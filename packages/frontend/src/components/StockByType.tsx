import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";
import { useExpandedSet } from "../hooks/useExpandedSet.js";
import { groupStockByType } from "../lib/stockByType.js";
import { ExpandableBarRow } from "./ExpandableBarRow.js";
import { SpoolFillRow } from "./SpoolFillRow.js";

// Restbestand je Material-Typ (nicht Verbrauch - das zeigt die Statistik-Seite): "was habe ich noch da".
// Ein Klick auf ein Material klappt darunter die einzelnen Spulen mit Farbe auf; ein zweiter Klick klappt zu.
export function StockByType({ spools }: { spools: readonly SpoolWithRelations[] }): React.JSX.Element {
  const { t } = useTranslation();
  const { isExpanded, toggle } = useExpandedSet();
  const groups = groupStockByType(spools);
  const maxG = Math.max(1, ...groups.map((group) => group.totalG));

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("dashboard.stockByType")}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("dashboard.noStock")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <ExpandableBarRow
              key={group.type}
              label={group.type}
              spoolCount={group.spools.length}
              valueText={`${(group.totalG / 1000).toFixed(2)} kg`}
              ratio={group.totalG / maxG}
              expanded={isExpanded(group.type)}
              onToggle={() => toggle(group.type)}
            >
              {group.spools.map((spool) => (
                <SpoolFillRow key={spool.id} spool={spool} />
              ))}
            </ExpandableBarRow>
          ))}
        </div>
      )}
    </div>
  );
}
