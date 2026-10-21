import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { AppError } from "../../src/lib/apiResult.js";
import { resetCatalogAttemptForTests, setCatalogFetcherForTests } from "../../src/services/sizzleCatalogService.js";
import { createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

const IMAGE = "https://cdn.shopify.com/s/files/1/x/files/sauce.webp?v=1";
const UNKNOWN_ID = "00000000-0000-4000-8000-0000000000aa";

describe("SizzleBrothers-Wunschliste - Negativ-Tests", () => {
  const app = createApp();
  let alice: TestUser;
  let bob: TestUser;
  let carl: TestUser;
  let admin: TestUser;
  let superAdmin: TestUser;
  let sauceId = "";
  let pepperId = "";
  let goneId = "";

  async function resetProducts(): Promise<void> {
    await prisma.sizzleWish.deleteMany();
    await prisma.sizzleProduct.deleteMany();
  }

  async function seedProducts(): Promise<void> {
    const common = { shopifyProductId: "1", handle: "sauce", productType: "Grillsauce", imageUrl: IMAGE, syncedAt: new Date() };
    sauceId = (await prisma.sizzleProduct.create({ data: { ...common, shopifyVariantId: "11", title: "BBQ-Sauce", variantTitle: "500 ml", priceCents: 720 } })).id;
    pepperId = (await prisma.sizzleProduct.create({ data: { ...common, shopifyVariantId: "21", shopifyProductId: "2", handle: "pfeffer", title: "Alter Pfeffer", priceCents: 1299 } })).id;
    goneId = (await prisma.sizzleProduct.create({ data: { ...common, shopifyVariantId: "31", shopifyProductId: "3", handle: "alt", title: "Ausverkauft fuer immer", priceCents: 500, active: false } })).id;
  }

  before(async () => {
    await resetInventoryData();
    await resetProducts();
    alice = await createLoggedInUser(app, "sizalice", "USER", { canUseSizzle: true });
    bob = await createLoggedInUser(app, "sizbob", "USER", { canUseSizzle: true });
    carl = await createLoggedInUser(app, "sizcarl");
    admin = await createLoggedInUser(app, "sizadmin", "ADMIN", { canUseSizzle: true });
    superAdmin = await createLoggedInUser(app, "sizsuper", "ADMIN", { isSuperAdmin: true, canUseSizzle: false });
    await seedProducts();
  });

  after(async () => {
    setCatalogFetcherForTests(null);
    await resetProducts();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const call = (method: "get" | "post" | "patch" | "delete", url: string, user: TestUser | null, body: object = {}) => {
    const req = request(app)[method](url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };
  const createWish = async (user: TestUser, productId: string, extra: object = {}) => {
    const res = await call("post", "/api/sizzle/wishes", user, { productId, ...extra });
    assert.ok(res.status === 200 || res.status === 201, `Wunsch anlegen: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data as { id: string; quantity: number; unitPriceCents: number | null; status: string; inOrder: boolean };
  };
  const ENDPOINTS: [("get" | "post" | "patch" | "delete"), string][] = [
    ["get", "/api/sizzle/products"],
    ["post", "/api/sizzle/products/refresh"],
    ["get", "/api/sizzle/wishes"],
    ["post", "/api/sizzle/wishes"],
    ["patch", "/api/sizzle/wishes/bulk"],
    ["delete", "/api/sizzle/wishes/done"],
    ["patch", `/api/sizzle/wishes/${UNKNOWN_ID}`],
    ["delete", `/api/sizzle/wishes/${UNKNOWN_ID}`]
  ];

  describe("Zugriff (S4-S6, Z6)", () => {
    it("anonym: 401 auf allen Routen", async () => {
      for (const [method, url] of ENDPOINTS) {
        assert.equal((await call(method, url, null)).status, 401, `${method} ${url}`);
      }
    });

    it("ohne Sizzle-Freigabe: 403 auf allen Routen, auch fuer Konten mit Filament-Freigabe", async () => {
      for (const [method, url] of ENDPOINTS) {
        assert.equal((await call(method, url, carl)).status, 403, `${method} ${url}`);
      }
    });

    it("ein Super-Admin hat Zugriff, auch ohne gesetzte Sizzle-Freigabe", async () => {
      assert.equal((await call("get", "/api/sizzle/wishes", superAdmin)).status, 200);
      assert.equal((await call("get", "/api/sizzle/products", superAdmin)).status, 200);
    });
  });

  describe("Katalog (S4)", () => {
    it("liefert aktive Produkte mit kleinem Bild und Preis, ohne interne Felder und ohne inaktive", async () => {
      const res = await call("get", "/api/sizzle/products", alice);
      assert.equal(res.status, 200);
      const titles = res.body.data.products.map((product: { title: string }) => product.title).sort();
      assert.deepEqual(titles, ["Alter Pfeffer", "BBQ-Sauce"]);
      const sauce = res.body.data.products.find((product: { title: string }) => product.title === "BBQ-Sauce");
      assert.equal(sauce.priceCents, 720);
      assert.equal(sauce.imageUrl, `${IMAGE}&width=160`);
      assert.equal(sauce.url, "https://sizzlebrothers.de/products/sauce");
      assert.equal("shopifyVariantId" in sauce, false);
      assert.ok(res.body.data.syncedAt);
    });

    it("Aktualisieren: haelt die Abkuehlzeit ein, der Shop wird nicht bei jedem Tippen abgefragt", async () => {
      let calls = 0;
      setCatalogFetcherForTests(() => {
        calls += 1;
        return Promise.resolve({ products: [{ id: 1, title: "BBQ-Sauce", handle: "sauce", product_type: "Grillsauce", images: [{ src: IMAGE }], variants: [{ id: 11, title: "500 ml", price: "6.99" }] }] });
      });
      resetCatalogAttemptForTests();
      await prisma.sizzleProduct.updateMany({ data: { syncedAt: new Date(Date.now() - 3_600_000) } });

      const first = await call("post", "/api/sizzle/products/refresh", alice);
      assert.equal(first.status, 200);
      assert.equal(calls, 1);
      assert.equal(first.body.data.products.find((product: { title: string }) => product.title === "BBQ-Sauce").priceCents, 699);

      const second = await call("post", "/api/sizzle/products/refresh", bob);
      assert.equal(second.status, 200);
      assert.equal(calls, 1, "innerhalb der Mindestpause kein zweiter Abruf");

      await prisma.sizzleProduct.update({ where: { id: sauceId }, data: { priceCents: 720 } });
    });

    it("meldet 502, wenn der Katalog leer ist und der Shop nicht antwortet", async () => {
      await resetProducts();
      setCatalogFetcherForTests(() => Promise.reject(new AppError("UPSTREAM_ERROR", "Shop nicht erreichbar")));
      resetCatalogAttemptForTests();
      const res = await call("get", "/api/sizzle/products", alice);
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, "UPSTREAM_ERROR");
      assert.equal(JSON.stringify(res.body).includes("stack"), false);
      setCatalogFetcherForTests(null);
      await seedProducts();
    });
  });

  describe("Wuensche anlegen und lesen (S5)", () => {
    it("legt einen Wunsch an, alle Freigegebenen sehen ihn mit Ersteller und Produkt", async () => {
      const res = await call("post", "/api/sizzle/wishes", alice, { productId: sauceId, quantity: 2, note: "scharf" });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.addedByName, "sizalice");
      assert.equal(res.body.data.status, "OPEN");
      assert.equal(res.body.data.inOrder, false);
      assert.equal(res.body.data.unitPriceCents, null);
      assert.equal(res.body.data.product.title, "BBQ-Sauce");
      assert.equal(res.body.data.product.priceCents, 720);

      const list = await call("get", "/api/sizzle/wishes", bob);
      assert.equal(list.status, 200);
      assert.ok(list.body.data.some((wish: { id: string }) => wish.id === res.body.data.id));
    });

    it("fasst denselben offenen Wunsch derselben Person zusammen (Menge steigt), nicht den einer anderen", async () => {
      const first = await createWish(alice, pepperId, { quantity: 1 });
      const again = await createWish(alice, pepperId, { quantity: 3 });
      assert.equal(again.id, first.id);
      assert.equal(again.quantity, 4);
      const bobs = await createWish(bob, pepperId, { quantity: 1 });
      assert.notEqual(bobs.id, first.id);
    });

    it("lehnt Unsinn ab: unbekanntes/inaktives Produkt, Menge 0 oder 1000, keine UUID (400)", async () => {
      assert.equal((await call("post", "/api/sizzle/wishes", alice, { productId: UNKNOWN_ID })).status, 400);
      assert.equal((await call("post", "/api/sizzle/wishes", alice, { productId: goneId })).status, 400);
      assert.equal((await call("post", "/api/sizzle/wishes", alice, { productId: sauceId, quantity: 0 })).status, 400);
      assert.equal((await call("post", "/api/sizzle/wishes", alice, { productId: sauceId, quantity: 1000 })).status, 400);
      assert.equal((await call("post", "/api/sizzle/wishes", alice, { productId: "kaputt" })).status, 400);
      assert.equal((await call("post", "/api/sizzle/wishes", alice, {})).status, 400);
    });

    it("die Menge ueberschreitet beim Zusammenfassen nie 999", async () => {
      const wish = await createWish(admin, sauceId, { quantity: 998 });
      const merged = await createWish(admin, sauceId, { quantity: 5 });
      assert.equal(merged.id, wish.id);
      assert.equal(merged.quantity, 999);
      await call("delete", `/api/sizzle/wishes/${wish.id}`, admin);
    });
  });

  describe("Inhalt nur Ersteller oder Admin, Status/Bestellliste/Preis alle (S6)", () => {
    it("ein anderer Nutzer darf Produkt/Menge/Notiz eines fremden Wunsches weder aendern noch loeschen (403)", async () => {
      const wish = await createWish(alice, sauceId);
      const original = await prisma.sizzleWish.findUniqueOrThrow({ where: { id: wish.id } });
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { quantity: 50 })).status, 403);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { note: "uebernommen" })).status, 403);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { productId: pepperId })).status, 403);
      assert.equal((await call("delete", `/api/sizzle/wishes/${wish.id}`, bob)).status, 403);
      const stored = await prisma.sizzleWish.findUniqueOrThrow({ where: { id: wish.id } });
      assert.equal(stored.quantity, original.quantity);
      assert.equal(stored.note, original.note);
      assert.equal(stored.productId, original.productId);
    });

    it("der Ersteller aendert den eigenen Wunsch, ein Admin loescht ihn", async () => {
      const wish = await createWish(alice, sauceId);
      const edited = await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { quantity: 6, note: "mehr" });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.quantity, 6);
      assert.equal((await call("delete", `/api/sizzle/wishes/${wish.id}`, admin)).status, 200);
    });

    it("beim Aendern auf ein inaktives oder unbekanntes Produkt: 400", async () => {
      const wish = await createWish(bob, sauceId);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { productId: goneId })).status, 400);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { productId: UNKNOWN_ID })).status, 400);
    });

    it("jeder Freigegebene setzt den Status auch bei fremden Wuenschen, aber nie zusammen mit Inhalt", async () => {
      const wish = await createWish(alice, sauceId);
      const ordered = await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { status: "ORDERED" });
      assert.equal(ordered.status, 200);
      assert.equal(ordered.body.data.status, "ORDERED");
      assert.equal(ordered.body.data.updatedByName, "sizbob");
      assert.equal(ordered.body.data.quantity, wish.quantity, "Menge blieb unveraendert");
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { status: "DONE", quantity: 99 })).status, 403);
      assert.equal((await prisma.sizzleWish.findUniqueOrThrow({ where: { id: wish.id } })).status, "ORDERED");
    });

    it("unbekannte ID: 404, keine UUID: 400, ungueltiger Status: 400", async () => {
      assert.equal((await call("patch", `/api/sizzle/wishes/${UNKNOWN_ID}`, alice, { status: "DONE" })).status, 404);
      assert.equal((await call("delete", `/api/sizzle/wishes/${UNKNOWN_ID}`, alice)).status, 404);
      assert.equal((await call("patch", "/api/sizzle/wishes/nix", alice, { status: "DONE" })).status, 400);
      const wish = await createWish(alice, pepperId);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { status: "ERLEDIGT" })).status, 400);
    });
  });

  describe("Bestellliste und massgeblicher Preis (S7)", () => {
    it("friert beim Aufnehmen den Shop-Preis ein; ein spaeter geaenderter Shop-Preis aendert den Wunsch nicht", async () => {
      const wish = await createWish(alice, sauceId);
      const inOrder = await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { inOrder: true });
      assert.equal(inOrder.status, 200);
      assert.equal(inOrder.body.data.inOrder, true);
      assert.equal(inOrder.body.data.unitPriceCents, 720);

      await prisma.sizzleProduct.update({ where: { id: sauceId }, data: { priceCents: 999 } });
      const list = await call("get", "/api/sizzle/wishes", alice);
      const same = list.body.data.find((entry: { id: string }) => entry.id === wish.id);
      assert.equal(same.unitPriceCents, 720);
      assert.equal(same.product.priceCents, 999);
      await prisma.sizzleProduct.update({ where: { id: sauceId }, data: { priceCents: 720 } });
    });

    it("jeder Freigegebene aendert den Preis in der Bestellliste (Rabatt), auch bei fremden Wuenschen", async () => {
      const wish = await createWish(alice, pepperId);
      await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { inOrder: true });
      const discounted = await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { unitPriceCents: 1100 });
      assert.equal(discounted.status, 200);
      assert.equal(discounted.body.data.unitPriceCents, 1100);
      assert.equal(discounted.body.data.product.priceCents, 1299, "der Shop-Preis des Produkts bleibt");

      const mixed = await call("patch", `/api/sizzle/wishes/${wish.id}`, bob, { unitPriceCents: 1000, quantity: 7 });
      assert.equal(mixed.status, 403, "Preis zusammen mit Inhalt eines fremden Wunsches");
    });

    it("ein geleerter Preis in der Bestellliste fuehrt zurueck auf den aktuellen Shop-Preis", async () => {
      const wish = await createWish(alice, pepperId);
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { inOrder: true });
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { unitPriceCents: 100 });
      const reset = await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { unitPriceCents: null });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.data.unitPriceCents, 1299);
    });

    it("beim Entfernen aus der Bestellliste faellt der Preis weg; ausserhalb gibt es keinen Preis (400)", async () => {
      const wish = await createWish(alice, pepperId);
      assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { unitPriceCents: 500 })).status, 400);
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { inOrder: true });
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { unitPriceCents: 500 });
      const out = await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { inOrder: false });
      assert.equal(out.body.data.unitPriceCents, null);
      assert.equal(out.body.data.inOrder, false);
    });

    it("lehnt ungueltige Preise ab (negativ, Dezimal, Text, zu gross): 400", async () => {
      const wish = await createWish(alice, pepperId);
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { inOrder: true });
      for (const price of [-1, 12.5, "7", 1_000_001, true]) {
        assert.equal((await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { unitPriceCents: price })).status, 400, String(price));
      }
    });

    it("ein Produkt-Wechsel in der Bestellliste friert den Preis des neuen Produkts ein", async () => {
      const wish = await createWish(alice, sauceId);
      await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { inOrder: true });
      const switched = await call("patch", `/api/sizzle/wishes/${wish.id}`, alice, { productId: pepperId });
      assert.equal(switched.status, 200);
      assert.equal(switched.body.data.unitPriceCents, 1299);
    });
  });

  describe("Sammel-Route (S7)", () => {
    it("setzt Status, Bestellliste und Preis fuer mehrere Wuensche; Preise werden je Produkt eingefroren", async () => {
      const first = await createWish(alice, sauceId);
      const second = await createWish(bob, pepperId);
      const res = await call("patch", "/api/sizzle/wishes/bulk", bob, { ids: [first.id, second.id], inOrder: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.updated, 2);
      const rows = await prisma.sizzleWish.findMany({ where: { id: { in: [first.id, second.id] } } });
      assert.deepEqual(rows.map((row) => row.unitPriceCents).sort((x, y) => (x ?? 0) - (y ?? 0)), [720, 1299]);

      const priced = await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [first.id, second.id], unitPriceCents: 650 });
      assert.equal(priced.status, 200);
      assert.deepEqual(
        (await prisma.sizzleWish.findMany({ where: { id: { in: [first.id, second.id] } } })).map((row) => row.unitPriceCents),
        [650, 650]
      );

      const status = await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [first.id, second.id], status: "ORDERED" });
      assert.equal(status.body.data.updated, 2);
      const out = await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [first.id], inOrder: false });
      assert.equal(out.status, 200);
      assert.equal((await prisma.sizzleWish.findUniqueOrThrow({ where: { id: first.id } })).unitPriceCents, null);
    });

    it("ein Preis gilt nur fuer Wuensche in der Bestellliste, fuer andere wird er ignoriert", async () => {
      const outside = await createWish(alice, sauceId);
      await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [outside.id], inOrder: false });
      const res = await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [outside.id], unitPriceCents: 1 });
      assert.equal(res.status, 200);
      assert.equal((await prisma.sizzleWish.findUniqueOrThrow({ where: { id: outside.id } })).unitPriceCents, null);
    });

    it("kennt keinen Inhalt: Menge/Notiz/Produkt/unbekannte Felder -> 400 (sonst liesse sich die Ersteller-Pruefung umgehen)", async () => {
      const wish = await createWish(alice, sauceId);
      for (const extra of [{ quantity: 99 }, { note: "x" }, { productId: pepperId }, { addedByName: "bob" }, { title: "x" }]) {
        const res = await call("patch", "/api/sizzle/wishes/bulk", bob, { ids: [wish.id], status: "DONE", ...extra });
        assert.equal(res.status, 400, JSON.stringify(extra));
      }
      assert.equal((await prisma.sizzleWish.findUniqueOrThrow({ where: { id: wish.id } })).status, "OPEN");
    });

    it("lehnt leere/zu lange/ungueltige ID-Listen, fehlende Aenderung, falschen Status und krumme Preise ab (400)", async () => {
      const wish = await createWish(alice, sauceId);
      const tooMany = Array.from({ length: 501 }, () => wish.id);
      const bad: object[] = [
        { ids: [], status: "DONE" },
        { ids: tooMany, status: "DONE" },
        { ids: ["nix"], status: "DONE" },
        { ids: [wish.id] },
        { ids: [wish.id], status: "ERLEDIGT" },
        { ids: [wish.id], inOrder: "ja" },
        { ids: [wish.id], unitPriceCents: -5 },
        { ids: [wish.id], unitPriceCents: 0.5 },
        { status: "DONE" }
      ];
      for (const body of bad) {
        assert.equal((await call("patch", "/api/sizzle/wishes/bulk", alice, body)).status, 400, JSON.stringify(body).slice(0, 60));
      }
    });

    it("unbekannte IDs zaehlen nicht mit", async () => {
      const wish = await createWish(alice, sauceId);
      const res = await call("patch", "/api/sizzle/wishes/bulk", alice, { ids: [wish.id, UNKNOWN_ID], status: "OPEN" });
      assert.equal(res.body.data.updated, 1);
    });
  });

  describe("Aufraeumen (S6)", () => {
    it("entfernt nur erledigte Wuensche, auch die anderer Nutzer", async () => {
      await prisma.sizzleWish.deleteMany();
      const done = await createWish(alice, sauceId);
      const open = await createWish(alice, pepperId);
      await call("patch", `/api/sizzle/wishes/${done.id}`, bob, { status: "DONE" });
      const res = await call("delete", "/api/sizzle/wishes/done", bob);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.deleted, 1);
      assert.equal(await prisma.sizzleWish.count({ where: { id: done.id } }), 0);
      assert.equal(await prisma.sizzleWish.count({ where: { id: open.id } }), 1);
    });
  });

  describe("Daten bleiben erhalten (S2)", () => {
    it("ein Produkt mit Wuenschen kann nicht versehentlich geloescht werden (Restrict)", async () => {
      const wish = await createWish(alice, sauceId);
      await assert.rejects(prisma.sizzleProduct.delete({ where: { id: sauceId } }));
      assert.equal(await prisma.sizzleWish.count({ where: { id: wish.id } }), 1);
    });

    it("ein geloeschter Benutzer laesst seine Wuensche mit Namen stehen (fuer die Abrechnung)", async () => {
      const dave = await createLoggedInUser(app, "sizdave", "USER", { canUseSizzle: true });
      const wish = await createWish(dave, pepperId);
      await prisma.user.delete({ where: { id: dave.id } });
      const stored = await prisma.sizzleWish.findUniqueOrThrow({ where: { id: wish.id } });
      assert.equal(stored.addedByName, "sizdave");
      assert.equal(stored.addedByUserId, null);
    });
  });
});
