import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";
import { LOW_STOCK_THRESHOLD_RATIO } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="mb-1.5 text-[12.5px] text-[var(--color-text-secondary)]">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

interface BreakdownEntry {
  label: string;
  consumedG: number;
}

function groupConsumption(
  spools: SpoolWithRelations[],
  keyOf: (spool: SpoolWithRelations) => string
): BreakdownEntry[] {
  const totals = new Map<string, number>();
  for (const spool of spools) {
    const key = keyOf(spool);
    const consumed = Math.max(0, spool.initialWeightG - spool.remainingWeightG);
    totals.set(key, (totals.get(key) ?? 0) + consumed);
  }
  return [...totals.entries()]
    .map(([label, consumedG]) => ({ label, consumedG }))
    .sort((a, b) => b.consumedG - a.consumedG);
}

function BreakdownList({
  title,
  entries,
  emptyLabel
}: {
  title: string;
  entries: BreakdownEntry[];
  emptyLabel: string;
}): React.JSX.Element {
  const max = Math.max(1, ...entries.map((entry) => entry.consumedG));
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <div key={entry.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{entry.label}</span>
                <span className="text-[var(--color-text-muted)]">
                  {(entry.consumedG / 1000).toFixed(2)} kg
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(entry.consumedG / max) * 100}%`,
                    backgroundColor: "var(--accent)"
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [spools, setSpools] = useState<SpoolWithRelations[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<SpoolWithRelations[]>("/spools")
      .then(setSpools)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : t("stats.loadFailed"));
      });
  }, [t]);

  if (loadError) {
    return <p className="text-sm text-[var(--color-danger)]">{loadError}</p>;
  }

  if (!spools) {
    return <div>{t("common.loading")}</div>;
  }

  const totalConsumedG = spools.reduce(
    (sum, spool) => sum + Math.max(0, spool.initialWeightG - spool.remainingWeightG),
    0
  );
  const totalRemainingG = spools.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
  const lowStockCount = spools.filter(
    (spool) => spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO
  ).length;

  const byMaterial = groupConsumption(spools, (spool) => spool.materialName);
  const byManufacturer = groupConsumption(spools, (spool) => spool.manufacturerName);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3.5">
        <StatCard label={t("stats.totalSpools")} value={String(spools.length)} />
        <StatCard
          label={t("stats.totalConsumed")}
          value={`${(totalConsumedG / 1000).toFixed(1)} kg`}
        />
        <StatCard
          label={t("stats.totalRemaining")}
          value={`${(totalRemainingG / 1000).toFixed(1)} kg`}
        />
        <StatCard label={t("stats.lowStock")} value={String(lowStockCount)} />
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <BreakdownList
          title={t("stats.byMaterial")}
          entries={byMaterial}
          emptyLabel={t("stats.noConsumption")}
        />
        <BreakdownList
          title={t("stats.byManufacturer")}
          entries={byManufacturer}
          emptyLabel={t("stats.noConsumption")}
        />
      </div>
    </div>
  );
}
