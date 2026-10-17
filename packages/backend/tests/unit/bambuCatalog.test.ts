import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLOR_PRESETS, getColorPresets } from "@filapilot/shared";
import { CATALOG_MATERIALS } from "../../src/services/catalogData.js";

const bambuMaterials = CATALOG_MATERIALS.filter((material) => material.manufacturer === "Bambu Lab");

describe("Bambu-Lab-Katalog: Materialien und Farben gehoeren zusammen", () => {
  it("fuehrt alle Filament-Linien des Bambu-Lab-Shops als Material", () => {
    const names = new Set(bambuMaterials.map((material) => material.name));
    for (const expected of [
      "PLA Basic", "PLA Matte", "PLA Pure", "PLA Silk+", "PLA Translucent", "PLA Wood", "PLA Marble", "PLA Galaxy",
      "PLA Sparkle", "PLA Metal", "PLA Glow", "PLA Aero", "PLA Basic Gradient", "PLA Silk Multi-Color", "PLA Tough+", "PLA-CF",
      "PETG Basic", "PETG Matte", "PETG HF", "PETG Translucent", "PETG-CF", "ABS", "ABS-GF", "ASA", "ASA-CF", "ASA Aero", "PC",
      "PC FR", "PA6-CF", "PA6-GF", "PAHT-CF", "PET-CF", "PPA-CF", "PPS-CF", "TPU 95A HF", "TPU for AMS", "TPU 85A", "TPU 90A",
      "PVA", "Support for PLA", "Support for PLA/PETG", "Support for ABS", "Support for PA/PET"
    ]) {
      assert.ok(names.has(expected), `Material fehlt: ${expected}`);
    }
  });

  it("hat zu jedem Bambu-Lab-Material eine eigene Farbliste mit gueltigen, eindeutigen Eintraegen", () => {
    for (const material of bambuMaterials) {
      const presets = getColorPresets("Bambu Lab", material.name);
      assert.notDeepEqual(presets, DEFAULT_COLOR_PRESETS, `keine eigene Farbliste: ${material.name}`);
      assert.ok(presets.every((preset) => /^#[0-9A-F]{6}$/.test(preset.hex)), `ungueltiger Farbwert: ${material.name}`);
      assert.equal(new Set(presets.map((preset) => preset.name)).size, presets.length, `doppelter Farbname: ${material.name}`);
    }
  });

  it("kennt die bisher vermissten Farben (PLA Matte Aschgrau, PLA Wood Klassische Birke) und die vollen Listen", () => {
    const names = (material: string): string[] => getColorPresets("Bambu Lab", material).map((preset) => preset.name);
    assert.ok(names("PLA Matte").includes("Aschgrau"));
    assert.ok(names("PLA Matte").includes("Nardo-Grau"));
    assert.ok(names("PLA Wood").includes("Klassische Birke"));
    assert.ok(names("PLA Matte").length >= 25);
    assert.ok(names("PLA Basic").length >= 30);
    assert.ok(names("PLA Silk Multi-Color").length >= 10);
  });

  it("haelt Temperaturen in sinnvollen Grenzen (Minimum unter Maximum, Bett nicht heisser als Duese)", () => {
    for (const material of bambuMaterials) {
      assert.ok(material.minC < material.maxC, material.name);
      assert.ok(material.bedC === null || material.bedC < material.minC, material.name);
    }
  });
});
