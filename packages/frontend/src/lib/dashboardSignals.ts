import type { BackupInfo, BambuConnectionInfo, SpoolFilter } from "@filapilot/shared";

// Die taegliche Sicherung laeuft um 03:00 UTC (backend/services/backupScheduler.ts). Eine gesunde Sicherung ist also hoechstens
// ~24 Stunden alt; 36 Stunden lassen Luft fuer eine Laufzeit, schlagen aber an, sobald ein Lauf ausgefallen ist.
export const BACKUP_STALE_AFTER_HOURS = 36;
// So viele Tage vor Ablauf des gemerkten Bambu-Tokens weist das Dashboard schon darauf hin.
export const BAMBU_TOKEN_WARN_DAYS = 3;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface AttentionItem {
  key: string;
  severity: "danger" | "warning";
  text: string;
  to: string;
  state?: { presetFilter: Partial<SpoolFilter> };
}

export type BackupSignal = { kind: "never" } | { kind: "stale"; days: number };

// Signal fuer "Braucht Aufmerksamkeit": die automatische Sicherung ist aktiv, aber es gibt keine oder nur eine alte Sicherung.
// Ausgeschaltete Sicherungen melden bewusst nichts (Entscheidung des Admins). Nur die neueste Sicherung zaehlt.
export function backupSignal(enabled: boolean, backups: readonly Pick<BackupInfo, "createdAt">[], now: Date): BackupSignal | null {
  if (!enabled) {
    return null;
  }
  const times = backups.map((backup) => Date.parse(backup.createdAt)).filter((time) => Number.isFinite(time));
  if (times.length === 0) {
    return { kind: "never" };
  }
  const ageMs = now.getTime() - Math.max(...times);
  if (ageMs < BACKUP_STALE_AFTER_HOURS * HOUR_MS) {
    return null;
  }
  return { kind: "stale", days: Math.floor(ageMs / DAY_MS) };
}

export type BambuSignal =
  | { kind: "tokenExpired" }
  | { kind: "syncFailed"; reason: string }
  | { kind: "tokenExpiresSoon"; days: number };

// Signal fuer eine gemerkte Bambu-Cloud-Verbindung: abgelaufenes Token, fehlgeschlagener Abgleich, bald ablaufendes Token (in dieser
// Rangfolge, es wird nur das wichtigste gemeldet). Ohne Verbindung gibt es nichts zu warnen.
export function bambuSignal(info: BambuConnectionInfo, now: Date): BambuSignal | null {
  if (!info.connected) {
    return null;
  }
  const expiresAt = info.tokenExpiresAt ? Date.parse(info.tokenExpiresAt) : Number.NaN;
  const remainingMs = Number.isFinite(expiresAt) ? expiresAt - now.getTime() : null;
  if (remainingMs !== null && remainingMs <= 0) {
    return { kind: "tokenExpired" };
  }
  if (info.lastSyncError) {
    return { kind: "syncFailed", reason: info.lastSyncError };
  }
  if (remainingMs !== null && remainingMs <= BAMBU_TOKEN_WARN_DAYS * DAY_MS) {
    return { kind: "tokenExpiresSoon", days: Math.ceil(remainingMs / DAY_MS) };
  }
  return null;
}
