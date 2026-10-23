import type { SizzleProduct } from "./schemas/sizzle.js";

// Alle Varianten (z.B. 250 ml / 500 ml) eines Shop-Produkts, fuer die Auswahl in der Oberflaeche.
export interface SizzleProductGroup {
  key: string;
  title: string;
  productType: string | null;
  imageUrl: string | null;
  url: string;
  // Nach Preis aufsteigend (meist gleich der Groesse)
  variants: SizzleProduct[];
}

export type SizzleRefreshState = "idle" | "running" | "done" | "cancelled" | "error";
// Schritte des Abgleichs: Shop abfragen, Antwort auswerten, Katalog speichern (ab hier ist ein Abbruch nicht mehr moeglich)
export type SizzleRefreshPhase = "fetch" | "parse" | "save";

// Stand des Katalog-Abgleichs mit dem Shop (fuer die Fortschrittsanzeige). Es gibt hoechstens einen Abgleich gleichzeitig.
export interface SizzleRefreshStatus {
  state: SizzleRefreshState;
  phase: SizzleRefreshPhase | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  // Anzahl Produktvarianten nach einem erfolgreichen Abgleich
  total: number | null;
  // Verstaendlicher Text bei einem Fehler
  message: string | null;
}

// Filterwert fuer "Produkte ohne Produktart" (ein leerer Wert heisst "alle")
export const NO_PRODUCT_TYPE_FILTER = "none";

export interface SizzleCatalogFilter {
  search: string;
  productType: string;
}

export function groupSizzleProducts(products: readonly SizzleProduct[], locale: string): SizzleProductGroup[] {
  const byKey = new Map<string, SizzleProduct[]>();
  for (const product of products) {
    byKey.set(product.productKey, [...(byKey.get(product.productKey) ?? []), product]);
  }
  const groups = [...byKey.entries()].flatMap(([key, variants]): SizzleProductGroup[] => {
    const sorted = [...variants].sort((a, b) => a.priceCents - b.priceCents || (a.variantTitle ?? "").localeCompare(b.variantTitle ?? "", locale, { numeric: true }));
    const first = sorted[0];
    if (!first) {
      return [];
    }
    return [
      {
        key,
        title: first.title,
        productType: first.productType,
        imageUrl: sorted.find((variant) => variant.imageUrl !== null)?.imageUrl ?? null,
        url: first.url,
        variants: sorted
      }
    ];
  });
  return groups.sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: "base", numeric: true }));
}

function searchText(group: SizzleProductGroup): string {
  return [group.title, group.productType, ...group.variants.map((variant) => variant.variantTitle)].filter(Boolean).join(" ").toLowerCase();
}

// Suche (alle Woerter muessen irgendwo vorkommen) und Produktart-Filter laufen im Browser: der Katalog ist ohnehin komplett geladen.
export function filterSizzleGroups(groups: readonly SizzleProductGroup[], filter: SizzleCatalogFilter): SizzleProductGroup[] {
  const words = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
  return groups.filter((group) => {
    if (filter.productType === NO_PRODUCT_TYPE_FILTER ? group.productType !== null : filter.productType !== "" && group.productType !== filter.productType) {
      return false;
    }
    const text = searchText(group);
    return words.every((word) => text.includes(word));
  });
}

export function sizzleProductTypes(groups: readonly SizzleProductGroup[], locale: string): string[] {
  const types = new Set(groups.flatMap((group) => (group.productType === null ? [] : [group.productType])));
  return [...types].sort((a, b) => a.localeCompare(b, locale, { sensitivity: "base" }));
}
