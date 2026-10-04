import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestPrice, type SpoolPriceSuggestion } from "@filapilot/shared";

const MANUFACTURER = "00000000-0000-4000-8000-0000000000b1";
const OTHER_MANUFACTURER = "00000000-0000-4000-8000-0000000000b2";
const MATERIAL_ID = "00000000-0000-4000-8000-0000000000a1";
const material = { id: MATERIAL_ID, priceRefillCents: 1019, priceWithSpoolCents: 1199 };
const last = (over: Partial<SpoolPriceSuggestion>): SpoolPriceSuggestion => ({
  manufacturerId: MANUFACTURER,
  materialId: MATERIAL_ID,
  isRefill: false,
  priceCents: 1299,
  ...over
});

describe("Spulen: Preis-Vorbelegung", () => {
  it("nimmt zuerst den zuletzt eingetragenen Preis derselben Kombination", () => {
    assert.deepEqual(suggestPrice([last({})], material, MANUFACTURER, false), { priceCents: 1299, source: "last" });
  });

  it("faellt auf den Richtpreis des Materials fuer die gewaehlte Art zurueck", () => {
    assert.deepEqual(suggestPrice([], material, MANUFACTURER, false), { priceCents: 1199, source: "material" });
    assert.deepEqual(suggestPrice([], material, MANUFACTURER, true), { priceCents: 1019, source: "material" });
  });

  it("uebernimmt nie den Preis der anderen Art, eines anderen Herstellers oder Materials", () => {
    const others = [last({ isRefill: true }), last({ manufacturerId: OTHER_MANUFACTURER }), last({ materialId: "00000000-0000-4000-8000-0000000000a9" })];
    assert.deepEqual(suggestPrice(others, material, MANUFACTURER, false), { priceCents: 1199, source: "material" });
    assert.equal(suggestPrice(others, { ...material, priceWithSpoolCents: null }, MANUFACTURER, false), null);
  });

  it("macht ohne Material oder Hersteller keinen Vorschlag", () => {
    assert.equal(suggestPrice([last({})], undefined, MANUFACTURER, false), null);
    assert.equal(suggestPrice([last({})], material, "", false), null);
  });
});
