import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SpoolWithRelations } from "@filapilot/shared";
import { SpoolListSiblings } from "../../src/components/SpoolListSiblings.js";

// Nur die Felder, die die Komponente liest.
function spool(id: string, remainingWeightG: number): SpoolWithRelations {
  return { id, remainingWeightG, initialWeightG: 1000, location: "Regal 2", openedAt: new Date() } as SpoolWithRelations;
}

describe("SpoolListSiblings - weitere Spulen desselben Filaments", () => {
  it("zeigt nichts, wenn es keine weitere Spule gibt", () => {
    assert.equal(renderToStaticMarkup(<SpoolListSiblings siblings={[]} onJump={() => undefined} />), "");
  });

  it("zeigt je weitere Spule eine Zeile mit Gramm und Prozent als Knopf", () => {
    const html = renderToStaticMarkup(<SpoolListSiblings siblings={[spool("a", 680), spool("b", 120)]} onJump={() => undefined} />);
    assert.equal((html.match(/<button/g) ?? []).length, 2);
    assert.ok(html.includes("680 g · 68 %"));
    assert.ok(html.includes("120 g · 12 %"));
  });
});
