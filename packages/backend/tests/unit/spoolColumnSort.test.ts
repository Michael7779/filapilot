import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortSpoolsByColumn, type SpoolSortMaterial, type SpoolWithRelations } from "@filapilot/shared";

const PLA = "00000000-0000-4000-8000-0000000000a1";
const PETG = "00000000-0000-4000-8000-0000000000a2";

const materials: SpoolSortMaterial[] = [
  { id: PLA, printTempMinC: 190, printTempMaxC: 230, bedTempC: 45, bedTempMaxC: null, densityGCm3: 1.24, filamentDiameterMm: 1.75 },
  { id: PETG, printTempMinC: 230, printTempMaxC: 260, bedTempC: 70, bedTempMaxC: 80, densityGCm3: null, filamentDiameterMm: 1.75 }
] as SpoolSortMaterial[];

function spool(over: Partial<SpoolWithRelations>): SpoolWithRelations {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    materialId: PLA,
    manufacturerId: "m1",
    inventoryId: null,
    colorName: "Schwarz",
    colorHex: null,
    initialWeightG: 1000,
    remainingWeightG: 500,
    purchasePriceCents: null,
    isRefill: false,
    purchasedAt: null,
    location: null,
    note: null,
    openedAt: new Date("2026-01-02"),
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

const names = (list: SpoolWithRelations[]): string[] => list.map((s) => s.colorName);

describe("Spulen: Spaltensortierung der Listenansicht", () => {
  const rot = spool({ colorName: "Rot", remainingWeightG: 100, purchasePriceCents: 3000, location: "Regal B", createdAt: new Date("2026-03-01") });
  const blau = spool({ colorName: "blau", remainingWeightG: 900, purchasePriceCents: 1000, location: "Regal A", materialId: PETG, materialName: "PETG HF", createdAt: new Date("2026-02-01") });
  const weiss = spool({ colorName: "Weiss", remainingWeightG: 500, createdAt: new Date("2026-01-01"), openedAt: null });
  const list = [rot, blau, weiss];

  it("sortiert Text aufsteigend und absteigend, ohne Gross-/Kleinschreibung", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "color", direction: "asc" }, "de", materials)), ["blau", "Rot", "Weiss"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "color", direction: "desc" }, "de", materials)), ["Weiss", "Rot", "blau"]);
  });

  it("sortiert Zahlen (Restgewicht) in beide Richtungen", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "weight", direction: "asc" }, "de", materials)), ["Rot", "Weiss", "blau"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "weight", direction: "desc" }, "de", materials)), ["blau", "Weiss", "Rot"]);
  });

  it("stellt Spulen ohne Wert (Preis, Lagerort) in BEIDEN Richtungen ans Ende", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "price", direction: "asc" }, "de", materials)), ["blau", "Rot", "Weiss"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "price", direction: "desc" }, "de", materials)), ["Rot", "blau", "Weiss"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "location", direction: "desc" }, "de", materials)), ["Rot", "blau", "Weiss"]);
  });

  it("sortiert Materialwerte (Duese, Bett) ueber die Material-Zuordnung", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "nozzle", direction: "desc" }, "de", materials)), ["blau", "Rot", "Weiss"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "bed", direction: "asc" }, "de", materials)), ["Rot", "Weiss", "blau"]);
  });

  it("Restlaenge: Material ohne Dichte hat keinen Wert und steht am Ende", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "length", direction: "asc" }, "de", materials)), ["Rot", "Weiss", "blau"]);
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "length", direction: "desc" }, "de", materials)), ["Weiss", "Rot", "blau"]);
  });

  it("sortiert Zeitpunkte und Status", () => {
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "addedAt", direction: "desc" }, "de", materials)), ["Rot", "blau", "Weiss"]);
    // Ohne lastModifiedAt gilt createdAt
    assert.deepEqual(names(sortSpoolsByColumn(list, { column: "lastModifiedAt", direction: "asc" }, "de", materials)), ["Weiss", "blau", "Rot"]);
    assert.equal(sortSpoolsByColumn(list, { column: "status", direction: "asc" }, "de", materials)[0]?.colorName, "Weiss");
  });

  it("sortiert die Lieferform: mit Spule vor Nachfuellung, angebrochene Spulen (ohne Angabe) zuletzt", () => {
    const mitSpule = spool({ colorName: "Mit", openedAt: null, isRefill: false });
    const refill = spool({ colorName: "Refill", openedAt: null, isRefill: true });
    const angebrochen = spool({ colorName: "Offen", isRefill: true });
    const mixed = [angebrochen, refill, mitSpule];
    assert.deepEqual(names(sortSpoolsByColumn(mixed, { column: "packaging", direction: "asc" }, "de", materials)), ["Mit", "Refill", "Offen"]);
    assert.deepEqual(names(sortSpoolsByColumn(mixed, { column: "packaging", direction: "desc" }, "de", materials)), ["Refill", "Mit", "Offen"]);
  });

  it("behaelt bei Gleichstand die Eingabereihenfolge und veraendert die Eingabe nicht", () => {
    const same = [spool({ colorName: "A" }), spool({ colorName: "B" }), spool({ colorName: "C" })];
    const before = names(same);
    assert.deepEqual(names(sortSpoolsByColumn(same, { column: "manufacturer", direction: "desc" }, "de", materials)), ["A", "B", "C"]);
    assert.deepEqual(names(same), before);
  });
});
