import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PrintJobListResult, PrintJobWithNames } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface PrintJobHistoryProps {
  inventoryId: string;
  isAll: boolean;
}

// Zuletzt automatisch erfasste Druckauftraege (aus dem AMS-Verbrauch) mit Gewicht und Kosten.
export function PrintJobHistory({ inventoryId, isAll }: PrintJobHistoryProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [jobs, setJobs] = useState<PrintJobWithNames[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setJobs(null);
    setError(null);
    apiRequest<PrintJobListResult>(`/print-jobs?inventoryId=${inventoryId}&limit=10`)
      .then((result) => {
        setJobs(result.jobs);
        setCursor(result.nextCursor);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : t("stats.jobs.loadFailed")));
  }, [inventoryId, t]);

  async function loadMore(): Promise<void> {
    if (!cursor) {
      return;
    }
    setLoadingMore(true);
    try {
      const result = await apiRequest<PrintJobListResult>(`/print-jobs?inventoryId=${inventoryId}&limit=10&cursor=${cursor}`);
      setJobs((current) => [...(current ?? []), ...result.jobs]);
      setCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("stats.jobs.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const euro = (cents: number | null): string =>
    cents === null ? "–" : (cents / 100).toLocaleString(i18n.language, { style: "currency", currency: "EUR" });
  const date = (value: Date | string): string => new Date(value).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("stats.jobs.title")}</h3>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!jobs && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
      {jobs && jobs.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("stats.jobs.empty")}</p>}
      {jobs && jobs.length > 0 && (
        <ul className="flex flex-col">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--color-border)] py-2 text-sm first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{job.name}</span>
                {!job.succeeded && (
                  <span className="ml-2 rounded-full bg-[var(--color-danger)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
                    {t("stats.jobs.failed")}
                  </span>
                )}
                <div className="text-xs text-[var(--color-text-muted)]">
                  {job.printerName} · {job.spoolLabel}
                  {isAll && job.inventoryName ? ` · ${job.inventoryName}` : ""} · {date(job.startedAt)}
                </div>
              </span>
              <span className="shrink-0 text-right text-xs text-[var(--color-text-secondary)]">
                {job.filamentUsedG} g
                <br />
                {euro(job.costCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="mt-2 text-sm font-medium disabled:opacity-60"
          style={{ color: "var(--accent)" }}
        >
          {loadingMore ? t("common.loading") : t("stats.jobs.more")}
        </button>
      )}
    </div>
  );
}
