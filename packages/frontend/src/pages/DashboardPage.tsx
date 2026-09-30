import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LOW_STOCK_THRESHOLD_RATIO, materialTypeOf } from "@filapilot/shared";
import type { Material, PrinterLiveStatus, PrinterPublic, SpoolFilter, SpoolWithRelations } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";
import { ConsumptionChart } from "../components/ConsumptionChart.js";

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

interface PrinterWithStatus {
  printer: PrinterPublic;
  status: PrinterLiveStatus | null;
}

async function fetchPrinterWithStatus(printer: PrinterPublic): Promise<PrinterWithStatus> {
  const status = await apiRequest<PrinterLiveStatus>(`/printers/${printer.id}/status`).catch(() => null);
  return { printer, status };
}

interface AttentionItem {
  key: string;
  severity: "danger" | "warning";
  text: string;
  to: string;
  state?: { presetFilter: Partial<SpoolFilter> };
}

// "Braucht Aufmerksamkeit": buendelt die Signale, die schon einzeln in der App stecken (Restgewicht der
// Spulen, Live-Status der Drucker), damit man sie nicht erst auf drei Seiten zusammensuchen muss. Bewusst
// nur Signale, fuer die es bereits ein Datenfeld gibt - kein neues Konzept (z.B. "Trocknung faellig") ohne
// Faelligkeitsdatum im Modell.
function NeedsAttention({
  spools,
  printersWithStatus
}: {
  spools: SpoolWithRelations[];
  printersWithStatus: PrinterWithStatus[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const lowStockSpools = spools.filter(
    (spool) => !spool.archivedAt && spool.openedAt && spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO
  );
  const failedPrinters = printersWithStatus.filter((entry) => entry.status?.printState === "failed");
  const offlinePrinters = printersWithStatus.filter((entry) => entry.status && !entry.status.connected);

  const items: AttentionItem[] = [
    ...failedPrinters.map(
      (entry): AttentionItem => ({
        key: `failed-${entry.printer.id}`,
        severity: "danger",
        text: t("dashboard.attention.printFailed", { name: entry.printer.name }),
        to: "/printers"
      })
    ),
    ...offlinePrinters.map(
      (entry): AttentionItem => ({
        key: `offline-${entry.printer.id}`,
        severity: "warning",
        text: t("dashboard.attention.printerOffline", { name: entry.printer.name }),
        to: "/printers"
      })
    ),
    ...(lowStockSpools.length > 0
      ? [
          {
            key: "low-stock",
            severity: "warning" as const,
            text: t("dashboard.attention.lowStock", { count: lowStockSpools.length }),
            to: "/spools",
            state: { presetFilter: { lowStockOnly: true } }
          }
        ]
      : [])
  ];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("dashboard.attention.title")}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("dashboard.attention.allGood")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.key} className="border-t border-[var(--color-border)] first:border-t-0">
              <Link
                to={item.to}
                state={item.state}
                className="flex items-center gap-3 py-2.5 text-sm hover:bg-[var(--color-bg)]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.severity === "danger" ? "var(--color-danger)" : "var(--color-warning)" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" fill="currentColor" aria-hidden="true">
                  <path d="M7.5 4.5a1 1 0 0 1 1.4-.1l5 4.5a1 1 0 0 1 0 1.5l-5 4.5a1 1 0 1 1-1.3-1.5L11.8 10 7.6 6.1a1 1 0 0 1-.1-1.6Z" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface BreakdownEntry {
  label: string;
  valueG: number;
}

// Restbestand je Material-Typ (nicht Verbrauch - das zeigt schon die Statistik-Seite): "was habe ich noch da".
function StockByType({ spools }: { spools: SpoolWithRelations[] }): React.JSX.Element {
  const { t } = useTranslation();
  const totals = new Map<string, number>();
  for (const spool of spools) {
    if (spool.archivedAt) {
      continue;
    }
    const key = materialTypeOf(spool.materialName);
    totals.set(key, (totals.get(key) ?? 0) + spool.remainingWeightG);
  }
  const entries: BreakdownEntry[] = [...totals.entries()]
    .map(([label, valueG]) => ({ label, valueG }))
    .sort((a, b) => b.valueG - a.valueG);
  const max = Math.max(1, ...entries.map((entry) => entry.valueG));

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("dashboard.stockByType")}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("dashboard.noStock")}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <div key={entry.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{entry.label}</span>
                <span className="text-[var(--color-text-muted)]">{(entry.valueG / 1000).toFixed(2)} kg</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(entry.valueG / max) * 100}%`, backgroundColor: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [printersWithStatus, setPrintersWithStatus] = useState<PrinterWithStatus[] | null>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    setSpools(null);
    setPrintersWithStatus(null);
    apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${selectedId}`).then(setSpools).catch(() => setSpools([]));
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
    apiRequest<PrinterPublic[]>(`/printers?inventoryId=${selectedId}`)
      .then((printers) => Promise.all(printers.map(fetchPrinterWithStatus)))
      .then(setPrintersWithStatus)
      .catch(() => setPrintersWithStatus([]));
  }, [selectedId]);

  const totalWeightKg = spools ? kilograms(spools.reduce((sum, spool) => sum + spool.remainingWeightG, 0)) : "0";
  const activePrints = printersWithStatus ? printersWithStatus.filter((entry) => entry.status?.printing).length : null;

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
        <StatCard
          label={t("dashboard.unopened")}
          value={spools ? String(spools.filter((spool) => !spool.openedAt).length) : "…"}
        />
      </div>

      {spools && printersWithStatus && <NeedsAttention spools={spools} printersWithStatus={printersWithStatus} />}

      {selectedId && <ConsumptionChart inventoryId={selectedId} />}

      {spools && <StockByType spools={spools} />}

      {isAll && spools && <InventoryComparison spools={spools} />}
    </div>
  );
}
