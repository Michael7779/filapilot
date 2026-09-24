import fs from "node:fs/promises";
import path from "node:path";
import { backupTimestampSchema, type BackupInfo } from "@filapilot/shared";

const FILE_PATTERN = /^filapilot-(db|settings|uploads)-(.+)\.(sql|json|tar\.gz)$/;

export function backupFileNames(timestamp: string): {
  database: string;
  settings: string;
  uploads: string;
} {
  return {
    database: `filapilot-db-${timestamp}.sql`,
    settings: `filapilot-settings-${timestamp}.json`,
    uploads: `filapilot-uploads-${timestamp}.tar.gz`
  };
}

// "2026-09-24T01-00-00-008Z" -> ISO-Datum. Der Zeitstempel wurde beim Erstellen aus toISOString() gebildet.
export function timestampToIso(timestamp: string): string {
  return timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
}

async function fileSize(filePath: string): Promise<number | null> {
  // filePath entsteht aus dem Admin-Backup-Ordner und einem per Regex geprueften Dateinamen.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.stat(filePath).then((stat) => stat.size, () => null);
}

// Listet nur wiederherstellbare Saetze (mit Datenbank-Dump), neueste zuerst.
export async function listBackups(folder: string): Promise<BackupInfo[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await fs.readdir(folder).catch(() => [] as string[]);
  const timestamps = new Set<string>();
  for (const entry of entries) {
    const match = FILE_PATTERN.exec(entry);
    const timestamp = match?.[2];
    if (timestamp && backupTimestampSchema.safeParse(timestamp).success) {
      timestamps.add(timestamp);
    }
  }

  const infos: BackupInfo[] = [];
  for (const timestamp of timestamps) {
    const names = backupFileNames(timestamp);
    const databaseSize = await fileSize(path.join(folder, names.database));
    if (databaseSize === null) {
      continue;
    }
    const settingsSize = await fileSize(path.join(folder, names.settings));
    const uploadsSize = await fileSize(path.join(folder, names.uploads));
    infos.push({
      timestamp,
      createdAt: timestampToIso(timestamp),
      hasUploads: uploadsSize !== null,
      sizeBytes: databaseSize + (settingsSize ?? 0) + (uploadsSize ?? 0)
    });
  }
  return infos.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
