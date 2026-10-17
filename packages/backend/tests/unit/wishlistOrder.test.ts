import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_WISHLIST_FILTER,
  NO_MANUFACTURER_FILTER,
  filterWishlistItems,
  groupWishlistByManufacturer,
  isWishlistFilterActive,
  presetManufacturerId
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

let groupCounter = 0;
function groupItem(over: Partial<GroupItem>): GroupItem {
  groupCounter += 1;
  return {
    id: `g-${groupCounter}`,
    title: "Irgendwas",
    quantity: 1,
    inOrder: false,
    status: "OPEN",
    unitPriceCents: null,
    addedByName: "anna",
    manufacturerId: null,
    manufacturerName: null,
    materialId: null,
    materialName: null,
    colorName: null,
    colorHex: null,
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

describe("Bestellliste: gleiche Wuensche zu einer Zeile zusammenfassen", () => {
  const bambu = { manufacturerId: "m1", manufacturerName: "Bambu Lab", materialId: "p1", materialName: "TPU", colorName: "Schwarz", colorHex: "#000000" };

  it("fasst Eintraege mit gleichem Hersteller, Material und gleicher Farbe zusammen (Gross-/Kleinschreibung egal)", () => {
    const [group] = groupWishlistByManufacturer(
      [
        groupItem({ ...bambu, title: "Bambu Lab TPU Schwarz", quantity: 1, addedByName: "micky" }),
        groupItem({ ...bambu, title: "Bambu Lab TPU Schwarz", quantity: 2, addedByName: "marcus", colorName: "schwarz" }),
        groupItem({ ...bambu, colorName: "Weiss", colorHex: "#ffffff", title: "Bambu Lab TPU Weiss" })
      ],
      "de"
    );
    assert.equal(group?.lines.length, 2);
    const black = group?.lines.find((line) => line.colorName?.toLowerCase() === "schwarz");
    assert.equal(black?.items.length, 2);
    assert.equal(black?.totalQuantity, 3);
    assert.deepEqual(black?.contributors, [
      { name: "marcus", quantity: 2 },
      { name: "micky", quantity: 1 }
    ]);
  });

  it("unterscheidet Hersteller, Material und Farbe; ohne Farbe entscheidet der Titel", () => {
    const [group] = groupWishlistByManufacturer(
      [
        groupItem({ ...bambu, materialId: "p2", materialName: "PLA" }),
        groupItem({ ...bambu }),
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", title: "Egal was A" }),
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", title: "egal was a" }),
        groupItem({ manufacturerId: "m1", manufacturerName: "Bambu Lab", title: "Egal was B" })
      ],
      "de"
    );
    assert.equal(group?.lines.length, 4);
  });

  it("addiert die Mengen derselben Person und zaehlt die Auswahl je Zeile (keine/teilweise/alle)", () => {
    const [group] = groupWishlistByManufacturer(
      [
        groupItem({ ...bambu, quantity: 1, addedByName: "anna", inOrder: true }),
        groupItem({ ...bambu, quantity: 2, addedByName: "anna", inOrder: false })
      ],
      "de"
    );
    const line = group?.lines[0];
    assert.deepEqual(line?.contributors, [{ name: "anna", quantity: 3 }]);
    assert.equal(line?.selection, "some");
    assert.equal(line?.selectedQuantity, 1);
    const [allSelected] = groupWishlistByManufacturer([groupItem({ ...bambu, inOrder: true }), groupItem({ ...bambu, inOrder: true })], "de");
    assert.equal(allSelected?.lines[0]?.selection, "all");
    const [noneSelected] = groupWishlistByManufacturer([groupItem({ ...bambu }), groupItem({ ...bambu })], "de");
    assert.equal(noneSelected?.lines[0]?.selection, "none");
  });

  it("zeigt einen gemeinsamen Status, sonst MIXED", () => {
    const status = (first: GroupItem["status"], second: GroupItem["status"]): string | undefined =>
      groupWishlistByManufacturer([groupItem({ ...bambu, status: first }), groupItem({ ...bambu, status: second })], "de")[0]?.lines[0]?.status;
    assert.equal(status("ORDERED", "ORDERED"), "ORDERED");
    assert.equal(status("OPEN", "ORDERED"), "MIXED");
  });

  it("zeigt einen gemeinsamen Preis; unterschiedliche Preise sind 'gemischt', fehlende zaehlen nicht als Preis", () => {
    const price = (first: number | null, second: number | null): { cents: number | null; mixed: boolean } | undefined => {
      const line = groupWishlistByManufacturer(
        [groupItem({ ...bambu, unitPriceCents: first, inOrder: true }), groupItem({ ...bambu, unitPriceCents: second, inOrder: true })],
        "de"
      )[0]?.lines[0];
      return line ? { cents: line.unitPriceCents, mixed: line.priceMixed } : undefined;
    };
    assert.deepEqual(price(1999, 1999), { cents: 1999, mixed: false });
    assert.deepEqual(price(null, null), { cents: null, mixed: false });
    assert.deepEqual(price(1999, 2499), { cents: null, mixed: true });
    assert.deepEqual(price(1999, null), { cents: null, mixed: true });
  });

  it("nimmt fuer den Preis nur die ausgewaehlten Eintraege, solange welche ausgewaehlt sind", () => {
    const line = groupWishlistByManufacturer(
      [groupItem({ ...bambu, unitPriceCents: 1999, inOrder: true }), groupItem({ ...bambu, unitPriceCents: 500, inOrder: false })],
      "de"
    )[0]?.lines[0];
    assert.equal(line?.unitPriceCents, 1999);
    assert.equal(line?.priceMixed, false);
  });
});

describe("presetManufacturerId: vorbelegter Hersteller im Wunschlisten-Formular", () => {
  const manufacturers = [{ id: "m1" }, { id: "m2" }];

  it("nimmt den Standard-Hersteller aus den Einstellungen, wenn es ihn gibt", () => {
    assert.equal(presetManufacturerId("m2", manufacturers), "m2");
  });

  it("bleibt leer (= beliebiger Hersteller) ohne Standard-Hersteller", () => {
    assert.equal(presetManufacturerId(null, manufacturers), "");
  });

  it("bleibt leer, wenn der Standard-Hersteller nicht (mehr) in der Liste steht oder die Liste noch leer ist", () => {
    assert.equal(presetManufacturerId("m9", manufacturers), "");
    assert.equal(presetManufacturerId("m1", []), "");
  });
});
