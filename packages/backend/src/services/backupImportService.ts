import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { backupTimestampSchema } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { logger } from "../logger.js";
import { backupFileNames } from "./backupCatalog.js";
import { runExclusive } from "./backupLock.js";

export const MAX_BACKUP_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const TAR = "/usr/bin/tar";
const DATABASE_FILE_PATTERN = /^filapilot-db-(.+)\.sql$/;

function runTar(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(TAR, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`tar ${args[0]} fehlgeschlagen (${String(code)}): ${stderr.slice(0, 300)}`));
      }
    });
  });
}

function invalid(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message);
}

// Zaehlt mit und bricht ab, sobald mehr als das Limit ankommt (der Body wird nie komplett im Speicher gehalten).
function limitBytes(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      callback(seen > limit ? invalid("Die Datei ist zu gross.") : null, chunk);
    }
  });
}

// Prueft die Namensliste eines Archivs streng: nur Dateien eines einzigen Sicherungssatzes, exakt mit den
// erwarteten Namen (keine Ordner, keine Pfade, kein "../"), nur normale Dateien (keine Links) und ein Datenbank-Dump.
// Liefert den Zeitstempel des Satzes.
export function validateArchiveEntries(names: string[], types: string[]): string {
  if (names.length === 0 || names.length !== types.length) {
    throw invalid("Das Archiv ist leer oder beschaedigt.");
  }
  const databaseName = names.find((name) => DATABASE_FILE_PATTERN.test(name));
  const timestamp = databaseName ? DATABASE_FILE_PATTERN.exec(databaseName)?.[1] : undefined;
  if (!timestamp || !backupTimestampSchema.safeParse(timestamp).success) {
    throw invalid("Das Archiv enthaelt keine gueltige Datenbank-Sicherung.");
  }
  const allowed = new Set(Object.values(backupFileNames(timestamp)));
  if (new Set(names).size !== names.length || !names.every((name) => allowed.has(name))) {
    throw invalid("Das Archiv enthaelt unerwartete Dateien - es darf nur eine FilaPilot-Sicherung enthalten.");
  }
  if (!types.every((type) => type === "-")) {
    throw invalid("Das Archiv darf nur normale Dateien enthalten (keine Ordner oder Verknuepfungen).");
  }
  return timestamp;
}

async function pathExists(filePath: string): Promise<boolean> {
  // filePath = Admin-Backup-Ordner + fest gebauter Dateiname.
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

// Nimmt eine heruntergeladene Sicherung (.tar) entgegen, prueft sie und legt die Dateien im Backup-Ordner ab.
// Es wird nichts eingespielt - das Wiederherstellen bleibt ein eigener, bestaetigter Schritt.
export async function importBackupArchive(body: Readable, folder: string): Promise<string> {
  return runExclusive(async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner kommt aus den Admin-Einstellungen.
    await fs.mkdir(folder, { recursive: true });
    // Der Name der Zwischendatei ist zufaellig, kein Client-Input.
    const temporary = path.join(folder, `.upload-${randomUUID()}.tar`);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await pipeline(body, limitBytes(MAX_BACKUP_UPLOAD_BYTES), createWriteStream(temporary, { mode: 0o600 }));

      let names: string[];
      let types: string[];
      try {
        names = (await runTar(["-tf", temporary])).split("\n").filter(Boolean);
        types = (await runTar(["-tvf", temporary])).split("\n").filter(Boolean).map((line) => line.charAt(0));
      } catch (err) {
        logger.warn("Hochgeladenes Archiv konnte nicht gelesen werden", { err });
        throw invalid("Die Datei ist kein gueltiges tar-Archiv.");
      }
      const timestamp = validateArchiveEntries(names, types);

      for (const name of names) {
        if (await pathExists(path.join(folder, name))) {
          throw new AppError("CONFLICT", "Diese Sicherung ist bereits vorhanden.");
        }
      }
      await runTar(["-xf", temporary, "-C", folder, "--no-same-owner", "--no-same-permissions"]);
      return timestamp;
    } finally {
      await fs.rm(temporary, { force: true }).catch((err: unknown) => {
        logger.error("Zwischendatei des Sicherungs-Uploads konnte nicht geloescht werden", { err });
      });
    }
  });
}
