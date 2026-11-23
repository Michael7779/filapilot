import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSpoolInputSchema, updateSpoolInputSchema } from "@filapilot/shared";

const INVENTORY_ID = "00000000-0000-4000-8000-0000000000c1";
const MANUFACTURER_ID = "00000000-0000-4000-8000-0000000000b1";
const MATERIAL_ID = "00000000-0000-4000-8000-0000000000a1";

describe("Spulen-Eingabeschemas: Standardwerte nur beim Anlegen", () => {
  it("fuellt beim Anlegen fehlende optionale Felder mit Standardwerten", () => {
    const parsed = createSpoolInputSchema.parse({
      inventoryId: INVENTORY_ID,
      manufacturerId: MANUFACTURER_ID,
      materialId: MATERIAL_ID,
      colorName: "Rot",
      colorHex: null,
      purchasePriceCents: null,
      purchasedAt: null,
      location: null,
      initialWeightG: 1000,
      remainingWeightG: 1000
    });
    assert.equal(parsed.isRefill, false);
    assert.equal(parsed.note, null);
    assert.equal(parsed.colorHex2, null);
    assert.equal(parsed.tareWeightG, null);
    assert.equal(parsed.alreadyOpened, false);
    assert.deepEqual(parsed.customFields, {});
  });

  // Regression (Update auf Zod 4): dort greift default() auch nach partial() - ein PATCH ohne diese Felder haette sonst
  // gespeicherte Werte (Notiz, Nachfuell-Kennzeichen, Leergewicht, eigene Felder) still zurueckgesetzt.
  it("setzt beim Aendern nichts auf einen Standardwert, was nicht mitgeschickt wurde", () => {
    assert.deepEqual(updateSpoolInputSchema.parse({}), {});
    assert.deepEqual(updateSpoolInputSchema.parse({ colorName: "Blau" }), { colorName: "Blau" });
  });

  it("uebernimmt beim Aendern ausdruecklich mitgeschickte Werte, auch null und false", () => {
    const parsed = updateSpoolInputSchema.parse({ note: null, isRefill: false, tareWeightG: 0, customFields: {} });
    assert.deepEqual(parsed, { note: null, isRefill: false, tareWeightG: 0, customFields: {} });
  });
});
