import { Router } from "express";
import { z } from "zod";
import { createManufacturerInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData, AppError } from "../lib/apiResult.js";
import {
  requireAuth,
  requirePasswordAlreadyChanged,
  requireRole
} from "../middleware/auth.js";
import { toPublicManufacturer } from "../lib/mappers.js";
import { ensureCatalog } from "../services/catalogService.js";
import { manufacturerSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const manufacturersRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const requireAdmin = [...requireActiveUser, requireRole("ADMIN")] as const;
const idParamSchema = z.string().uuid();

async function assertNameFree(name: string, ignoreId?: string): Promise<void> {
  const duplicate = await prisma.manufacturer.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(ignoreId ? { NOT: { id: ignoreId } } : {})
    },
    select: { id: true }
  });
  if (duplicate) {
    throw new AppError("CONFLICT", "Ein Hersteller mit diesem Namen existiert bereits.");
  }
}

// Threat-Model: Ein anonymer Request koennte versuchen, Hersteller-Stammdaten zu lesen/anzulegen; ein
// normaler Nutzer koennte versuchen, geteilte Stammdaten zu aendern oder zu loeschen.
// Serverseitig erzwungen: requireAuth (Lesen/Anlegen fuer jeden eingeloggten Nutzer, geteilter
// Bestand ohne Owner-Konzept, analog zu materials.ts), requireRole("ADMIN") fuer Aendern/Loeschen;
// Loeschen wird abgelehnt, solange Spulen den Hersteller nutzen.
// Negativ-Tests: kein Cookie -> 401, USER -> 403, benutzt -> 409.
// SCOPE: user
manufacturersRouter.get("/", ...requireActiveUser, async (_req, res, next) => {
  try {
    await ensureCatalog();
    const manufacturers = await prisma.manufacturer.findMany({ orderBy: { name: "asc" } });
    sendData(
      res,
      manufacturers.map((manufacturer) => toPublicManufacturer(manufacturer))
    );
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
manufacturersRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createManufacturerInputSchema.parse(req.body);
    await assertNameFree(input.name);
    const created = await prisma.manufacturer.create({ data: input });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "MANUFACTURER",
      entityId: created.id,
      description: created.name,
      after: manufacturerSnapshot(created)
    });
    sendData(res, toPublicManufacturer(created), 201);
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
manufacturersRouter.patch("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const input = createManufacturerInputSchema.parse(req.body);
    await assertNameFree(input.name, id);
    const before = await prisma.manufacturer.findUnique({ where: { id } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Hersteller wurde nicht gefunden.");
    }
    const updated = await prisma.manufacturer
      .update({ where: { id }, data: { name: input.name } })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Hersteller wurde nicht gefunden.");
        }
        throw err;
      });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "MANUFACTURER",
      entityId: id,
      description: updated.name,
      before: manufacturerSnapshot(before),
      after: manufacturerSnapshot(updated)
    });
    sendData(res, toPublicManufacturer(updated));
  } catch (err) {
    next(err);
  }
});

// Loescht auch die zum Hersteller gehoerenden Materialien (FK-Cascade) - erlaubt nur, wenn keine
// Spule den Hersteller nutzt.
// SCOPE: global
manufacturersRouter.delete("/:id", ...requireAdmin, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const inUse = await prisma.spool.count({ where: { manufacturerId: id } });
    if (inUse > 0) {
      throw new AppError(
        "CONFLICT",
        `Der Hersteller wird noch von ${inUse} Spule(n) verwendet und kann nicht geloescht werden.`
      );
    }
    const before = await prisma.manufacturer.findUnique({ where: { id } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Hersteller wurde nicht gefunden.");
    }
    const materialCount = await prisma.material.count({ where: { manufacturerId: id } });
    await prisma.manufacturer.delete({ where: { id } });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "MANUFACTURER",
      entityId: id,
      description: before.name,
      before: { ...manufacturerSnapshot(before), materialCount }
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
