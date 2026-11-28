import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { netCloudFluctuations } from "../../src/services/cloudNetting.js";

type Source = "CLOUD_SYNC" | "CLOUD_IMPORT" | "PRINT" | "MANUAL";
const log = (spoolId: string, minute: number, deltaG: number, source: Source = "CLOUD_SYNC") => ({
  spoolId,
  at: new Date(Date.UTC(2026, 10, 27, 12, minute)),
  deltaG,
  source
});
const used = (logs: ReturnType<typeof log>[]): [string, number, number][] =>
  netCloudFluctuations(logs).map((entry) => [entry.spoolId, entry.at.getUTCMinutes(), entry.deltaG]);

describe("Schwankungen des Cloud-Gewichts verrechnen", () => {
  it("eine spaetere Zunahme hebt die Abnahme derselben Spule auf", () => {
    assert.deepEqual(used([log("a", 1, 30), log("a", 2, -30)]), []);
    assert.deepEqual(used([log("a", 1, 30), log("a", 2, -30), log("a", 3, 30), log("a", 4, -30)]), []);
  });

  it("verrechnet teilweise, zuerst mit der juengsten Abnahme", () => {
    assert.deepEqual(used([log("a", 1, 50), log("a", 2, 40), log("a", 3, -60, "CLOUD_IMPORT")]), [["a", 1, 30]]);
  });

  it("verrechnet nie ueber Spulen hinweg und nie mit spaeterem Verbrauch", () => {
    assert.deepEqual(used([log("a", 1, -30), log("a", 2, 20), log("b", 3, 10), log("a", 4, -5)]), [["a", 2, 15], ["b", 3, 10]]);
  });

  it("laesst Druck- und Handbuchungen unangetastet und ignoriert deren Zunahmen", () => {
    assert.deepEqual(used([log("a", 1, 40, "PRINT"), log("a", 2, -100), log("a", 3, 5), log("a", 4, -90, "MANUAL")]), [
      ["a", 1, 40],
      ["a", 3, 5]
    ]);
  });

  it("veraendert die uebergebenen Eintraege nicht", () => {
    const logs = [log("a", 1, 30), log("a", 2, -10)];
    netCloudFluctuations(logs);
    assert.deepEqual(logs.map((entry) => entry.deltaG), [30, -10]);
  });
});
