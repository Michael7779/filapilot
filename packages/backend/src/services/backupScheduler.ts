import { createBackup } from "./backupService.js";
import { getSettings } from "./settingsService.js";
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

async function runIfEnabled(): Promise<void> {
  const settings = await getSettings();
  if (!settings.backupEnabled) {
    return;
  }
  try {
    await createBackup();
  } catch (err) {
    logger.error("Taeglicher Backup-Job fehlgeschlagen", { err });
  }
}

export function startDailyBackupScheduler(): void {
  const schedule = () => {
    setTimeout(() => {
      void runIfEnabled();
      setInterval(() => void runIfEnabled(), ONE_DAY_MS);
    }, msUntilNextRun());
  };
  schedule();
}
