import { Router } from "express";
import { z } from "zod";
import { createWeighInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicSpool } from "../lib/mappers.js";
import { spoolSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordUpdate } from "../services/auditService.js";
import { requireAccessToObjectInventory } from "../services/inventoryAccess.js";
import { recordWeightChange } from "../services/spoolWeightLog.js";

// Gemountet unter /api/spools (wie spoolPhotos.ts/spoolDrying.ts) - definiert selbst den vollen Unterpfad.
export const spoolWeighRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const paramSchema = z.object({ id: z.string().uuid() });
const SPOOL_INCLUDE = { material: true, manufacturer: true, inventory: true } as const;

async function findSpoolOrThrow(id: string) {
  const spool = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
  if (!spool) {
    throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
  }
  return spool;
}

// Threat-Model: Ein Betrachter oder ein Nutzer ohne Zugriff auf das Lager der Spule koennte versuchen, ueber diese
// Route das Restgewicht einer fremden/nicht zugaenglichen Spule zu setzen. Serverseitig erzwungen: dieselbe
// EDITOR-Pruefung wie beim Bearbeiten der Spule, Zod-Validierung des gemessenen Gewichts (0-10000 g); ohne
// hinterlegtes Leergewicht (tareWeightG) wird abgelehnt (400), damit nie ein falscher Wert aus einer fehlenden
// Tara berechnet wird; nicht existente Spule -> 404.
// Negativ-Tests: anonym -> 401, Betrachter -> 403, fremde Spule -> 404, negatives/zu grosses Gewicht -> 400,
// fehlende Tara -> 400.
// SCOPE: user
spoolWeighRouter.post(
  "/:id/weigh",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = paramSchema.parse(req.params);
    const input = createWeighInputSchema.parse(req.body);
    const before = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), before.inventoryId, "EDITOR");
    if (before.tareWeightG === null) {
      throw new AppError("VALIDATION_ERROR", "Bitte zuerst das Leergewicht dieser Spule hinterlegen (im Bearbeiten-Formular).");
    }
    const remaining = Math.max(0, input.measuredWeightG - before.tareWeightG);
    const updated = await prisma.spool.update({ where: { id }, data: { remainingWeightG: remaining }, include: SPOOL_INCLUDE });
    const openedAt = await recordWeightChange({ spoolId: id, inventoryId: updated.inventoryId, before: before.remainingWeightG, after: remaining, source: "WEIGHED" });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "SPOOL",
      entityId: id,
      inventory: updated.inventory ? { id: updated.inventory.id, name: updated.inventory.name } : null,
      description: `${updated.manufacturer.name} ${updated.material.name} ${updated.colorName}: gewogen`,
      before: spoolSnapshot(before),
      after: spoolSnapshot(updated)
    });
    sendData(res, toPublicSpool(openedAt ? { ...updated, openedAt } : updated));
  })
);
