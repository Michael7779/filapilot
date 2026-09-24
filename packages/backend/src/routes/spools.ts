import { Router } from "express";
import { z } from "zod";
import { createSpoolInputSchema, updateSpoolInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicSpool, toPublicSpoolWithRelations } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { describeSpool, spoolSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const spoolsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const SPOOL_INCLUDE = { material: true, manufacturer: true } as const;

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

// Threat-Model: Ein anonymer Request koennte versuchen, den Filament-Bestand einzusehen oder zu
// aendern. Serverseitig erzwungen: requireAuth + requirePasswordAlreadyChanged auf jeder Route.
// Spulen gehoeren keinem einzelnen Nutzer (geteilter Bestand, 2-5 Personen), daher kein
// Ownership-Check noetig - jeder eingeloggte Nutzer darf lesen/anlegen/aendern/loeschen.
// Negativ-Tests: kein Cookie -> 401, mustChangePassword=true -> 403.
// SCOPE: user
spoolsRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    const spools = await prisma.spool.findMany({
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
spoolsRouter.get("/:id", ...requireActiveUser, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const spool = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
    if (!spool) {
      throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
    }
    sendData(res, toPublicSpoolWithRelations(spool));
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
spoolsRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createSpoolInputSchema.parse(req.body);
    await assertMaterialExists(input.materialId);
    await assertManufacturerExists(input.manufacturerId);
    await assertMaterialMatchesManufacturer(input.materialId, input.manufacturerId);
    const created = await prisma.spool.create({ data: input, include: SPOOL_INCLUDE });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "SPOOL",
      entityId: created.id,
      description: describeSpool(created),
      after: spoolSnapshot(created)
    });
    sendData(res, toPublicSpool(created), 201);
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
spoolsRouter.patch("/:id", ...requireActiveUser, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const input = updateSpoolInputSchema.parse(req.body);

    if (input.materialId) {
      await assertMaterialExists(input.materialId);
    }
    if (input.manufacturerId) {
      await assertManufacturerExists(input.manufacturerId);
    }
    const before = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
    if (!before) {
      throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
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
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "SPOOL",
      entityId: id,
      description: describeSpool(updated),
      before: spoolSnapshot(before),
      after: spoolSnapshot(updated)
    });
    sendData(res, toPublicSpool(updated));
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
spoolsRouter.delete("/:id", ...requireActiveUser, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const before = await prisma.spool.findUnique({ where: { id }, include: SPOOL_INCLUDE });
    if (!before) {
      throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
    }
    await prisma.spool.delete({ where: { id } }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
        throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
      }
      throw err;
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "SPOOL",
      entityId: id,
      description: describeSpool(before),
      before: spoolSnapshot(before)
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
