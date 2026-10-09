import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importColorName, legacyNearestColorName, nearestColorName, normalizeHexColor } from "@filapilot/shared";
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

  it("ueberspringt leere Platzhalter ohne Materialangabe, nimmt aber Eintraege mit nur Name oder nur Typ an", () => {
    const { spools, skipped } = parseBambuHits([
      { id: "leer", filamentVendor: "Bambu Lab", netWeight: 0, totalNetWeight: 0 },
      { id: "blank", filamentName: "  ", filamentType: "" },
      { id: "nurName", filamentName: "PLA Basic" },
      { id: "nurTyp", filamentType: "PETG" }
    ]);
    assert.deepEqual(spools.map((spool) => spool.id), ["nurName", "nurTyp"]);
    assert.equal(skipped, 2);
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

  it("ordnet auch helle und gedeckte Farben ihrem Farbton zu (Werte aus Bambu Studio), nicht dem Grau", () => {
    assert.equal(nearestColorName("#61C680"), "Hellgrün");
    assert.equal(nearestColorName("#56B7E6"), "Hellblau");
    assert.equal(nearestColorName("#DE4343"), "Rot");
    assert.equal(nearestColorName("#F7D959"), "Gelb");
    assert.equal(nearestColorName("#042F56"), "Dunkelblau");
    assert.equal(nearestColorName("#757575"), "Grau");
    assert.equal(nearestColorName("#9B9EA0"), "Grau");
  });

  it("die alte RGB-Zuordnung (nur fuer die Korrektur aelterer Importe) ergibt fuer #61C680 weiterhin das alte \"Grau\"", () => {
    assert.equal(legacyNearestColorName("#61C680"), "Grau");
    assert.equal(legacyNearestColorName(null), "Unbekannt");
    assert.equal(importColorName("#61C680", "Bambu Lab", "PLA Basic"), "Hellgrün");
  });

  it("nimmt den Herstellernamen, wenn der Hex-Wert genau zu einer bekannten Farbe des Materials passt", () => {
    const base = { id: "c1", filamentVendor: "Bambu Lab", filamentName: "PLA Basic" };
    assert.equal(mapBambuSpool({ ...base, color: "#00AE42FF" }).colorName, "Bambu-Grün");
    assert.equal(mapBambuSpool({ ...base, color: "#C12E1FFF" }).colorName, "Rot");
    // kein exakter Treffer -> allgemeiner Name; anderer Hersteller -> nie ein fremder Herstellername
    assert.equal(mapBambuSpool({ ...base, color: "#61C680FF" }).colorName, "Hellgrün");
    assert.equal(mapBambuSpool({ ...base, filamentVendor: "eSun", color: "#00AE42FF" }).colorName, "Grün");
  });
});
