import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_BULK_COUNT_PER_ENTRY, addBulkEntry, bulkEntryKey, changeBulkCount, groupBulkEntries, totalBulkSpools, type BulkSpoolEntry } from "@filapilot/shared";

const base = { manufacturerId: "m1", materialId: "pla", isRefill: false, initialWeightG: 1000, colorName: "Rot", colorHex: "#C12E1F" };

describe("Mehrfach-Anlegen: Auswahlliste", () => {
  it("erhoeht den Zaehler bei gleicher Farbe in derselben Gruppe (ohne Gross-/Kleinschreibung), sonst neue Zeile", () => {
    let list: BulkSpoolEntry[] = [];
    list = addBulkEntry(list, base);
    list = addBulkEntry(list, { ...base, colorName: " rot " });
    list = addBulkEntry(list, { ...base, colorName: "Blau", colorHex: "#0056B8" });
    assert.deepEqual(list.map((entry) => [entry.colorName, entry.count]), [["Rot", 2], ["Blau", 1]]);
    assert.equal(totalBulkSpools(list), 3);
  });

  it("behandelt dieselbe Farbe bei anderem Material, anderer Lieferform oder anderem Gewicht als eigenen Eintrag", () => {
    let list = addBulkEntry([], base);
    list = addBulkEntry(list, { ...base, materialId: "petg" });
    list = addBulkEntry(list, { ...base, isRefill: true });
    list = addBulkEntry(list, { ...base, initialWeightG: 500 });
    assert.equal(list.length, 4);
    assert.equal(groupBulkEntries(list).length, 4);
  });

  it("gruppiert nach Hersteller+Material+Lieferform+Gewicht in Klick-Reihenfolge", () => {
    let list = addBulkEntry([], base);
    list = addBulkEntry(list, { ...base, materialId: "petg", colorName: "Gelb" });
    list = addBulkEntry(list, { ...base, colorName: "Blau" });
    const groups = groupBulkEntries(list);
    assert.deepEqual(groups.map((group) => group.entries.map((entry) => entry.colorName)), [["Rot", "Blau"], ["Gelb"]]);
  });

  it("aendert den Zaehler, entfernt bei 0 und deckelt nach oben", () => {
    const key = bulkEntryKey(base);
    let list = changeBulkCount(addBulkEntry([], base), key, +2);
    assert.equal(list[0]?.count, 3);
    list = changeBulkCount(list, key, +1000);
    assert.equal(list[0]?.count, MAX_BULK_COUNT_PER_ENTRY);
    assert.deepEqual(changeBulkCount(list, key, -1000), []);
  });
});
