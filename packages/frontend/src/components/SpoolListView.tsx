import { useTranslation } from "react-i18next";
import { findSameFilamentSpools, remainingPercent, spoolPackaging, type SpoolSortColumn, type SpoolWithRelations } from "@filapilot/shared";
import { spoolRowDomId, useSpoolFocus } from "../hooks/useSpoolFocus.js";
import { PackagingIcon } from "./PackagingIcon.js";
import { SpoolActions } from "./SpoolActions.js";
import { SpoolListDetail } from "./SpoolListDetail.js";
import { SpoolListSiblings } from "./SpoolListSiblings.js";
import { SpoolListSortBar } from "./SpoolListSortBar.js";
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

function statusKey(spool: SpoolWithRelations): string {
  if (spool.archivedAt) {
    return spool.archiveReason === "CLOUD_REMOVED" ? "spools.archivedCloud" : "spools.archived";
  }
  return spool.openedAt ? "spools.list.active" : "spools.unopened";
}

interface SpoolRowsProps {
  rowId: string;
  flash: boolean;
  columnCount: number;
  archived: boolean;
  main: React.JSX.Element;
  detail: React.JSX.Element;
}

// Hauptzeile + direkt darunter die kompakte Detailzeile; beide teilen sich Hervorhebung und Trennlinie.
function SpoolRows({ rowId, flash, columnCount, archived, main, detail }: SpoolRowsProps): React.JSX.Element {
  const tone = `transition-colors duration-700 motion-reduce:transition-none ${archived ? "opacity-70" : ""}`;
  const style = flash ? { backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)" } : undefined;
  return (
    <>
      <tr id={rowId} className={tone} style={style}>
        {main}
      </tr>
      <tr className={`border-b border-[var(--color-border)] last:border-b-0 ${tone}`} style={style}>
        <td colSpan={columnCount} className="px-3 pb-2.5 pt-0">
          {detail}
        </td>
      </tr>
    </>
  );
}

// Liste: pro Spule eine Zeile mit den Kernangaben (Farbe, Hersteller/Material, Restgewicht, Lagerort, Status);
// alles Weitere (Temperaturen, Preis, Datum, Notiz, Zusatzfelder) steht kompakt in einer Zeile direkt darunter.
export function ListView({ spools, materials, isAll, customFieldDefinitions, columnSort, onColumnSort, density = "normal", allSpools, onJumpToSpool, focus, ...handlers }: SpoolViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const compact = density === "compact";
  const cellClass = `px-3 align-middle ${compact ? "py-1" : "py-2.5"}`;
  const columnCount = isAll ? 8 : 7;
  const flashId = useSpoolFocus(focus, spools.map((spool) => spool.id));

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
            {sortHead("color", t("spools.list.color"))}
            <th className={headClass} aria-sort={ariaSort("manufacturer") ?? ariaSort("material")}>
              {sortButton("manufacturer", t("spools.manufacturer"))}
              <span className="mx-1 font-normal">·</span>
              {sortButton("material", t("spools.material"))}
            </th>
            {sortHead("packaging", t("spools.packaging.listLabel"))}
            {isAll && sortHead("inventory", t("spools.inventory"))}
            {sortHead("weight", t("spools.list.weight"))}
            {sortHead("location", t("spools.filter.location"))}
            {sortHead("status", t("spools.list.status"))}
            <th className={headClass}>
              <span className="sr-only">{t("spools.actions")}</span>
            </th>
          </tr>
          <tr className="border-b border-[var(--color-border)]">
            <th colSpan={columnCount} className="pt-1 text-left">
              <SpoolListSortBar sortButton={sortButton} activeColumn={columnSort?.column} />
            </th>
          </tr>
        </thead>
        <tbody>
          {spools.map((spool) => {
            const percent = Math.round(remainingPercent(spool));
            const siblings = allSpools ? findSameFilamentSpools(spool, allSpools) : [];
            const cell = { className: cellClass };
            return (
              <SpoolRows
                key={spool.id}
                rowId={spoolRowDomId(spool.id)}
                flash={flashId === spool.id}
                columnCount={columnCount}
                archived={Boolean(spool.archivedAt)}
                main={
                  <>
                    <td {...cell} className={`${cell.className} whitespace-nowrap`}>
                      <span className="flex items-center gap-2">
                        <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span>
                          <span className="font-medium">{spool.colorName}</span>
                          {spool.colorHex && <span className="ml-1 text-xs text-[var(--color-text-muted)]">{spool.colorHex.toUpperCase()}</span>}
                        </span>
                      </span>
                    </td>
                    <td {...cell}>
                      {spool.manufacturerName} · {spool.materialName}
                    </td>
                    <td {...cell}>
                      {spoolPackaging(spool) ? <PackagingIcon spool={spool} size={26} /> : <span className="text-[var(--color-text-muted)]">–</span>}
                    </td>
                    {isAll && <td {...cell}>{spool.inventoryName ?? "–"}</td>}
                    <td {...cell}>
                      <div className="w-36 max-w-full">
                        <WeightBar spool={spool} />
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {spool.remainingWeightG} g / {spool.initialWeightG} g ({percent} %)
                        </span>
                      </div>
                    </td>
                    <td {...cell} className={`${cell.className} whitespace-nowrap`}>
                      {spool.location ?? "–"}
                    </td>
                    <td {...cell} className={`${cell.className} whitespace-nowrap`} style={!spool.archivedAt && !spool.openedAt ? { color: "var(--accent)" } : undefined}>
                      {t(statusKey(spool))}
                    </td>
                    <td className={`px-3 ${siblings.length > 0 ? "py-2 align-top" : "align-middle"}`}>
                      <SpoolActions spool={spool} {...handlers} labelledReorder />
                      {onJumpToSpool && <SpoolListSiblings siblings={siblings} onJump={onJumpToSpool} />}
                    </td>
                  </>
                }
                detail={
                  <SpoolListDetail
                    spool={spool}
                    material={materials.find((entry) => entry.id === spool.materialId)}
                    customFieldDefinitions={customFieldDefinitions}
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
