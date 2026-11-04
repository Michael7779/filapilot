import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SPOOL_SORT_COLUMNS } from "@filapilot/shared";
import { DETAIL_SORT_COLUMNS, SpoolListSortBar } from "../../src/components/SpoolListSortBar.js";

const sortButton = (column: string, label: string): React.JSX.Element => <button data-column={column}>{label}</button>;

describe("SpoolListSortBar - Sortierung der Detail-Spalten ohne Aufklappen", () => {
  it("bietet fuer jede nur aufgeklappt sichtbare Angabe einen Sortier-Knopf", () => {
    const html = renderToStaticMarkup(<SpoolListSortBar sortButton={sortButton} activeColumn={undefined} />);
    for (const column of ["nozzle", "bed", "length", "price", "purchasedAt", "addedAt", "lastModifiedAt", "note"]) {
      assert.ok(html.includes(`data-column="${column}"`), `Knopf fuer ${column} fehlt`);
    }
  });

  it("verwendet nur gueltige Sortier-Spalten, jede genau einmal", () => {
    const columns = DETAIL_SORT_COLUMNS.map((entry) => entry.column);
    assert.equal(new Set(columns).size, columns.length);
    for (const column of columns) {
      assert.ok((SPOOL_SORT_COLUMNS as readonly string[]).includes(column), `${column} ist keine Sortier-Spalte`);
    }
  });

  it("hebt die aktive Spalte hervor", () => {
    const html = renderToStaticMarkup(<SpoolListSortBar sortButton={sortButton} activeColumn="lastModifiedAt" />);
    assert.match(html, /<span class="[^"]*text-\[var\(--color-text-primary\)\][^"]*"><button data-column="lastModifiedAt"/);
    assert.doesNotMatch(html, /<span class="[^"]*text-\[var\(--color-text-primary\)\][^"]*"><button data-column="price"/);
  });
});
