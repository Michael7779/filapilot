import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { colorDistanceSquared } from "@filapilot/shared";

describe("colorDistanceSquared", () => {
  it("ist 0 fuer identische Farben", () => {
    assert.equal(colorDistanceSquared("#FFFFFF", "#FFFFFF"), 0);
  });

  it("ist klein fuer sehr aehnliche Farben (von Hand vs. Cloud-Meldung desselben Weiss)", () => {
    assert.ok(colorDistanceSquared("#FFFFFF", "#F5F5F0") < 900);
  });

  it("ist gross fuer deutlich unterschiedliche Farben", () => {
    assert.ok(colorDistanceSquared("#FFFFFF", "#D8C3A0") > 900);
  });
});
