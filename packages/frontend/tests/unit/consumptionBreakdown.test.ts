import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SpoolWithRelations } from "@filapilot/shared";
import { consumedOf, groupConsumption } from "../../src/lib/consumptionBreakdown.js";

// Nur die Felder, die die Gruppierung liest.
function spool(id: string, manufacturerName: string, initialWeightG: number, remainingWeightG: number, archivedAt: Date | null = null): SpoolWithRelations {
  return { id, manufacturerName, initialWeightG, remainingWeightG, archivedAt } as SpoolWithRelations;
}

describe("groupConsumption - Verbrauch je Gruppe mit den zugehoerigen Spulen", () => {
  it("berechnet den Verbrauch einer Spule aus Ursprungs- und Restgewicht, nie negativ", () => {
    assert.equal(consumedOf({ initialWeightG: 1000, remainingWeightG: 250 }), 750);
    assert.equal(consumedOf({ initialWeightG: 1000, remainingWeightG: 1200 }), 0);
  });

  it("summiert je Gruppe und sortiert Gruppen und Spulen absteigend nach Verbrauch", () => {
    const groups = groupConsumption(
      [spool("a", "Bambu", 1000, 900), spool("b", "Bambu", 1000, 200), spool("c", "Sunlu", 1000, 500)],
      (entry) => entry.manufacturerName
    );
    assert.deepEqual(
      groups.map((group) => [group.label, group.consumedG]),
      [
        ["Bambu", 900],
        ["Sunlu", 500]
      ]
    );
    assert.deepEqual(groups[0]?.spools.map((entry) => entry.id), ["b", "a"]);
  });

  it("zaehlt archivierte Spulen mit (Verbrauch bleibt erhalten)", () => {
    const groups = groupConsumption([spool("a", "Bambu", 1000, 400, new Date())], (entry) => entry.manufacturerName);
    assert.equal(groups[0]?.consumedG, 600);
    assert.equal(groups[0]?.spools.length, 1);
  });
});
