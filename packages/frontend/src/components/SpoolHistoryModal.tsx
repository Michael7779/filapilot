import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEntry, SpoolWithRelations } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { AuditEntryDetailModal } from "./AuditEntryDetail.js";

interface SpoolHistoryModalProps {
  spool: SpoolWithRelations;
  onClose: () => void;
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
      <div className="flex max-h-[85dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("spools.history.title", { name: `${spool.materialName} ${spool.colorName}` })}</h2>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {!entries && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
        {entries && entries.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.history.empty")}</p>}
        {entries && entries.length > 0 && (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li key={entry.id} className="border-t border-[var(--color-border)] py-2 text-sm first:border-t-0">
                <button type="button" onClick={() => setDetail(entry)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.description}</span>
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{new Date(entry.createdAt).toLocaleString(i18n.language)}</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">{entry.username}</div>
                </button>
              </li>
            ))}
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
