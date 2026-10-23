import type { TFunction } from "i18next";
import type { SizzleRefreshView } from "../hooks/useSizzleRefresh.js";

type SyncedAt = Date | string | null;

export function formatSyncedAt(syncedAt: SyncedAt, locale: string): string | null {
  return syncedAt ? new Date(syncedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : null;
}

// Kurz fuer die kleine Marke am Handy: nur die Uhrzeit, wenn der Stand von heute ist, sonst Tag.Monat und Uhrzeit.
export function formatChipTime(syncedAt: Date | string, locale: string, now: Date = new Date()): string {
  const date = new Date(syncedAt);
  const today = date.toDateString() === now.toDateString();
  return date.toLocaleString(locale, today ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Der Satz zur Anzeige in beiden Darstellungen (Karte am Desktop, Marke am Handy).
export function refreshText(t: TFunction, view: SizzleRefreshView, syncedAt: SyncedAt, locale: string): string {
  const date = formatSyncedAt(syncedAt, locale) ?? t("sizzle.refresh.unknownDate");
  switch (view.stage) {
    case "running":
      return t("sizzle.refresh.running", { seconds: view.elapsedSeconds });
    case "slow":
      return view.connectionLost ? t("sizzle.refresh.lost", { seconds: view.elapsedSeconds }) : t("sizzle.refresh.slow", { seconds: view.elapsedSeconds, date });
    case "done":
      return t("sizzle.refresh.done", {
        seconds: (view.durationSeconds ?? 0).toLocaleString(locale, { maximumFractionDigits: 1 }),
        count: view.total ?? 0
      });
    case "cancelled":
      return t("sizzle.refresh.cancelled", { date });
    case "error":
      return t("sizzle.refresh.error", { reason: view.message ?? t("sizzle.refresh.failed"), date });
    default:
      return syncedAt ? t("sizzle.refresh.syncedAt", { date }) : t("sizzle.refresh.never");
  }
}
