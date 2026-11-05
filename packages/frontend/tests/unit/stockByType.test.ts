import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SpoolWithRelations } from "@filapilot/shared";
import { groupStockByType } from "../../src/lib/stockByType.js";

// Nur die Felder, die die Gruppierung liest.
function spool(id: string, materialName: string, remainingWeightG: number, archivedAt: Date | null = null): SpoolWithRelations {
  return { id, materialName, remainingWeightG, archivedAt } as SpoolWithRelations;
}

describe("groupStockByType - Restbestand je Material-Typ mit den zugehoerigen Spulen", () => {
  it("fasst Spulen je Material-Typ zusammen und summiert das Restgewicht", () => {
    const groups = groupStockByType([spool("a", "PLA Basic", 300), spool("b", "PLA Matte", 200), spool("c", "PETG HF", 900)]);
    assert.deepEqual(
      groups.map((group) => [group.type, group.totalG, group.spools.length]),
      [
        ["PETG", 900, 1],
        ["PLA", 500, 2]
      ]
    );
  });

  it("sortiert Gruppen und Spulen absteigend nach Restgewicht", () => {
    const groups = groupStockByType([spool("a", "PLA", 100), spool("b", "PLA", 700), spool("c", "PLA", 400)]);
    assert.deepEqual(
      groups[0]?.spools.map((entry) => entry.id),
      ["b", "c", "a"]
    );
  });

  it("laesst archivierte Spulen weg", () => {
    const groups = groupStockByType([spool("a", "PLA", 300), spool("b", "PLA", 800, new Date())]);
    assert.equal(groups[0]?.totalG, 300);
    assert.equal(groups[0]?.spools.length, 1);
  });

  it("liefert ohne Bestand eine leere Liste", () => {
    assert.deepEqual(groupStockByType([]), []);
  });
});
