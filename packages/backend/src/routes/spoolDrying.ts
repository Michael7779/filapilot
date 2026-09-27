import { Router } from "express";
import { z } from "zod";
import { createDryingLogInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { describeSpool } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { requireAccessToObjectInventory } from "../services/inventoryAccess.js";

// Gemountet unter /api/spools (wie spoolPhotos.ts) - definiert selbst den vollen Unterpfad.
export const spoolDryingRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const paramSchema = z.object({ id: z.string().uuid() });

async function findSpoolOrThrow(id: string) {
  const spool = await prisma.spool.findUnique({
    where: { id },
    include: { material: true, manufacturer: true, inventory: true }
  });
  if (!spool) {
    throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
  }
  return spool;
}

function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) {
    return `${minutes} Min`;
  }
  return minutes > 0 ? `${hours} Std ${minutes} Min` : `${hours} Std`;
}

function describeDrying(input: { temperatureC: number; durationMinutes: number; note: string | null }): string {
  const note = input.note ? ` (${input.note})` : "";
  const duration = formatDuration(input.durationMinutes);
  return `Getrocknet: ${input.temperatureC} °C, ${duration}${note}`;
}

// Threat-Model: Ein Betrachter (nur Leserecht) oder ein Nutzer ohne Zugriff auf das Lager der Spule koennte versuchen,
// fuer eine fremde/nicht zugaengliche Spule einen Trocknungs-Eintrag anzulegen. Serverseitig erzwungen: dieselbe
// EDITOR-Pruefung wie beim Bearbeiten der Spule selbst, Zod-Validierung von Temperatur (1-150 Grad) und Dauer
// (1-2880 Minuten, max. 48 Std.), Notiz auf 300 Zeichen begrenzt; nicht existente Spule -> 404.
// Negativ-Tests: anonym -> 401, Betrachter -> 403, fremde Spule -> 404, Temperatur/Dauer ausserhalb der Grenzen -> 400.
// SCOPE: user
spoolDryingRouter.post(
  "/:id/drying",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = paramSchema.parse(req.params);
    const input = createDryingLogInputSchema.parse(req.body);
    const spool = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "EDITOR");
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "SPOOL",
      entityId: spool.id,
      inventory: spool.inventory ? { id: spool.inventory.id, name: spool.inventory.name } : null,
      description: `${describeSpool(spool)}: ${describeDrying(input)}`,
      after: { temperatureC: input.temperatureC, durationMinutes: input.durationMinutes, note: input.note }
    });
    sendData(res, { logged: true }, 201);
  })
);
