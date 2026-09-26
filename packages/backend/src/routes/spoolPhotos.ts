import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { requireAccessToObjectInventory } from "../services/inventoryAccess.js";
import { describeSpool } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { getSettings } from "../services/settingsService.js";
import {
  MAX_PHOTO_BYTES,
  deletePhoto,
  detectImageType,
  readPhoto,
  savePhoto
} from "../services/spoolPhotoService.js";

export const spoolPhotosRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const SPOOL_INCLUDE = { material: true, manufacturer: true, inventory: true } as const;

async function findSpoolOrThrow(id: string) {
  const spool = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
  if (!spool) {
    throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
  }
  return spool;
}

// Threat-Model: Ein anonymer Nutzer koennte Fotos ansehen oder ueberschreiben; ein eingeloggter Nutzer koennte
// eine riesige oder gar keine Bilddatei (z.B. HTML/SVG mit Skript, ausfuehrbare Datei) hochladen oder ueber die
// Spulen-ID in fremde Pfade schreiben. Serverseitig erzwungen: requireAuth auf jeder Route, ID nur als UUID, Datei-
// pfad aus der ID gebaut (kein Client-Pfad), Groesse max. 5 MB, Typ nur JPEG/PNG/WebP anhand der Anfangsbytes,
// Auslieferung mit dem erkannten Typ (+ nosniff durch helmet), Upload nur wenn Settings.photoUploadEnabled. Zugriff nur
// ueber die Mitgliedschaft im Lager der Spule (ansehen VIEWER, hochladen/entfernen EDITOR, sonst 404/403).
// Negativ-Tests: kein Cookie -> 401, Foto-Upload aus -> 403, keine Bilddatei -> 400, zu gross -> 400, unbekannte
// Spule -> 404, ungueltige ID -> 400, fremdes Lager -> 404, Betrachter beim Hochladen -> 403.

// Damit die Oberflaeche das Foto-Feld nur zeigt, wenn der Admin den Upload erlaubt hat (die Einstellungen selbst
// sind Admin-only).
// SCOPE: user
spoolPhotosRouter.get(
  "/photo-settings",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    sendData(res, { enabled: (await getSettings()).photoUploadEnabled });
  })
);

// SCOPE: user
spoolPhotosRouter.put(
  "/:id/photo",
  ...requireActiveUser,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_PHOTO_BYTES }),
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const spool = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "EDITOR");
    if (!(await getSettings()).photoUploadEnabled) {
      throw new AppError("FORBIDDEN", "Foto-Upload ist in den Einstellungen ausgeschaltet.");
    }
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || detectImageType(body) === null) {
      throw new AppError("VALIDATION_ERROR", "Bitte ein Bild im Format JPEG, PNG oder WebP hochladen.");
    }

    await savePhoto(id, body);
    const photoUrl = `/api/spools/${id}/photo?v=${Date.now()}`;
    await prisma.spool.update({ where: { id }, data: { photoUrl } });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "SPOOL",
      entityId: id,
      inventory: spool.inventory,
      description: `${describeSpool(spool)}: Foto hochgeladen`
    });
    sendData(res, { photoUrl });
  })
);

// SCOPE: user
spoolPhotosRouter.get(
  "/:id/photo",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const spool = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "VIEWER");
    const photo = spool.photoUrl ? await readPhoto(id) : null;
    const type = photo ? detectImageType(photo) : null;
    if (!photo || !type) {
      throw new AppError("NOT_FOUND", "Diese Spule hat kein Foto.");
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(photo);
  })
);

// SCOPE: user
spoolPhotosRouter.delete(
  "/:id/photo",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const spool = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "EDITOR");
    if (spool.photoUrl) {
      await prisma.spool.update({ where: { id }, data: { photoUrl: null } });
      await deletePhoto(id);
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "SPOOL",
        entityId: id,
        inventory: spool.inventory,
        description: `${describeSpool(spool)}: Foto entfernt`
      });
    }
    sendData(res, { deleted: true });
  })
);
