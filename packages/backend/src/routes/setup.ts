import { Router } from "express";
import { setupInputSchema } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { hashPassword } from "../services/authService.js";
import { startSession } from "../lib/sessionCookie.js";
import { toPublicUser } from "../lib/mappers.js";
import { userSnapshot } from "../lib/auditSnapshots.js";
import { recordAudit } from "../services/auditService.js";

export const setupRouter = Router();

// Threat-Model: Ein anonymer Angreifer koennte auf einer bereits eingerichteten Instanz versuchen, sich
// ueber die Einrichtung einen Admin-Zugang zu verschaffen. Serverseitig erzwungen: Der Zugang wird nur
// vergeben, solange die Tabelle users leer ist - Pruefung und Anlage laufen in einer Serializable-
// Transaktion, damit zwei gleichzeitige Aufrufe nicht beide durchkommen. Auf einer frischen Instanz gewinnt
// bewusst, wer zuerst einrichtet (siehe docs/requirements/auth.md). Negativ-Test: sobald ein Benutzer
// existiert -> 403, auch bei korrekten Daten.
// SCOPE: global
setupRouter.get("/status", asyncHandler(async (_req, res) => {
  sendData(res, { needsSetup: (await prisma.user.count()) === 0 });
}));

// SCOPE: global
setupRouter.post("/", asyncHandler(async (req, res) => {
  const input = setupInputSchema.parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const created = await prisma.$transaction(
    async (tx) => {
      if ((await tx.user.count()) > 0) {
        throw new AppError("FORBIDDEN", "Die Einrichtung wurde bereits abgeschlossen.");
      }
      return tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          passwordHash,
          role: "ADMIN",
          mustChangePassword: false
        }
      });
    },
    { isolationLevel: "Serializable" }
  );
  await recordAudit({
    actor: { id: created.id, username: created.username },
    action: "CREATE",
    area: "USER",
    entityId: created.id,
    description: `${created.username} (erster Administrator, Einrichtung)`,
    after: userSnapshot(created)
  });
  await startSession(res, created.id);
  sendData(res, toPublicUser(created), 201);
}));
