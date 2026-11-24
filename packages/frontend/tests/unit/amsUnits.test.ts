import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visibleAmsUnits } from "../../src/lib/amsUnits.js";

describe("visibleAmsUnits", () => {
  it("zeigt immer die erste AMS-Einheit, auch ohne Meldung", () => {
    assert.deepEqual(visibleAmsUnits([]), [0]);
    assert.deepEqual(visibleAmsUnits([254]), [0]);
  });

  it("nimmt weitere Einheiten auf, sobald ein Fach gemeldet oder zugeordnet ist, sortiert und ohne Doppelte", () => {
    assert.deepEqual(visibleAmsUnits([9, 4, 5, 0]), [0, 1, 2]);
    assert.deepEqual(visibleAmsUnits([15]), [0, 3]);
  });

  it("ignoriert ungueltige Fach-Nummern", () => {
    assert.deepEqual(visibleAmsUnits([-1, 16, 99]), [0]);
  });
});
