import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { materialTypeOf } from "@filapilot/shared";

describe("Material-Typ", () => {
  it("fasst Produktnamen zum gleichen Grundmaterial zusammen", () => {
    for (const name of ["PLA", "PLA Basic", "PolyLite PLA", "PLA Silk", "PLA+", "PLA Matte", "PLA/PHA", "PolyTerra PLA"]) {
      assert.equal(materialTypeOf(name), "PLA", name);
    }
    for (const name of ["TPU", "TPU 95A", "PolyFlex TPU95", "TPU 95A HF"]) {
      assert.equal(materialTypeOf(name), "TPU", name);
    }
    assert.equal(materialTypeOf("PolyLite ABS"), "ABS");
    assert.equal(materialTypeOf("ABS+"), "ABS");
    assert.equal(materialTypeOf("PolyLite ASA"), "ASA");
  });

  it("haelt PETG, PETG-CF, PLA-CF und Polyamide als eigene Typen auseinander", () => {
    assert.equal(materialTypeOf("PETG HF"), "PETG");
    assert.equal(materialTypeOf("PolyLite PETG"), "PETG");
    assert.equal(materialTypeOf("PETG-CF"), "PETG-CF");
    assert.equal(materialTypeOf("PLA-CF"), "PLA-CF");
    assert.equal(materialTypeOf("PA6-CF"), "PA-CF");
    assert.equal(materialTypeOf("PAHT-CF"), "PA-CF");
    assert.equal(materialTypeOf("PA (Nylon)"), "PA (Nylon)");
    assert.equal(materialTypeOf("PC Blend"), "PC");
  });

  it("laesst Unbekanntes unter dem eigenen Namen stehen", () => {
    assert.equal(materialTypeOf("XT"), "XT");
    assert.equal(materialTypeOf("  Spezial Mix  "), "Spezial Mix");
  });
});
