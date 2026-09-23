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
    await prisma.material.delete({ where: { id } }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
        throw new AppError("NOT_FOUND", "Material wurde nicht gefunden.");
      }
      throw err;
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
