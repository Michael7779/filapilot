import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { AppError } from "../../src/lib/apiResult.js";
import {
  loadCatalog,
  refreshCatalogIfDue,
  resetCatalogAttemptForTests,
  setCatalogFetcherForTests,
  syncCatalog
} from "../../src/services/sizzleCatalogService.js";

const IMAGE = "https://cdn.shopify.com/s/files/1/x/files/sauce.webp?v=1";

function product(id: number, variants: { id: number; title: string; price: string }[], over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Produkt ${id}`, handle: `produkt-${id}`, product_type: "Grillsauce", images: [{ src: IMAGE }], variants, ...over };
}

function fakeShop(pages: unknown[][]): { fetcher: (page: number) => Promise<unknown>; calls: () => number } {
  let calls = 0;
  return {
    fetcher: (page) => {
      calls += 1;
      return Promise.resolve({ products: pages[page - 1] ?? [] });
    },
    calls: () => calls
  };
}

async function reset(): Promise<void> {
  await prisma.sizzleWish.deleteMany();
  await prisma.sizzleProduct.deleteMany();
  resetCatalogAttemptForTests();
}

describe("Abgleich des Sizzle-Katalogs mit dem Shop (echte DB, Shop gefaket)", () => {
  beforeEach(reset);
  after(async () => {
    setCatalogFetcherForTests(null);
    await reset();
    await prisma.$disconnect();
  });

  it("legt je Variante eine Zeile an", async () => {
    const shop = fakeShop([[product(1, [{ id: 11, title: "500 ml", price: "7.20" }, { id: 12, title: "250 ml", price: "3.99" }]), product(2, [{ id: 21, title: "Default Title", price: "14.70" }])]]);
    setCatalogFetcherForTests(shop.fetcher);
    const result = await syncCatalog();
    assert.deepEqual(result, { total: 3, deactivated: 0 });

    const catalog = await loadCatalog();
    assert.equal(catalog.products.length, 3);
    assert.ok(catalog.syncedAt);
    const sauce = catalog.products.find((entry) => entry.variantTitle === "500 ml");
    assert.equal(sauce?.priceCents, 720);
    assert.equal(sauce?.title, "Produkt 1");
    assert.equal(catalog.products.find((entry) => entry.title === "Produkt 2")?.variantTitle, null);
  });

  it("uebernimmt geaenderte Preise und aktualisiert vorhandene Zeilen statt neue anzulegen", async () => {
    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "500 ml", price: "7.20" }])]]).fetcher);
    await syncCatalog();
    const before = await prisma.sizzleProduct.findUniqueOrThrow({ where: { shopifyVariantId: "11" } });

    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "500 ml", price: "6.49" }], { title: "Neuer Name" })]]).fetcher);
    await syncCatalog();
    const after = await prisma.sizzleProduct.findUniqueOrThrow({ where: { shopifyVariantId: "11" } });
    assert.equal(after.id, before.id);
    assert.equal(after.priceCents, 649);
    assert.equal(after.title, "Neuer Name");
    assert.equal(await prisma.sizzleProduct.count(), 1);
  });

  it("setzt nicht mehr gelieferte Varianten auf inaktiv, loescht sie nie, und reaktiviert sie bei Rueckkehr", async () => {
    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }, { id: 12, title: "B", price: "2.00" }])]]).fetcher);
    await syncCatalog();
    const user = await prisma.user.create({ data: { username: "syncuser", email: "syncuser@example.test", passwordHash: "x", mustChangePassword: false } });
    const gone = await prisma.sizzleProduct.findUniqueOrThrow({ where: { shopifyVariantId: "12" } });
    await prisma.sizzleWish.create({ data: { productId: gone.id, addedByUserId: user.id, addedByName: user.username } });

    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }])]]).fetcher);
    const result = await syncCatalog();
    assert.equal(result.deactivated, 1);
    assert.equal((await prisma.sizzleProduct.findUniqueOrThrow({ where: { shopifyVariantId: "12" } })).active, false);
    assert.equal((await loadCatalog()).products.length, 1, "inaktive Produkte stehen nicht in der Auswahl");
    assert.equal(await prisma.sizzleWish.count(), 1, "der bestehende Wunsch bleibt");

    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }, { id: 12, title: "B", price: "2.50" }])]]).fetcher);
    await syncCatalog();
    const back = await prisma.sizzleProduct.findUniqueOrThrow({ where: { shopifyVariantId: "12" } });
    assert.equal(back.active, true);
    assert.equal(back.priceCents, 250);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("laesst den Katalog unveraendert, wenn der Shop nichts liefert (kein Massen-Deaktivieren bei Ausfall)", async () => {
    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }])]]).fetcher);
    await syncCatalog();

    setCatalogFetcherForTests(fakeShop([[]]).fetcher);
    await assert.rejects(syncCatalog(), (err) => err instanceof AppError && err.code === "UPSTREAM_ERROR");
    assert.equal((await loadCatalog()).products.length, 1);
  });

  it("laesst den Katalog unveraendert, wenn der Abruf fehlschlaegt", async () => {
    setCatalogFetcherForTests(fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }])]]).fetcher);
    await syncCatalog();

    setCatalogFetcherForTests(() => Promise.reject(new AppError("UPSTREAM_ERROR", "Shop nicht erreichbar")));
    await assert.rejects(syncCatalog(), (err) => err instanceof AppError && err.code === "UPSTREAM_ERROR");
    assert.equal((await loadCatalog()).products.length, 1);
  });

  it("holt weitere Seiten, solange die Seite voll ist", async () => {
    const full = Array.from({ length: 250 }, (_, index) => product(1000 + index, [{ id: 50_000 + index, title: "Default Title", price: "1.00" }]));
    const rest = [product(9000, [{ id: 90_000, title: "Default Title", price: "2.00" }])];
    const shop = fakeShop([full, rest]);
    setCatalogFetcherForTests(shop.fetcher);
    const result = await syncCatalog();
    assert.equal(result.total, 251);
    assert.equal(shop.calls(), 2);
  });

  it("teilt sich bei gleichzeitigen Aufrufen einen Lauf", async () => {
    const shop = fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }])]]);
    setCatalogFetcherForTests(shop.fetcher);
    await Promise.all([syncCatalog(), syncCatalog(), syncCatalog()]);
    assert.equal(shop.calls(), 1);
  });

  it("refreshCatalogIfDue haelt die Mindestpause ein", async () => {
    const shop = fakeShop([[product(1, [{ id: 11, title: "A", price: "1.00" }])]]);
    setCatalogFetcherForTests(shop.fetcher);
    assert.equal(await refreshCatalogIfDue(60_000), true);
    assert.equal(await refreshCatalogIfDue(60_000), false);
    assert.equal(shop.calls(), 1);
  });

  it("zaehlt auch einen fehlgeschlagenen Versuch als Pause", async () => {
    let calls = 0;
    setCatalogFetcherForTests(() => {
      calls += 1;
      return Promise.reject(new AppError("UPSTREAM_ERROR", "down"));
    });
    await assert.rejects(refreshCatalogIfDue(60_000));
    assert.equal(await refreshCatalogIfDue(60_000), false);
    assert.equal(calls, 1);
  });
});
