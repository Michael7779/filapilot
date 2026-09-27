import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEntry } from "@filapilot/shared";

function formatValue(key: string, value: unknown, translate: (key: string, fallback: string) => string): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return translate(value ? "audit.yes" : "audit.no", String(value));
  }
  if (key === "purchasePriceCents" && typeof value === "number") {
    return `${(value / 100).toFixed(2)} €`;
  }
  if (typeof value === "string") {
    return translate(`audit.values.${value}`, value);
  }
  return String(value);
}

interface AuditEntryDetailModalProps {
  entry: AuditEntry;
  onClose: () => void;
}

// Details eines Protokoll-Eintrags (Vorher/Nachher) - wiederverwendet vom Admin-Protokoll und vom Spulen-Verlauf.
export function AuditEntryDetailModal({ entry, onClose }: AuditEntryDetailModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const translate = (key: string, fallback: string): string => t(key, { defaultValue: fallback });
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  // Bei Aenderungen nur die Felder zeigen, die sich unterscheiden - bei Anlegen/Loeschen alle.
  const rows = keys.filter((key) => entry.action !== "UPDATE" || JSON.stringify(before[key]) !== JSON.stringify(after[key]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("audit.details")}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-text-muted)]">{t("audit.time")}</dt>
          <dd>{new Date(entry.createdAt).toLocaleString(i18n.language)}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("audit.user")}</dt>
          <dd>{entry.username}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("audit.action")}</dt>
          <dd>{t(`audit.actions.${entry.action}`)}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("audit.area")}</dt>
          <dd>{t(`audit.areas.${entry.area}`)}</dd>
          {entry.inventoryName && (
            <>
              <dt className="text-[var(--color-text-muted)]">{t("audit.inventory")}</dt>
              <dd>{entry.inventoryName}</dd>
            </>
          )}
          <dt className="text-[var(--color-text-muted)]">{t("audit.description")}</dt>
          <dd className="break-words">{entry.description}</dd>
        </dl>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{t("audit.noValues")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-[var(--color-text-muted)]">
                  <th className="pb-2 font-medium">{t("audit.field")}</th>
                  <th className="pb-2 font-medium">{t("audit.before")}</th>
                  <th className="pb-2 font-medium">{t("audit.after")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((key) => (
                  <tr key={key} className="border-t border-[var(--color-border)] align-top">
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{t(`audit.fields.${key}`, { defaultValue: key })}</td>
                    <td className="break-words py-2 pr-3">{entry.before ? formatValue(key, before[key], translate) : "—"}</td>
                    <td className="break-words py-2">{entry.after ? formatValue(key, after[key], translate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button type="button" onClick={onClose} className="self-end rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
