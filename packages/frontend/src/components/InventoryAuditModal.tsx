import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEntry, AuditPage, Inventory } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { AuditEntryDetailModal, formatValue } from "./AuditEntryDetail.js";

interface InventoryAuditModalProps {
  inventory: Inventory;
  onClose: () => void;
}

const PAGE_SIZE = 25;

// Kurzfassung eines Eintrags, wie im Spulen-Verlauf (SpoolHistoryModal) - hier zusaetzlich ueber alle Bereiche
// des Lagers (Spulen, Drucker, Lager-Ereignisse), nicht nur eine einzelne Spule.
function summarize(entry: AuditEntry, translate: (key: string, fallback: string) => string): string | null {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  let source = after;
  if (entry.action === "DELETE") {
    source = before;
  }
  const keys =
    entry.action === "UPDATE"
      ? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      : Object.keys(source).filter((key) => source[key] !== null && source[key] !== undefined);
  if (keys.length === 0) {
    return null;
  }
  return keys
    .slice(0, 3)
    .map((key) => {
      const label = translate(`audit.fields.${key}`, key);
      if (entry.action === "UPDATE") {
        return `${label}: ${formatValue(key, before[key], translate)} → ${formatValue(key, after[key], translate)}`;
      }
      return `${label}: ${formatValue(key, source[key], translate)}`;
    })
    .join(" · ");
}

// Protokoll EINES Lagers, fuer dessen Besitzer (OP-L5) - dieselbe Liste wie das admin-only Gesamt-Protokoll,
// aber serverseitig fest auf dieses eine Lager begrenzt (GET /api/inventories/:id/audit-log).
export function InventoryAuditModal({ inventory, onClose }: InventoryAuditModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const translate = (key: string, fallback: string): string => t(key, { defaultValue: fallback });

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
    setError(null);
    apiRequest<AuditPage>(`/inventories/${inventory.id}/audit-log?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(setResult)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : t("inventory.audit.loadFailed")));
  }, [inventory.id, page, t]);

  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-[640px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("inventory.audit.title", { name: inventory.name })}</h2>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {!result && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
        {result && result.items.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("inventory.audit.empty")}</p>}
        {result && result.items.length > 0 && (
          <ul className="flex flex-col">
            {result.items.map((entry) => {
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
        {result && result.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="disabled:opacity-40" style={{ color: "var(--accent)" }}>
              {t("spools.pager.prev")}
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">{t("spools.pager.page", { page, count: pageCount })}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="disabled:opacity-40" style={{ color: "var(--accent)" }}>
              {t("spools.pager.next")}
            </button>
          </div>
        )}
        <button type="button" onClick={onClose} className="self-end rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
          {t("common.close")}
        </button>
      </div>
      {detail && <AuditEntryDetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
