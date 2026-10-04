import { useTranslation } from "react-i18next";
import { bulkEntryKey, groupBulkEntries, type BulkSpoolEntry, type Manufacturer, type Material } from "@filapilot/shared";
import { ColorDot } from "./SpoolViews.js";

interface BulkSpoolListProps {
  entries: BulkSpoolEntry[];
  manufacturers: Manufacturer[];
  materials: Material[];
  // Preis je Gruppe (Hersteller + Material + Lieferform + Gewicht) als Euro-Text
  prices: Record<string, string>;
  onPriceChange: (groupKey: string, value: string) => void;
  onCountChange: (entryKey: string, delta: number) => void;
}

const BUTTON_CLASS = "flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-sm font-semibold hover:bg-[var(--color-bg)]";

// Die bisher angeklickten Farben, je Hersteller + Material + Lieferform in einer Gruppe mit eigenem Preis; je Farbe ein
// Zaehler (+/-), bei 0 verschwindet die Zeile.
export function BulkSpoolList({ entries, manufacturers, materials, prices, onPriceChange, onCountChange }: BulkSpoolListProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {groupBulkEntries(entries).map((group) => {
        const first = group.entries[0];
        if (!first) {
          return null;
        }
        const manufacturer = manufacturers.find((entry) => entry.id === first.manufacturerId)?.name ?? "?";
        const material = materials.find((entry) => entry.id === first.materialId)?.name ?? "?";
        const packaging = first.isRefill ? t("spools.packaging.refill") : t("spools.packaging.withSpoolShort");
        return (
          <div key={group.key} className="rounded-lg border border-[var(--color-border)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-sm font-semibold">
                {manufacturer} {material}
                <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                  {packaging} · {first.initialWeightG} g
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                {t("spools.bulk.pricePerSpool")}
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={prices[group.key] ?? ""}
                  onChange={(event) => onPriceChange(group.key, event.target.value)}
                  className="w-24 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
                />
              </label>
            </div>
            <ul>
              {group.entries.map((entry) => {
                const key = bulkEntryKey(entry);
                return (
                  <li key={key} className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5 last:border-b-0">
                    <ColorDot hex={entry.colorHex} size="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.colorName}</span>
                    <button type="button" onClick={() => onCountChange(key, -1)} aria-label={t("spools.bulk.fewer", { color: entry.colorName })} className={BUTTON_CLASS}>
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{entry.count}</span>
                    <button type="button" onClick={() => onCountChange(key, 1)} aria-label={t("spools.bulk.more", { color: entry.colorName })} className={BUTTON_CLASS}>
                      +
                    </button>
                    <button type="button" onClick={() => onCountChange(key, -entry.count)} aria-label={t("spools.bulk.remove", { color: entry.colorName })} className={`${BUTTON_CLASS} text-[var(--color-danger)]`}>
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
