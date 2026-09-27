import { Router } from "express";
import { z } from "zod";
import {
  createSpoolInputSchema,
  CustomFieldValidationError,
  spoolArchiveFilterSchema,
  updateSpoolInputSchema,
  validateCustomFieldValues,
  type CustomFieldValues,
  type RawCustomFieldValues,
  type SpoolArchiveFilter
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicSpool, toPublicSpoolWithRelations } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { describeSpool, spoolSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate, listEntityHistory } from "../services/auditService.js";
import { deletePhoto } from "../services/spoolPhotoService.js";
import { recordWeightChange } from "../services/spoolWeightLog.js";
import { spoolsToCsv, spoolsToXlsx } from "../services/spoolExportService.js";
import {
  accessibleInventoryIds,
  requireAccessToObjectInventory,
  requireInventoryRole
} from "../services/inventoryAccess.js";

export const spoolsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const listQuerySchema = z.object({
  inventoryId: z.union([z.literal("all"), z.string().uuid()]),
  archived: spoolArchiveFilterSchema.default("exclude")
});
function archiveWhere(filter: SpoolArchiveFilter): { archivedAt?: null | { not: null } } {
  if (filter === "exclude") {
    return { archivedAt: null };
  }
  return filter === "only" ? { archivedAt: { not: null } } : {};
}

const SPOOL_INCLUDE = { material: true, manufacturer: true, inventory: true } as const;

async function assertMaterialExists(materialId: string): Promise<void> {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) {
    throw new AppError("VALIDATION_ERROR", "Unbekanntes Material.");
  }
}

// Ein herstellerspezifisches Material darf nur mit seinem eigenen Hersteller kombiniert werden;
// allgemeine Materialien (ohne Hersteller) passen zu jedem.
async function assertMaterialMatchesManufacturer(
  materialId: string,
  manufacturerId: string
): Promise<void> {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (material?.manufacturerId && material.manufacturerId !== manufacturerId) {
    throw new AppError("VALIDATION_ERROR", "Das Material gehoert zu einem anderen Hersteller.");
  }
}

async function assertManufacturerExists(manufacturerId: string): Promise<void> {
  const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
  if (!manufacturer) {
    throw new AppError("VALIDATION_ERROR", "Unbekannter Hersteller.");
  }
}

function inventoryOf(spool: { inventory: { id: string; name: string } | null }): { id: string; name: string } | null {
  return spool.inventory ? { id: spool.inventory.id, name: spool.inventory.name } : null;
}

// Gegen die bekannten Zusatzfeld-Definitionen validieren (Whitelist der Schluessel + Typ je Definition).
async function resolveCustomFields(raw: RawCustomFieldValues): Promise<CustomFieldValues> {
  const definitions = await prisma.customFieldDefinition.findMany({ select: { id: true, kind: true, name: true } });
  try {
    return validateCustomFieldValues(definitions, raw);
  } catch (err) {
    if (err instanceof CustomFieldValidationError) {
      throw new AppError("VALIDATION_ERROR", err.message);
    }
    throw err;
  }
}

async function findSpoolOrThrow(id: string) {
  const spool = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
  if (!spool) {
    throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
  }
  return spool;
}

// Threat-Model: Ein anonymer Request koennte den Filament-Bestand einsehen oder aendern; ein angemeldeter Benutzer ohne
// Mitgliedschaft koennte Spulen eines fremden Lagers lesen, aendern, loeschen oder in ein fremdes Lager schieben.
// Serverseitig erzwungen: requireAuth + requirePasswordAlreadyChanged auf jeder Route; die Rolle im Lager wird aus der
// Datenbank berechnet (bei Einzel-Spulen aus dem Lager der Spule, nie aus dem Client): lesen VIEWER, schreiben EDITOR,
// Verschieben EDITOR im Quell- UND Ziel-Lager; ohne Zugriff 404. "inventoryId=all" liefert nur Lager mit Mitgliedschaft.
// Negativ-Tests: kein Cookie -> 401, mustChangePassword -> 403, Fremder -> 404, Betrachter beim Schreiben -> 403.
// Archivieren/Wiederherstellen braucht Bearbeiten wie jede Aenderung; der Gewichtsverlauf wird nur hier im Server geschrieben.
// SCOPE: user
spoolsRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { inventoryId, archived } = listQuerySchema.parse(req.query);
    const user = getAuthenticatedUser(req);
    let where: { inventoryId: string } | { inventoryId: { in: string[] } };
    if (inventoryId === "all") {
      where = { inventoryId: { in: await accessibleInventoryIds(user) } };
    } else {
      await requireInventoryRole(user, inventoryId, "VIEWER");
      where = { inventoryId };
    }
    const spools = await prisma.spool.findMany({
      where: { ...where, ...archiveWhere(archived) },
      include: SPOOL_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    sendData(
      res,
      spools.map((spool) => toPublicSpoolWithRelations(spool))
    );
  })
);

