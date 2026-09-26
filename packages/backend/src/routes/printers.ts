import { Router } from "express";
import { z } from "zod";
import { createPrinterInputSchema, updatePrinterInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { printerSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicPrinter } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { connectPrinter, disconnectPrinter, getLatestStatus } from "../services/printerRuntime.js";
import {
  accessibleInventoryIds,
  requireAccessToObjectInventory,
  requireInventoryRole
} from "../services/inventoryAccess.js";

export const printersRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const listQuerySchema = z.object({ inventoryId: z.union([z.literal("all"), z.string().uuid()]) });

async function findPrinterOrThrow(id: string) {
  const printer = await prisma.printer.findUnique({ where: { id }, include: { inventory: true } });
  if (!printer) {
    throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
  }
  return printer;
}

function inventoryOf(printer: { inventory: { id: string; name: string } | null }): { id: string; name: string } | null {
  return printer.inventory ? { id: printer.inventory.id, name: printer.inventory.name } : null;
}

// Threat-Model: Der Access-Code ist das Passwort des Druckers, und der Server baut zu der angegebenen Adresse eine
// Verbindung auf - ein Benutzer ohne Recht koennte Drucker fremder Lager sehen, anlegen, aendern oder loeschen und so
// Netzwerkzugriff auf fremde Hardware bekommen. Serverseitig erzwungen: Lesen (Liste, Status) braucht die Rolle VIEWER im
// Lager des Druckers, Anlegen/Aendern/Loeschen die Rolle OWNER (Admins gelten ueberall als OWNER); ohne Zugriff 404; das
// Lager eines Druckers kann nachtraeglich nicht geaendert werden; der accessCode verlaesst den Server nie.
// Negativ-Tests: kein Cookie -> 401, Fremder -> 404, Betrachter/Bearbeiter beim Schreiben -> 403, accessCode nie in einer Antwort.
// SCOPE: user
printersRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { inventoryId } = listQuerySchema.parse(req.query);
    const user = getAuthenticatedUser(req);
    let where: { inventoryId: string } | { inventoryId: { in: string[] } };
    if (inventoryId === "all") {
      where = { inventoryId: { in: await accessibleInventoryIds(user) } };
    } else {
      await requireInventoryRole(user, inventoryId, "VIEWER");
      where = { inventoryId };
    }
    const printers = await prisma.printer.findMany({ where, orderBy: { name: "asc" } });
    sendData(
      res,
      printers.map((printer) => toPublicPrinter(printer))
    );
  })
);

// SCOPE: user
printersRouter.get(
  "/:id/status",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const printer = await findPrinterOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), printer.inventoryId, "VIEWER");
    sendData(res, getLatestStatus(id));
  })
);

// SCOPE: user
printersRouter.post(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = createPrinterInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), input.inventoryId, "OWNER");
    const created = await prisma.printer
      .create({ data: input, include: { inventory: true } })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Unique constraint")) {
          throw new AppError("CONFLICT", "Ein Drucker mit dieser Seriennummer existiert bereits.");
        }
        throw err;
      });
    connectPrinter(created);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "PRINTER",
      entityId: created.id,
      inventory: inventoryOf(created),
      description: created.name,
      after: printerSnapshot(created)
    });
    sendData(res, toPublicPrinter(created), 201);
  })
);

// SCOPE: user
printersRouter.patch(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updatePrinterInputSchema.parse(req.body);
    const before = await findPrinterOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), before.inventoryId, "OWNER");
    const updated = await prisma.printer
      .update({ where: { id }, data: omitUndefined(input), include: { inventory: true } })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
        }
        throw err;
      });
    connectPrinter(updated);
    // Der Zugangscode ist ein Geheimnis: nie im Protokoll, nur dass er geaendert wurde.
    const accessCodeChanged = input.accessCode !== undefined && input.accessCode !== before.accessCode;
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "PRINTER",
      entityId: id,
      inventory: inventoryOf(updated),
      description: updated.name,
      before: printerSnapshot(before),
      after: { ...printerSnapshot(updated), ...(accessCodeChanged ? { accessCodeChanged: true } : {}) }
    });
    sendData(res, toPublicPrinter(updated));
  })
);

// SCOPE: user
printersRouter.delete(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const before = await findPrinterOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), before.inventoryId, "OWNER");
    disconnectPrinter(id);
    await prisma.printer.delete({ where: { id } });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "PRINTER",
      entityId: id,
      inventory: inventoryOf(before),
      description: before.name,
      before: printerSnapshot(before)
    });
    sendData(res, { deleted: true });
  })
);
