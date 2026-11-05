import { useTranslation } from "react-i18next";
import { useExpandedSet } from "../hooks/useExpandedSet.js";
import { consumedOf } from "../lib/consumptionBreakdown.js";
import type { ConsumptionGroup } from "../lib/consumptionBreakdown.js";
import { ExpandableBarRow } from "./ExpandableBarRow.js";
import { SpoolFillRow } from "./SpoolFillRow.js";

interface ConsumptionBreakdownListProps {
  title: string;
  groups: readonly ConsumptionGroup[];
  emptyLabel: string;
}

// Aufschluesselung des Verbrauchs (Statistik-Seite): je Zeile ein Klick auf die einzelnen Spulen dahinter.
export function ConsumptionBreakdownList({ title, groups, emptyLabel }: ConsumptionBreakdownListProps): React.JSX.Element {
  const { t } = useTranslation();
  const { isExpanded, toggle } = useExpandedSet();
  const max = Math.max(1, ...groups.map((group) => group.consumedG));

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <ExpandableBarRow
              key={group.label}
              label={group.label}
              spoolCount={group.spools.length}
              valueText={`${(group.consumedG / 1000).toFixed(2)} kg`}
              ratio={group.consumedG / max}
              expanded={isExpanded(group.label)}
              onToggle={() => toggle(group.label)}
            >
              {group.spools.map((spool) => (
                <SpoolFillRow
                  key={spool.id}
                  spool={spool}
                  detail={t("stats.spoolConsumed", { g: consumedOf(spool) })}
                  archivedLabel={spool.archivedAt ? t("spools.archived") : undefined}
                />
              ))}
            </ExpandableBarRow>
          ))}
        </div>
      )}
    </div>
  );
}
