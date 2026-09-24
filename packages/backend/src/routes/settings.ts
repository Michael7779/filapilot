import { Router } from "express";
import { updateSettingsInputSchema } from "@filapilot/shared";
import { sendData } from "../lib/apiResult.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { createBackup } from "../services/backupService.js";
import { sendTestEmail } from "../services/mailService.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { settingsSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const settingsRouter = Router();

const requireAdmin = [requireAuth, requirePasswordAlreadyChanged, requireRole("ADMIN")] as const;

// SCOPE: global
settingsRouter.get(
  "/",
  ...requireAdmin,
  asyncHandler(async (_req, res) => {
    sendData(res, await getSettings());
  })
);

// Threat-Model: Ein Nutzer ohne Admin-Rolle koennte versuchen, SMTP-Zugangsdaten oder den
// Backup-Pfad zu aendern. Serverseitig erzwungen: requireRole("ADMIN"). Negativ-Test: Nutzer mit
// Rolle USER erhaelt 403.
// SCOPE: global
settingsRouter.patch("/", ...requireAdmin, async (req, res, next) => {
  try {
    const input = updateSettingsInputSchema.parse(req.body);
    const before = await getSettings();
    const updated = await updateSettings(input);
    // Das SMTP-Passwort ist ein Geheimnis: nie im Protokoll, nur dass es gesetzt wurde.
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "SETTINGS",
      description: "Einstellungen",
      before: settingsSnapshot(before),
      after: {
        ...settingsSnapshot(updated),
        ...(input.smtp?.password ? { smtpPasswordChanged: true } : {})
      }
    });
    sendData(res, updated);
  } catch (err) {
    next(err);
  }
});

// SCOPE: global
settingsRouter.post("/backup", ...requireAdmin, async (req, res, next) => {
  try {
    const timestamp = await createBackup();
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "BACKUP",
      entityId: timestamp,
      description: `Sicherung erstellt (${timestamp})`
    });
    sendData(res, { timestamp }, 201);
  } catch (err) {
    next(err);
  }
});

// Threat-Model: Ein Nutzer ohne Admin-Rolle koennte den Server als Mail-Relay missbrauchen. Serverseitig
// erzwungen: requireRole("ADMIN"); die Test-Mail geht nur an die eigene Adresse des angemeldeten Admins,
// nie an einen frei waehlbaren Empfaenger. Negativ-Tests: kein Cookie -> 401, USER -> 403.
// SCOPE: global
settingsRouter.post(
  "/smtp-test",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    sendData(res, await sendTestEmail(getAuthenticatedUser(req).email));
  })
);
