import { prisma } from "../prisma.js";
import type { BackupFailure } from "@filapilot/shared";

const MAX_REASON_LENGTH = 300;

// Die Fehlermeldung eines fehlgeschlagenen pg_dump enthaelt die komplette Kommandozeile samt Datenbank-URL (mit Passwort).
// Sie wird in der Datenbank gespeichert, im Protokoll und im Dashboard angezeigt - deshalb werden URLs hier entfernt.
export function describeBackupFailure(err: unknown): string {
  let raw = "";
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "string") {
    raw = err;
  }
  // Wortweise statt per Regex: jedes Wort mit "://" (auch mit Anfuehrungszeichen davor) wird ersetzt, ohne Backtracking-Risiko.
  const text = raw
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => (word.includes("://") ? "[URL entfernt]" : word))
    .join(" ");
  return (text || "Unbekannter Fehler").slice(0, MAX_REASON_LENGTH);
}

export async function recordBackupFailure(err: unknown): Promise<string> {
  const reason = describeBackupFailure(err);
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { lastBackupFailedAt: new Date(), lastBackupFailureReason: reason },
    create: { id: 1, lastBackupFailedAt: new Date(), lastBackupFailureReason: reason }
  });
  return reason;
}

export async function clearBackupFailure(): Promise<void> {
  await prisma.settings.updateMany({
    where: { id: 1 },
    data: { lastBackupFailedAt: null, lastBackupFailureReason: null }
  });
}

export async function getBackupFailure(): Promise<BackupFailure | null> {
  const row = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { lastBackupFailedAt: true, lastBackupFailureReason: true }
  });
  if (!row?.lastBackupFailedAt) {
    return null;
  }
  return {
    at: row.lastBackupFailedAt.toISOString(),
    reason: row.lastBackupFailureReason ?? "Unbekannter Fehler"
  };
}
