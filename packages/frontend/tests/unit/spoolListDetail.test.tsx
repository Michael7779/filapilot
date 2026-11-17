import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Material, SpoolWithRelations } from "@filapilot/shared";
import { buildDetailItems } from "../../src/components/SpoolListDetail.js";

const t = (key: string): string => key;
const format = { t, language: "de" };

const material = { printTempMinC: 240, printTempMaxC: 270, bedTempC: 90, bedTempMaxC: null, densityGCm3: 1.04, filamentDiameterMm: 1.75 } as unknown as Material;

function spool(over: Partial<SpoolWithRelations>): SpoolWithRelations {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    remainingWeightG: 1000,
    purchasePriceCents: null,
    purchasedAt: null,
    openedAt: new Date("2026-02-01"),
    isRefill: false,
    note: null,
    customFields: {},
    createdAt: new Date("2026-01-01T10:00:00Z"),
    lastModifiedAt: null,
    ...over
  } as SpoolWithRelations;
}

const keys = (items: { key: string }[]): string[] => items.map((item) => item.key);

describe("buildDetailItems - kompakte Detailzeile der Listenansicht", () => {
  it("zeigt Temperaturen, Preis und Datum direkt, in fester Reihenfolge", () => {
    const items = buildDetailItems(spool({ purchasePriceCents: 1019 }), material, [], format);
    assert.deepEqual(keys(items), ["nozzle", "bed", "length", "price", "addedAt", "lastModifiedAt"]);
    assert.equal(items[0]?.value, "240–270 °C");
    assert.equal(items[1]?.value, "90 °C");
    assert.match(items[3]?.value ?? "", /10,19/);
  });

  it("laesst Angaben ohne Wert weg (kein Preis, nie gekauft, keine Notiz)", () => {
    const items = buildDetailItems(spool({}), material, [], format);
    for (const key of ["price", "purchasedAt", "note", "packaging"]) {
      assert.ok(!keys(items).includes(key), `${key} duerfte nicht erscheinen`);
    }
  });

  it("zeigt Bett-Bereich, Lieferform ungeoeffneter Spulen und die Notiz", () => {
    const ranged = { ...material, bedTempMaxC: 100 } as Material;
    const items = buildDetailItems(spool({ openedAt: null, isRefill: true, note: "  Gekauft bei Petra  " }), ranged, [], format);
    assert.equal(items.find((item) => item.key === "bed")?.value, "90–100 °C");
    assert.equal(items.find((item) => item.key === "packaging")?.value, "spools.packaging.refill");
    assert.equal(items.at(-1)?.key, "note");
    assert.equal(items.at(-1)?.value, "Gekauft bei Petra");
  });

  it("kommt ohne Material zurecht", () => {
    const items = buildDetailItems(spool({}), undefined, [], format);
    assert.deepEqual(keys(items), ["addedAt", "lastModifiedAt"]);
  });
});
