import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOW_STOCK_THRESHOLD_RATIO } from "@filapilot/shared";
import type { Material, PrinterLiveStatus, PrinterPublic, SpoolWithRelations } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";

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

function kilograms(grams: number): string {
  return (grams / 1000).toFixed(1);
}

// Uebersicht "Alle Lager": eine Zeile je Lager mit Zahlen; ein Klick wechselt in das Lager.
function InventoryComparison({ spools }: { spools: SpoolWithRelations[] }): React.JSX.Element {
  const { t } = useTranslation();
  const inventories = useInventoryStore((state) => state.inventories);
  const select = useInventoryStore((state) => state.select);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("dashboard.perInventory")}</h3>
      <ul className="flex flex-col">
        {inventories.map((inventory) => {
          const own = spools.filter((spool) => spool.inventoryId === inventory.id);
          const remaining = own.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
          const low = own.filter((spool) => spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO).length;
          return (
            <li key={inventory.id} className="flex items-center gap-3 border-t border-[var(--color-border)] py-2.5 first:border-t-0">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: inventory.color }} aria-hidden="true" />
              <button
                type="button"
                onClick={() => select(inventory.id)}
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {inventory.name}
              </button>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {t("dashboard.inventoryRow", { spools: own.length, kg: kilograms(remaining), low })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DashboardPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { selectedId, isAll } = useCurrentInventory();
  const [spools, setSpools] = useState<SpoolWithRelations[] | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [activePrints, setActivePrints] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    setSpools(null);
    setActivePrints(null);
    apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${selectedId}`).then(setSpools).catch(() => setSpools([]));
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
    apiRequest<PrinterPublic[]>(`/printers?inventoryId=${selectedId}`)
      .then(async (printers) => {
        const statuses = await Promise.all(
          printers.map((printer) => apiRequest<PrinterLiveStatus>(`/printers/${printer.id}/status`))
        );
        setActivePrints(statuses.filter((status) => status.printing).length);
      })
      .catch(() => setActivePrints(0));
  }, [selectedId]);

  const totalWeightKg = spools ? kilograms(spools.reduce((sum, spool) => sum + spool.remainingWeightG, 0)) : "0";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
        <StatCard label={t("dashboard.totalSpools")} value={spools ? String(spools.length) : "…"} />
        <StatCard label={t("dashboard.totalWeight")} value={spools ? `${totalWeightKg} kg` : "…"} />
        <StatCard
          label={t("dashboard.activePrints")}
          value={activePrints !== null ? String(activePrints) : "…"}
        />
        <StatCard
          label={t("dashboard.materialTypes")}
          value={materials ? String(materials.length) : "…"}
        />
      </div>
      {isAll && spools && <InventoryComparison spools={spools} />}
    </div>
  );
}
