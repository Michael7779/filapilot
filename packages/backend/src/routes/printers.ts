import { Router } from "express";
import { z } from "zod";
import {
  assignAmsSlotInputSchema,
  createPrinterInputSchema,
  isValidAmsSlotIndex,
  printerConnectionProblem,
  updatePrinterInputSchema,
  type UpdatePrinterInput
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { printerSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicPrinter } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import {
  connectPrinter,
  disconnectPrinter,
  getLatestStatus,
  whenPrinterConnectStarted
} from "../services/printerRuntime.js";
import { broadcastAmsChanged, refreshSocketAccess } from "../socket.js";
import { assignAmsSlot, listAmsSlots } from "../services/amsSlotService.js";
import {
  accessibleInventoryIds,
  requireAccessToObjectInventory,
  requireInventoryRole
} from "../services/inventoryAccess.js";

export const printersRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const CONNECT_START_WAIT_MS = 3000;
const idParamSchema = z.string().uuid();
const listQuerySchema = z.object({ inventoryId: z.union([z.literal("all"), z.string().uuid()]) });
const slotIndexParamSchema = z.coerce
  .number()
  .int()
  .refine(isValidAmsSlotIndex, "Ungueltiger Slot");

async function findPrinterOrThrow(id: string) {
  const printer = await prisma.printer.findUnique({ where: { id }, include: { inventory: true } });
  if (!printer) {
    throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
  }
  return printer;
}

// Beim Verschieben in ein anderes Lager werden die AMS-Zuordnungen im selben Schritt geleert: sie verweisen auf Spulen des alten
// Lagers (die Pruefung "Spule im Lager des Druckers" wuerde sonst bei der Verbrauchserfassung ins Leere laufen).
async function updatePrinterRow(
  id: string,
  input: UpdatePrinterInput,
  moveToInventoryId: string | null
) {
  const data = omitUndefined(input);
  if (moveToInventoryId === null) {
    return prisma.printer.update({ where: { id }, data, include: { inventory: true } });
  }
  return prisma.$transaction(async (tx) => {
    const target = await tx.inventory.findUnique({
      where: { id: moveToInventoryId },
      select: { id: true }
    });
    if (!target) {
      throw new AppError("NOT_FOUND", "Lager wurde nicht gefunden.");
    }
    await tx.amsSlotAssignment.deleteMany({ where: { printerId: id } });
    return tx.printer.update({ where: { id }, data, include: { inventory: true } });
  });
}

interface ConnectionFields {
  connectionMode: "LOCAL" | "CLOUD";
  ipAddress: string | null;
  accessCode: string | null;
}

// Fuehrt die Verbindungsfelder einer Aenderung mit dem bisherigen Stand zusammen und prueft sie wie beim Anlegen: LOCAL braucht IP und
// Access-Code, CLOUD hat keins von beidem (beim Wechsel nach CLOUD werden alte Werte geleert; neu mitgeschickte sind ein Fehler).
function resolveConnectionFields(
  before: ConnectionFields,
  input: { connectionMode?: "LOCAL" | "CLOUD" | undefined; ipAddress?: string | null | undefined; accessCode?: string | null | undefined }
): ConnectionFields {
  const connectionMode = input.connectionMode ?? before.connectionMode;
  if (connectionMode === "CLOUD") {
    if (printerConnectionProblem("CLOUD", input.ipAddress, input.accessCode)) {
      throw new AppError("VALIDATION_ERROR", "Bei der Verbindung über die Bambu Cloud gibt es keine IP-Adresse und keinen Access-Code.");
    }
    return { connectionMode, ipAddress: null, accessCode: null };
  }
  const ipAddress = input.ipAddress ?? before.ipAddress;
  const accessCode = input.accessCode ?? before.accessCode;
  if (printerConnectionProblem("LOCAL", ipAddress, accessCode)) {
    throw new AppError("VALIDATION_ERROR", "Für die lokale Verbindung sind IP-Adresse und Access-Code nötig.");
  }
  return { connectionMode, ipAddress, accessCode };
}

function inventoryOf(printer: {
  inventory: { id: string; name: string } | null;
}): { id: string; name: string } | null {
  return printer.inventory ? { id: printer.inventory.id, name: printer.inventory.name } : null;
}

// Threat-Model: Der Access-Code ist das Passwort des Druckers, und der Server baut zu der angegebenen Adresse eine
// Verbindung auf - ein Benutzer ohne Recht koennte Drucker fremder Lager sehen, anlegen, aendern oder loeschen und so
// Netzwerkzugriff auf fremde Hardware bekommen. Serverseitig erzwungen: Lesen (Liste, Status) braucht die Rolle VIEWER im
// Lager des Druckers, Anlegen/Aendern/Loeschen die Rolle OWNER (Admins gelten ueberall als OWNER); ohne Zugriff 404; ein
// Drucker wird nur verschoben, wenn der Nutzer im alten UND im neuen Lager OWNER ist (ein Ziel ohne Zugriff bleibt unsichtbar,
// ein nicht existierendes Ziel ergibt 404); beim Verschieben werden die AMS-Zuordnungen geleert, weil sie Spulen des alten Lagers
// meinen; der accessCode verlaesst den Server nie. Verbindung ueber die Bambu Cloud (CLOUD): der Server nutzt dabei nur die
// Bambu-Verbindung des Lagers, in dem der Drucker liegt (nie die eines anderen Lagers), und der MQTT-Broker ist fest je Region -
// weder Adresse noch Token kommen vom Client; die Seriennummer darf nur Geraete des verbundenen Kontos abonnieren (Broker-Regel).
// Negativ-Tests dazu: Cloud-Drucker ohne Zugriff -> 404/403, IP/Access-Code bei CLOUD -> 400, LOCAL ohne beides -> 400, Token nie in
// Antwort oder Protokoll (tests/security/printerCloudMode.test.ts).
// Negativ-Tests: kein Cookie -> 401, Fremder -> 404, Betrachter/Bearbeiter beim Schreiben -> 403, accessCode nie in einer Antwort,
// Verschieben ohne Besitzer-Recht im Ziel -> 403/404 (tests/security/printerMove.test.ts).
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

// Threat-Model: Ein Benutzer ohne Zugriff aufs Lager des Druckers koennte fremde AMS-Slots einer fremden Spule
// zuordnen und so Verbrauch fremder Drucker gegen fremde Spulen buchen lassen. Serverseitig erzwungen: Lesen
// braucht VIEWER, Zuordnen EDITOR im Lager des Druckers, und die Spule muss serverseitig geprueft im selben
// Lager wie der Drucker liegen (sonst 400) - Zuordnen ist Tagesgeschaeft (wie Spule bearbeiten), kein Besitzer-Vorgang.
// Negativ-Tests: kein Cookie 401, Fremder 404, Betrachter 403, Spule aus anderem Lager 400, ungueltiger Slot 400.
// SCOPE: user
printersRouter.get(
  "/:id/ams-slots",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const printer = await findPrinterOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), printer.inventoryId, "VIEWER");
    sendData(res, await listAmsSlots(id, getLatestStatus(id).amsSlots));
  })
);

