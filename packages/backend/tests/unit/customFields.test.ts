import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CustomFieldValidationError, validateCustomFieldValues } from "@filapilot/shared";

const DEFS = [
  { id: "text-1", kind: "TEXT" as const, name: "Charge" },
  { id: "num-1", kind: "NUMBER" as const, name: "Bewertung" },
  { id: "date-1", kind: "DATE" as const, name: "Geoeffnet am" },
  { id: "bool-1", kind: "BOOLEAN" as const, name: "Getrocknet" }
];

describe("Zusatzfeld-Werte validieren (Whitelist + Typpruefung)", () => {
  it("nimmt gueltige Werte je Typ an", () => {
    const result = validateCustomFieldValues(DEFS, {
      "text-1": "L23-04",
      "num-1": 4.5,
      "date-1": "2026-09-01",
      "bool-1": true
    });
    assert.deepEqual(result, { "text-1": "L23-04", "num-1": 4.5, "date-1": "2026-09-01", "bool-1": true });
  });

  it("wandelt leeren Text und leeren String in null (Feld zuruecksetzen)", () => {
    assert.deepEqual(validateCustomFieldValues(DEFS, { "text-1": null }), { "text-1": null });
    assert.deepEqual(validateCustomFieldValues(DEFS, { "num-1": "" }), { "num-1": null });
  });

  it("wirft bei unbekanntem Schluessel (Whitelist)", () => {
    assert.throws(() => validateCustomFieldValues(DEFS, { "unbekannt-1": "x" }), CustomFieldValidationError);
  });

  it("wirft bei falschem Typ je Feldart", () => {
    assert.throws(() => validateCustomFieldValues(DEFS, { "num-1": "keine Zahl" }), CustomFieldValidationError);
    assert.throws(() => validateCustomFieldValues(DEFS, { "bool-1": "ja" }), CustomFieldValidationError);
    assert.throws(() => validateCustomFieldValues(DEFS, { "date-1": "nicht-datum" }), CustomFieldValidationError);
    assert.throws(() => validateCustomFieldValues(DEFS, { "text-1": "x".repeat(201) }), CustomFieldValidationError);
  });

  it("liefert ein leeres Ergebnis fuer leere Eingabe", () => {
    assert.deepEqual(validateCustomFieldValues(DEFS, {}), {});
  });
});
