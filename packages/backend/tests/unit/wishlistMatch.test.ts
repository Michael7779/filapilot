import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLowStockSpool, isSpoolOnWishlist } from "@filapilot/shared";

const spool = {
  manufacturerId: "m1",
  materialId: "mat1",
  manufacturerName: "Bambu Lab",
  materialName: "PLA Basic",
  colorName: "Bambu-Grün"
};

function item(over: Partial<Parameters<typeof isSpoolOnWishlist>[1][number]>): Parameters<typeof isSpoolOnWishlist>[1][number] {
  return { status: "OPEN", title: "Irgendwas", manufacturerId: null, materialId: null, colorName: null, ...over };
}

describe("isSpoolOnWishlist", () => {
  it("erkennt einen Wunsch mit gleichem Hersteller, Material und gleicher Farbe (Gross-/Kleinschreibung egal)", () => {
    assert.equal(isSpoolOnWishlist(spool, [item({ manufacturerId: "m1", materialId: "mat1", colorName: "bambu-grün" })]), true);
  });

  it("erkennt auch bestellte Wuensche, aber keine erledigten", () => {
    const base = { manufacturerId: "m1", materialId: "mat1", colorName: "Bambu-Grün" };
    assert.equal(isSpoolOnWishlist(spool, [item({ ...base, status: "ORDERED" })]), true);
    assert.equal(isSpoolOnWishlist(spool, [item({ ...base, status: "DONE" })]), false);
  });

  it("unterscheidet Farbe, Material und Hersteller", () => {
    const base = { manufacturerId: "m1", materialId: "mat1", colorName: "Bambu-Grün" };
    assert.equal(isSpoolOnWishlist(spool, [item({ ...base, colorName: "Schwarz" })]), false);
    assert.equal(isSpoolOnWishlist(spool, [item({ ...base, materialId: "mat2" })]), false);
    assert.equal(isSpoolOnWishlist(spool, [item({ ...base, manufacturerId: "m2" })]), false);
  });

  it("erkennt alte Wuensche ohne Farbfeld am gleichlautenden Titel", () => {
    assert.equal(isSpoolOnWishlist(spool, [item({ title: "bambu lab PLA Basic Bambu-Grün" })]), true);
    assert.equal(isSpoolOnWishlist(spool, [item({ title: "Bambu Lab PLA Basic Schwarz" })]), false);
  });

  it("findet nichts in einer leeren Liste", () => {
    assert.equal(isSpoolOnWishlist(spool, []), false);
  });
});

describe("isLowStockSpool", () => {
  it("ist ab 15 % Rest oder weniger knapp, darueber nicht", () => {
    assert.equal(isLowStockSpool({ remainingWeightG: 150, initialWeightG: 1000, archivedAt: null }), true);
    assert.equal(isLowStockSpool({ remainingWeightG: 151, initialWeightG: 1000, archivedAt: null }), false);
  });

  it("zaehlt archivierte Spulen nie als knapp", () => {
    assert.equal(isLowStockSpool({ remainingWeightG: 10, initialWeightG: 1000, archivedAt: new Date() }), false);
  });
});
