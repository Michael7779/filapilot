import { Router } from "express";
import { createManufacturerInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { toPublicManufacturer } from "../lib/mappers.js";

export const manufacturersRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

// Bekannteste FDM-Filament-Hersteller, damit die Liste nicht leer startet (siehe
// docs/requirements/manufacturers.md). Wird einmalig angelegt, wenn die Tabelle leer ist.
const DEFAULT_MANUFACTURERS = [
  "Bambu Lab",
  "Polymaker",
  "eSun",
  "Prusament",
  "Sunlu",
  "Overture",
  "Devil Design",
  "Fillamentum",
  "ColorFabb",
  "Extrudr",
  "Hatchbox",
  "3DJake"
];

async function ensureDefaultManufacturers(): Promise<void> {
  const count = await prisma.manufacturer.count();
  if (count > 0) {
    return;
  }
  await prisma.manufacturer.createMany({
    data: DEFAULT_MANUFACTURERS.map((name) => ({ name })),
    skipDuplicates: true
  });
}

// Threat-Model: Ein anonymer Request koennte versuchen, Hersteller-Stammdaten zu lesen/anzulegen.
// Serverseitig erzwungen: requireAuth (jeder eingeloggte Nutzer darf, geteilter Bestand ohne
// Owner-Konzept, analog zu materials.ts). Negativ-Test: kein Session-Cookie -> 401.
// SCOPE: user
manufacturersRouter.get("/", ...requireActiveUser, async (_req, res) => {
  await ensureDefaultManufacturers();
  const manufacturers = await prisma.manufacturer.findMany({ orderBy: { name: "asc" } });
  sendData(
    res,
    manufacturers.map((manufacturer) => toPublicManufacturer(manufacturer))
  );
});

// SCOPE: user
manufacturersRouter.post("/", ...requireActiveUser, async (req, res, next) => {
  try {
    const input = createManufacturerInputSchema.parse(req.body);
    const created = await prisma.manufacturer.create({ data: input }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        throw new AppError("CONFLICT", "Ein Hersteller mit diesem Namen existiert bereits.");
      }
      throw err;
    });
    sendData(res, toPublicManufacturer(created), 201);
  } catch (err) {
    next(err);
  }
});
