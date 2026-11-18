import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OPENED_TABS, SpoolOpenedTabs, type SpoolOpenedTab } from "../../src/components/SpoolOpenedTabs.js";

const render = (active: SpoolOpenedTab): string =>
  renderToStaticMarkup(<SpoolOpenedTabs active={active} counts={{ started: 30, unopened: 12 }} summary="12 Spulen" onChange={() => undefined} />);

describe("SpoolOpenedTabs - Tabs Angefangene | Ungeoeffnete", () => {
  it("zeigt erst den Tab der angefangenen, dann den der ungeoeffneten Spulen", () => {
    assert.deepEqual([...OPENED_TABS], ["started", "unopened"]);
    const html = render("started");
    assert.ok(html.indexOf("spool-tab-started") < html.indexOf("spool-tab-unopened"));
  });

  it("zeigt die Anzahl je Tab und die Zusammenfassung", () => {
    const html = render("started");
    assert.match(html, /\(30\)/);
    assert.match(html, /\(12\)/);
    assert.match(html, /12 Spulen/);
  });

  it("markiert nur den gewaehlten Tab als ausgewaehlt und erreichbar per Tab-Taste", () => {
    const html = render("unopened");
    assert.match(html, /id="spool-tab-unopened"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    assert.match(html, /id="spool-tab-started"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  });
});
