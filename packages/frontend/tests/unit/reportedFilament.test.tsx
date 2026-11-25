import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportedFilament } from "../../src/components/ReportedFilament.js";

describe("ReportedFilament - Material und Farbe eines AMS-Fachs", () => {
  it("zeigt Material und Farbpunkt, wie der Drucker sie meldet", () => {
    const html = renderToStaticMarkup(<ReportedFilament material="PETG" colorHex="#000000" />);
    assert.ok(html.includes("PETG"));
    assert.ok(html.includes("background-color:#000000"));
  });

  it("kommt mit nur einer der beiden Angaben aus", () => {
    assert.ok(!renderToStaticMarkup(<ReportedFilament material="PLA" colorHex={null} />).includes("background-color"));
    assert.ok(renderToStaticMarkup(<ReportedFilament material={null} colorHex="#FFFFFF" />).includes("background-color:#FFFFFF"));
  });

  it("zeigt nichts, wenn der Drucker nichts meldet", () => {
    assert.equal(renderToStaticMarkup(<ReportedFilament material={null} colorHex={null} />), "");
  });
});
