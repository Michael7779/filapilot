import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeTooltip } from "../../src/lib/tooltipPlacement.js";

const anchor = (left: number, top: number, size = 28) => ({ left, right: left + size, top, bottom: top + size });

describe("placeTooltip: Sprechblase ueber/unter dem Symbol, immer im Bildschirm", () => {
  it("zentriert die Blase ueber dem Symbol, solange genug Platz ist", () => {
    const result = placeTooltip(anchor(180, 400), 390);
    assert.equal(result.placement, "above");
    assert.equal(result.left, 194);
    assert.equal(result.top, 400 - 8);
  });

  it("schiebt die Blase vom rechten und linken Rand weg (Symbol am Kartenrand)", () => {
    const right = placeTooltip(anchor(350, 400), 390);
    assert.ok(right.left <= 390 - 8 - 90, `rechts: ${right.left}`);
    const left = placeTooltip(anchor(4, 400), 390);
    assert.ok(left.left >= 8 + 90, `links: ${left.left}`);
  });

  it("setzt die Blase unter das Symbol, wenn oben zu wenig Platz ist", () => {
    const result = placeTooltip(anchor(180, 20), 390);
    assert.equal(result.placement, "below");
    assert.equal(result.top, 20 + 28 + 8);
  });

  it("zentriert bei winziger Bildschirmbreite einfach mittig statt falsch zu klemmen", () => {
    assert.equal(placeTooltip(anchor(10, 400), 150).left, 75);
  });
});
