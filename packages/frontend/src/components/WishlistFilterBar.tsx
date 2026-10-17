import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  EMPTY_WISHLIST_FILTER,
  NO_MANUFACTURER_FILTER,
  isWishlistFilterActive,
  type WishlistFilter,
  type WishlistItem
} from "@filapilot/shared";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { STATUS_ORDER } from "../lib/wishlistStatus.js";

interface WishlistFilterBarProps {
  items: readonly WishlistItem[];
  filter: WishlistFilter;
  onChange: (filter: WishlistFilter) => void;
}

const FIELD_CLASS = "rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text-primary)]";

function toStatusFilter(value: string): WishlistFilter["status"] {
  return STATUS_ORDER.find((status) => status === value) ?? "";
}

// Suche und Filter der Wunsch- und Bestellliste (rein im Browser). Die Auswahlen bieten nur an, was auf der Liste vorkommt.
export function WishlistFilterBar({ items, filter, onChange }: WishlistFilterBarProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const set = (patch: Partial<WishlistFilter>): void => onChange({ ...filter, ...patch });

  const options = useMemo(() => {
    const manufacturers = new Map<string, string>();
    const materials = new Map<string, string>();
    let withoutManufacturer = false;
    for (const item of items) {
      if (item.manufacturerId && item.manufacturerName) {
        manufacturers.set(item.manufacturerId, item.manufacturerName);
      } else {
        withoutManufacturer = true;
      }
      if (item.materialId && item.materialName) {
        materials.set(item.materialId, item.materialName);
      }
    }
    return {
      manufacturers: sortAlphabetically([...manufacturers], ([, name]) => name, locale),
      materials: sortAlphabetically([...materials], ([, name]) => name, locale),
      addedBy: sortAlphabetically([...new Set(items.map((item) => item.addedByName))], (name) => name, locale),
      withoutManufacturer
    };
  }, [items, locale]);

  const select = (label: string, value: string, onSelect: (value: string) => void, entries: readonly (readonly [string, string])[]): React.JSX.Element => (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
      {label}
      <select value={value} onChange={(event) => onSelect(event.target.value)} className={FIELD_CLASS}>
        <option value="">{t("wishlist.filter.all")}</option>
        {entries.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  const manufacturerEntries: (readonly [string, string])[] = options.withoutManufacturer
    ? [...options.manufacturers, [NO_MANUFACTURER_FILTER, t("wishlist.filter.noManufacturer")]]
    : options.manufacturers;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
      <input
        type="search"
        value={filter.search}
        onChange={(event) => set({ search: event.target.value })}
        placeholder={t("wishlist.filter.searchPlaceholder")}
        aria-label={t("wishlist.filter.search")}
        className={`${FIELD_CLASS} w-full`}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
          {t("wishlist.statusLabel")}
          <select value={filter.status} onChange={(event) => set({ status: toStatusFilter(event.target.value) })} className={FIELD_CLASS}>
            <option value="">{t("wishlist.filter.all")}</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {t(`wishlist.status.${status}`)}
              </option>
            ))}
          </select>
        </label>
        {select(t("spools.manufacturer"), filter.manufacturer, (value) => set({ manufacturer: value }), manufacturerEntries)}
        {select(t("spools.material"), filter.material, (value) => set({ material: value }), options.materials)}
        {select(t("wishlist.filter.addedBy"), filter.addedBy, (value) => set({ addedBy: value }), options.addedBy.map((name) => [name, name] as const))}
        {isWishlistFilterActive(filter) && (
          <button type="button" onClick={() => onChange(EMPTY_WISHLIST_FILTER)} className="pb-2 text-sm font-medium" style={{ color: "var(--accent)" }}>
            {t("wishlist.filter.reset")}
          </button>
        )}
      </div>
    </div>
  );
}
