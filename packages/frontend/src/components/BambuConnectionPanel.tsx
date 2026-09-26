import { useTranslation } from "react-i18next";
import type { BambuConnectionInfo } from "@filapilot/shared";

interface BambuConnectionPanelProps {
  info: BambuConnectionInfo;
  isOwner: boolean;
  busy: boolean;
  onSync: () => void;
  onPick: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

// Ansicht des Import-Dialogs, wenn das Lager schon mit der Bambu-Cloud verbunden ist (gemerktes Token, kein Passwort).
export function BambuConnectionPanel({
  info,
  isOwner,
  busy,
  onSync,
  onPick,
  onReconnect,
  onDisconnect,
  onClose
}: BambuConnectionPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const format = (value: string | null): string => (value ? new Date(value).toLocaleString(i18n.language) : "");
  const button = "rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {t("bambu.connectedInfo", { name: info.connectedByName ?? "", date: format(info.connectedAt) })}
      </p>
      <ul className="text-xs text-[var(--color-text-muted)]">
        {info.tokenExpiresAt && <li>{t("bambu.expiresAt", { date: format(info.tokenExpiresAt) })}</li>}
        <li>{info.lastSyncAt ? t("bambu.lastSync", { date: format(info.lastSyncAt), summary: info.lastSyncSummary ?? "" }) : t("bambu.neverSynced")}</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSync}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {busy ? t("bambu.syncing") : t("bambu.syncNow")}
        </button>
        <button type="button" disabled={busy} onClick={onPick} className={button}>
          {t("bambu.pick")}
        </button>
        {isOwner && (
          <button type="button" disabled={busy} onClick={onReconnect} className={button}>
            {t("bambu.reconnect")}
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{t("bambu.syncHint")}</p>
      <div className="flex items-center justify-between gap-2">
        {isOwner ? (
          <button type="button" disabled={busy} onClick={onDisconnect} className="text-xs font-medium text-[var(--color-danger)] disabled:opacity-60">
            {t("bambu.disconnect")}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onClose} className={button}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
