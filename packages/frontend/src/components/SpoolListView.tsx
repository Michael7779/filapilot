import { useTranslation } from "react-i18next";
import { effectiveLastModifiedAt, estimateRemainingLengthM, remainingPercent, type SpoolSortColumn, type SpoolWithRelations } from "@filapilot/shared";
import { SpoolActions } from "./SpoolActions.js";
import { ColorDot, WeightBar, type SpoolViewProps } from "./SpoolViews.js";

const headClass = "whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]";
const cellClass = "whitespace-nowrap px-3 py-2 align-middle";

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

// "–" ohne bekannte Dichte des Materials, sonst "≈ 335 m" (Naeherung, siehe estimateRemainingLengthM).
function formatLength(meters: number | null, locale: string, t: (key: string) => string): string {
  if (meters === null) {
    return "–";
  }
  return `${t("spools.list.approx")} ${Math.round(meters).toLocaleString(locale)} m`;
}

// "60 °C" bei nur einem Wert, sonst "60–80 °C" als Bereich (Material.bedTempMaxC).
function bedTempCell(bedTempC: number | null, bedTempMaxC: number | null): string {
  if (bedTempC === null) {
    return "–";
  }
  return bedTempMaxC !== null ? `${bedTempC}–${bedTempMaxC} °C` : `${bedTempC} °C`;
}

function statusKey(spool: SpoolWithRelations): string {
  if (spool.archivedAt) {
    return spool.archiveReason === "CLOUD_REMOVED" ? "spools.archivedCloud" : "spools.archived";
  }
  return spool.openedAt ? "spools.list.active" : "spools.unopened";
}

// Liste: eine Zeile pro Spule mit ALLEN Angaben (Material, Farbe, Temperaturen, Gewicht, Lagerort, Preis, Datum, Notiz, Zusatzfelder).
export function ListView({ spools, materials, isAll, customFieldDefinitions, columnSort, onColumnSort, ...handlers }: SpoolViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  // Klick auf die Ueberschrift sortiert nach der Spalte; erneuter Klick dreht die Richtung um (Logik in der Spulen-Seite).
  const sortHead = (column: SpoolSortColumn, label: string): React.JSX.Element => {
    const direction = columnSort?.column === column ? columnSort.direction : null;
    return (
      <th key={column} className={headClass} aria-sort={direction ? ARIA_SORT[direction] : undefined}>
        <button
          type="button"
          onClick={() => onColumnSort?.(column)}
          title={t("spools.list.sortBy", { column: label })}
          className="inline-flex items-center gap-1 font-medium hover:text-[var(--color-text)]"
        >
          {label}
          <SortIcon direction={direction} />
        </button>
      </th>
    );
  };
  // "Gekauft am" bleibt ein reines Datum (kein Zeitpunkt, nur ein Kalendertag). "Hinzugefuegt am" und "Geaendert
  // am" sind echte Zeitpunkte und zeigen deshalb auch die Uhrzeit.
  const date = (value: Date | string | null): string => (value ? new Date(value).toLocaleDateString(i18n.language) : "–");
  const dateTime = (value: Date | string): string =>
    new Date(value).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const price = (spool: SpoolWithRelations): string =>
    spool.purchasePriceCents === null ? "–" : (spool.purchasePriceCents / 100).toLocaleString(i18n.language, { style: "currency", currency: "EUR" });
  const customFieldSummary = (spool: SpoolWithRelations): string =>
    customFieldDefinitions
      .filter((definition) => spool.customFields[definition.id] != null && spool.customFields[definition.id] !== "")
      .map((definition) => {
        const value = spool.customFields[definition.id];
        let display = String(value);
        if (definition.kind === "BOOLEAN") {
          display = value ? t("audit.yes") : t("audit.no");
        }
        return `${definition.name}: ${display}`;
      })
      .join(" · ");

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {sortHead("color", t("spools.list.color"))}
            {sortHead("manufacturer", t("spools.manufacturer"))}
            {sortHead("material", t("spools.material"))}
            {isAll && sortHead("inventory", t("spools.inventory"))}
            {sortHead("nozzle", t("spools.list.nozzle"))}
            {sortHead("bed", t("spools.list.bed"))}
            {sortHead("weight", t("spools.list.weight"))}
            {sortHead("length", t("spools.list.length"))}
            {sortHead("location", t("spools.filter.location"))}
            {sortHead("price", t("spools.filter.price"))}
            {sortHead("purchasedAt", t("spools.list.purchasedAt"))}
            {sortHead("addedAt", t("spools.list.addedAt"))}
            {sortHead("lastModifiedAt", t("spools.list.lastModifiedAt"))}
            {sortHead("note", t("spools.note"))}
            {customFieldDefinitions.length > 0 && <th className={headClass}>{t("spools.customFields")}</th>}
            {sortHead("status", t("spools.list.status"))}
            <th className={headClass}>
              <span className="sr-only">{t("spools.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spools.map((spool) => {
            const temps = materials.find((material) => material.id === spool.materialId);
            const percent = Math.round(remainingPercent(spool));
            return (
              <tr key={spool.id} className={`border-b border-[var(--color-border)] last:border-b-0 ${spool.archivedAt ? "opacity-70" : ""}`}>
                <td className={cellClass}>
                  <span className="flex items-center gap-2">
                    <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size="h-4 w-4" />
                    <span>
                      <span className="font-medium">{spool.colorName}</span>
                      {spool.colorHex && <span className="ml-1 text-xs text-[var(--color-text-muted)]">{spool.colorHex.toUpperCase()}</span>}
                    </span>
                  </span>
                </td>
                <td className={cellClass}>{spool.manufacturerName}</td>
                <td className={cellClass}>{spool.materialName}</td>
                {isAll && <td className={cellClass}>{spool.inventoryName ?? "–"}</td>}
                <td className={cellClass}>{temps ? `${temps.printTempMinC}–${temps.printTempMaxC} °C` : "–"}</td>
                <td className={cellClass}>{temps ? bedTempCell(temps.bedTempC, temps.bedTempMaxC) : "–"}</td>
                <td className={cellClass}>
                  <div className="w-36">
                    <WeightBar spool={spool} />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {spool.remainingWeightG} g / {spool.initialWeightG} g ({percent} %)
                    </span>
                  </div>
                </td>
                <td className={cellClass}>
                  {formatLength(estimateRemainingLengthM(spool.remainingWeightG, temps?.densityGCm3 ?? null, temps?.filamentDiameterMm), i18n.language, t)}
                </td>
                <td className={cellClass}>{spool.location ?? "–"}</td>
                <td className={cellClass}>{price(spool)}</td>
                <td className={cellClass}>{date(spool.purchasedAt)}</td>
                <td className={cellClass}>{dateTime(spool.createdAt)}</td>
                <td className={cellClass}>{dateTime(effectiveLastModifiedAt(spool))}</td>
                <td className={`${cellClass} max-w-[160px] truncate`} title={spool.note ?? ""}>
                  {spool.note ?? "–"}
                </td>
                {customFieldDefinitions.length > 0 && (
                  <td className={`${cellClass} max-w-[200px] truncate`} title={customFieldSummary(spool)}>
                    {customFieldSummary(spool) || "–"}
                  </td>
                )}
                <td className={cellClass} style={!spool.archivedAt && !spool.openedAt ? { color: "var(--accent)" } : undefined}>
                  {t(statusKey(spool))}
                </td>
                <td className={cellClass}>
                  <SpoolActions spool={spool} {...handlers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
