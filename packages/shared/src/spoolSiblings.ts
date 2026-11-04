import type { SpoolWithRelations } from "./schemas/spool.js";

type SiblingSpool = Pick<SpoolWithRelations, "id" | "inventoryId" | "manufacturerId" | "materialId" | "colorName" | "remainingWeightG" | "archivedAt">;

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Die weiteren Spulen desselben Filaments (gleiches Lager, Hersteller, Material und gleiche Farbe wie bei der
// Wunschlisten-Erkennung), ohne die Spule selbst und ohne archivierte. Die vollste steht zuerst, bei Gleichstand
// bleibt die Reihenfolge der Eingabe erhalten.
export function findSameFilamentSpools<T extends SiblingSpool>(spool: SiblingSpool, all: readonly T[]): T[] {
  return all
    .filter(
      (other) =>
        other.id !== spool.id &&
        !other.archivedAt &&
        other.inventoryId === spool.inventoryId &&
        other.manufacturerId === spool.manufacturerId &&
        other.materialId === spool.materialId &&
        sameText(other.colorName, spool.colorName)
    )
    .sort((a, b) => b.remainingWeightG - a.remainingWeightG);
}
