import { Router } from "express";
import { z } from "zod";
import { createSpoolInputSchema, updateSpoolInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicSpool, toPublicSpoolWithMaterial } from "../lib/mappers.js";
import { omitUndefined } from "../lib/omitUndefined.js";

export const spoolsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();

// Threat-Model: Ein anonymer Request koennte versuchen, den Filament-Bestand einzusehen oder zu
// aendern. Serverseitig erzwungen: requireAuth + requirePasswordAlreadyChanged auf jeder Route.
// Spulen gehoeren keinem einzelnen Nutzer (geteilter Bestand, 2-5 Personen), daher kein
// Ownership-Check noetig - jeder eingeloggte Nutzer darf lesen/anlegen/aendern/loeschen.
// Negativ-Tests: kein Cookie -> 401, mustChangePassword=true -> 403.
// SCOPE: user
spoolsRouter.get("/", ...requireActiveUser, async (_req, res) => {
  const spools = await prisma.spool.findMany({
    include: { material: true },
    orderBy: { createdAt: "desc" }
  });
  sendData(
    res,
    spools.map((spool) => toPublicSpoolWithMaterial(spool))
  );
});

// SCOPE: user
spoolsRouter.get("/:id", ...requireActiveUser, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const spool = await prisma.spool.findUnique({ where: { id }, include: { material: true } });
    if (!spool) {
      throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
    }
    sendData(res, toPublicSpoolWithMaterial(spool));
  } catch (err) {
    next(err);
  }
});

// SCOPE: user
spoolsRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createSpoolInputSchema.parse(req.body);
    const material = await prisma.material.findUnique({ where: { id: input.materialId } });
    if (!material) {
      throw new AppError("VALIDATION_ERROR", "Unbekanntes Material.");
    }
    const created = await prisma.spool.create({ data: input });
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
      const material = await prisma.material.findUnique({ where: { id: input.materialId } });
      if (!material) {
        throw new AppError("VALIDATION_ERROR", "Unbekanntes Material.");
      }
    }

    const updated = await prisma.spool
      .update({ where: { id }, data: omitUndefined(input) })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Record to update not found")) {
          throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
        }
        throw err;
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
    await prisma.spool.delete({ where: { id } }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
        throw new AppError("NOT_FOUND", "Spule wurde nicht gefunden.");
      }
      throw err;
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
