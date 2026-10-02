import type { SpoolWithRelations } from "./schemas/spool.js";

export const SPOOL_SORT_KEYS = ["name", "manufacturer", "remaining", "price", "added"] as const;
export type SpoolSortKey = (typeof SPOOL_SORT_KEYS)[number];

// Filter der Spulenliste. Leere Werte ("" bzw. null) bedeuten "kein Filter".
export interface SpoolFilter {
  search: string;
  manufacturerId: string;
  materialName: string;
  colorName: string;
  location: string;
  // Restgewicht in Gramm
  remainingMinG: number | null;
  remainingMaxG: number | null;
  // Kaufpreis in Cent
  priceMinCents: number | null;
  priceMaxCents: number | null;
  // Restgewicht in % vom Ursprungsgewicht, nur Obergrenze ("hoechstens X %")
  remainingMaxPercent: number | null;
  lowStockOnly: boolean;
  unopenedOnly: boolean;
  // Zeitstempel (ms) auf die letzte Aenderung (siehe effectiveLastModifiedAt), bereits auf Tagesgrenzen
  // umgerechnet (Beginn/Ende des gewaehlten Tages) - wie bei den Zahlen-Bereichen oben rechnet die Oberflaeche
  // den fertigen Grenzwert, der Filter selbst vergleicht nur noch.
  lastModifiedAfter: number | null;
  lastModifiedBefore: number | null;
}

export const EMPTY_SPOOL_FILTER: SpoolFilter = {
  search: "",
  manufacturerId: "",
  materialName: "",
  colorName: "",
  location: "",
  remainingMinG: null,
  remainingMaxG: null,
  priceMinCents: null,
  priceMaxCents: null,
  remainingMaxPercent: null,
  lowStockOnly: false,
  unopenedOnly: false,
  lastModifiedAfter: null,
  lastModifiedBefore: null
};

// Letzte inhaltliche Aenderung einer Spule: lastModifiedAt, sonst (noch nie geaendert) createdAt.
export function effectiveLastModifiedAt(spool: Pick<SpoolWithRelations, "lastModifiedAt" | "createdAt">): Date {
  return new Date(spool.lastModifiedAt ?? spool.createdAt);
}

// Restgewicht in % vom Ursprungsgewicht (0-100, kann rechnerisch > 100 sein bei nachtraeglich erhoehtem Restgewicht)
export function remainingPercent(spool: Pick<SpoolWithRelations, "remainingWeightG" | "initialWeightG">): number {
  return (spool.remainingWeightG / spool.initialWeightG) * 100;
}

export function isFilterActive(filter: SpoolFilter): boolean {
  return (Object.keys(EMPTY_SPOOL_FILTER) as (keyof SpoolFilter)[]).some((key) => filter[key] !== EMPTY_SPOOL_FILTER[key]);
}

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) {
    return true;
  }
  // Spulen ohne Wert (z.B. ohne Kaufpreis) fallen aus jedem Bereichsfilter heraus
  if (value === null) {
    return false;
  }
  return (min === null || value >= min) && (max === null || value <= max);
}

function matchesSearch(spool: SpoolWithRelations, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = [spool.manufacturerName, spool.materialName, spool.colorName, spool.location ?? "", spool.inventoryName ?? ""]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function filterSpools(spools: readonly SpoolWithRelations[], filter: SpoolFilter, lowStockRatio: number): SpoolWithRelations[] {
  return spools.filter(
    (spool) =>
      matchesSearch(spool, filter.search) &&
      (!filter.manufacturerId || spool.manufacturerId === filter.manufacturerId) &&
      (!filter.materialName || spool.materialName === filter.materialName) &&
      (!filter.colorName || spool.colorName === filter.colorName) &&
      (!filter.location || spool.location === filter.location) &&
      inRange(spool.remainingWeightG, filter.remainingMinG, filter.remainingMaxG) &&
      inRange(spool.purchasePriceCents, filter.priceMinCents, filter.priceMaxCents) &&
      (filter.remainingMaxPercent === null || remainingPercent(spool) <= filter.remainingMaxPercent) &&
      (!filter.lowStockOnly || spool.remainingWeightG / spool.initialWeightG <= lowStockRatio) &&
      (!filter.unopenedOnly || spool.openedAt === null) &&
      inRange(effectiveLastModifiedAt(spool).getTime(), filter.lastModifiedAfter, filter.lastModifiedBefore)
  );
}

export function sortSpools(spools: readonly SpoolWithRelations[], key: SpoolSortKey, locale: string): SpoolWithRelations[] {
  const text = (a: string, b: string): number => a.localeCompare(b, locale, { sensitivity: "base", numeric: true });
  const byName = (a: SpoolWithRelations, b: SpoolWithRelations): number =>
    text(`${a.materialName} ${a.colorName}`, `${b.materialName} ${b.colorName}`);
  const sorted = [...spools];
  switch (key) {
    case "manufacturer":
      return sorted.sort((a, b) => text(a.manufacturerName, b.manufacturerName) || byName(a, b));
    case "remaining":
      return sorted.sort((a, b) => a.remainingWeightG - b.remainingWeightG || byName(a, b));
    case "price":
      // ohne Preis ans Ende
      return sorted.sort((a, b) => (a.purchasePriceCents ?? Infinity) - (b.purchasePriceCents ?? Infinity) || byName(a, b));
    case "added":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    default:
      return sorted.sort(byName);
  }
}
