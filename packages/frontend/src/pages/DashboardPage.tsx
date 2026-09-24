import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Material, PrinterLiveStatus, PrinterPublic, SpoolWithRelations } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";

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

export function DashboardPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [spools, setSpools] = useState<SpoolWithRelations[] | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [activePrints, setActivePrints] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<SpoolWithRelations[]>("/spools").then(setSpools).catch(() => setSpools([]));
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
    apiRequest<PrinterPublic[]>("/printers")
      .then(async (printers) => {
        const statuses = await Promise.all(
          printers.map((printer) => apiRequest<PrinterLiveStatus>(`/printers/${printer.id}/status`))
        );
        setActivePrints(statuses.filter((status) => status.printing).length);
      })
      .catch(() => setActivePrints(0));
  }, []);

  const totalWeightKg = spools
    ? (spools.reduce((sum, spool) => sum + spool.remainingWeightG, 0) / 1000).toFixed(1)
    : "0";

  return (
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
  );
}
