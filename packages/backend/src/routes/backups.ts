import { Router } from "express";
import { z } from "zod";
import { backupTimestampSchema, restoreBackupInputSchema } from "@filapilot/shared";
import { sendData } from "../lib/apiResult.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { getSettings } from "../services/settingsService.js";
import { listBackups } from "../services/backupCatalog.js";
import { getRestoreStatus, startRestore } from "../services/restoreService.js";

export const backupsRouter = Router();

const requireAdmin = [requireAuth, requirePasswordAlreadyChanged, requireRole("ADMIN")] as const;

// Threat-Model: Die Wiederherstellung ueberschreibt die komplette Datenbank - ein normaler Benutzer (oder
// ein gestohlenes Benutzer-Konto) koennte versuchen, damit Daten zu vernichten oder alte Zugangsdaten
// zurueckzuspielen; ein Admin koennte sie versehentlich ausloesen; ein manipulierter Zeitstempel koennte
// auf fremde Dateien zeigen (Path-Traversal). Serverseitig erzwungen: requireRole("ADMIN"); der Zeitstempel
// wird strikt per Regex geprueft und nie als Pfad verwendet (Dateinamen werden daraus neu gebaut); ein festes
// Bestaetigungswort im Body; vor dem Einspielen entsteht automatisch eine Sicherung des aktuellen Stands;
// das Einspielen laeuft in einer Transaktion (bei Fehler unveraendert); nie automatisch beim Start.
// Negativ-Tests: kein Cookie -> 401, USER -> 403, ungueltiger Zeitstempel -> 400, falsches Wort -> 400,
// unbekannte Sicherung -> 404.
// SCOPE: global
backupsRouter.get(
  "/",
  ...requireAdmin,
  asyncHandler(async (_req, res) => {
    sendData(res, await listBackups((await getSettings()).backupFolderPath));
  })
);

// SCOPE: global
backupsRouter.get(
  "/restore-status",
  ...requireAdmin,
  asyncHandler(async (_req, res) => {
    sendData(res, getRestoreStatus());
  })
);

// SCOPE: global
backupsRouter.post(
  "/:timestamp/restore",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const timestamp = z.string().pipe(backupTimestampSchema).parse(req.params.timestamp);
    restoreBackupInputSchema.parse(req.body);
    await startRestore(timestamp);
    sendData(res, { started: true }, 202);
  })
);
