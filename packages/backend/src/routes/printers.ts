import { Router } from "express";
import { z } from "zod";
import { createPrinterInputSchema, updatePrinterInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { toPublicPrinter } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { connectPrinter, disconnectPrinter, getLatestStatus } from "../services/printerRuntime.js";

export const printersRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const requireAdmin = [requireAuth, requirePasswordAlreadyChanged, requireRole("ADMIN")] as const;
const idParamSchema = z.string().uuid();

// Threat-Model: Der Access-Code ist das Passwort des Druckers - ein Nutzer ohne Admin-Rolle
// koennte versuchen, Drucker anzulegen/zu aendern/zu loeschen und so Netzwerkzugriff auf fremde
// Hardware zu bekommen. Serverseitig erzwungen: requireRole("ADMIN") auf allen schreibenden
// Routen; Lesen (Status/Liste, ohne accessCode) bleibt fuer jeden eingeloggten Nutzer offen, da
// der Live-Status der ganze Sinn des Features ist. Negativ-Tests: kein Cookie -> 401,
// nicht-Admin bei POST/PATCH/DELETE -> 403, accessCode nie in einer Antwort.
// SCOPE: user
printersRouter.get("/", ...requireActiveUser, async (_req, res) => {
  const printers = await prisma.printer.findMany({ orderBy: { name: "asc" } });
  sendData(
    res,
    printers.map((printer) => toPublicPrinter(printer))
  );
});

// SCOPE: user
printersRouter.get("/:id/status", ...requireActiveUser, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const printer = await prisma.printer.findUnique({ where: { id } });
    if (!printer) {
      throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
    }
    sendData(res, getLatestStatus(id));
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
printersRouter.post("/", ...requireAdmin, async (req, res, next) => {
  try {
    const input = createPrinterInputSchema.parse(req.body);
    const created = await prisma.printer.create({ data: input }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        throw new AppError("CONFLICT", "Ein Drucker mit dieser Seriennummer existiert bereits.");
      }
      throw err;
    });
    connectPrinter(created);
    sendData(res, toPublicPrinter(created), 201);
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
printersRouter.patch("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const input = updatePrinterInputSchema.parse(req.body);
    const updated = await prisma.printer
      .update({ where: { id }, data: omitUndefined(input) })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
        }
        throw err;
      });
    connectPrinter(updated);
    sendData(res, toPublicPrinter(updated));
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
printersRouter.delete("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    disconnectPrinter(id);
    await prisma.printer.delete({ where: { id } }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
        throw new AppError("NOT_FOUND", "Drucker wurde nicht gefunden.");
      }
      throw err;
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
