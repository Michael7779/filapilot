import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EMPTY_SPOOL_FILTER,
  SPOOL_SORT_KEYS,
  isFilterActive,
  type SpoolFilter,
  type SpoolSortKey,
  type SpoolWithRelations
} from "@filapilot/shared";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

interface SpoolFilterBarProps {
  spools: readonly SpoolWithRelations[];
  filter: SpoolFilter;
  sort: SpoolSortKey;
  onFilterChange: (filter: SpoolFilter) => void;
  onSortChange: (sort: SpoolSortKey) => void;
}

const inputClass = "rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text-primary)]";

// Zahl aus einem Eingabefeld (Komma oder Punkt); leer oder ungueltig = kein Grenzwert
function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(",", ".").trim());
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}

// Suche, Filter und Sortierung der Spulenliste (rein im Browser; die Liste ist bereits auf das Lager begrenzt).
export function SpoolFilterBar({ spools, filter, sort, onFilterChange, onSortChange }: SpoolFilterBarProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  // Zaehler, der die (unkontrollierten) Zahlenfelder beim Zuruecksetzen leert
  const [resetCount, setResetCount] = useState(0);
  const set = (patch: Partial<SpoolFilter>): void => onFilterChange({ ...filter, ...patch });

  const options = useMemo(() => {
    const manufacturers = new Map(spools.map((spool) => [spool.manufacturerId, spool.manufacturerName]));
    return {
      manufacturers: sortAlphabetically([...manufacturers], ([, name]) => name, locale),
      materials: sortAlphabetically(unique(spools.map((spool) => spool.materialName)), (name) => name, locale),
      colors: sortAlphabetically(unique(spools.map((spool) => spool.colorName)), (name) => name, locale),
      locations: sortAlphabetically(unique(spools.map((spool) => spool.location ?? "")), (name) => name, locale)
    };
  }, [spools, locale]);
  const sortOptions = sortAlphabetically([...SPOOL_SORT_KEYS], (key) => t(`spools.sort.${key}`), locale);

  const select = (label: string, value: string, onChange: (value: string) => void, entries: readonly [string, string][]): React.JSX.Element => (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">{t("spools.filter.all")}</option>
        {entries.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  const range = (
    label: string,
    unit: string,
    min: number | null,
    max: number | null,
    onChange: (min: number | null, max: number | null) => void,
    scale: number
  ): React.JSX.Element => (
    <fieldset className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
      <legend className="mb-1">{label}</legend>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} ${t("spools.filter.min")}`}
          placeholder={t("spools.filter.min")}
          defaultValue={min === null ? "" : String(min / scale)}
          key={`min-${resetCount}`}
          onChange={(event) => {
            const value = parseNumber(event.target.value);
            onChange(value === null ? null : Math.round(value * scale), max);
          }}
          className={`${inputClass} w-20`}
        />
        <span>–</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} ${t("spools.filter.max")}`}
          placeholder={t("spools.filter.max")}
          defaultValue={max === null ? "" : String(max / scale)}
          key={`max-${resetCount}`}
          onChange={(event) => {
            const value = parseNumber(event.target.value);
            onChange(min, value === null ? null : Math.round(value * scale));
          }}
          className={`${inputClass} w-20`}
        />
        <span>{unit}</span>
      </div>
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
      <input
        type="search"
        value={filter.search}
        onChange={(event) => set({ search: event.target.value })}
        placeholder={t("spools.filter.searchPlaceholder")}
        aria-label={t("spools.filter.search")}
        className={`${inputClass} w-full`}
      />
      <div className="flex flex-wrap items-end gap-3">
        {select(t("spools.manufacturer"), filter.manufacturerId, (value) => set({ manufacturerId: value }), options.manufacturers)}
        {select(t("spools.material"), filter.materialName, (value) => set({ materialName: value }), options.materials.map((name) => [name, name]))}
        {select(t("spools.colorName"), filter.colorName, (value) => set({ colorName: value }), options.colors.map((name) => [name, name]))}
        {select(t("spools.filter.location"), filter.location, (value) => set({ location: value }), options.locations.map((name) => [name, name]))}
        {range(t("spools.filter.remaining"), "g", filter.remainingMinG, filter.remainingMaxG, (min, max) => set({ remainingMinG: min, remainingMaxG: max }), 1)}
        {range(t("spools.filter.price"), "€", filter.priceMinCents, filter.priceMaxCents, (min, max) => set({ priceMinCents: min, priceMaxCents: max }), 100)}
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
          {t("spools.filter.sortBy")}
          <select value={sort} onChange={(event) => onSortChange(SPOOL_SORT_KEYS.find((key) => key === event.target.value) ?? "name")} className={inputClass}>
            {sortOptions.map((key) => (
              <option key={key} value={key}>
                {t(`spools.sort.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={filter.lowStockOnly} onChange={(event) => set({ lowStockOnly: event.target.checked })} />
          {t("spools.filter.lowStockOnly")}
        </label>
        {isFilterActive(filter) && (
          <button
            type="button"
            onClick={() => {
              setResetCount((count) => count + 1);
              onFilterChange(EMPTY_SPOOL_FILTER);
            }}
            className="pb-2 text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            {t("spools.filter.reset")}
          </button>
        )}
      </div>
    </div>
  );
}
