import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { backupTimestampSchema, type RestoreStatus } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { getSettings } from "./settingsService.js";
import { createBackupUnlocked } from "./backupService.js";
import { acquireBackupLock } from "./backupLock.js";
import { backupFileNames } from "./backupCatalog.js";
import { connectAllPrinters, disconnectAllPrinters } from "./printerRuntime.js";

const execFile = promisify(execFileCallback);

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<void>;

const defaultRunner: CommandRunner = async (command, args, options) => {
  await execFile(command, args, { maxBuffer: 20 * 1024 * 1024, ...options });
};

// Alles, was von aussen kommt (Ordner, Kommandos, Sicherung), ist injizierbar - so laesst sich der
// Ablauf ohne echte Datenbank und ohne echte Programme testen (siehe CLAUDE.md Tests).
export interface RestoreDependencies {
  folder: string;
  databaseUrl: string;
  uploadsFolder: string;
  run: CommandRunner;
  createSafetyBackup: () => Promise<string>;
  afterDatabaseRestore: () => Promise<void>;
  afterAllRestored: () => Promise<void>;
  syncSchema: boolean;
}

const IDLE: RestoreStatus = { state: "idle", step: null, timestamp: null, message: null };
let status: RestoreStatus = { ...IDLE };

export function getRestoreStatus(): RestoreStatus {
  return { ...status };
}

export function resetRestoreStatusForTests(): void {
  status = { ...IDLE };
}

async function defaultDependencies(): Promise<RestoreDependencies> {
  const settings = await getSettings();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new AppError("INTERNAL_ERROR", "DATABASE_URL ist nicht gesetzt.");
  }
  return {
    folder: settings.backupFolderPath,
    databaseUrl,
    uploadsFolder: "/data/uploads",
    run: defaultRunner,
    createSafetyBackup: () => createBackupUnlocked(),
    afterDatabaseRestore: () => prisma.$disconnect(),
    afterAllRestored: async () => {
      disconnectAllPrinters();
      await connectAllPrinters();
    },
    syncSchema: true
  };
}

function describeError(err: unknown, databaseUrl: string): string {
  let raw = "Unbekannter Fehler";
  if (err instanceof Error) {
    const stderr = "stderr" in err && typeof err.stderr === "string" ? err.stderr : "";
    raw = stderr || err.message;
  }
  return raw.split(databaseUrl).join("***").slice(0, 500);
}

async function exists(filePath: string): Promise<boolean> {
  // filePath = Admin-Backup-Ordner + Dateiname aus per Regex geprueftem Zeitstempel.
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

async function clearFolder(folder: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.mkdir(folder, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  for (const entry of await fs.readdir(folder)) {
    await fs.rm(path.join(folder, entry), { recursive: true, force: true });
  }
}

function setStep(step: NonNullable<RestoreStatus["step"]>, timestamp: string): void {
  status = { state: "running", step, timestamp, message: null };
}

async function syncSchema(deps: RestoreDependencies): Promise<string | null> {
  try {
    // Eine Sicherung aus einer aelteren Version hat evtl. noch nicht alle aktuellen Tabellen/Spalten.
    await deps.run("node_modules/.bin/prisma", [
      "db",
      "push",
      "--schema=prisma/schema.prisma",
      "--skip-generate"
    ]);
    return null;
  } catch (err) {
    logger.warn("Schema-Abgleich nach Wiederherstellung fehlgeschlagen", { err });
    return `Schema-Abgleich fehlgeschlagen: ${describeError(err, deps.databaseUrl)}`;
  }
}

async function performRestore(
  timestamp: string,
  deps: RestoreDependencies,
  release: () => void
): Promise<void> {
  const names = backupFileNames(timestamp);
  try {
    setStep("safety-backup", timestamp);
    await deps.createSafetyBackup();

    // Eine einzige Transaktion: Schema leeren und Dump einspielen. Schlaegt irgendetwas fehl, wird alles
    // zurueckgerollt und die Datenbank bleibt unveraendert.
    setStep("database", timestamp);
    await deps.run("psql", [
      deps.databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "-c",
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
      "-f",
      path.join(deps.folder, names.database)
    ]);
    await deps.afterDatabaseRestore();

    const uploadsArchive = path.join(deps.folder, names.uploads);
    if (await exists(uploadsArchive)) {
      setStep("uploads", timestamp);
      await clearFolder(deps.uploadsFolder);
      await deps.run("tar", ["-xzf", uploadsArchive, "-C", deps.uploadsFolder, "--no-same-owner"]);
    }

    let warning: string | null = null;
    if (deps.syncSchema) {
      setStep("schema", timestamp);
      warning = await syncSchema(deps);
    }

    setStep("finish", timestamp);
    await deps.afterAllRestored();
    status = { state: "done", step: null, timestamp, message: warning };
    logger.info("Backup wiederhergestellt", { timestamp });
  } catch (err) {
    logger.error("Wiederherstellung fehlgeschlagen", { err, timestamp });
    status = {
      state: "failed",
      step: status.step,
      timestamp,
      message: describeError(err, deps.databaseUrl)
    };
  } finally {
    release();
  }
}

// Prueft alles Pruefbare sofort (damit der Aufrufer einen klaren Fehler bekommt) und startet dann die
// eigentliche Wiederherstellung im Hintergrund - sie kann bei grossen Datenbanken laenger dauern als ein
// Proxy-Timeout. Den Fortschritt liefert getRestoreStatus(). Liefert ein Promise fuer das Ende der
// Wiederherstellung, damit Tests darauf warten koennen; die Route wartet nicht darauf.
export async function startRestore(
  timestamp: string,
  overrides: Partial<RestoreDependencies> = {}
): Promise<{ finished: Promise<void> }> {
  if (!backupTimestampSchema.safeParse(timestamp).success) {
    throw new AppError("VALIDATION_ERROR", "Ungueltiger Sicherungs-Zeitstempel.");
  }
  const deps = { ...(await defaultDependencies()), ...overrides };
  if (!(await exists(path.join(deps.folder, backupFileNames(timestamp).database)))) {
    throw new AppError("NOT_FOUND", "Diese Sicherung wurde nicht gefunden.");
  }

  const release = acquireBackupLock();
  setStep("safety-backup", timestamp);
  return { finished: performRestore(timestamp, deps, release) };
}
