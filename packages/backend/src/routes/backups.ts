import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { backupTimestampSchema, restoreBackupInputSchema } from "@filapilot/shared";
import { sendData, AppError } from "../lib/apiResult.js";
import { logger } from "../logger.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { getSettings } from "../services/settingsService.js";
import { backupFileNames, listBackups } from "../services/backupCatalog.js";
import { getRestoreStatus, startRestore } from "../services/restoreService.js";
import { importBackupArchive } from "../services/backupImportService.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";

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

// Threat-Model: Ein hochgeladenes Archiv ist Fremdmaterial - ein Angreifer (oder ein versehentlich falsches Archiv)
// koennte Dateien ausserhalb des Backup-Ordners ueberschreiben (Path-Traversal, Verknuepfungen), fremde Dateien
// einschleusen, eine bestehende Sicherung ueberschreiben oder den Server mit riesigen Uploads fuellen.
// Serverseitig erzwungen: nur Admin; Typ application/x-tar; Streaming mit hartem Limit (2 GB); das Archiv wird
// VOR dem Entpacken geprueft (nur die erwarteten Dateinamen eines einzigen Satzes, nur normale Dateien, Datenbank-
// Dump Pflicht); vorhandene Saetze werden nie ueberschrieben (409); es wird nichts eingespielt - Wiederherstellen
// bleibt ein eigener, bestaetigter Schritt.
// Negativ-Tests: kein Cookie -> 401, USER -> 403, kein tar -> 400, fremde Dateien/Pfade/Links -> 400, doppelt -> 409.
// SCOPE: global
backupsRouter.post(
  "/upload",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    if (!req.is("application/x-tar")) {
      throw new AppError("VALIDATION_ERROR", "Bitte eine tar-Datei einer FilaPilot-Sicherung hochladen.");
    }
    const timestamp = await importBackupArchive(req, (await getSettings()).backupFolderPath);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "BACKUP",
      entityId: timestamp,
      description: `Sicherung hochgeladen (${timestamp})`
    });
    sendData(res, { timestamp }, 201);
  })
);

// SCOPE: global
backupsRouter.post(
  "/:timestamp/restore",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const timestamp = z.string().pipe(backupTimestampSchema).parse(req.params.timestamp);
    restoreBackupInputSchema.parse(req.body);
    // Der Eintrag "wiederhergestellt" entsteht erst nach dem Einspielen (in der wiederhergestellten Datenbank),
    // sonst wuerde er mit ersetzt - deshalb wird der Akteur hier nur mitgegeben.
    await startRestore(timestamp, { auditActor: actorFromRequest(req) });
    sendData(res, { started: true }, 202);
  })
);

// Threat-Model: Der Download liefert die komplette Datenbank inkl. Passwort-Hashes - ein normaler Benutzer
// oder ein Angreifer mit manipuliertem Zeitstempel (Path-Traversal) duerfte nie drankommen. Serverseitig
// erzwungen: requireRole("ADMIN"); Zeitstempel per Regex, Dateinamen werden daraus neu gebaut; es werden nur
// Dateien des Sicherungssatzes im Backup-Ordner gepackt (nie ein frei waehlbarer Pfad).
// Negativ-Tests: kein Cookie -> 401, USER -> 403, ungueltiger Zeitstempel -> 400, unbekannt -> 404.
// SCOPE: global
backupsRouter.get(
  "/:timestamp/download",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const timestamp = z.string().pipe(backupTimestampSchema).parse(req.params.timestamp);
    const folder = (await getSettings()).backupFolderPath;
    const names = backupFileNames(timestamp);
    const present: string[] = [];
    for (const fileName of Object.values(names)) {
      // fileName stammt aus dem per Regex geprueften Zeitstempel, folder aus den Admin-Einstellungen.
      if (await fs.access(path.join(folder, fileName)).then(() => true, () => false)) {
        present.push(fileName);
      }
    }
    if (!present.includes(names.database)) {
      throw new AppError("NOT_FOUND", "Diese Sicherung wurde nicht gefunden.");
    }

    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "BACKUP",
      entityId: timestamp,
      description: `Sicherung heruntergeladen (${timestamp})`
    });
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="filapilot-backup-${timestamp}.tar"`);
    const tar = spawn("/usr/bin/tar", ["-cf", "-", "-C", folder, ...present]);
    tar.stdout.pipe(res);
    tar.on("error", (err) => {
      logger.error("Sicherung konnte nicht gepackt werden", { err, timestamp });
      res.destroy(err);
    });
    tar.on("close", (code) => {
      if (code !== 0) {
        logger.error("tar beim Sicherungs-Download fehlgeschlagen", { code, timestamp });
        res.destroy();
      }
    });
    res.on("close", () => tar.kill());
  })
);
