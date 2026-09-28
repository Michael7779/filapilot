import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { STATS_PERIODS, type ConsumptionStats, type StatsPeriod } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { downloadFile } from "../lib/download.js";

interface ConsumptionChartProps {
  // ID des Lagers oder "all"
  inventoryId: string;
}

function formatGrams(grams: number, locale: string): string {
  return grams >= 1000 ? `${(grams / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} kg` : `${grams.toLocaleString(locale)} g`;
}

// Beschriftung eines Zeitabschnitts aus seinem Schluessel (Tag/Montag der Woche "2026-09-21", Monat "2026-09", Jahr "2026").
function bucketLabel(key: string, period: StatsPeriod, locale: string): string {
  if (period === "year") {
    return key;
  }
  const date = new Date(`${period === "month" ? key + "-01" : key}T12:00:00Z`);
  if (period === "month") {
    return date.toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

// Verbrauch ueber die Zeit (aus dem Gewichtsverlauf) mit Umschalter Tag / Woche / Monat / Jahr.
export function ConsumptionChart({ inventoryId }: ConsumptionChartProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<StatsPeriod>("day");
  const [data, setData] = useState<ConsumptionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setData(null);
    setError(null);
    apiRequest<ConsumptionStats>(
      `/stats/consumption?inventoryId=${inventoryId}&period=${period}&timeZone=${encodeURIComponent(timeZone)}`
    )
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : t("stats.time.loadFailed")));
  }, [inventoryId, period, t, timeZone]);

  async function handleExport(): Promise<void> {
    setExporting(true);
    setExportError(null);
    try {
      await downloadFile(
        `/stats/consumption/export?inventoryId=${inventoryId}&period=${period}&timeZone=${encodeURIComponent(timeZone)}`,
        "filapilot-verbrauch.csv"
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("stats.time.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  // null = kein sinnvoller Vergleich moeglich (im Vorzeitraum wurde nichts verbraucht)
  function comparisonPercent(current: number, previous: number): number | null {
    return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  }

  const max = Math.max(1, ...(data?.buckets.map((bucket) => bucket.consumedG) ?? [0]));
  // Bei vielen Balken nur jede n-te Beschriftung zeigen
  const labelEvery = data && data.buckets.length > 14 ? Math.ceil(data.buckets.length / 8) : 1;
  const euro = (cents: number): string => (cents / 100).toLocaleString(i18n.language, { style: "currency", currency: "EUR" });

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("stats.time.title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label={t("stats.time.title")}>
            {STATS_PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className="rounded-lg border px-3 py-1 text-xs font-medium"
                style={
                  period === value
                    ? { borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "var(--color-accent-bg)" }
                    : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
                }
              >
                {t(`stats.time.period.${value}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={exporting || !data}
            onClick={() => void handleExport()}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] disabled:opacity-60"
          >
            {t("stats.time.exportCsv")}
          </button>
        </div>
      </div>

      {exportError && <p className="mb-2 text-sm text-[var(--color-danger)]">{exportError}</p>}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!data && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-[var(--color-text-secondary)]">{t("stats.time.consumed")}: </span>
              <span className="font-semibold">{formatGrams(data.totals.consumedG, i18n.language)}</span>
              {(() => {
                const percent = comparisonPercent(data.totals.consumedG, data.previousTotals.consumedG);
                return percent === null ? null : (
                  <span className="ml-1 text-xs" style={{ color: percent > 0 ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                    ({percent > 0 ? "+" : ""}
                    {percent}% {t("stats.time.vsPrevious")})
                  </span>
                );
              })()}
            </span>
            <span>
              <span className="text-[var(--color-text-secondary)]">{t("stats.time.cost")}: </span>
              <span className="font-semibold">{euro(data.totals.costCents)}</span>
            </span>
          </div>

          {data.totals.consumedG === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("stats.time.empty")}</p>
          ) : (
            <div className="flex h-44 gap-1" aria-hidden="true">
              {data.buckets.map((bucket, index) => (
                <div
                  key={bucket.key}
                  className="flex min-w-0 flex-1 flex-col"
                  title={`${bucketLabel(bucket.key, period, i18n.language)}: ${formatGrams(bucket.consumedG, i18n.language)}`}
                >
                  <div className="flex flex-1 items-end">
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${(bucket.consumedG / max) * 100}%`, minHeight: bucket.consumedG > 0 ? 2 : 0, backgroundColor: "var(--accent)" }}
                    />
                  </div>
                  <span className="mt-1 h-4 whitespace-nowrap text-center text-[10px] text-[var(--color-text-muted)]">
                    {index % labelEvery === 0 ? bucketLabel(bucket.key, period, i18n.language) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {data.totals.consumedG > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { title: t("stats.time.byType"), entries: data.byType },
                { title: t("stats.time.byManufacturer"), entries: data.byManufacturer },
                { title: t("stats.time.byPrinter"), entries: data.byPrinter }
              ].map((group) => (
                <div key={group.title}>
                  <h4 className="mb-1 text-xs font-semibold text-[var(--color-text-secondary)]">{group.title}</h4>
                  {group.entries.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">{t("stats.time.noBreakdown")}</p>
                  ) : (
                    <ul className="text-sm">
                      {group.entries.map((entry) => (
                        <li key={entry.label} className="flex justify-between gap-2">
                          <span className="truncate">{entry.label}</span>
                          <span className="text-[var(--color-text-secondary)]">{formatGrams(entry.consumedG, i18n.language)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {data.trackingSince
              ? t("stats.time.since", { date: new Date(data.trackingSince).toLocaleDateString(i18n.language) })
              : t("stats.time.notTracked")}
          </p>
        </>
      )}
    </div>
  );
}
