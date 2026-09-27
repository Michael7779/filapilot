import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateRemainingLengthM } from "@filapilot/shared";

describe("Ungefaehre Restlaenge einer Spule", () => {
  it("rechnet ein 1kg-PLA-Spule auf ca. 335m (Bambu gibt fuer PLA Basic 1kg ~330m an)", () => {
    const meters = estimateRemainingLengthM(1000, 1.24);
    assert.ok(meters !== null);
    assert.ok(meters > 320 && meters < 345, String(meters));
  });

  it("liefert 0 bei leerem Restgewicht, auch ohne bekannte Dichte", () => {
    assert.equal(estimateRemainingLengthM(0, null), 0);
    assert.equal(estimateRemainingLengthM(0, 1.24), 0);
  });

  it("liefert null ohne bekannte oder ungueltige Dichte", () => {
    assert.equal(estimateRemainingLengthM(500, null), null);
    assert.equal(estimateRemainingLengthM(500, 0), null);
    assert.equal(estimateRemainingLengthM(500, -1), null);
  });

  it("ist proportional zum Restgewicht", () => {
    const half = estimateRemainingLengthM(500, 1.24);
    const full = estimateRemainingLengthM(1000, 1.24);
    assert.ok(half !== null && full !== null);
    assert.ok(Math.abs(full / half - 2) < 0.001);
  });
});
