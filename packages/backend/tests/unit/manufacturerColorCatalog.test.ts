import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COLOR_PRESETS, getColorPresets } from "@filapilot/shared";

describe("getColorPresets", () => {
  it("liefert die hinterlegten Farben fuer eine bekannte Hersteller+Material-Kombination", () => {
    const presets = getColorPresets("Bambu Lab", "PLA Basic");
    assert.ok(presets.length > 0);
    assert.notDeepEqual(presets, DEFAULT_COLOR_PRESETS);
    assert.ok(presets.some((preset) => preset.name === "Jade-Weiß"));
  });

  it("liefert unterschiedliche Listen fuer unterschiedliche Material-Linien desselben Herstellers", () => {
    const basic = getColorPresets("Bambu Lab", "PLA Basic");
    const matte = getColorPresets("Bambu Lab", "PLA Matte");
    assert.notDeepEqual(basic, matte);
  });

  it("faellt auf die generische Liste zurueck, wenn kein Material gewaehlt ist", () => {
    assert.deepEqual(getColorPresets("Bambu Lab", null), DEFAULT_COLOR_PRESETS);
    assert.deepEqual(getColorPresets(null, null), DEFAULT_COLOR_PRESETS);
  });

  it("faellt auf die generische Liste zurueck, wenn der Hersteller keine eigenen Farben hinterlegt hat", () => {
    assert.deepEqual(getColorPresets("Unbekannte Marke GmbH", "PLA"), DEFAULT_COLOR_PRESETS);
  });
});
