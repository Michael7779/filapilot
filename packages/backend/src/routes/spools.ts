import { Router } from "express";
import { z } from "zod";
import {
  createSpoolInputSchema,
  spoolArchiveFilterSchema,
  updateSpoolInputSchema,
  type SpoolArchiveFilter
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicSpool, toPublicSpoolWithRelations } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { describeSpool, spoolSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { deletePhoto } from "../services/spoolPhotoService.js";
import { recordWeightChange } from "../services/spoolWeightLog.js";
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
    const created = await prisma.spool.create({ data: input, include: SPOOL_INCLUDE });
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

    const updated = await prisma.spool
      .update({ where: { id }, data: omitUndefined(input), include: SPOOL_INCLUDE })
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
