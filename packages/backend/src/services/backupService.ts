import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { getSettings } from "./settingsService.js";
import { logger } from "../logger.js";

const exec = promisify(execCallback);

export interface CreateBackupOptions {
  // Injizierbar, damit Tests nicht in den echten Backup-Ordner schreiben (siehe CLAUDE.md Tests).
  targetFolder?: string;
  databaseUrl?: string;
  uploadsFolder?: string;
}

export async function createBackup(options: CreateBackupOptions = {}): Promise<string> {
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
  const dumpPath = path.join(targetFolder, `filapilot-db-${timestamp}.sql`);
  const settingsPath = path.join(targetFolder, `filapilot-settings-${timestamp}.json`);
  const filesArchivePath = path.join(targetFolder, `filapilot-uploads-${timestamp}.tar.gz`);

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