// SCOPE: user
printersRouter.put(
  "/:id/ams-slots/:slotIndex",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const slotIndex = slotIndexParamSchema.parse(req.params.slotIndex);
    const input = assignAmsSlotInputSchema.parse(req.body);
    const printer = await findPrinterOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), printer.inventoryId, "EDITOR");
    await assignAmsSlot(id, printer.inventoryId, slotIndex, input.spoolId);
    broadcastAmsChanged(printer.inventoryId);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "PRINTER",
      entityId: id,
      inventory: inventoryOf(printer),
      description: `${printer.name}: Slot ${slotIndex} ${input.spoolId ? "zugeordnet" : "geleert"}`
    });
    sendData(res, await listAmsSlots(id, getLatestStatus(id).amsSlots));
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
    // Kurz abwarten, damit die Oberflaeche direkt nach dem Anlegen schon den Grund zeigen kann (z.B. keine Bambu-Verbindung im Lager).
    await whenPrinterConnectStarted(created.id, CONNECT_START_WAIT_MS);
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
    const user = getAuthenticatedUser(req);
    await requireAccessToObjectInventory(user, before.inventoryId, "OWNER");
    const connection = resolveConnectionFields(before, input);
    const targetInventoryId = input.inventoryId;
    const moving = targetInventoryId !== undefined && targetInventoryId !== before.inventoryId;
    if (moving) {
      await requireInventoryRole(user, targetInventoryId, "OWNER");
    }
    const updated = await updatePrinterRow(id, { ...input, ...connection }, moving ? targetInventoryId : null).catch(
      (err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
        }
        throw err;
      }
    );
    connectPrinter(updated);
    if (moving) {
      // Die Live-Status-Raeume haengen am Lager: Zuhoerer des alten Lagers verlieren den Drucker sofort.
      void refreshSocketAccess();
    }
    // Der Zugangscode ist ein Geheimnis: nie im Protokoll, nur dass er geaendert wurde.
    const accessCodeChanged = connection.accessCode !== before.accessCode;
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
