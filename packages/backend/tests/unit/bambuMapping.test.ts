import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nearestColorName, normalizeHexColor } from "@filapilot/shared";
import { mapBambuSpool, parseBambuHits } from "../../src/services/bambuImportService.js";

describe("Bambu-Import: Zuordnung einer Spule", () => {
  it("uebernimmt Marke, Material, Farbe und Gewicht und schneidet den Alpha-Kanal ab", () => {
    const mapped = mapBambuSpool({
      id: "101",
      filamentVendor: " Bambu Lab ",
      filamentType: "PLA",
      filamentName: "PLA Basic",
      color: "#FFFFFFFF",
      netWeight: 931.4,
      totalNetWeight: 1000,
      status: 0,
      inPrinter: true,
      deviceName: "X1C Werkstatt"
    });
    assert.equal(mapped.vendor, "Bambu Lab");
    assert.equal(mapped.materialName, "PLA Basic");
    assert.equal(mapped.typeName, "PLA");
    assert.equal(mapped.colorHex, "#FFFFFF");
    assert.equal(mapped.colorName, "Weiß");
    assert.deepEqual([mapped.remainingG, mapped.totalG], [931, 1000]);
    assert.equal(mapped.deviceName, "X1C Werkstatt");
  });

  it("begrenzt das Restgewicht auf 0 bis Ursprungsgewicht und nutzt 1000 g, wenn das Gesamtgewicht fehlt", () => {
    assert.equal(mapBambuSpool({ id: "1", netWeight: 1500, totalNetWeight: 1000 }).remainingG, 1000);
    assert.equal(mapBambuSpool({ id: "2", netWeight: -20, totalNetWeight: 1000 }).remainingG, 0);
    const noTotal = mapBambuSpool({ id: "3", netWeight: 400 });
    assert.deepEqual([noTotal.remainingG, noTotal.totalG], [400, 1000]);
    assert.equal(mapBambuSpool({ id: "4" }).remainingG, 1000);
  });

  it("nutzt Ersatzwerte fuer fehlende Angaben", () => {
    const mapped = mapBambuSpool({ id: "5" });
    assert.equal(mapped.vendor, "Unbekannt");
    assert.equal(mapped.materialName, "Filament");
    assert.equal(mapped.colorHex, null);
    assert.equal(mapped.colorName, "Unbekannt");
    assert.equal(mapped.inPrinter, false);
    assert.equal(mapBambuSpool({ id: "6", filamentType: "PETG" }).materialName, "PETG");
  });
});

describe("Bambu-Import: Eintraege pruefen", () => {
  it("nimmt Zahlen- und Text-IDs an, zaehlt kaputte und doppelte Eintraege als uebersprungen", () => {
    const { spools, skipped } = parseBambuHits([
      { id: 1, filamentName: "A" },
      { id: "2", filamentName: "B", netWeight: 5 },
      { id: 1, filamentName: "doppelt" },
      { filamentName: "ohne id" },
      { id: 3, netWeight: "viel" },
      "kein objekt",
      null
    ]);
    assert.deepEqual(spools.map((spool) => spool.id), ["1", "2"]);
    assert.equal(skipped, 5);
  });
});

describe("Farbnamen", () => {
  it("normalisiert Hex-Werte", () => {
    assert.equal(normalizeHexColor("#ffffffff"), "#FFFFFF");
    assert.equal(normalizeHexColor("#1a1a1a"), "#1A1A1A");
    assert.equal(normalizeHexColor("rot"), null);
    assert.equal(normalizeHexColor("#12345"), null);
    assert.equal(normalizeHexColor(null), null);
  });

  it("findet den naechsten deutschen Namen", () => {
    assert.equal(nearestColorName("#000000"), "Schwarz");
    assert.equal(nearestColorName("#FFFFFF"), "Weiß");
    assert.equal(nearestColorName("#FF0000"), "Rot");
    assert.equal(nearestColorName("#0000FF"), "Blau");
    assert.equal(nearestColorName("#00AE42"), "Grün");
    assert.equal(nearestColorName(null), "Unbekannt");
  });
});
