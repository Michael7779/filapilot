import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { colorAfterCatalogChange, getColorPresets, importColorName } from "@filapilot/shared";

const BAMBU_BASIC = { manufacturerName: "Bambu Lab", materialName: "PLA Basic" };
const BAMBU_MATTE = { manufacturerName: "Bambu Lab", materialName: "PLA Matte" };

describe("colorAfterCatalogChange", () => {
  it("setzt eine Farbe zurueck, die aus dem vorigen Material stammt und im neuen nicht angeboten wird", () => {
    const grey = getColorPresets("Bambu Lab", "PLA Basic").find((preset) => preset.name === "Grau");
    assert.ok(grey, "Testvoraussetzung: PLA Basic hat 'Grau'");
    assert.equal(colorAfterCatalogChange(grey, BAMBU_BASIC, BAMBU_MATTE), null);
  });

  it("behaelt eine Farbe, die auch im neuen Material angeboten wird", () => {
    const black = getColorPresets("Bambu Lab", "PLA Basic").find((preset) => preset.name === "Schwarz");
    assert.ok(black);
    assert.equal(colorAfterCatalogChange(black, BAMBU_BASIC, { manufacturerName: "Bambu Lab", materialName: "ABS" }), black);
  });

  it("behaelt eine von Hand eingetragene Farbe (stammt aus keiner Voreinstellung)", () => {
    const custom = { name: "Mein Spezialgruen", hex: "#123456" };
    assert.equal(colorAfterCatalogChange(custom, BAMBU_BASIC, BAMBU_MATTE), custom);
  });

  it("behaelt eine Farbe mit eigenem Farbwert, auch wenn der Name einer Voreinstellung gleicht (Farbwert angepasst)", () => {
    const edited = { name: "Grau", hex: "#010203" };
    assert.equal(colorAfterCatalogChange(edited, BAMBU_BASIC, BAMBU_MATTE), edited);
  });

  it("laesst eine leere Farbe unveraendert", () => {
    const empty = { name: "", hex: "" };
    assert.equal(colorAfterCatalogChange(empty, BAMBU_BASIC, BAMBU_MATTE), empty);
  });

  it("vergleicht Farbnamen ohne Beachtung der Gross-/Kleinschreibung", () => {
    const black = getColorPresets("Bambu Lab", "PLA Basic").find((preset) => preset.name === "Schwarz");
    assert.ok(black);
    const lower = { name: "schwarz", hex: black.hex };
    assert.equal(colorAfterCatalogChange(lower, BAMBU_BASIC, { manufacturerName: "Bambu Lab", materialName: "ABS" }), lower);
  });
});

describe("importColorName: Farbname beim Import vom Drucker", () => {
  it("findet die neuen Shop-Farben ueber den genauen Farbwert", () => {
    assert.equal(importColorName("#9B9EA0", "Bambu Lab", "PLA Matte"), "Aschgrau");
  });

  it("findet weiterhin die bisherigen Drucker-Farbwerte (Bambu-Gruen #00AE42), auch wenn die Shop-Liste sie nicht fuehrt", () => {
    assert.equal(importColorName("#00AE42", "Bambu Lab", "PLA Basic"), "Bambu-Grün");
  });

  it("nimmt sonst den naechsten allgemeinen Farbnamen", () => {
    assert.equal(importColorName("#010101", "Unbekannte Marke", "PLA"), "Schwarz");
  });
});
