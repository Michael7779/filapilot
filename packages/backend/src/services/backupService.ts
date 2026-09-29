import { env } from "../env.js";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { getSettings } from "./settingsService.js";
import { logger } from "../logger.js";
import { runExclusive } from "./backupLock.js";
import { backupFileNames, pruneBackups } from "./backupCatalog.js";
import { APP_VERSION } from "../lib/appVersion.js";

const execFile = promisify(execFileCallback);

// Kommando-Ausfuehrung injizierbar (wie restoreService.ts): Tests koennen so pruefen, dass Backup-Ordner und
// Datenbank-URL immer als einzelnes execFile-Argument ankommen - nie durch eine Shell gejagt. `backupFolderPath`
// kommt aus den Admin-Settings (Zod erlaubt aktuell jedes Zeichen); ohne execFile waere ein Wert wie
// `/data"; rm -rf / #` eine Befehls-Einschleusung (CWE-78), weil node:child_process.exec ueber /bin/sh -c laeuft.
export type CommandRunner = (command: string, args: string[]) => Promise<void>;

const defaultRunner: CommandRunner = async (command, args) => {
  await execFile(command, args, { maxBuffer: 20 * 1024 * 1024 });
};

export interface CreateBackupOptions {
  // Injizierbar, damit Tests nicht in den echten Backup-Ordner schreiben (siehe CLAUDE.md Tests).
  targetFolder?: string;
  databaseUrl?: string;
  uploadsFolder?: string;
  run?: CommandRunner;
}

// Ohne Sperre - fuer die Wiederherstellung, die die Sperre schon haelt und vorher eine Sicherung anlegt.
export async function createBackupUnlocked(options: CreateBackupOptions = {}): Promise<string> {
  const settings = await getSettings();
  const targetFolder = options.targetFolder ?? settings.backupFolderPath;
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const uploadsFolder = options.uploadsFolder ?? env.UPLOADS_FOLDER_PATH;
  const run = options.run ?? defaultRunner;

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
  const versionPath = path.join(targetFolder, names.version);

  await run("pg_dump", [databaseUrl, "--no-owner", `--file=${dumpPath}`]);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(versionPath, APP_VERSION, "utf8");

  const uploadsExist = await fs
    .access(uploadsFolder)
    .then(() => true)
    .catch(() => false);
  if (uploadsExist) {
    await run("tar", ["-czf", filesArchivePath, "-C", uploadsFolder, "."]);
  }

  logger.info("Backup erstellt", { targetFolder, timestamp });
  return timestamp;
}

// Regulaere Sicherung (Zeitplan oder Knopf): danach werden aeltere Sicherungen gemaess Einstellung geloescht.
// Die Sicherungen, die vor einer Wiederherstellung entstehen, laufen ueber createBackupUnlocked und werden
// erst bei der naechsten regulaeren Sicherung mit aufgeraeumt - so kann nie der Satz verschwinden, der gerade
// wiederhergestellt wird.
export function createBackup(options: CreateBackupOptions = {}): Promise<string> {
  return runExclusive(async () => {
    const timestamp = await createBackupUnlocked(options);
    const settings = await getSettings();
    try {
      const removed = await pruneBackups(
        options.targetFolder ?? settings.backupFolderPath,
        settings.backupRetentionCount
      );
      if (removed.length > 0) {
        logger.info("Alte Sicherungen geloescht", { removed });
      }
    } catch (err) {
      logger.warn("Aufraeumen alter Sicherungen fehlgeschlagen", { err });
    }
    return timestamp;
  });
}