// Export als Datei zum Herunterladen (CSV/JSON) - vor "/:id" registriert, sonst wuerde "export" als ID gelesen.
// Threat-Model: Ein Benutzer ohne Zugriff koennte den Bestand eines fremden Lagers exportieren (Kaufpreise,
// Lagerort). Serverseitig erzwungen: dieselbe Rechtepruefung wie beim Lesen der Liste (VIEWER, "all" nur eigene
// Lager); die Datei enthaelt nur Felder, die der Client ohnehin ueber die Liste sehen darf.
// Negativ-Test: fremdes Lager -> 404 (tests/security/spools.test.ts, "lehnt Export eines fremden Lagers ab").
// SCOPE: user
spoolsRouter.get(
  "/export",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { inventoryId, archived } = listQuerySchema.parse(req.query);
    const format = z.enum(["csv", "json", "xlsx"]).default("csv").parse(req.query.format);
    const user = getAuthenticatedUser(req);
    let where: { inventoryId: string } | { inventoryId: { in: string[] } };
    if (inventoryId === "all") {
      where = { inventoryId: { in: await accessibleInventoryIds(user) } };
    } else {
      await requireInventoryRole(user, inventoryId, "VIEWER");
      where = { inventoryId };
    }
    const rows = await prisma.spool.findMany({
      where: { ...where, ...archiveWhere(archived) },
      include: SPOOL_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    const spools = rows.map((spool) => toPublicSpoolWithRelations(spool));
    const materials = await prisma.material.findMany({ select: { id: true, densityGCm3: true, filamentDiameterMm: true } });
    const densityByMaterialId = new Map(materials.map((material) => [material.id, material.densityGCm3]));
    const diameterByMaterialId = new Map(materials.map((material) => [material.id, material.filamentDiameterMm]));

    const filename = `filapilot-spulen-${new Date().toISOString().slice(0, 10)}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify(spools, null, 2));
    } else if (format === "xlsx") {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(await spoolsToXlsx(spools, densityByMaterialId, diameterByMaterialId)));
    } else {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      // BOM voranstellen, damit Excel Umlaute korrekt als UTF-8 erkennt statt als Windows-1252 zu raten.
      res.send("﻿" + spoolsToCsv(spools, densityByMaterialId, diameterByMaterialId));
    }
  })
);

// SCOPE: user
spoolsRouter.get(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const spool = await findSpoolOrThrow(idParamSchema.parse(req.params.id));
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "VIEWER");
    sendData(res, toPublicSpoolWithRelations(spool));
  })
);

// Protokoll dieser einen Spule (aus dem allgemeinen Aenderungsverlauf, nur die Eintraege dieser Spule).
// Threat-Model: Ein Benutzer ohne Zugriff auf das Lager der Spule koennte ihre Historie einsehen (Kaufpreis,
// wer sie wann geaendert hat). Serverseitig erzwungen: dieselbe VIEWER-Pruefung wie beim Lesen der Spule selbst;
// die Abfrage filtert serverseitig fest auf area=SPOOL und diese eine entityId (nie andere Bereiche/Objekte).
// Negativ-Test: fremde Spule -> 404 (tests/security/spools.test.ts).
// SCOPE: user
spoolsRouter.get(
  "/:id/history",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const spool = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "VIEWER");
    sendData(res, await listEntityHistory("SPOOL", id));
  })
);

// SCOPE: user
spoolsRouter.post(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = createSpoolInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), input.inventoryId, "EDITOR");
    await assertMaterialExists(input.materialId);
    await assertManufacturerExists(input.manufacturerId);
    await assertMaterialMatchesManufacturer(input.materialId, input.manufacturerId);
    const customFields = await resolveCustomFields(input.customFields);
    const created = await prisma.spool.create({ data: { ...input, customFields }, include: SPOOL_INCLUDE });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "SPOOL",
      entityId: created.id,
      inventory: inventoryOf(created),
      description: describeSpool(created),
      after: spoolSnapshot(created)
    });
    sendData(res, toPublicSpool(created), 201);
  })
);

// SCOPE: user
spoolsRouter.patch(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateSpoolInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);

    const before = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(user, before.inventoryId, "EDITOR");
    // Verschieben: auch im Ziel-Lager muss der Benutzer bearbeiten duerfen.
    if (input.inventoryId && input.inventoryId !== before.inventoryId) {
      await requireInventoryRole(user, input.inventoryId, "EDITOR");
    }
    if (input.materialId) {
      await assertMaterialExists(input.materialId);
    }
    if (input.manufacturerId) {
      await assertManufacturerExists(input.manufacturerId);
    }
    if (input.materialId || input.manufacturerId) {
      await assertMaterialMatchesManufacturer(
        input.materialId ?? before.materialId,
        input.manufacturerId ?? before.manufacturerId
      );
    }

    const customFields = input.customFields !== undefined ? await resolveCustomFields(input.customFields) : undefined;
    const updated = await prisma.spool
      .update({ where: { id }, data: omitUndefined({ ...input, customFields }), include: SPOOL_INCLUDE })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
        }
        throw err;
      });
    // Beim Verschieben zieht der Gewichtsverlauf der Spule mit ins neue Lager (Statistik)
    if (input.inventoryId && input.inventoryId !== before.inventoryId) {
      await prisma.spoolWeightLog.updateMany({ where: { spoolId: id }, data: { inventoryId: input.inventoryId } });
    }
    // Aenderung des Restgewichts fuer die Zeit-Statistik festhalten (nur bei echter Aenderung)
    await recordWeightChange({
      spoolId: id,
      inventoryId: updated.inventoryId,
      before: before.remainingWeightG,
      after: updated.remainingWeightG,
      source: "MANUAL"
    });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "SPOOL",
      entityId: id,
      inventory: inventoryOf(updated),
      description: describeSpool(updated),
      before: spoolSnapshot(before),
      after: spoolSnapshot(updated)
    });
    sendData(res, toPublicSpool(updated));
  })
);

// Archivieren: die Spule verschwindet aus dem Bestand, ihr Verbrauch bleibt in der Statistik.
// SCOPE: user
spoolsRouter.post(
  "/:id/archive",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const spool = await findSpoolOrThrow(idParamSchema.parse(req.params.id));
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "EDITOR");
    const updated = spool.archivedAt
      ? spool
      : await prisma.spool.update({
          where: { id: spool.id },
          data: { archivedAt: new Date(), archiveReason: "MANUAL" },
          include: SPOOL_INCLUDE
        });
    if (!spool.archivedAt) {
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "SPOOL",
        entityId: spool.id,
        inventory: inventoryOf(updated),
        description: `${describeSpool(updated)}: archiviert`
      });
    }
    sendData(res, toPublicSpool(updated));
  })
);

// SCOPE: user
spoolsRouter.post(
  "/:id/unarchive",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const spool = await findSpoolOrThrow(idParamSchema.parse(req.params.id));
    await requireAccessToObjectInventory(getAuthenticatedUser(req), spool.inventoryId, "EDITOR");
    const updated = spool.archivedAt
      ? await prisma.spool.update({ where: { id: spool.id }, data: { archivedAt: null, archiveReason: null }, include: SPOOL_INCLUDE })
      : spool;
    if (spool.archivedAt) {
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "SPOOL",
        entityId: spool.id,
        inventory: inventoryOf(updated),
        description: `${describeSpool(updated)}: wiederhergestellt`
      });
    }
    sendData(res, toPublicSpool(updated));
  })
);

// SCOPE: user
spoolsRouter.delete(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const before = await findSpoolOrThrow(id);
    await requireAccessToObjectInventory(getAuthenticatedUser(req), before.inventoryId, "EDITOR");
    await prisma.spool.delete({ where: { id } }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
        throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
      }
      throw err;
    });
    await deletePhoto(id);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "SPOOL",
      entityId: id,
      inventory: inventoryOf(before),
      description: describeSpool(before),
      before: spoolSnapshot(before)
    });
    sendData(res, { deleted: true });
  })
);
