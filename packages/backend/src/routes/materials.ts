import { Router } from "express";
import { z } from "zod";
import { createMaterialInputSchema, updateMaterialInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData, AppError } from "../lib/apiResult.js";
import {
  requireAuth,
  requirePasswordAlreadyChanged,
  requireRole
} from "../middleware/auth.js";
import { toPublicMaterial } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { ensureCatalog } from "../services/catalogService.js";
import { materialSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const materialsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const requireAdmin = [...requireActiveUser, requireRole("ADMIN")] as const;
const idParamSchema = z.string().uuid();

async function assertManufacturerExists(manufacturerId: string | null): Promise<void> {
  if (manufacturerId === null) {
    return;
  }
  const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
  if (!manufacturer) {
    throw new AppError("VALIDATION_ERROR", "Unbekannter Hersteller.");
  }
}

async function manufacturerNameOf(manufacturerId: string | null): Promise<string | null> {
  if (manufacturerId === null) {
    return null;
  }
  return (await prisma.manufacturer.findUnique({ where: { id: manufacturerId } }))?.name ?? null;
}

function describeMaterial(name: string, manufacturerName: string | null): string {
  return manufacturerName ? `${manufacturerName} ${name}` : `${name} (allgemein)`;
}

// Name ist je Hersteller eindeutig (ohne Gross-/Kleinschreibung); "kein Hersteller" zaehlt als eigene Gruppe.
async function assertNameFree(
  name: string,
  manufacturerId: string | null,
  ignoreId?: string
): Promise<void> {
  const duplicate = await prisma.material.findFirst({
    where: {
      manufacturerId,
      name: { equals: name, mode: "insensitive" },
      ...(ignoreId ? { NOT: { id: ignoreId } } : {})
    },
    select: { id: true }
  });
  if (duplicate) {
    throw new AppError("CONFLICT", "Ein Material mit diesem Namen existiert bereits.");
  }
}

// Threat-Model: Ein anonymer Request koennte versuchen, Material-Stammdaten zu lesen/anzulegen; ein
// normaler Nutzer koennte versuchen, geteilte Stammdaten zu aendern oder zu loeschen.
// Serverseitig erzwungen: requireAuth (Lesen/Anlegen fuer jeden eingeloggten Nutzer, geteilter
// Bestand ohne Owner-Konzept), requireRole("ADMIN") fuer Aendern/Loeschen; Loeschen wird abgelehnt,
// solange Spulen das Material nutzen. Negativ-Tests: kein Cookie -> 401, USER -> 403, benutzt -> 409.
// SCOPE: user
materialsRouter.get("/", ...requireActiveUser, async (_req, res, next) => {
  try {
    await ensureCatalog();
    const materials = await prisma.material.findMany({ orderBy: { name: "asc" } });
    sendData(
      res,
      materials.map((material) => toPublicMaterial(material))
    );
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
materialsRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createMaterialInputSchema.parse(req.body);
    await assertManufacturerExists(input.manufacturerId);
    await assertNameFree(input.name, input.manufacturerId);
    const created = await prisma.material.create({ data: input });
    const manufacturerName = await manufacturerNameOf(created.manufacturerId);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "MATERIAL",
      entityId: created.id,
      description: describeMaterial(created.name, manufacturerName),
      after: materialSnapshot(created, manufacturerName)
    });
    sendData(res, toPublicMaterial(created), 201);
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
materialsRouter.patch("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const input = updateMaterialInputSchema.parse(req.body);
    const current = await prisma.material.findUnique({ where: { id } });
    if (!current) {
      throw new AppError("NOT_FOUND", "Material wurde nicht gefunden.");
    }
    const manufacturerId =
      input.manufacturerId === undefined ? current.manufacturerId : input.manufacturerId;
    await assertManufacturerExists(manufacturerId);
    await assertNameFree(input.name ?? current.name, manufacturerId, id);

    // Spulen behalten ihren Hersteller - ein Herstellerwechsel des Materials waere sonst inkonsistent.
    if (manufacturerId !== current.manufacturerId) {
      const inUse = await prisma.spool.count({ where: { materialId: id } });
      if (inUse > 0) {
        throw new AppError(
          "CONFLICT",
          "Der Hersteller kann nicht geaendert werden, solange Spulen dieses Material nutzen."
        );
      }
    }
    const updated = await prisma.material.update({ where: { id }, data: omitUndefined(input) });
    const beforeManufacturer = await manufacturerNameOf(current.manufacturerId);
    const afterManufacturer = await manufacturerNameOf(updated.manufacturerId);
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "MATERIAL",
      entityId: id,
      description: describeMaterial(updated.name, afterManufacturer),
      before: materialSnapshot(current, beforeManufacturer),
      after: materialSnapshot(updated, afterManufacturer)
    });
    sendData(res, toPublicMaterial(updated));
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
materialsRouter.delete("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const inUse = await prisma.spool.count({ where: { materialId: id } });
    if (inUse > 0) {
      throw new AppError(
        "CONFLICT",
        `Das Material wird noch von ${inUse} Spule(n) verwendet und kann nicht geloescht werden.`
      );
    }
    const before = await prisma.material.findUnique({ where: { id } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Material wurde nicht gefunden.");
    }
    await prisma.material.delete({ where: { id } });
    const manufacturerName = await manufacturerNameOf(before.manufacturerId);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "MATERIAL",
      entityId: id,
      description: describeMaterial(before.name, manufacturerName),
      before: materialSnapshot(before, manufacturerName)
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
