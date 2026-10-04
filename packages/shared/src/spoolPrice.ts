import type { Material } from "./schemas/material.js";
import type { SpoolPriceSuggestion } from "./schemas/spool.js";

export interface SuggestedPrice {
  priceCents: number;
  // "last" = zuletzt eingetragener Preis einer eigenen Spule (gleicher Hersteller, gleiches Material, gleiche Art),
  // "material" = Richtpreis des Materials (Stammdaten).
  source: "last" | "material";
}

// Preis-Vorbelegung beim Anlegen einer neuen Spule, unabhaengig von der Farbe: zuerst der zuletzt eingetragene Preis
// fuer genau diese Kombination aus Hersteller, Material und Art (Nachfuellung / mit Spule), sonst der Richtpreis des
// Materials fuer diese Art, sonst kein Vorschlag. Preise der jeweils anderen Art werden bewusst nicht uebernommen
// (Nachfuellung und Spule kosten verschieden viel).
export function suggestPrice(
  suggestions: readonly SpoolPriceSuggestion[],
  material: Pick<Material, "id" | "priceRefillCents" | "priceWithSpoolCents"> | undefined,
  manufacturerId: string,
  isRefill: boolean
): SuggestedPrice | null {
  if (!material || !manufacturerId) {
    return null;
  }
  const last = suggestions.find(
    (entry) => entry.manufacturerId === manufacturerId && entry.materialId === material.id && entry.isRefill === isRefill
  );
  if (last) {
    return { priceCents: last.priceCents, source: "last" };
  }
  const fallback = isRefill ? material.priceRefillCents : material.priceWithSpoolCents;
  return fallback === null ? null : { priceCents: fallback, source: "material" };
}
