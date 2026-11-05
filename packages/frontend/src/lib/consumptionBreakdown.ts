import type { SpoolWithRelations } from "@filapilot/shared";

export interface ConsumptionGroup {
  label: string;
  consumedG: number;
  spools: SpoolWithRelations[];
}

export function consumedOf(spool: Pick<SpoolWithRelations, "initialWeightG" | "remainingWeightG">): number {
  return Math.max(0, spool.initialWeightG - spool.remainingWeightG);
}

// Verbrauch je Schluessel (Material-Typ, Material, Hersteller) samt den Spulen dahinter - archivierte zaehlen mit.
// Gruppen und Spulen sind absteigend nach Verbrauch sortiert.
export function groupConsumption(
  spools: readonly SpoolWithRelations[],
  keyOf: (spool: SpoolWithRelations) => string
): ConsumptionGroup[] {
  const groups = new Map<string, ConsumptionGroup>();
  for (const spool of spools) {
    const label = keyOf(spool);
    const group = groups.get(label) ?? { label, consumedG: 0, spools: [] };
    group.consumedG += consumedOf(spool);
    group.spools.push(spool);
    groups.set(label, group);
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.spools.sort((a, b) => consumedOf(b) - consumedOf(a));
  }
  return result.sort((a, b) => b.consumedG - a.consumedG);
}
