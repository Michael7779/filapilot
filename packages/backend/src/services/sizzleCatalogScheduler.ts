import { logger } from "../logger.js";
import { isCatalogDue, lastCatalogSyncAt, syncCatalog } from "./sizzleCatalogService.js";

// Der Katalog wird regelmaessig mit dem Shop abgeglichen (Preise und Sortiment aendern sich): kurz nach dem Start und danach
// alle sechs Stunden. Ein Neustart (z.B. durch das Update-Skript) loest keinen Abruf aus, wenn der letzte noch frisch ist.
export const SCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SCHEDULE_MIN_AGE_MS = 5 * 60 * 60 * 1000;
// Nach dem Start etwas warten: direkt nach einem Update gleicht das Skript das Datenbank-Schema erst nach dem Start ab.
const STARTUP_DELAY_MS = 60_000;

export interface SchedulerDependencies {
  lastSyncedAt: () => Promise<Date | null>;
  sync: () => Promise<unknown>;
  now: () => Date;
}

const defaultDependencies: SchedulerDependencies = {
  lastSyncedAt: lastCatalogSyncAt,
  sync: syncCatalog,
  now: () => new Date()
};

export type ScheduledSyncOutcome = "synced" | "skipped" | "failed";

// Ein Durchlauf: gleicht ab, wenn der letzte Abgleich lange genug her ist. Fehler (Shop nicht erreichbar, Schema noch nicht
// abgeglichen) werden geloggt und beenden nicht den Prozess; der alte Katalog bleibt, der naechste Durchlauf versucht es erneut.
export async function runScheduledSync(deps: SchedulerDependencies = defaultDependencies): Promise<ScheduledSyncOutcome> {
  try {
    if (!isCatalogDue(await deps.lastSyncedAt(), null, deps.now(), SCHEDULE_MIN_AGE_MS)) {
      return "skipped";
    }
    await deps.sync();
    return "synced";
  } catch (err) {
    logger.warn("Regelmaessiger Abgleich des SizzleBrothers-Katalogs fehlgeschlagen - der bisherige Katalog bleibt", { err });
    return "failed";
  }
}

export function startSizzleCatalogScheduler(): void {
  setTimeout(() => void runScheduledSync(), STARTUP_DELAY_MS).unref();
  setInterval(() => void runScheduledSync(), SCHEDULE_INTERVAL_MS).unref();
}
