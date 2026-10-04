import type { Material } from "./schemas/material.js";
import type { SpoolWithRelations } from "./schemas/spool.js";
import { estimateRemainingLengthM } from "./spoolLength.js";
import { effectiveLastModifiedAt } from "./spoolFilter.js";

// Sortierbare Spalten der Listenansicht (Spulen-Seite). "Zusatzfelder" und die Aktionen sind bewusst nicht dabei.
export const SPOOL_SORT_COLUMNS = [
  "color",
  "manufacturer",
  "material",
  "inventory",
  "nozzle",
  "bed",
  "weight",
  "length",
  "location",
  "price",
  "purchasedAt",
  "addedAt",
  "lastModifiedAt",
  "note",
  "packaging",
  "status"
] as const;
export type SpoolSortColumn = (typeof SPOOL_SORT_COLUMNS)[number];
export type SortDirection = "asc" | "desc";

export interface SpoolColumnSort {
  column: SpoolSortColumn;
  direction: SortDirection;
}

export type SpoolSortMaterial = Pick<Material, "id" | "printTempMinC" | "printTempMaxC" | "bedTempC" | "bedTempMaxC" | "densityGCm3" | "filamentDiameterMm">;

type SortValue = string | number | null;

// Reihenfolge wie in der Status-Spalte: ungeoeffnet, aktiv, archiviert.
function statusRank(spool: SpoolWithRelations): number {
  if (spool.archivedAt) {
    return spool.archiveReason === "CLOUD_REMOVED" ? 3 : 2;
  }
  return spool.openedAt ? 1 : 0;
}

function columnValue(spool: SpoolWithRelations, column: SpoolSortColumn, material: SpoolSortMaterial | undefined): SortValue {
  switch (column) {
    case "color":
      return spool.colorName;
    case "manufacturer":
      return spool.manufacturerName;
    case "material":
      return spool.materialName;
    case "inventory":
      return spool.inventoryName;
    case "nozzle":
      return material ? material.printTempMinC * 1000 + material.printTempMaxC : null;
    case "bed":
      return material && material.bedTempC !== null ? material.bedTempC * 1000 + (material.bedTempMaxC ?? material.bedTempC) : null;
    case "weight":
      return spool.remainingWeightG;
    case "length":
      return estimateRemainingLengthM(spool.remainingWeightG, material?.densityGCm3 ?? null, material?.filamentDiameterMm);
    case "location":
      return spool.location;
    case "price":
      return spool.purchasePriceCents;
    case "purchasedAt":
      return spool.purchasedAt ? new Date(spool.purchasedAt).getTime() : null;
    case "addedAt":
      return new Date(spool.createdAt).getTime();
    case "lastModifiedAt":
      return effectiveLastModifiedAt(spool).getTime();
    case "note":
      return spool.note;
    case "packaging":
      // Nur bei ungeoeffneten Spulen bekannt: mit Spule vor Nachfuellung
      return spool.openedAt ? null : Number(spool.isRefill);
    case "status":
      return statusRank(spool);
  }
}

// Sortiert nach einer Spalte auf- oder absteigend. Spulen ohne Wert (z.B. ohne Preis, Lagerort oder Notiz) stehen
// in beiden Richtungen am Ende. Bei Gleichstand bleibt die Reihenfolge der Eingabe erhalten (stabile Sortierung).
export function sortSpoolsByColumn(
  spools: readonly SpoolWithRelations[],
  sort: SpoolColumnSort,
  locale: string,
  materials: readonly SpoolSortMaterial[]
): SpoolWithRelations[] {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const sign = sort.direction === "asc" ? 1 : -1;
  const keyed = spools.map((spool) => ({ spool, value: columnValue(spool, sort.column, materialById.get(spool.materialId)) }));
  keyed.sort((a, b) => {
    // Leere Textwerte zaehlen wie "kein Wert"
    const left = a.value === "" ? null : a.value;
    const right = b.value === "" ? null : b.value;
    if (left === null || right === null) {
      return Number(left === null) - Number(right === null);
    }
    if (typeof left === "string" && typeof right === "string") {
      return sign * left.localeCompare(right, locale, { sensitivity: "base", numeric: true });
    }
    return sign * (Number(left) - Number(right));
  });
  return keyed.map((entry) => entry.spool);
}
