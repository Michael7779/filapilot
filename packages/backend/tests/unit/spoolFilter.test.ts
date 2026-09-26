import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SPOOL_FILTER, filterSpools, isFilterActive, sortSpools, type SpoolWithRelations } from "@filapilot/shared";

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
  it("sortiert nach Restgewicht und nach Preis (ohne Preis zuletzt)", () => {
    assert.deepEqual(sortSpools(list, "remaining", "de").map((s) => s.colorName), ["Rot", "Blau", "Weiss"]);
    assert.deepEqual(sortSpools(list, "price", "de").map((s) => s.colorName), ["Rot", "Blau", "Weiss"]);
    assert.deepEqual(sortSpools(list, "manufacturer", "de").map((s) => s.manufacturerName), ["Bambu Lab", "Bambu Lab", "Prusa"]);
  });
});
