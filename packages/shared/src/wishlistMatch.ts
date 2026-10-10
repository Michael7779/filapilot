import { LOW_STOCK_THRESHOLD_RATIO, type SpoolWithRelations } from "./schemas/spool.js";
import type { WishlistItem } from "./schemas/wishlist.js";

type StockSpool = Pick<SpoolWithRelations, "remainingWeightG" | "initialWeightG" | "archivedAt">;
type WishlistSpool = Pick<SpoolWithRelations, "manufacturerId" | "materialId" | "manufacturerName" | "materialName" | "colorName">;
type WishlistEntry = Pick<WishlistItem, "status" | "title" | "manufacturerId" | "materialId" | "colorName">;

// Knapp = hoechstens 15 % Rest; archivierte Spulen zaehlen nicht (sie liegen nicht mehr im Bestand).
export function isLowStockSpool(spool: StockSpool): boolean {
  return !spool.archivedAt && spool.initialWeightG > 0 && spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Steht diese Spule (Hersteller + Material + Farbe) schon als offener oder bestellter Wunsch auf der Liste?
// Erledigte Wuensche zaehlen nicht (man darf nachbestellen). Wuensche aus der Zeit vor dem Farbfeld werden am Titel
// erkannt ("{Hersteller} {Material} {Farbe}", so legt ihn "Zur Wunschliste" an).
export function isSpoolOnWishlist(spool: WishlistSpool, items: readonly WishlistEntry[]): boolean {
  const legacyTitle = `${spool.manufacturerName} ${spool.materialName} ${spool.colorName}`;
  return items.some((item) => {
    if (item.status === "DONE") {
      return false;
    }
    if (item.colorName !== null) {
      return item.manufacturerId === spool.manufacturerId && item.materialId === spool.materialId && sameText(item.colorName, spool.colorName);
    }
    return sameText(item.title, legacyTitle);
  });
}
