import { useTranslation } from "react-i18next";
import type { BambuConnectionInfo } from "@filapilot/shared";

// Hinweiszeile auf der Spulen-Seite: wann zuletzt mit der Bambu-Cloud abgeglichen wurde, ob automatisch, und ein evtl. Fehler.
export function BambuSyncStatus({ info }: { info: BambuConnectionInfo }): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  if (!info.connected) {
    return null;
  }
  const format = (value: string): string => new Date(value).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const hours = info.autoSyncMinutes / 60;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
      <span>
        {info.lastSyncAt
          ? t("bambu.status.last", { date: format(info.lastSyncAt), how: info.lastSyncAuto ? t("bambu.status.auto") : t("bambu.status.manual") })
          : t("bambu.status.never")}
        {info.autoSyncMinutes > 0 ? ` · ${t("bambu.status.interval", { hours })}` : ` · ${t("bambu.status.autoOff")}`}
      </span>
      {info.lastSyncError && (
        <span className="text-[var(--color-danger)]">
          {t("bambu.status.failed", { date: info.lastAttemptAt ? format(info.lastAttemptAt) : "", reason: info.lastSyncError })}
        </span>
      )}
    </div>
  );
}
