import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_WISHLIST_FILTER,
  NO_MANUFACTURER_FILTER,
  filterWishlistItems,
  groupWishlistByManufacturer,
  isWishlistFilterActive
} from "@filapilot/shared";

type FilterItem = Parameters<typeof filterWishlistItems>[0][number];
type GroupItem = Parameters<typeof groupWishlistByManufacturer>[0][number];

function filterItem(over: Partial<FilterItem>): FilterItem {
  return {
    title: "Irgendwas",
    note: null,
    status: "OPEN",
    manufacturerId: null,
    manufacturerName: null,
    materialId: null,
    materialName: null,
    colorName: null,
    addedByName: "anna",
    ...over
  };
}

function groupItem(over: Partial<GroupItem>): GroupItem {
  return {
    title: "Irgendwas",
    quantity: 1,
    inOrder: false,
    manufacturerId: null,
    manufacturerName: null,
    materialName: null,
    colorName: null,
    ...over
  };
}

describe("filterWishlistItems", () => {
  const items = [
    filterItem({ title: "Bambu PLA Schwarz", manufacturerId: "m1", manufacturerName: "Bambu Lab", materialId: "p1", materialName: "PLA Basic", colorName: "Schwarz", addedByName: "anna" }),
    filterItem({ title: "Prusament PETG Orange", manufacturerId: "m2", manufacturerName: "Prusa", materialId: "p2", materialName: "PETG", colorName: "Orange", status: "ORDERED", addedByName: "ben", note: "fuer den Drucker im Keller" }),
    filterItem({ title: "Irgendein TPU", status: "DONE", addedByName: "anna" })
  ];

  it("laesst bei leerem Filter alles durch", () => {
    assert.equal(filterWishlistItems(items, EMPTY_WISHLIST_FILTER).length, 3);
    assert.equal(isWishlistFilterActive(EMPTY_WISHLIST_FILTER), false);
  });

  it("sucht ohne Beachtung der Gross-/Kleinschreibung in Titel, Notiz, Hersteller, Material, Farbe und Ersteller", () => {
    const search = (text: string): string[] => filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, search: text }).map((item) => item.title);
    assert.deepEqual(search("prusament"), ["Prusament PETG Orange"]);
    assert.deepEqual(search("KELLER"), ["Prusament PETG Orange"]);
    assert.deepEqual(search("bambu lab"), ["Bambu PLA Schwarz"]);
    assert.deepEqual(search("petg"), ["Prusament PETG Orange"]);
    assert.deepEqual(search("schwarz"), ["Bambu PLA Schwarz"]);
    assert.deepEqual(search("ben"), ["Prusament PETG Orange"]);
  });

  it("verlangt bei mehreren Suchwoertern, dass alle vorkommen (auch ueber verschiedene Felder)", () => {
    const search = (text: string): number => filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, search: text }).length;
    assert.equal(search("bambu schwarz"), 1);
    assert.equal(search("bambu orange"), 0);
    assert.equal(search("   "), 3);
  });

  it("filtert nach Status, Hersteller, Material und Ersteller und kombiniert die Filter", () => {
    assert.equal(filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, status: "DONE" }).length, 1);
    assert.equal(filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, manufacturer: "m2" }).length, 1);
    assert.equal(filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, material: "p1" }).length, 1);
    assert.equal(filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, addedBy: "anna" }).length, 2);
    assert.equal(filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, addedBy: "anna", status: "OPEN" }).length, 1);
    assert.equal(isWishlistFilterActive({ ...EMPTY_WISHLIST_FILTER, status: "OPEN" }), true);
  });

  it("findet Eintraege ohne Hersteller ueber den eigenen Filterwert", () => {
    const result = filterWishlistItems(items, { ...EMPTY_WISHLIST_FILTER, manufacturer: NO_MANUFACTURER_FILTER });
    assert.deepEqual(result.map((item) => item.title), ["Irgendein TPU"]);
  });
});

describe("groupWishlistByManufacturer", () => {
  it("gruppiert nach Hersteller alphabetisch, Eintraege ohne Hersteller stehen zuletzt", () => {
    const groups = groupWishlistByManufacturer(
      [
        groupItem({ title: "a", manufacturerId: "m2", manufacturerName: "Prusa" }),
        groupItem({ title: "b" }),
        groupItem({ title: "c", manufacturerId: "m1", manufacturerName: "Bambu Lab" }),
        groupItem({ title: "d", manufacturerId: "m2", manufacturerName: "Prusa" })
      ],
      "de"
    );
    assert.deepEqual(groups.map((group) => group.manufacturerName), ["Bambu Lab", "Prusa", null]);
    assert.deepEqual(groups[1]?.items.map((item) => item.title).sort(), ["a", "d"]);
  });

  it("summiert Mengen: gesamt und nur die fuer die Bestellung ausgewaehlten", () => {
    const [group] = groupWishlistByManufacturer(
      [
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", quantity: 2, inOrder: true }),
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", quantity: 3, inOrder: false }),
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", quantity: 1, inOrder: true })
      ],
      "de"
    );
    assert.equal(group?.totalQuantity, 6);
    assert.equal(group?.selectedQuantity, 3);
    assert.equal(group?.selectedCount, 2);
  });

  it("sortiert die Eintraege einer Gruppe nach Material, Farbe und Titel, damit Gleiches nebeneinander steht", () => {
    const [group] = groupWishlistByManufacturer(
      [
        groupItem({ title: "z", manufacturerId: "m1", manufacturerName: "Bambu Lab", materialName: "PLA", colorName: "Weiss" }),
        groupItem({ title: "y", manufacturerId: "m1", manufacturerName: "Bambu Lab", materialName: "ABS", colorName: "Rot" }),
        groupItem({ title: "x", manufacturerId: "m1", manufacturerName: "Bambu Lab", materialName: "PLA", colorName: "Gelb" })
      ],
      "de"
    );
    assert.deepEqual(group?.items.map((item) => item.title), ["y", "x", "z"]);
  });

  it("liefert bei leerer Liste keine Gruppen", () => {
    assert.deepEqual(groupWishlistByManufacturer([], "de"), []);
  });
});
