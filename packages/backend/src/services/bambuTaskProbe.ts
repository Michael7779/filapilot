import type { BambuRegion } from "@filapilot/shared";
import { logger } from "../logger.js";
import { getBambuCloudClient, logBambuFailure } from "./bambuCloudClient.js";

// Voruebergehende Diagnose (Schritt 1 zu Befund OP-P11): Liefert die Druckhistorie der Bambu-Cloud den Verbrauch je Druck
// und Fach? Es wird nichts gespeichert, nur protokolliert.
//
// Threat-Model: (1) Eingeloggte Benutzer koennten durch wiederholtes Abgleichen viele Anfragen an Bambu ausloesen, und
// Druckdaten koennten ins Server-Protokoll gelangen. (2) Serverseitig erzwungen: nur beim Abgleich von Hand (gleiche Rechte
// wie dieser), nie im Zeitplan, feste Adresse; protokolliert werden Feldnamen und nur die Zahlen fuer Gramm, Fach und Status -
// keine Namen, Kennungen, Seriennummern oder Links. (3) Tests: tests/unit/bambuTaskProbe.test.ts,
// tests/integration/bambuAutoSync.test.ts.

const VALUE_KEYS = new Set(["ams", "amsId", "slotId", "status", "weight"]);
const SAMPLE_COUNT = 3;
const MAX_LIST_ENTRIES = 17;

export interface TaskSample {
  knownPrinter: boolean;
  values: Record<string, number>;
  lists: Record<string, Record<string, number>[]>;
}

export interface TaskDescription {
  count: number;
  fields: string[];
  listFields: Record<string, string[]>;
  samples: TaskSample[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function plainNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((name) => /^\w{1,40}$/.test(name));
}

function allowedNumbers(record: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [name, value] of Object.entries(record)) {
    const text = typeof value === "number" || typeof value === "string" ? String(value) : "";
    // Nur kurze Zahlen: lange Ziffernfolgen waeren eher Kennungen als Gramm, Fach oder Status.
    if (VALUE_KEYS.has(name) && text !== "" && text.length <= 12 && Number.isFinite(Number(text))) {
      result[name] = Number(text);
    }
  }
  return result;
}

// Felder eines Auftrags, die Listen aus Objekten sind (z.B. die Zuordnung der AMS-Faecher).
function objectLists(task: Record<string, unknown>): [string, Record<string, unknown>[]][] {
  return plainNames(task).flatMap((name) => {
    const value = task[name];
    return Array.isArray(value) && value.length > 0 ? [[name, value.slice(0, MAX_LIST_ENTRIES).map(asRecord)]] : [];
  });
}

const sorted = (names: Iterable<string>): string[] => [...new Set(names)].sort((a, b) => a.localeCompare(b)).slice(0, 60);

export function describeTasks(tasks: readonly unknown[], printerSerials: readonly string[]): TaskDescription {
  const records = tasks.map(asRecord);
  const serials = new Set(printerSerials.map((serial) => serial.toUpperCase()));
  const listFields: Record<string, string[]> = {};
  for (const [name, entries] of records.flatMap(objectLists)) {
    listFields[name] = sorted([...(listFields[name] ?? []), ...entries.flatMap(plainNames)]);
  }
  return {
    count: records.length,
    fields: sorted(records.flatMap(plainNames)),
    listFields,
    samples: records.slice(0, SAMPLE_COUNT).map((task) => ({
      knownPrinter: Object.values(task).some((value) => typeof value === "string" && serials.has(value.toUpperCase())),
      values: allowedNumbers(task),
      lists: Object.fromEntries(objectLists(task).map(([name, entries]) => [name, entries.map(allowedNumbers)]))
    }))
  };
}

// Wirft nie: die Diagnose darf den Abgleich nicht stoeren.
export async function probeTaskHistory(region: BambuRegion, token: string, printerSerials: readonly string[]): Promise<void> {
  try {
    const tasks = await getBambuCloudClient().listTasks(region, token);
    logger.info("Bambu-Cloud Druckhistorie: Aufbau", { ...describeTasks(tasks, printerSerials) });
  } catch (err) {
    logBambuFailure(err);
  }
}
