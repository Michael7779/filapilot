import { useTranslation } from "react-i18next";
import type { SpoolSortColumn } from "@filapilot/shared";

// Angaben, die in der Listenansicht erst im aufgeklappten Bereich stehen - sortierbar sind sie trotzdem ohne Aufklappen.
export const DETAIL_SORT_COLUMNS: readonly { column: SpoolSortColumn; labelKey: string }[] = [
  { column: "nozzle", labelKey: "spools.list.nozzle" },
  { column: "bed", labelKey: "spools.list.bed" },
  { column: "length", labelKey: "spools.list.length" },
  { column: "price", labelKey: "spools.filter.price" },
  { column: "purchasedAt", labelKey: "spools.list.purchasedAt" },
  { column: "addedAt", labelKey: "spools.list.addedAt" },
  { column: "lastModifiedAt", labelKey: "spools.list.lastModifiedAt" },
  { column: "note", labelKey: "spools.note" }
];

interface SpoolListSortBarProps {
  // Liefert den Sortier-Knopf einer Spalte (Pfeile und Richtung kommen aus der Listenansicht).
  sortButton: (column: SpoolSortColumn, label: string) => React.JSX.Element;
  activeColumn: SpoolSortColumn | undefined;
}

// Zweite Kopfzeile der Liste: Sortier-Knoepfe fuer alle Angaben aus dem aufgeklappten Bereich.
export function SpoolListSortBar({ sortButton, activeColumn }: SpoolListSortBarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2 text-xs font-medium text-[var(--color-text-secondary)]">
      <span className="font-normal text-[var(--color-text-muted)]">{t("spools.list.sortMore")}</span>
      {DETAIL_SORT_COLUMNS.map(({ column, labelKey }) => (
        <span key={column} className={column === activeColumn ? "text-[var(--color-text-primary)]" : undefined}>
          {sortButton(column, t(labelKey))}
        </span>
      ))}
    </div>
  );
}
