import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AUDIT_PAGE_SIZES,
  type AuditAction,
  type AuditArea,
  type AuditEntry,
  type AuditListResult
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

const AREAS: AuditArea[] = ["SPOOL", "MATERIAL", "MANUFACTURER", "PRINTER", "USER", "SETTINGS", "BACKUP", "INVENTORY"];
const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "EVENT"];
const FIELD_CLASS =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)]";

const ACTION_STYLE: Record<AuditAction, { bg: string; fg: string }> = {
  CREATE: { bg: "#e3f4e8", fg: "#1a6b3a" },
  UPDATE: { bg: "#e4edfd", fg: "#1f4fb8" },
  DELETE: { bg: "#fbe6e4", fg: "#9c2a22" },
  EVENT: { bg: "#efeee9", fg: "#5b5c60" }
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function formatValue(
  key: string,
  value: unknown,
  translate: (key: string, fallback: string) => string
): string {
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

function DetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }): React.JSX.Element {
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
  const rows = keys.filter(
    (key) => entry.action !== "UPDATE" || JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );

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
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                      {t(`audit.fields.${key}`, { defaultValue: key })}
                    </td>
                    <td className="break-words py-2 pr-3">
                      {entry.before ? formatValue(key, before[key], translate) : "—"}
                    </td>
                    <td className="break-words py-2">{entry.after ? formatValue(key, after[key], translate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="self-end rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

export function AuditLogView(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [area, setArea] = useState("");
  const [action, setAction] = useState("");
  const [username, setUsername] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const debouncedSearch = useDebounced(search, 300);

  // Jede Aenderung eines Filters springt zurueck auf Seite 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, area, action, username, inventoryId, pageSize]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch.trim()) {
      params.set("search", debouncedSearch.trim());
    }
    if (from) {
      params.set("from", new Date(`${from}T00:00:00`).toISOString());
    }
    if (to) {
      params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    }
    if (area) {
      params.set("area", area);
    }
    if (action) {
      params.set("action", action);
    }
    if (username) {
      params.set("username", username);
    }
    if (inventoryId) {
      params.set("inventoryId", inventoryId);
    }
    let cancelled = false;
    apiRequest<AuditListResult>(`/audit-log?${params.toString()}`)
      .then((data) => {
        if (!cancelled) {
          setResult(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : t("audit.loadFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedSearch, from, to, area, action, username, inventoryId, t]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const areaOptions = sortAlphabetically(AREAS, (value) => t(`audit.areas.${value}`), i18n.language);
  const actionOptions = sortAlphabetically(ACTIONS, (value) => t(`audit.actions.${value}`), i18n.language);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <p className="text-xs text-[var(--color-text-muted)]">{t("audit.hint")}</p>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("audit.search")}
        aria-label={t("audit.search")}
        className={`w-full ${FIELD_CLASS}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
          aria-label={t("audit.from")}
          className={FIELD_CLASS}
        />
        <span className="text-[var(--color-text-muted)]">–</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
          aria-label={t("audit.to")}
          className={FIELD_CLASS}
        />
        <select value={area} onChange={(event) => setArea(event.target.value)} className={FIELD_CLASS}>
          <option value="">{t("audit.areaAll")}</option>
          {areaOptions.map((value) => (
            <option key={value} value={value}>
              {t(`audit.areas.${value}`)}
            </option>
          ))}
        </select>
        <select value={action} onChange={(event) => setAction(event.target.value)} className={FIELD_CLASS}>
          <option value="">{t("audit.actionAll")}</option>
          {actionOptions.map((value) => (
            <option key={value} value={value}>
              {t(`audit.actions.${value}`)}
            </option>
          ))}
        </select>
        <select value={username} onChange={(event) => setUsername(event.target.value)} className={FIELD_CLASS}>
          <option value="">{t("audit.userAll")}</option>
          {(result?.usernames ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={inventoryId} onChange={(event) => setInventoryId(event.target.value)} className={FIELD_CLASS}>
          <option value="">{t("audit.inventoryAll")}</option>
          {sortAlphabetically(result?.inventories ?? [], (entry) => entry.name, i18n.language).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          {t("audit.perPage")}
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={FIELD_CLASS}
          >
            {AUDIT_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {result === null && !error && (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>
      )}

      {result && result.items.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("audit.none")}</p>
      )}

      {result && result.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--color-text-muted)]">
                <th className="w-10 pb-2" />
                <th className="pb-2 font-medium">{t("audit.time")}</th>
                <th className="pb-2 font-medium">{t("audit.user")}</th>
                <th className="pb-2 font-medium">{t("audit.action")}</th>
                <th className="pb-2 font-medium">{t("audit.area")}</th>
                <th className="pb-2 font-medium">{t("audit.description")}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => setDetail(entry)}
                      aria-label={t("audit.details")}
                      title={t("audit.details")}
                      className="rounded-md border border-[var(--color-border)] p-1.5"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="6" />
                        <path d="m20 20-4-4" />
                      </svg>
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {new Date(entry.createdAt).toLocaleString(i18n.language, {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </td>
                  <td className="py-2 pr-3">{entry.username}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: ACTION_STYLE[entry.action].bg, color: ACTION_STYLE[entry.action].fg }}
                    >
                      {t(`audit.actions.${entry.action}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{t(`audit.areas.${entry.area}`)}</td>
                  <td className="break-words py-2">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-text-secondary)]">
          <span>{t("audit.total", { count: result.total })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
            >
              {t("audit.prev")}
            </button>
            <span>{t("audit.pageOf", { page, pages: totalPages })}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
            >
              {t("audit.next")}
            </button>
          </div>
        </div>
      )}

      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
