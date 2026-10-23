import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBasisPoints, parsePercentInput } from "@filapilot/shared";

describe("parsePercentInput", () => {
  it("liest Prozent mit Komma oder Punkt in Hundertstel-Prozent", () => {
    assert.deepEqual(parsePercentInput("10"), { kind: "ok", basisPoints: 1000 });
    assert.deepEqual(parsePercentInput("7,5"), { kind: "ok", basisPoints: 750 });
    assert.deepEqual(parsePercentInput("7.5"), { kind: "ok", basisPoints: 750 });
    assert.deepEqual(parsePercentInput("0,25"), { kind: "ok", basisPoints: 25 });
    assert.deepEqual(parsePercentInput("12,34"), { kind: "ok", basisPoints: 1234 });
    assert.deepEqual(parsePercentInput("0"), { kind: "ok", basisPoints: 0 });
    assert.deepEqual(parsePercentInput("100"), { kind: "ok", basisPoints: 10000 });
  });

  it("erlaubt ein Prozentzeichen und Leerzeichen", () => {
    assert.deepEqual(parsePercentInput(" 15 % "), { kind: "ok", basisPoints: 1500 });
    assert.deepEqual(parsePercentInput("2,5%"), { kind: "ok", basisPoints: 250 });
  });

  it("ein leeres Feld heisst: kein Rabatt", () => {
    assert.deepEqual(parsePercentInput(""), { kind: "empty" });
    assert.deepEqual(parsePercentInput("  %"), { kind: "empty" });
  });

  it("lehnt Unbrauchbares ab: ueber 100, negativ, Text, drei Nachkommastellen, mehrere Trenner", () => {
    for (const bad of ["100,01", "101", "-5", "abc", "1,234", "1,2,3", "1e2", "5 5", "%5"]) {
      assert.deepEqual(parsePercentInput(bad), { kind: "invalid" }, bad);
    }
  });
});

describe("formatBasisPoints", () => {
  it("zeigt nur die noetigen Nachkommastellen", () => {
    assert.equal(formatBasisPoints(1000, ","), "10");
    assert.equal(formatBasisPoints(750, ","), "7,5");
    assert.equal(formatBasisPoints(25, ","), "0,25");
    assert.equal(formatBasisPoints(1234, "."), "12.34");
    assert.equal(formatBasisPoints(0, ","), "0");
    assert.equal(formatBasisPoints(10000, ","), "100");
  });

  it("ist die Umkehrung von parsePercentInput", () => {
    for (const bp of [0, 1, 25, 99, 100, 750, 1234, 9999, 10000]) {
      assert.deepEqual(parsePercentInput(formatBasisPoints(bp, ",")), { kind: "ok", basisPoints: bp });
    }
  });
});
