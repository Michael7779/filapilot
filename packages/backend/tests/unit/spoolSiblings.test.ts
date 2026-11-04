import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findSameFilamentSpools } from "@filapilot/shared";

interface TestSpool {
  id: string;
  inventoryId: string | null;
  manufacturerId: string;
  materialId: string;
  colorName: string;
  remainingWeightG: number;
  archivedAt: Date | null;
}

function spool(over: Partial<TestSpool> & { id: string }): TestSpool {
  return { inventoryId: "inv1", manufacturerId: "m1", materialId: "mat1", colorName: "Weiß", remainingWeightG: 500, archivedAt: null, ...over };
}

describe("findSameFilamentSpools", () => {
  it("liefert die anderen Spulen mit gleichem Hersteller, Material und gleicher Farbe, nicht die Spule selbst", () => {
    const self = spool({ id: "a" });
    const result = findSameFilamentSpools(self, [self, spool({ id: "b" }), spool({ id: "c", colorName: "  weiß " })]);
    assert.deepEqual(result.map((entry) => entry.id).sort(), ["b", "c"]);
  });

  it("unterscheidet Farbe, Material, Hersteller und Lager", () => {
    const self = spool({ id: "a" });
    const others = [
      spool({ id: "farbe", colorName: "Schwarz" }),
      spool({ id: "material", materialId: "mat2" }),
      spool({ id: "hersteller", manufacturerId: "m2" }),
      spool({ id: "lager", inventoryId: "inv2" })
    ];
    assert.deepEqual(findSameFilamentSpools(self, others), []);
  });

  it("blendet archivierte Spulen aus", () => {
    const self = spool({ id: "a" });
    assert.deepEqual(findSameFilamentSpools(self, [spool({ id: "b", archivedAt: new Date() })]), []);
  });

  it("sortiert die vollste Spule zuerst, bei Gleichstand bleibt die Eingabe-Reihenfolge", () => {
    const self = spool({ id: "a" });
    const result = findSameFilamentSpools(self, [
      spool({ id: "leer", remainingWeightG: 10 }),
      spool({ id: "voll1", remainingWeightG: 1000 }),
      spool({ id: "voll2", remainingWeightG: 1000 })
    ]);
    assert.deepEqual(result.map((entry) => entry.id), ["voll1", "voll2", "leer"]);
  });
});
