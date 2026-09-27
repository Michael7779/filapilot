import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { AppError } from "../lib/apiResult.js";
import { SYSTEM_ACTOR } from "./auditService.js";
import { runCloudSync } from "./bambuSyncRunner.js";
import { getSettings } from "./settingsService.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
// Pause zwischen zwei Lagern, damit die Cloud nicht mit einer Anfrage-Serie belastet wird
const PAUSE_BETWEEN_INVENTORIES_MS = 5_000;

export interface AutoSyncOptions {
  now?: Date;
  pauseMs?: number;
}

// Faellig ist eine Verbindung, wenn der letzte Versuch (erfolgreich oder nicht) laenger als das Intervall zurueckliegt.
export function isDue(lastAttemptAt: Date | null, intervalMinutes: number, now: Date): boolean {
  return lastAttemptAt === null || now.getTime() - lastAttemptAt.getTime() >= intervalMinutes * 60_000;
}

// Gleicht alle faelligen, gemerkten Verbindungen nacheinander ab. Ein Fehler in einem Lager stoppt die anderen nicht.
// Liefert die Anzahl der versuchten Abgleiche.
export async function runAutoSyncOnce(options: AutoSyncOptions = {}): Promise<number> {
  const now = options.now ?? new Date();
  const { bambuAutoSyncMinutes } = await getSettings();
  if (bambuAutoSyncMinutes <= 0) {
    return 0;
  }
  const connections = await prisma.bambuConnection.findMany({ select: { inventoryId: true, lastAttemptAt: true } });
  const due = connections.filter((connection) => isDue(connection.lastAttemptAt, bambuAutoSyncMinutes, now));
  let attempted = 0;
  for (const connection of due) {
    if (attempted > 0 && (options.pauseMs ?? PAUSE_BETWEEN_INVENTORIES_MS) > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? PAUSE_BETWEEN_INVENTORIES_MS));
    }
    attempted += 1;
    try {
      await runCloudSync(connection.inventoryId, SYSTEM_ACTOR, true);
    } catch (err) {
      // Der Grund steht bereits am Lager (lastSyncError) bzw. die Verbindung wurde bei Ablauf verworfen.
      logger.warn("Automatischer Bambu-Abgleich fehlgeschlagen", {
        inventoryId: connection.inventoryId,
        reason: err instanceof AppError ? err.message : "unbekannt"
      });
    }
  }
  return attempted;
}

export function startBambuAutoSync(): void {
  setInterval(() => {
    runAutoSyncOnce().catch((err: unknown) => logger.error("Automatischer Bambu-Abgleich abgebrochen", { err }));
  }, CHECK_INTERVAL_MS).unref();
}
