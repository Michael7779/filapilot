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

type GroupableItem = Pick<
  WishlistItem,
  | "id"
  | "title"
  | "quantity"
  | "inOrder"
  | "status"
  | "unitPriceCents"
  | "addedByName"
  | "manufacturerId"
  | "manufacturerName"
  | "materialId"
  | "materialName"
  | "colorName"
  | "colorHex"
>;

export interface WishlistContributor {
  name: string;
  quantity: number;
}

// Eine Zeile der Bestellliste: alle Wuensche mit gleichem Hersteller, Material und gleicher Farbe (bzw. gleichem Titel,
// wenn keine Farbe angegeben ist) - so wird aus den Einzelwuenschen mehrerer Personen eine Bestellposition.
export interface WishlistOrderLine<T extends GroupableItem> {
  key: string;
  title: string;
  manufacturerName: string | null;
  materialName: string | null;
  colorName: string | null;
  colorHex: string | null;
  items: T[];
  totalQuantity: number;
  selectedQuantity: number;
  selection: "none" | "some" | "all";
  // Gemeinsamer Status aller Eintraege der Zeile, sonst MIXED
  status: WishlistStatus | "MIXED";
  // Gemeinsamer Preis je Spule (nur ausgewaehlte Eintraege, solange welche ausgewaehlt sind); priceMixed = die Eintraege
  // haben verschiedene bzw. teils fehlende Preise
  unitPriceCents: number | null;
  priceMixed: boolean;
  contributors: WishlistContributor[];
}

export interface WishlistManufacturerGroup<T extends GroupableItem> {
  manufacturerId: string | null;
  manufacturerName: string | null;
  items: T[];
  lines: WishlistOrderLine<T>[];
  totalQuantity: number;
  selectedCount: number;
  selectedQuantity: number;
}

function compareText(a: string | null, b: string | null, locale: string): number {
  return (a ?? "").localeCompare(b ?? "", locale, { sensitivity: "base" });
}

function lineKey(item: GroupableItem): string {
  const detail = item.colorName === null ? `t:${item.title.trim().toLowerCase()}` : `c:${item.colorName.trim().toLowerCase()}`;
  return `${item.manufacturerId ?? ""}|${item.materialId ?? ""}|${detail}`;
}

function sharedStatus(items: readonly GroupableItem[]): WishlistStatus | "MIXED" {
  const first = items[0]?.status ?? "OPEN";
  return items.every((item) => item.status === first) ? first : "MIXED";
}

function sharedPrice(items: readonly GroupableItem[]): { cents: number | null; mixed: boolean } {
  const selected = items.filter((item) => item.inOrder);
  const basis = selected.length > 0 ? selected : items;
  const prices = basis.map((item) => item.unitPriceCents);
  const first = prices[0] ?? null;
  if (prices.every((price) => price === first)) {
    return { cents: first, mixed: false };
  }
  return { cents: null, mixed: true };
}

function contributorsOf(items: readonly GroupableItem[], locale: string): WishlistContributor[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.addedByName, (quantities.get(item.addedByName) ?? 0) + item.quantity);
  }
  return [...quantities]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => compareText(a.name, b.name, locale));
}

function buildLine<T extends GroupableItem>(key: string, items: T[], locale: string): WishlistOrderLine<T> {
  const sorted = [...items].sort((a, b) => compareText(a.title, b.title, locale));
  const first = sorted[0];
  const selectedItems = items.filter((item) => item.inOrder);
  const price = sharedPrice(items);
  let selection: WishlistOrderLine<T>["selection"] = "some";
  if (selectedItems.length === 0) {
    selection = "none";
  } else if (selectedItems.length === items.length) {
    selection = "all";
  }
  return {
    key,
    title: first?.title ?? "",
    manufacturerName: first?.manufacturerName ?? null,
    materialName: first?.materialName ?? null,
    colorName: first?.colorName ?? null,
    colorHex: first?.colorHex ?? null,
    items: sorted,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    selectedQuantity: selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    selection,
    status: sharedStatus(items),
    unitPriceCents: price.cents,
    priceMixed: price.mixed,
    contributors: contributorsOf(items, locale)
  };
}

function buildLines<T extends GroupableItem>(items: readonly T[], locale: string): WishlistOrderLine<T>[] {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const key = lineKey(item);
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  return [...byKey]
    .map(([key, lineItems]) => buildLine(key, lineItems, locale))
    .sort((a, b) => compareText(a.materialName, b.materialName, locale) || compareText(a.colorName, b.colorName, locale) || compareText(a.title, b.title, locale));
}

// Bestellliste: nach Hersteller gruppiert (ein Shop/Bestellvorgang je Hersteller), Gruppen alphabetisch, "ohne Hersteller"
// zuletzt. Innerhalb einer Gruppe sind gleiche Wuensche zu Zeilen zusammengefasst (lines); items bleibt die Einzelliste.
export function groupWishlistByManufacturer<T extends GroupableItem>(items: readonly T[], locale: string): WishlistManufacturerGroup<T>[] {
  const groups = new Map<string, WishlistManufacturerGroup<T>>();
  for (const item of items) {
    const key = item.manufacturerId ?? "";
    const group = groups.get(key) ?? {
      manufacturerId: item.manufacturerId,
      manufacturerName: item.manufacturerName,
      items: [],
      lines: [],
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
    group.lines = buildLines(group.items, locale);
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

// Hersteller, der im Wunschlisten-Formular vorbelegt ist: der vom Admin eingestellte Standard-Hersteller (derselbe wie im
// "Neue Spule"-Formular), solange es ihn in der Liste gibt. Leer heisst "Beliebiger Hersteller". Aenderbar bleibt er immer.
export function presetManufacturerId(defaultManufacturerId: string | null, manufacturers: readonly { id: string }[]): string {
  return defaultManufacturerId !== null && manufacturers.some((manufacturer) => manufacturer.id === defaultManufacturerId) ? defaultManufacturerId : "";
}
