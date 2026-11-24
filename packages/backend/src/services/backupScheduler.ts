import { createBackup } from "./backupService.js";
import { getSettings } from "./settingsService.js";
import { pruneAuditLog } from "./auditRetentionService.js";
import { SYSTEM_ACTOR, recordAudit } from "./auditService.js";
import { clearBackupFailure, recordBackupFailure } from "./backupStatusService.js";
import { logger } from "../logger.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_HOUR_UTC = 3;

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), BACKUP_HOUR_UTC, 0, 0)
  );
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export interface ScheduledBackupDependencies {
  createBackup: () => Promise<string>;
}

// Ein Lauf des taeglichen Jobs. Ein Fehlschlag wird zusaetzlich zum Server-Log gemerkt (Dashboard "Braucht Aufmerksamkeit")
// und im Aenderungsprotokoll festgehalten; die naechste erfolgreiche Sicherung loescht den Vermerk wieder.
export async function runScheduledBackup(
  deps: ScheduledBackupDependencies = { createBackup }
): Promise<void> {
  try {
    const settings = await getSettings();
    if (settings.backupEnabled) {
      try {
        const timestamp = await deps.createBackup();
        await clearBackupFailure();
        await recordAudit({
          actor: SYSTEM_ACTOR,
          action: "EVENT",
          area: "BACKUP",
          entityId: timestamp,
          description: `Automatische Sicherung erstellt (${timestamp})`
        });
      } catch (err) {
        logger.error("Taeglicher Backup-Job fehlgeschlagen", { err });
        const reason = await recordBackupFailure(err);
        await recordAudit({
          actor: SYSTEM_ACTOR,
          action: "EVENT",
          area: "BACKUP",
          entityId: null,
          description: `Automatische Sicherung fehlgeschlagen: ${reason}`
        });
      }
    }
  } catch (err) {
    logger.error("Taeglicher Backup-Job konnte nicht ausgewertet werden", { err });
  }
  // Protokoll-Aufbewahrung laeuft unabhaengig davon, ob Sicherungen aktiv sind.
  try {
    await pruneAuditLog();
  } catch (err) {
    logger.error("Aufraeumen des Aenderungsprotokolls fehlgeschlagen", { err });
  }
}

export function startDailyBackupScheduler(): void {
  const schedule = () => {
    setTimeout(() => {
      void runScheduledBackup();
      setInterval(() => void runScheduledBackup(), ONE_DAY_MS);
    }, msUntilNextRun());
  };
  schedule();
}
