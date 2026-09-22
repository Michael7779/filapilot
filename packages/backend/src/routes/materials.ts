import { Router } from "express";
import { createMaterialInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicMaterial } from "../lib/mappers.js";
import { AppError } from "../lib/apiResult.js";

export const materialsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

// Threat-Model: Ein anonymer Request koennte versuchen, Material-Stammdaten zu lesen/anzulegen.
// Serverseitig erzwungen: requireAuth (jeder eingeloggte Nutzer darf, geteilter Bestand ohne
// Owner-Konzept). Negativ-Test: kein Session-Cookie -> 401.
// SCOPE: user
materialsRouter.get("/", ...requireActiveUser, async (_req, res) => {
  const materials = await prisma.material.findMany({ orderBy: { name: "asc" } });
  sendData(
    res,
    materials.map((material) => toPublicMaterial(material))
  );
});

// SCOPE: user
materialsRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createMaterialInputSchema.parse(req.body);
    const created = await prisma.material.create({ data: input }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        throw new AppError("CONFLICT", "Ein Material mit diesem Namen existiert bereits.");
      }
      throw err;
    });
    sendData(res, toPublicMaterial(created), 201);
  } catch (err) {
    next(err);
  }
});
