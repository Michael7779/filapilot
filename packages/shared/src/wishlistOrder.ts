import type { WishlistItem, WishlistStatus } from "./schemas/wishlist.js";

// Filterwert fuer "Eintraege ohne Hersteller" (ein leerer Wert heisst "alle").
export const NO_MANUFACTURER_FILTER = "none";

export interface WishlistFilter {
  search: string;
  status: WishlistStatus | "";
  manufacturer: string;
  material: string;
  addedBy: string;
}

export const EMPTY_WISHLIST_FILTER: WishlistFilter = { search: "", status: "", manufacturer: "", material: "", addedBy: "" };

type FilterableItem = Pick<
  WishlistItem,
  "title" | "note" | "status" | "manufacturerId" | "manufacturerName" | "materialId" | "materialName" | "colorName" | "addedByName"
>;

export function isWishlistFilterActive(filter: WishlistFilter): boolean {
  return filter.search.trim() !== "" || filter.status !== "" || filter.manufacturer !== "" || filter.material !== "" || filter.addedBy !== "";
}

function searchText(item: FilterableItem): string {
  return [item.title, item.note, item.manufacturerName, item.materialName, item.colorName, item.addedByName].filter(Boolean).join(" ").toLowerCase();
}

function matchesManufacturer(item: FilterableItem, manufacturer: string): boolean {
  if (manufacturer === "") {
    return true;
  }
  return manufacturer === NO_MANUFACTURER_FILTER ? item.manufacturerId === null : item.manufacturerId === manufacturer;
}

// Suche (alle Woerter muessen irgendwo vorkommen) und Filter laufen rein im Browser: die Liste ist ohnehin komplett geladen.
export function filterWishlistItems<T extends FilterableItem>(items: readonly T[], filter: WishlistFilter): T[] {
  const words = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filter.status !== "" && item.status !== filter.status) {
      return false;
    }
    if (!matchesManufacturer(item, filter.manufacturer)) {
      return false;
    }
    if (filter.material !== "" && item.materialId !== filter.material) {
      return false;
    }
    if (filter.addedBy !== "" && item.addedByName !== filter.addedBy) {
      return false;
    }
    const text = searchText(item);
    return words.every((word) => text.includes(word));
  });
}

type GroupableItem = Pick<WishlistItem, "title" | "quantity" | "inOrder" | "manufacturerId" | "manufacturerName" | "materialName" | "colorName">;

export interface WishlistManufacturerGroup<T extends GroupableItem> {
  manufacturerId: string | null;
  manufacturerName: string | null;
  items: T[];
  totalQuantity: number;
  selectedCount: number;
  selectedQuantity: number;
}

function compareText(a: string | null, b: string | null, locale: string): number {
  return (a ?? "").localeCompare(b ?? "", locale, { sensitivity: "base" });
}

// Bestellliste: nach Hersteller gruppiert (ein Shop/Bestellvorgang je Hersteller), Gruppen alphabetisch, "ohne Hersteller"
// zuletzt. Innerhalb einer Gruppe steht Gleiches (Material, Farbe) nebeneinander.
export function groupWishlistByManufacturer<T extends GroupableItem>(items: readonly T[], locale: string): WishlistManufacturerGroup<T>[] {
  const groups = new Map<string, WishlistManufacturerGroup<T>>();
  for (const item of items) {
    const key = item.manufacturerId ?? "";
    const group = groups.get(key) ?? {
      manufacturerId: item.manufacturerId,
      manufacturerName: item.manufacturerName,
      items: [],
      totalQuantity: 0,
      selectedCount: 0,
      selectedQuantity: 0
    };
    group.items.push(item);
    group.totalQuantity += item.quantity;
    if (item.inOrder) {
      group.selectedCount += 1;
      group.selectedQuantity += item.quantity;
    }
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.items.sort(
      (a, b) => compareText(a.materialName, b.materialName, locale) || compareText(a.colorName, b.colorName, locale) || compareText(a.title, b.title, locale)
    );
  }
  return [...groups.values()].sort((a, b) => {
    if (a.manufacturerId === null || b.manufacturerId === null) {
      return Number(a.manufacturerId === null) - Number(b.manufacturerId === null);
    }
    return compareText(a.manufacturerName, b.manufacturerName, locale);
  });
}
