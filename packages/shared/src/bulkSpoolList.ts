// Auswahlliste des Dialogs "Mehrere Spulen": jeder Klick auf eine Farbe legt einen Eintrag an bzw. erhoeht dessen Zaehler.
// Reine Listenlogik ohne Oberflaeche - die Preise je Gruppe (Hersteller + Material + Lieferform + Gewicht) pflegt der Dialog.

export interface BulkSpoolEntry {
  manufacturerId: string;
  materialId: string;
  isRefill: boolean;
  initialWeightG: number;
  colorName: string;
  colorHex: string | null;
  count: number;
}

// Eine Gruppe teilt sich einen Preis: derselbe Hersteller, dasselbe Material, dieselbe Lieferform und dasselbe Gewicht.
export function bulkGroupKey(entry: Pick<BulkSpoolEntry, "manufacturerId" | "materialId" | "isRefill" | "initialWeightG">): string {
  return `${entry.manufacturerId}|${entry.materialId}|${entry.isRefill ? "refill" : "spool"}|${entry.initialWeightG}`;
}

export function bulkEntryKey(entry: Omit<BulkSpoolEntry, "count">): string {
  return `${bulkGroupKey(entry)}|${entry.colorName.trim().toLowerCase()}`;
}

// Gleiche Farbe in derselben Gruppe: Zaehler +1 (statt einer zweiten Zeile), sonst neuer Eintrag mit Zaehler 1.
export function addBulkEntry(list: readonly BulkSpoolEntry[], entry: Omit<BulkSpoolEntry, "count">): BulkSpoolEntry[] {
  const key = bulkEntryKey(entry);
  if (list.some((existing) => bulkEntryKey(existing) === key)) {
    return list.map((existing) => (bulkEntryKey(existing) === key ? { ...existing, count: existing.count + 1 } : existing));
  }
  return [...list, { ...entry, count: 1 }];
}

// Zaehler um delta aendern; bei 0 oder weniger verschwindet der Eintrag. Oben begrenzt auf MAX_BULK_COUNT_PER_ENTRY.
export const MAX_BULK_COUNT_PER_ENTRY = 50;
export function changeBulkCount(list: readonly BulkSpoolEntry[], key: string, delta: number): BulkSpoolEntry[] {
  return list.flatMap((entry) => {
    if (bulkEntryKey(entry) !== key) {
      return [entry];
    }
    const count = Math.min(MAX_BULK_COUNT_PER_ENTRY, entry.count + delta);
    return count > 0 ? [{ ...entry, count }] : [];
  });
}

export function totalBulkSpools(list: readonly BulkSpoolEntry[]): number {
  return list.reduce((sum, entry) => sum + entry.count, 0);
}

// Eintraege nach Gruppe, in der Reihenfolge des ersten Klicks.
export function groupBulkEntries(list: readonly BulkSpoolEntry[]): { key: string; entries: BulkSpoolEntry[] }[] {
  const groups = new Map<string, BulkSpoolEntry[]>();
  for (const entry of list) {
    const key = bulkGroupKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, entries]) => ({ key, entries }));
}
