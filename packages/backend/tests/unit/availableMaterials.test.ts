import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { availableMaterialsFor } from "@filapilot/shared";

const materials = [
  { id: "generic-pla", name: "PLA", manufacturerId: null },
  { id: "generic-abs", name: "ABS", manufacturerId: null },
  { id: "bambu-pla-basic", name: "PLA Basic", manufacturerId: "bambu" },
  { id: "bambu-pla-matte", name: "PLA Matte", manufacturerId: "bambu" },
  { id: "sunlu-pla", name: "PLA", manufacturerId: "sunlu" }
];

describe("availableMaterialsFor", () => {
  it("zeigt bei einem Hersteller mit eigenen Produkten nur dessen eigene, keine generischen", () => {
    const result = availableMaterialsFor(materials, "bambu");
    assert.deepEqual(
      result.map((m) => m.id),
      ["bambu-pla-basic", "bambu-pla-matte"]
    );
  });

  it("faellt fuer einen Hersteller ohne jegliches eigenes Material auf die generische Liste zurueck", () => {
    const result = availableMaterialsFor(materials, "unbekannter-hersteller");
    assert.deepEqual(
      result.map((m) => m.id),
      ["generic-pla", "generic-abs"]
    );
  });

  it("zeigt sein eigenes 'PLA' und nicht das generische, wenn der Hersteller selbst ein gleichnamiges Produkt hat", () => {
    const result = availableMaterialsFor(materials, "sunlu");
    assert.deepEqual(
      result.map((m) => m.id),
      ["sunlu-pla"]
    );
  });

  it("faellt ohne gewaehlten Hersteller (z.B. '+ Neuer Hersteller' im Entstehen) auf die generische Liste zurueck", () => {
    const result = availableMaterialsFor(materials, null);
    assert.deepEqual(
      result.map((m) => m.id),
      ["generic-pla", "generic-abs"]
    );
  });
});
