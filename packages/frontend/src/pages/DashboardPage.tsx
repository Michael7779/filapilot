import { useTranslation } from "react-i18next";

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

  return (
    <div className="grid grid-cols-4 gap-3.5">
      <StatCard label={t("dashboard.totalSpools")} value="0" />
      <StatCard label={t("dashboard.totalWeight")} value="0 kg" />
      <StatCard label={t("dashboard.activePrints")} value="0" />
      <StatCard label={t("dashboard.materialTypes")} value="0" />
    </div>
  );
}
