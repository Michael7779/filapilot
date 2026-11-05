import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SpoolWithRelations } from "@filapilot/shared";
import { StockByType } from "../../src/components/StockByType.js";

function spool(id: string, colorName: string): SpoolWithRelations {
  return {
    id,
    colorName,
    colorHex: "#ff0000",
    colorHex2: null,
    materialName: "PLA Basic",
    manufacturerName: "Bambu Lab",
    remainingWeightG: 500,
    initialWeightG: 1000,
    archivedAt: null
  } as SpoolWithRelations;
}

describe("StockByType - aufklappbare Material-Zeilen", () => {
  it("startet zugeklappt: je Material ein Knopf, die Spulen sind noch nicht zu sehen", () => {
    const html = renderToStaticMarkup(<StockByType spools={[spool("a", "Rot"), spool("b", "Blau")]} />);
    assert.equal((html.match(/<button/g) ?? []).length, 1);
    assert.ok(html.includes('aria-expanded="false"'));
    assert.ok(!html.includes("Rot"));
    assert.ok(!html.includes("Blau"));
  });

  it("zeigt ohne Bestand den Leertext und keinen Knopf", () => {
    const html = renderToStaticMarkup(<StockByType spools={[]} />);
    assert.ok(!html.includes("<button"));
  });
});
