import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBambuReport } from "../../src/services/bambuConnector.js";

describe("parseBambuReport", () => {
  it("parst einen laufenden Druckauftrag korrekt", () => {
    const raw = {
      print: {
        gcode_state: "RUNNING",
        subtask_name: "Gehaeuse_Deckel_v3",
        mc_percent: 67,
        mc_remaining_time: 102
      }
    };

    const status = parseBambuReport("printer-1", raw);

    assert.ok(status);
    assert.equal(status.printing, true);
    assert.equal(status.currentJobName, "Gehaeuse_Deckel_v3");
    assert.equal(status.progressPercent, 67);
    assert.equal(status.remainingSeconds, 102 * 60);
  });

  it("gibt null zurueck bei unbekanntem Payload-Format", () => {
    const status = parseBambuReport("printer-1", { foo: "bar" });
    assert.equal(status, null);
  });

  it("erkennt einen nicht druckenden Zustand", () => {
    const raw = { print: { gcode_state: "IDLE" } };
    const status = parseBambuReport("printer-1", raw);
    assert.ok(status);
    assert.equal(status.printing, false);
  });
});
