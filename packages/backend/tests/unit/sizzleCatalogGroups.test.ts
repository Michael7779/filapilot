import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterSizzleGroups, groupSizzleProducts, sizzleProductTypes, type SizzleProduct } from "@filapilot/shared";

let counter = 0;
function product(over: Partial<SizzleProduct>): SizzleProduct {
  counter += 1;
  return {
    id: `id-${counter}`,
    productKey: "p1",
    title: "Burger & Ribs BBQ-Sauce",
    variantTitle: "500 ml",
    productType: "Grillsauce",
    imageUrl: null,
    url: "https://sizzlebrothers.de/products/x",
    priceCents: 720,
    available: true,
    active: true,
    ...over
  };
}

describe("groupSizzleProducts", () => {
  it("fasst die Varianten eines Produkts zusammen und sortiert sie nach Preis", () => {
    const groups = groupSizzleProducts(
      [
        product({ variantTitle: "1000 ml", priceCents: 1599 }),
        product({ variantTitle: "250 ml", priceCents: 399 }),
        product({ variantTitle: "500 ml", priceCents: 720 }),
        product({ productKey: "p2", title: "Alter Pfeffer", variantTitle: null, priceCents: 1299, productType: "Gewürze" })
      ],
      "de"
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.title, "Alter Pfeffer");
    assert.deepEqual(
      groups[1]?.variants.map((variant) => variant.variantTitle),
      ["250 ml", "500 ml", "1000 ml"]
    );
  });

  it("nimmt Bild und Produktart der ersten Variante mit Bild", () => {
    const [group] = groupSizzleProducts([product({ imageUrl: null, priceCents: 100 }), product({ imageUrl: "https://cdn.shopify.com/a.webp", priceCents: 200 })], "de");
    assert.equal(group?.imageUrl, "https://cdn.shopify.com/a.webp");
  });

  it("sortiert die Produkte alphabetisch ohne Beachtung der Gross-/Kleinschreibung", () => {
    const groups = groupSizzleProducts([product({ productKey: "b", title: "bbq" }), product({ productKey: "a", title: "Alpha" }), product({ productKey: "c", title: "Zimt" })], "de");
    assert.deepEqual(
      groups.map((group) => group.title),
      ["Alpha", "bbq", "Zimt"]
    );
  });
});

describe("filterSizzleGroups / sizzleProductTypes", () => {
  const groups = groupSizzleProducts(
    [
      product({ productKey: "a", title: "Burger & Ribs BBQ-Sauce", productType: "Grillsauce" }),
      product({ productKey: "b", title: "Alter Pfeffer Marinade", productType: "Flüssige Marinaden", variantTitle: "25 ml" }),
      product({ productKey: "c", title: "Geschenkgutschein", productType: null, variantTitle: null })
    ],
    "de"
  );

  it("sucht ohne Gross-/Kleinschreibung, alle Woerter muessen vorkommen", () => {
    assert.equal(filterSizzleGroups(groups, { search: "bbq burger", productType: "" }).length, 1);
    assert.equal(filterSizzleGroups(groups, { search: "PFEFFER", productType: "" })[0]?.title, "Alter Pfeffer Marinade");
    assert.equal(filterSizzleGroups(groups, { search: "pfeffer bbq", productType: "" }).length, 0);
  });

  it("sucht auch in Produktart und Variante", () => {
    assert.equal(filterSizzleGroups(groups, { search: "grillsauce", productType: "" }).length, 1);
    assert.equal(filterSizzleGroups(groups, { search: "25 ml", productType: "" }).length, 1);
  });

  it("filtert nach Produktart, auch auf Produkte ohne Art", () => {
    assert.equal(filterSizzleGroups(groups, { search: "", productType: "Grillsauce" }).length, 1);
    assert.equal(filterSizzleGroups(groups, { search: "", productType: "none" }).length, 1);
    assert.equal(filterSizzleGroups(groups, { search: "", productType: "" }).length, 3);
  });

  it("listet die vorkommenden Produktarten alphabetisch und ohne Doppelte", () => {
    assert.deepEqual(sizzleProductTypes(groups, "de"), ["Flüssige Marinaden", "Grillsauce"]);
  });
});
