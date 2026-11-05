import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";
import { LOW_STOCK_THRESHOLD_RATIO, materialTypeOf } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { ConsumptionChart } from "../components/ConsumptionChart.js";
import { PrintJobHistory } from "../components/PrintJobHistory.js";
import { ConsumptionBreakdownList } from "../components/ConsumptionBreakdownList.js";
import { consumedOf, groupConsumption } from "../lib/consumptionBreakdown.js";

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

export function StatsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [spools, setSpools] = useState<SpoolWithRelations[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { selectedId } = useCurrentInventory();

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    setSpools(null);
    setLoadError(null);
    apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${selectedId}&archived=include`)
      .then(setSpools)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : t("stats.loadFailed"));
      });
  }, [t, selectedId]);

  if (loadError) {
    return <p className="text-sm text-[var(--color-danger)]">{loadError}</p>;
  }

  if (!spools) {
    return <div>{t("common.loading")}</div>;
  }

  // Verbrauch zaehlt alle Spulen (auch archivierte), Bestand und "Fast leer" nur die aktiven.
  const active = spools.filter((spool) => !spool.archivedAt);
  const totalConsumedG = spools.reduce((sum, spool) => sum + consumedOf(spool), 0);
  const totalRemainingG = active.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
  const lowStockCount = active.filter(
    (spool) => spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO
  ).length;
  const unopenedCount = active.filter((spool) => !spool.openedAt).length;

  const byMaterialType = groupConsumption(spools, (spool) => materialTypeOf(spool.materialName));
  const byMaterial = groupConsumption(spools, (spool) => spool.materialName);
  const byManufacturer = groupConsumption(spools, (spool) => spool.manufacturerName);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
        <StatCard label={t("stats.totalSpools")} value={String(active.length)} />
        <StatCard
          label={t("stats.totalConsumed")}
          value={`${(totalConsumedG / 1000).toFixed(1)} kg`}
        />
        <StatCard
          label={t("stats.totalRemaining")}
          value={`${(totalRemainingG / 1000).toFixed(1)} kg`}
        />
        <StatCard label={t("stats.lowStock")} value={String(lowStockCount)} />
        <StatCard label={t("stats.unopened")} value={String(unopenedCount)} />
      </div>

      {selectedId && <ConsumptionChart inventoryId={selectedId} />}

      {selectedId && <PrintJobHistory inventoryId={selectedId} isAll={selectedId === "all"} />}

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <ConsumptionBreakdownList
          title={t("stats.byMaterialType")}
          groups={byMaterialType}
          emptyLabel={t("stats.noConsumption")}
        />
        <ConsumptionBreakdownList
          title={t("stats.byMaterial")}
          groups={byMaterial}
          emptyLabel={t("stats.noConsumption")}
        />
        <ConsumptionBreakdownList
          title={t("stats.byManufacturer")}
          groups={byManufacturer}
          emptyLabel={t("stats.noConsumption")}
        />
      </div>
    </div>
  );
}
