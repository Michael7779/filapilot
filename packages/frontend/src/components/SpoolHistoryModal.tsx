import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEntry, SpoolWithRelations } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { AuditEntryDetailModal, formatValue } from "./AuditEntryDetail.js";

interface SpoolHistoryModalProps {
  spool: SpoolWithRelations;
  onClose: () => void;
}

// Kurzfassung "was hat sich geaendert", damit man das nicht erst aufklappen muss: bei Aenderungen die
// abweichenden Felder (vorher -> nachher), beim Anlegen das Restgewicht, mit dem die Spule anfing.
function summarize(entry: AuditEntry, translate: (key: string, fallback: string) => string): string | null {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  if (entry.action === "UPDATE") {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
    );
    if (keys.length === 0) {
      return null;
    }
    return keys
      .map((key) => {
        const label = translate(`audit.fields.${key}`, key);
        return `${label}: ${formatValue(key, before[key], translate)} → ${formatValue(key, after[key], translate)}`;
      })
      .join(" · ");
  }
  if (entry.action === "CREATE" && after.remainingWeightG !== undefined) {
    return `${translate("audit.fields.remainingWeightG", "Restgewicht (g)")}: ${formatValue("remainingWeightG", after.remainingWeightG, translate)}`;
  }
  if (entry.action === "EVENT") {
    // Ereignisse mit eigenen Werten (z.B. Trocknung: Temperatur/Dauer) - reine Status-Ereignisse ohne Momentaufnahme
    // (archiviert, wiederhergestellt, ...) haben kein "after" und liefern hier nichts.
    const keys = Object.keys(after).filter((key) => after[key] !== null && after[key] !== undefined);
    if (keys.length === 0) {
      return null;
    }
    return keys
      .map((key) => {
        const label = translate(`audit.fields.${key}`, key);
        return `${label}: ${formatValue(key, after[key], translate)}`;
      })
      .join(" · ");
  }
  return null;
}

// Protokoll (Aenderungsverlauf) genau dieser einen Spule - aus dem allgemeinen Protokoll gefiltert, aber auch
// fuer Nicht-Admins sichtbar (Rechte wie beim Lesen der Spule selbst).
export function SpoolHistoryModal({ spool, onClose }: SpoolHistoryModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    apiRequest<AuditEntry[]>(`/spools/${spool.id}/history`)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : t("spools.history.loadFailed")));
  }, [spool.id, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6 sm:max-w-[640px]">
        <h2 className="text-lg font-bold">{t("spools.history.title", { name: `${spool.materialName} ${spool.colorName}` })}</h2>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {!entries && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
        {entries && entries.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.history.empty")}</p>}
        {entries && entries.length > 0 && (
          <ul className="flex flex-col">
            {entries.map((entry) => {
              const translate = (key: string, fallback: string): string => t(key, { defaultValue: fallback });
              const summary = summarize(entry, translate);
              return (
                <li key={entry.id} className="border-t border-[var(--color-border)] py-2 text-sm first:border-t-0">
                  <button type="button" onClick={() => setDetail(entry)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                          {t(`audit.actions.${entry.action}`)}
                        </span>
                        <span className="font-medium">{entry.description}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{new Date(entry.createdAt).toLocaleString(i18n.language)}</span>
                    </div>
                    {summary && <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{summary}</div>}
                    <div className="text-xs text-[var(--color-text-muted)]">{entry.username}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" onClick={onClose} className="self-end rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
          {t("common.close")}
        </button>
      </div>
      {detail && <AuditEntryDetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
