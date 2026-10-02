import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SPOOL_FILTER, effectiveLastModifiedAt, filterSpools, isFilterActive, sortSpools, type SpoolWithRelations } from "@filapilot/shared";

function spool(over: Partial<SpoolWithRelations>): SpoolWithRelations {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    materialId: "00000000-0000-4000-8000-000000000002",
    manufacturerId: "m1",
    inventoryId: null,
    colorName: "Schwarz",
    colorHex: null,
    initialWeightG: 1000,
    remainingWeightG: 500,
    photoUrl: null,
    purchasePriceCents: null,
    purchasedAt: null,
    location: null,
    archivedAt: null,
    archiveReason: null,
    createdAt: new Date("2026-01-01"),
    lastModifiedAt: null,
    materialName: "PLA Basic",
    manufacturerName: "Bambu Lab",
    inventoryName: null,
    ...over
  } as SpoolWithRelations;
}

const list = [
  spool({ colorName: "Rot", remainingWeightG: 100, purchasePriceCents: 1999, location: "Regal A" }),
  spool({ colorName: "Blau", materialName: "PETG HF", manufacturerId: "m2", manufacturerName: "Prusa", remainingWeightG: 900, purchasePriceCents: 2500, location: "Regal B" }),
  spool({ colorName: "Weiss", remainingWeightG: 1000 })
];
const f = (over: object) => ({ ...EMPTY_SPOOL_FILTER, ...over });

describe("Spulen: Suche, Filter, Sortierung", () => {
  it("ohne Filter bleibt alles, isFilterActive erkennt aktive Filter", () => {
    assert.equal(filterSpools(list, EMPTY_SPOOL_FILTER, 0.15).length, 3);
    assert.equal(isFilterActive(EMPTY_SPOOL_FILTER), false);
    assert.equal(isFilterActive(f({ location: "x" })), true);
  });
  it("Suche: alle Woerter muessen in Hersteller, Material, Farbe oder Lagerort vorkommen", () => {
    assert.deepEqual(filterSpools(list, f({ search: "prusa blau" }), 0.15).map((s) => s.colorName), ["Blau"]);
    assert.deepEqual(filterSpools(list, f({ search: "REGAL rot" }), 0.15).map((s) => s.colorName), ["Rot"]);
    assert.equal(filterSpools(list, f({ search: "prusa rot" }), 0.15).length, 0);
  });
  it("Dropdown-Filter und Restgewicht-Bereich", () => {
    assert.deepEqual(filterSpools(list, f({ manufacturerId: "m2" }), 0.15).map((s) => s.colorName), ["Blau"]);
    assert.deepEqual(filterSpools(list, f({ remainingMinG: 500, remainingMaxG: 950 }), 0.15).map((s) => s.colorName), ["Blau"]);
    assert.deepEqual(filterSpools(list, f({ lowStockOnly: true }), 0.15).map((s) => s.colorName), ["Rot"]);
  });
  it("Preisfilter schliesst Spulen ohne Preis aus", () => {
    assert.deepEqual(filterSpools(list, f({ priceMinCents: 2000 }), 0.15).map((s) => s.colorName), ["Blau"]);
    assert.deepEqual(filterSpools(list, f({ priceMaxCents: 3000 }), 0.15).map((s) => s.colorName), ["Rot", "Blau"]);
  });
  it("Restgewicht-%-Filter: hoechstens X % vom Ursprungsgewicht", () => {
    // Rot 100/1000=10%, Blau 900/1000=90%, Weiss 1000/1000=100%
    assert.deepEqual(filterSpools(list, f({ remainingMaxPercent: 10 }), 0.15).map((s) => s.colorName), ["Rot"]);
    assert.deepEqual(filterSpools(list, f({ remainingMaxPercent: 90 }), 0.15).map((s) => s.colorName), ["Rot", "Blau"]);
    assert.equal(filterSpools(list, f({ remainingMaxPercent: 5 }), 0.15).length, 0);
  });
  it("sortiert nach Restgewicht und nach Preis (ohne Preis zuletzt)", () => {
    assert.deepEqual(sortSpools(list, "remaining", "de").map((s) => s.colorName), ["Rot", "Blau", "Weiss"]);
    assert.deepEqual(sortSpools(list, "price", "de").map((s) => s.colorName), ["Rot", "Blau", "Weiss"]);
    assert.deepEqual(sortSpools(list, "manufacturer", "de").map((s) => s.manufacturerName), ["Bambu Lab", "Bambu Lab", "Prusa"]);
  });
  it("effectiveLastModifiedAt faellt ohne lastModifiedAt auf createdAt zurueck", () => {
    assert.equal(effectiveLastModifiedAt(spool({ lastModifiedAt: null, createdAt: new Date("2026-02-01") })).getTime(), new Date("2026-02-01").getTime());
    assert.equal(
      effectiveLastModifiedAt(spool({ lastModifiedAt: new Date("2026-03-15"), createdAt: new Date("2026-02-01") })).getTime(),
      new Date("2026-03-15").getTime()
    );
  });
  it("Datumsfilter vergleicht gegen lastModifiedAt, sonst createdAt", () => {
    const withChange = spool({ colorName: "Geaendert", createdAt: new Date("2026-01-01"), lastModifiedAt: new Date("2026-03-10") });
    const withoutChange = spool({ colorName: "Unveraendert", createdAt: new Date("2026-02-01"), lastModifiedAt: null });
    const dated = [withChange, withoutChange];
    // Ab 1. Maerz: nur die Spule mit lastModifiedAt im Maerz passt, nicht die unveraenderte (createdAt im Februar)
    assert.deepEqual(
      filterSpools(dated, f({ lastModifiedAfter: new Date("2026-03-01").getTime() }), 0.15).map((s) => s.colorName),
      ["Geaendert"]
    );
    // Bis Ende Januar: nur die unveraenderte Spule (createdAt, da kein lastModifiedAt) faellt NICHT rein (Februar > Januar);
    // die geaenderte (Maerz) erst recht nicht - beide fallen raus.
    assert.equal(filterSpools(dated, f({ lastModifiedBefore: new Date("2026-01-31").getTime() }), 0.15).length, 0);
    // Bis Ende Februar: nur die unveraenderte Spule (createdAt im Februar) passt
    assert.deepEqual(
      filterSpools(dated, f({ lastModifiedBefore: new Date("2026-02-28").getTime() }), 0.15).map((s) => s.colorName),
      ["Unveraendert"]
    );
  });
});
