import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCatalogDue, parseShopifyProducts, priceToCents, toPublicProduct } from "../../src/services/sizzleCatalogService.js";

const IMAGE = "https://cdn.shopify.com/s/files/1/0910/2622/7575/files/sauce.webp?v=1";

function shopProduct(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1001,
    title: "Burger & Ribs BBQ-Sauce",
    handle: "burger-ribs-bbq-sauce",
    product_type: "Grillsauce",
    images: [{ src: IMAGE }],
    variants: [
      { id: 5001, title: "500 ml", price: "7.20", available: true, featured_image: null },
      { id: 5002, title: "250 ml", price: "3.99", available: false, featured_image: null }
    ],
    ...over
  };
}

describe("priceToCents", () => {
  it("liest Euro-Texte exakt in Cent", () => {
    assert.equal(priceToCents("14.70"), 1470);
    assert.equal(priceToCents("7.2"), 720);
    assert.equal(priceToCents("5"), 500);
    assert.equal(priceToCents("0.10"), 10);
    // Gleitkomma-Falle: 19.99 * 100 = 1998.9999999999998
    assert.equal(priceToCents("19.99"), 1999);
  });

  it("lehnt Unbrauchbares ab", () => {
    for (const bad of ["", "abc", "-1.00", "1,50", "1.234", "1e3", "12345678"]) {
      assert.equal(priceToCents(bad), null, bad);
    }
  });
});

describe("parseShopifyProducts", () => {
  it("macht aus jeder Variante eine Zeile mit Titel, Variante, Preis und Bild", () => {
    const { variants, skipped } = parseShopifyProducts({ products: [shopProduct()] });
    assert.equal(skipped, 0);
    assert.equal(variants.length, 2);
    assert.deepEqual(variants[0], {
      shopifyVariantId: "5001",
      shopifyProductId: "1001",
      handle: "burger-ribs-bbq-sauce",
      title: "Burger & Ribs BBQ-Sauce",
      variantTitle: "500 ml",
      productType: "Grillsauce",
      imageUrl: IMAGE,
      priceCents: 720,
      available: true
    });
    assert.equal(variants[1]?.available, false);
  });

  it("laesst den Variantennamen bei Produkten ohne Varianten weg", () => {
    const { variants } = parseShopifyProducts({
      products: [shopProduct({ variants: [{ id: 7, title: "Default Title", price: "14.70" }], product_type: "" })]
    });
    assert.equal(variants[0]?.variantTitle, null);
    assert.equal(variants[0]?.productType, null);
  });

  it("bevorzugt das Variantenbild, sonst das erste Produktbild", () => {
    const own = "https://cdn.shopify.com/s/files/variant.webp";
    const { variants } = parseShopifyProducts({
      products: [shopProduct({ variants: [{ id: 1, title: "A", price: "1.00", featured_image: { src: own } }, { id: 2, title: "B", price: "1.00" }] })]
    });
    assert.equal(variants[0]?.imageUrl, own);
    assert.equal(variants[1]?.imageUrl, IMAGE);
  });

  it("nimmt nur https-Bilder (kein javascript:, kein http:)", () => {
    // Bewusst unsichere Adressen als Testeingaben: genau sie muessen abgelehnt werden.
    // eslint-disable-next-line sonarjs/code-eval, sonarjs/no-clear-text-protocols
    for (const src of ["javascript:alert(1)", "http://cdn.shopify.com/x.webp", "data:image/png;base64,AAAA", "kein url"]) {
      const { variants } = parseShopifyProducts({ products: [shopProduct({ images: [{ src }] })] });
      assert.equal(variants[0]?.imageUrl, null, src);
    }
  });

  it("ueberspringt kaputte Produkte und Varianten, statt alles abzubrechen", () => {
    const { variants, skipped } = parseShopifyProducts({
      products: [
        shopProduct({ id: 1, handle: "gut", variants: [{ id: 11, title: "x", price: "2.00" }, { id: 12, title: "y", price: "kostenlos" }] }),
        shopProduct({ id: 2, handle: "../../etc/passwd" }),
        shopProduct({ id: 3, title: "" }),
        shopProduct({ id: 4, variants: [] }),
        "kein objekt",
        null
      ]
    });
    assert.deepEqual(
      variants.map((variant) => variant.shopifyVariantId),
      ["11"]
    );
    assert.equal(skipped, 6);
  });

  it("wirft, wenn die Antwort gar kein Produktverzeichnis ist", () => {
    assert.throws(() => parseShopifyProducts({ error: "nope" }));
    assert.throws(() => parseShopifyProducts("<html>"));
  });
});

describe("toPublicProduct", () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    shopifyVariantId: "5001",
    shopifyProductId: "1001",
    handle: "burger-ribs-bbq-sauce",
    title: "Burger & Ribs BBQ-Sauce",
    variantTitle: "500 ml",
    productType: "Grillsauce",
    imageUrl: IMAGE,
    priceCents: 720,
    available: true,
    active: true,
    syncedAt: new Date(),
    createdAt: new Date()
  };

  it("liefert ein kleines Bild, den Shop-Link und nie interne Felder", () => {
    const product = toPublicProduct(row);
    assert.equal(product.imageUrl, `${IMAGE}&width=160`);
    assert.equal(product.url, "https://sizzlebrothers.de/products/burger-ribs-bbq-sauce");
    assert.equal(product.productKey, "1001");
    assert.equal("shopifyVariantId" in product, false);
    assert.equal("handle" in product, false);
  });

  it("kommt ohne Bild zurecht", () => {
    assert.equal(toPublicProduct({ ...row, imageUrl: null }).imageUrl, null);
  });
});

describe("isCatalogDue", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const hours = (count: number): Date => new Date(now.getTime() - count * 3_600_000);

  it("ist ohne jeden Abgleich faellig", () => {
    assert.equal(isCatalogDue(null, null, now, 60_000), true);
  });

  it("ist erst nach der Mindestpause faellig", () => {
    assert.equal(isCatalogDue(hours(1), null, now, 2 * 3_600_000), false);
    assert.equal(isCatalogDue(hours(3), null, now, 2 * 3_600_000), true);
  });

  it("zaehlt auch einen fehlgeschlagenen Versuch als Pause (kein Dauerfeuer auf den Shop)", () => {
    assert.equal(isCatalogDue(hours(10), new Date(now.getTime() - 30_000), now, 60_000), false);
    assert.equal(isCatalogDue(hours(10), new Date(now.getTime() - 90_000), now, 60_000), true);
  });
});
