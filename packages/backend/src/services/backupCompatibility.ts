import { createReadStream } from "node:fs";
import { AppError } from "../lib/apiResult.js";

// So beginnt die Lager-Tabelle in jedem Datenbank-Dump ab Version 0.13.0 (pg_dump, Textformat). Das " (" am Ende unterscheidet sie
// von Tabellen mit gleichem Anfang.
const INVENTORIES_TABLE = "CREATE TABLE public.inventories (";
const DEFAULT_CHUNK_SIZE = 64 * 1024;

// Spulen und Drucker gehoeren seit 0.42.0 zwingend zu einem Lager (Pflichtfeld in der Datenbank). Eine Sicherung aus der Zeit vor den Lagern
// (vor 0.13.0) hat weder die Lager-Tabelle noch die Spalte - sie liesse sich nicht mehr in das aktuelle Schema ueberfuehren. Deshalb wird
// sie VOR dem Einspielen abgewiesen (nichts wird gesichert, geloescht oder veraendert). Der Dump wird gestreamt, nicht komplett geladen.
export async function assertBackupHasInventories(dumpPath: string, chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<void> {
  // dumpPath = Admin-Backup-Ordner + Dateiname aus per Regex geprueftem Zeitstempel (siehe startRestore).
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const stream = createReadStream(dumpPath, { encoding: "latin1", highWaterMark: chunkSize });
  // Das Ende des vorigen Stuecks mitnehmen, damit ein Treffer an der Lesegrenze nicht verloren geht.
  let tail = "";
  for await (const chunk of stream) {
    const window = tail + String(chunk);
    if (window.includes(INVENTORIES_TABLE)) {
      stream.destroy();
      return;
    }
    tail = window.slice(-(INVENTORIES_TABLE.length - 1));
  }
  throw new AppError(
    "VALIDATION_ERROR",
    "Diese Sicherung stammt aus einer Version vor den Lagern (vor 0.13.0) und kann in dieser Version nicht eingespielt werden. Bitte zuerst mit einer aelteren Version wiederherstellen."
  );
}
