import { materialTypeOf } from "@filapilot/shared";
import type { SpoolWithRelations } from "@filapilot/shared";

export interface StockGroup {
  type: string;
  totalG: number;
  spools: SpoolWithRelations[];
}

// Restbestand je Material-Typ (nur nicht archivierte Spulen) samt den Spulen dahinter. Gruppen und Spulen sind
// absteigend nach Restgewicht sortiert - dieselbe Reihenfolge wie die Balken im Dashboard.
export function groupStockByType(spools: readonly SpoolWithRelations[]): StockGroup[] {
  const groups = new Map<string, StockGroup>();
  for (const spool of spools) {
    if (spool.archivedAt) {
      continue;
    }
    const type = materialTypeOf(spool.materialName);
    const group = groups.get(type) ?? { type, totalG: 0, spools: [] };
    group.totalG += spool.remainingWeightG;
    group.spools.push(spool);
    groups.set(type, group);
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.spools.sort((a, b) => b.remainingWeightG - a.remainingWeightG);
  }
  return result.sort((a, b) => b.totalG - a.totalG);
}
