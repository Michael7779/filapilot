import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeConsumedG, decideTransition } from "../../src/services/printJobTracker.js";

describe("Druckauftrag-Erkennung: reine Logik", () => {
  it("beginnt einen Auftrag nur beim Wechsel in laufend/pausiert (nicht bei Pause<->Weiterdrucken)", () => {
    assert.equal(decideTransition(null, "running"), "start");
    assert.equal(decideTransition("idle", "running"), "start");
    assert.equal(decideTransition("finished", "running"), "start");
    assert.equal(decideTransition(null, "paused"), "start");
    assert.equal(decideTransition("running", "paused"), "none");
    assert.equal(decideTransition("paused", "running"), "none");
    assert.equal(decideTransition("running", "running"), "none");
  });

  it("beendet einen Auftrag nur beim Verlassen von laufend/pausiert", () => {
    assert.equal(decideTransition("running", "finished"), "end");
    assert.equal(decideTransition("running", "failed"), "end");
    assert.equal(decideTransition("running", "idle"), "end");
    assert.equal(decideTransition("paused", "idle"), "end");
    assert.equal(decideTransition("idle", "idle"), "none");
    assert.equal(decideTransition("finished", "idle"), "none");
  });

  it("rechnet den Verbrauch aus der Fuellstand-Differenz, nie negativ", () => {
    assert.equal(computeConsumedG(80, 60, 1000), 200);
    assert.equal(computeConsumedG(60, 80, 1000), 0);
    assert.equal(computeConsumedG(100, 100, 1000), 0);
    assert.equal(computeConsumedG(33.3, 10, 1000), 233);
  });
});
