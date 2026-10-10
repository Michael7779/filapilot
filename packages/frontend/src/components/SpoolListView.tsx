import { useState } from "react";
import { useTranslation } from "react-i18next";
import { remainingPercent, type SpoolSortColumn, type SpoolWithRelations } from "@filapilot/shared";
import { SpoolActions } from "./SpoolActions.js";
import { SpoolListDetail } from "./SpoolListDetail.js";
import { ColorDot, WeightBar, type SpoolViewProps } from "./SpoolViews.js";

const headClass = "whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

// Pfeil nach oben/unten fuer die aktive Sortierung, sonst ein dezentes Doppel-Chevron.
function SortIcon({ direction }: { direction: "asc" | "desc" | null }): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5 6 1.5l3 3" opacity={direction === null ? 0.4 : Number(direction === "asc") || 0.25} />
      <path d="M3 7.5 6 10.5l3-3" opacity={direction === null ? 0.4 : Number(direction === "desc") || 0.25} />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

function statusKey(spool: SpoolWithRelations): string {
  if (spool.archivedAt) {
    return spool.archiveReason === "CLOUD_REMOVED" ? "spools.archivedCloud" : "spools.archived";
  }
  return spool.openedAt ? "spools.list.active" : "spools.unopened";
}

interface SpoolRowsProps {
  open: boolean;
  columnCount: number;
  archived: boolean;
  main: React.JSX.Element;
  detail: React.JSX.Element;
}

// Hauptzeile + (aufgeklappt) Detailzeile.
function SpoolRows({ open, columnCount, archived, main, detail }: SpoolRowsProps): React.JSX.Element {
  return (
    <>
      <tr className={`border-b border-[var(--color-border)] last:border-b-0 ${archived ? "opacity-70" : ""}`}>{main}</tr>
      {open && (
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] last:border-b-0">
          <td colSpan={columnCount} className="py-3 pl-12 pr-4">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

// Liste: pro Spule eine Zeile mit den Kernangaben (Farbe, Hersteller/Material, Restgewicht, Lagerort, Status);
// alles Weitere (Temperaturen, Preis, Datum, Notiz, Zusatzfelder) klappt unter der Zeile auf.
export function ListView({ spools, materials, isAll, customFieldDefinitions, columnSort, onColumnSort, density = "normal", ...handlers }: SpoolViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const compact = density === "compact";
  const cellClass = `px-3 align-middle ${compact ? "py-1" : "py-2.5"}`;
  const allOpen = spools.length > 0 && spools.every((spool) => expanded.has(spool.id));
  const columnCount = isAll ? 8 : 7;

  function toggle(id: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  // Klick auf die Ueberschrift sortiert nach der Spalte; erneuter Klick dreht die Richtung um (Logik in der Spulen-Seite).
  const sortButton = (column: SpoolSortColumn, label: string): React.JSX.Element => {
    const direction = columnSort?.column === column ? columnSort.direction : null;
    return (
      <button
        type="button"
        onClick={() => onColumnSort?.(column)}
        title={t("spools.list.sortBy", { column: label })}
        className="inline-flex items-center gap-1 font-medium hover:text-[var(--color-text-primary)]"
      >
        {label}
        <SortIcon direction={direction} />
      </button>
    );
  };
  const ariaSort = (column: SpoolSortColumn): "ascending" | "descending" | undefined => (columnSort?.column === column ? ARIA_SORT[columnSort.direction] : undefined);
  const sortHead = (column: SpoolSortColumn, label: string): React.JSX.Element => (
    <th key={column} className={headClass} aria-sort={ariaSort(column)}>
      {sortButton(column, label)}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="w-9 px-2 py-2">
              <button
                type="button"
                onClick={() => setExpanded(allOpen ? new Set() : new Set(spools.map((spool) => spool.id)))}
                aria-label={t(allOpen ? "spools.list.collapseAll" : "spools.list.expandAll")}
                title={t(allOpen ? "spools.list.collapseAll" : "spools.list.expandAll")}
                className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
              >
                <ChevronIcon open={allOpen} />
              </button>
            </th>
            {sortHead("color", t("spools.list.color"))}
            <th className={headClass} aria-sort={ariaSort("manufacturer") ?? ariaSort("material")}>
              {sortButton("manufacturer", t("spools.manufacturer"))}
              <span className="mx-1 font-normal">·</span>
              {sortButton("material", t("spools.material"))}
            </th>
            {isAll && sortHead("inventory", t("spools.inventory"))}
            {sortHead("weight", t("spools.list.weight"))}
            {sortHead("location", t("spools.filter.location"))}
            {sortHead("status", t("spools.list.status"))}
            <th className={headClass}>
              <span className="sr-only">{t("spools.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spools.map((spool) => {
            const open = expanded.has(spool.id);
            const percent = Math.round(remainingPercent(spool));
            // Ein Klick auf eine Zelle klappt die Zeile auf; die Aktionen und der Pfeil bleiben davon unberuehrt.
            const toggleCell = { onClick: () => toggle(spool.id), className: `${cellClass} cursor-pointer` };
            return (
              <SpoolRows
                key={spool.id}
                open={open}
                columnCount={columnCount}
                archived={Boolean(spool.archivedAt)}
                main={
                  <>
                    <td className="px-2 align-middle">
                      <button
                        type="button"
                        onClick={() => toggle(spool.id)}
                        aria-expanded={open}
                        aria-label={t(open ? "spools.list.collapseRow" : "spools.list.expandRow")}
                        className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
                      >
                        <ChevronIcon open={open} />
                      </button>
                    </td>
                    <td {...toggleCell} className={`${toggleCell.className} whitespace-nowrap`}>
                      <span className="flex items-center gap-2">
                        <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span>
                          <span className="font-medium">{spool.colorName}</span>
                          {spool.colorHex && <span className="ml-1 text-xs text-[var(--color-text-muted)]">{spool.colorHex.toUpperCase()}</span>}
                        </span>
                      </span>
                    </td>
                    <td {...toggleCell}>
                      {spool.manufacturerName} · {spool.materialName}
                    </td>
                    {isAll && <td {...toggleCell}>{spool.inventoryName ?? "–"}</td>}
                    <td {...toggleCell}>
                      <div className="w-36 max-w-full">
                        <WeightBar spool={spool} />
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {spool.remainingWeightG} g / {spool.initialWeightG} g ({percent} %)
                        </span>
                      </div>
                    </td>
                    <td {...toggleCell} className={`${toggleCell.className} whitespace-nowrap`}>
                      {spool.location ?? "–"}
                    </td>
                    <td {...toggleCell} className={`${toggleCell.className} whitespace-nowrap`} style={!spool.archivedAt && !spool.openedAt ? { color: "var(--accent)" } : undefined}>
                      {t(statusKey(spool))}
                    </td>
                    <td className="px-3 align-middle">
                      <SpoolActions spool={spool} {...handlers} labelledReorder />
                    </td>
                  </>
                }
                detail={
                  <SpoolListDetail
                    spool={spool}
                    material={materials.find((entry) => entry.id === spool.materialId)}
                    customFieldDefinitions={customFieldDefinitions}
                    renderLabel={sortButton}
                  />
                }
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
