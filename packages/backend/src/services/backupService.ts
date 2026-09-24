import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { getSettings } from "./settingsService.js";
import { logger } from "../logger.js";
import { runExclusive } from "./backupLock.js";
import { backupFileNames } from "./backupCatalog.js";

const exec = promisify(execCallback);

export interface CreateBackupOptions {
  // Injizierbar, damit Tests nicht in den echten Backup-Ordner schreiben (siehe CLAUDE.md Tests).
  targetFolder?: string;
  databaseUrl?: string;
  uploadsFolder?: string;
}

// Ohne Sperre - fuer die Wiederherstellung, die die Sperre schon haelt und vorher eine Sicherung anlegt.
export async function createBackupUnlocked(options: CreateBackupOptions = {}): Promise<string> {
  const settings = await getSettings();
  const targetFolder = options.targetFolder ?? settings.backupFolderPath;
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const uploadsFolder = options.uploadsFolder ?? "/data/uploads";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL ist nicht gesetzt - Backup kann nicht erstellt werden.");
  }

  // targetFolder kommt aus den Admin-Settings oder einem Test-Aufruf, nie aus einem
  // Request-Body/User-Input - kein Path-Traversal-Risiko durch fremde Eingaben.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.mkdir(targetFolder, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const names = backupFileNames(timestamp);
  const dumpPath = path.join(targetFolder, names.database);
  const settingsPath = path.join(targetFolder, names.settings);
  const filesArchivePath = path.join(targetFolder, names.uploads);

  await exec(`pg_dump "${databaseUrl}" --no-owner --file="${dumpPath}"`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");

  const uploadsExist = await fs
    .access(uploadsFolder)
    .then(() => true)
    .catch(() => false);
  if (uploadsExist) {
    await exec(`tar -czf "${filesArchivePath}" -C "${uploadsFolder}" .`);
  }

  logger.info("Backup erstellt", { targetFolder, timestamp });
  return timestamp;
}

export function createBackup(options: CreateBackupOptions = {}): Promise<string> {
  return runExclusive(() => createBackupUnlocked(options));
}
