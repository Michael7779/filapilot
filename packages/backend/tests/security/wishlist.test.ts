import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

describe("Wunschliste (instanzweit) - Negativ-Tests", () => {
  const app = createApp();
  let alice: TestUser;
  let bob: TestUser;
  let admin: TestUser;

  before(async () => {
    await resetInventoryData();
    alice = await createLoggedInUser(app, "wishalice");
    bob = await createLoggedInUser(app, "wishbob");
    admin = await createLoggedInUser(app, "wishadmin", "ADMIN");
  });

  after(async () => {
    await prisma.wishlistItem.deleteMany();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const call = (method: "get" | "post" | "patch" | "put" | "delete", url: string, user: TestUser | null, body: object = {}) => {
    const req = request(app)[method](url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await call("get", "/api/wishlist", null)).status, 401);
    assert.equal((await call("post", "/api/wishlist", null, { title: "Test" })).status, 401);
  });

  it("legt einen Wunsch an und zeigt, wer ihn hinzugefuegt hat", async () => {
    const res = await call("post", "/api/wishlist", alice, { title: "Bambu PETG-CF Schwarz", quantity: 2, note: "1kg-Spule" });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.addedByName, "wishalice");
    assert.equal(res.body.data.status, "OPEN");
    assert.equal(res.body.data.quantity, 2);

    const list = await call("get", "/api/wishlist", bob);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.some((item: { title: string }) => item.title === "Bambu PETG-CF Schwarz"));
  });

  it("weist ein leeres Wunsch-Titel ab (400)", async () => {
    assert.equal((await call("post", "/api/wishlist", alice, { title: "" })).status, 400);
  });

  it("nur Ersteller oder Admin duerfen Titel/Notiz/Menge aendern oder loeschen (403 fuer andere)", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Nur Alice" });
    const id = created.body.data.id;

    const bobEdits = await call("patch", `/api/wishlist/${id}`, bob, { title: "Uebernommen" });
    assert.equal(bobEdits.status, 403);
    const bobDeletes = await call("delete", `/api/wishlist/${id}`, bob);
    assert.equal(bobDeletes.status, 403);

    const aliceEdits = await call("patch", `/api/wishlist/${id}`, alice, { title: "Von Alice geaendert" });
    assert.equal(aliceEdits.status, 200);
    assert.equal(aliceEdits.body.data.title, "Von Alice geaendert");

    const adminDeletes = await call("delete", `/api/wishlist/${id}`, admin);
    assert.equal(adminDeletes.status, 200);
  });

  it("jeder aktive Nutzer darf den Status setzen (Sammelbestellung), auch bei fremden Wuenschen", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Gemeinsam bestellen" });
    const id = created.body.data.id;

    const bobMarksOrdered = await call("patch", `/api/wishlist/${id}`, bob, { status: "ORDERED" });
    assert.equal(bobMarksOrdered.status, 200);
    assert.equal(bobMarksOrdered.body.data.status, "ORDERED");
    assert.equal(bobMarksOrdered.body.data.updatedByName, "wishbob");
    // Titel blieb dabei unveraendert (Bob durfte nur den Status setzen)
    assert.equal(bobMarksOrdered.body.data.title, "Gemeinsam bestellen");
  });

  it("weist einen ungueltigen Status ab (400)", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Status-Test" });
    assert.equal((await call("patch", `/api/wishlist/${created.body.data.id}`, alice, { status: "UNBEKANNT" })).status, 400);
  });

  it("entfernt erledigte Eintraege auf einmal, laesst offene/bestellte stehen, anonym 401", async () => {
    assert.equal((await call("delete", "/api/wishlist/done", null)).status, 401);

    const open = await call("post", "/api/wishlist", alice, { title: "Bleibt offen" });
    const done1 = await call("post", "/api/wishlist", alice, { title: "Erledigt 1" });
    const done2 = await call("post", "/api/wishlist", bob, { title: "Erledigt 2" });
    await call("patch", `/api/wishlist/${done1.body.data.id}`, alice, { status: "DONE" });
    // Bob darf auch fremde Eintraege auf erledigt setzen (Status ist fuer alle offen) und spaeter Alice' Aufraeumen nutzen
    await call("patch", `/api/wishlist/${done2.body.data.id}`, bob, { status: "DONE" });

    const result = await call("delete", "/api/wishlist/done", bob);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.deleted, 2);
    assert.equal(await prisma.wishlistItem.count({ where: { id: done1.body.data.id } }), 0);
    assert.equal(await prisma.wishlistItem.count({ where: { id: done2.body.data.id } }), 0);
    assert.equal(await prisma.wishlistItem.count({ where: { id: open.body.data.id } }), 1);

    const again = await call("delete", "/api/wishlist/done", alice);
    assert.deepEqual(again.body.data, { deleted: 0 });
  });

  it("speichert einen optionalen Verweis auf Hersteller/Material, zeigt deren Namen, und weist unbekannte IDs ab (400)", async () => {
    const catalog = await createCatalogEntries();
    const created = await call("post", "/api/wishlist", alice, {
      title: "Mit Verweis",
      manufacturerId: catalog.manufacturerId,
      materialId: catalog.materialId
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.manufacturerId, catalog.manufacturerId);
    assert.equal(created.body.data.materialName, "Test PLA");

    const unknown = await call("post", "/api/wishlist", alice, { title: "Unbekannt", manufacturerId: "00000000-0000-0000-0000-000000000000" });
    assert.equal(unknown.status, 400);

    // Aendern des Verweises ist Inhalt - nur Ersteller/Admin, wie Titel/Notiz/Menge.
    const forbidden = await call("patch", `/api/wishlist/${created.body.data.id}`, bob, { materialId: null });
    assert.equal(forbidden.status, 403);
    const cleared = await call("patch", `/api/wishlist/${created.body.data.id}`, alice, { materialId: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.materialId, null);
    assert.equal(cleared.body.data.materialName, null);
  });

  it("speichert eine optionale Wunschfarbe (Name + Farbwert), weist ungueltige Werte ab (400), Aendern nur Ersteller/Admin (403)", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Mit Farbe", colorName: "Bambu-Grün", colorHex: "#00AE42" });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.colorName, "Bambu-Grün");
    assert.equal(created.body.data.colorHex, "#00AE42");

    const withoutColor = await call("post", "/api/wishlist", alice, { title: "Ohne Farbe" });
    assert.equal(withoutColor.body.data.colorName, null);
    assert.equal(withoutColor.body.data.colorHex, null);

    const badHex = await call("post", "/api/wishlist", alice, { title: "Kaputt", colorName: "Rot", colorHex: "rot" });
    assert.equal(badHex.status, 400);
    const longName = await call("post", "/api/wishlist", alice, { title: "Kaputt", colorName: "x".repeat(61) });
    assert.equal(longName.status, 400);

    // Die Farbe ist Inhalt wie Titel/Notiz/Menge - fremde Nutzer duerfen sie nicht aendern.
    const forbidden = await call("patch", `/api/wishlist/${created.body.data.id}`, bob, { colorName: null, colorHex: null });
    assert.equal(forbidden.status, 403);
    const cleared = await call("patch", `/api/wishlist/${created.body.data.id}`, alice, { colorName: null, colorHex: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.colorName, null);
    assert.equal(cleared.body.data.colorHex, null);
  });

  it("Bestellliste: neuer Wunsch ist nicht ausgewaehlt, jeder aktive Nutzer darf die Auswahl setzen, Typfehler 400", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Auswahl-Test" });
    assert.equal(created.body.data.inOrder, false);
    const id = created.body.data.id;

    // Bob ist nicht Ersteller, darf aber (wie beim Status) die Sammelbestellung mitgestalten - Inhalt bleibt unberuehrt
    const bobSelects = await call("patch", `/api/wishlist/${id}`, bob, { inOrder: true });
    assert.equal(bobSelects.status, 200);
    assert.equal(bobSelects.body.data.inOrder, true);
    assert.equal(bobSelects.body.data.title, "Auswahl-Test");

    // Die Auswahl schleust keinen Inhalt durch: Bob darf mit inOrder zusammen keinen Titel aendern
    const smuggled = await call("patch", `/api/wishlist/${id}`, bob, { inOrder: false, title: "Uebernommen" });
    assert.equal(smuggled.status, 403);
    assert.equal((await prisma.wishlistItem.findUniqueOrThrow({ where: { id } })).inOrder, true);

    assert.equal((await call("patch", `/api/wishlist/${id}`, alice, { inOrder: "ja" })).status, 400);
    assert.equal((await call("patch", `/api/wishlist/${id}`, null, { inOrder: false })).status, 401);
  });

  it("Sammel-Route: setzt Auswahl und Status fuer mehrere Wuensche auf einmal, jeder aktive Nutzer, anonym 401", async () => {
    const first = await call("post", "/api/wishlist", alice, { title: "Sammel 1" });
    const second = await call("post", "/api/wishlist", alice, { title: "Sammel 2" });
    const untouched = await call("post", "/api/wishlist", alice, { title: "Sammel unberuehrt" });
    const ids = [first.body.data.id, second.body.data.id];

    assert.equal((await call("patch", "/api/wishlist/bulk", null, { ids, inOrder: true })).status, 401);

    const select = await call("patch", "/api/wishlist/bulk", bob, { ids, inOrder: true });
    assert.equal(select.status, 200);
    assert.deepEqual(select.body.data, { updated: 2 });

    const ordered = await call("patch", "/api/wishlist/bulk", bob, { ids, status: "ORDERED" });
    assert.equal(ordered.status, 200);
    const rows = await prisma.wishlistItem.findMany({ where: { id: { in: ids } } });
    assert.ok(rows.every((row) => row.inOrder && row.status === "ORDERED" && row.updatedByName === "wishbob"));
    const other = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: untouched.body.data.id } });
    assert.equal(other.inOrder, false);
    assert.equal(other.status, "OPEN");

    const deselect = await call("patch", "/api/wishlist/bulk", alice, { ids, inOrder: false });
    assert.deepEqual(deselect.body.data, { updated: 2 });

    // Preis je Spule fuer eine zusammengefasste Zeile: gilt fuer alle genannten Wuensche, nur fuer diese
    const priced = await call("patch", "/api/wishlist/bulk", bob, { ids, unitPriceCents: 1999 });
    assert.deepEqual(priced.body.data, { updated: 2 });
    const pricedRows = await prisma.wishlistItem.findMany({ where: { id: { in: ids } } });
    assert.ok(pricedRows.every((row) => row.unitPriceCents === 1999));
    assert.equal((await prisma.wishlistItem.findUniqueOrThrow({ where: { id: untouched.body.data.id } })).unitPriceCents, null);
    const unpriced = await call("patch", "/api/wishlist/bulk", bob, { ids, unitPriceCents: null });
    assert.equal(unpriced.status, 200);
    assert.equal((await prisma.wishlistItem.findUniqueOrThrow({ where: { id: ids[0] } })).unitPriceCents, null);
  });

  it("Sammel-Route: weist ungueltige Eingaben ab (400) und aendert keinen Inhalt fremder Wuensche", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Bleibt wie es ist", quantity: 2 });
    const id = created.body.data.id;
    const valid = "00000000-0000-4000-8000-000000000000";

    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [], inOrder: true })).status, 400);
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: ["keine-uuid"], inOrder: true })).status, 400);
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [valid] })).status, 400);
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [valid], status: "UNBEKANNT" })).status, 400);
    for (const badPrice of [-1, 12.5, "12", 1_000_001]) {
      assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [valid], unitPriceCents: badPrice })).status, 400, String(badPrice));
    }
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: Array(501).fill(valid), inOrder: true })).status, 400);

    // Inhaltsfelder sind in der Sammel-Route nicht erlaubt - sonst koennte man Titel/Menge fremder Wuensche umgehen
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [id], title: "Uebernommen" })).status, 400);
    assert.equal((await call("patch", "/api/wishlist/bulk", bob, { ids: [id], quantity: 99 })).status, 400);
    const row = await prisma.wishlistItem.findUniqueOrThrow({ where: { id } });
    assert.equal(row.title, "Bleibt wie es ist");
    assert.equal(row.quantity, 2);

    // Unbekannte IDs werden einfach nicht mitgezaehlt
    const unknown = await call("patch", "/api/wishlist/bulk", bob, { ids: [valid], inOrder: true });
    assert.deepEqual(unknown.body.data, { updated: 0 });
  });

  it("Einzelpreis: jeder aktive Nutzer darf ihn setzen und loeschen, ohne Inhalt zu aendern; ungueltige Betraege 400, anonym 401", async () => {
    const created = await call("post", "/api/wishlist", alice, { title: "Preis-Test", quantity: 2 });
    const id = created.body.data.id;
    assert.equal(created.body.data.unitPriceCents, null);

    const bobPrices = await call("patch", `/api/wishlist/${id}`, bob, { unitPriceCents: 1999 });
    assert.equal(bobPrices.status, 200);
    assert.equal(bobPrices.body.data.unitPriceCents, 1999);
    assert.equal(bobPrices.body.data.title, "Preis-Test");
    assert.equal(bobPrices.body.data.quantity, 2);

    // Der Preis schleust keinen Inhalt durch (Titel/Menge fremder Wuensche bleiben bei Ersteller/Admin)
    const smuggled = await call("patch", `/api/wishlist/${id}`, bob, { unitPriceCents: 1, quantity: 99 });
    assert.equal(smuggled.status, 403);
    assert.equal((await prisma.wishlistItem.findUniqueOrThrow({ where: { id } })).unitPriceCents, 1999);

    for (const bad of [-1, 12.5, "12", 1_000_001]) {
      assert.equal((await call("patch", `/api/wishlist/${id}`, bob, { unitPriceCents: bad })).status, 400, String(bad));
    }
    assert.equal((await call("patch", `/api/wishlist/${id}`, null, { unitPriceCents: 5 })).status, 401);

    const cleared = await call("patch", `/api/wishlist/${id}`, bob, { unitPriceCents: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.unitPriceCents, null);
  });

  it("Nebenkosten je Hersteller: anonym 401, jeder aktive Nutzer darf setzen, ungueltige Eingaben 400, unbekannter Hersteller 404", async () => {
    const { manufacturerId } = await createCatalogEntries();
    const url = `/api/wishlist/costs/${manufacturerId}`;

    assert.equal((await call("get", "/api/wishlist/costs", null)).status, 401);
    assert.equal((await call("put", url, null, { shippingCents: 500, discountCents: 0 })).status, 401);

    const set = await call("put", url, bob, { shippingCents: 695, discountCents: 100 });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body.data, { manufacturerId, shippingCents: 695, discountCents: 100 });

    // zweites Setzen ueberschreibt, legt keine zweite Zeile an
    await call("put", url, alice, { shippingCents: 400, discountCents: 0 });
    assert.equal(await prisma.wishlistOrderCost.count({ where: { manufacturerId } }), 1);
    const list = await call("get", "/api/wishlist/costs", alice);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data.filter((entry: { manufacturerId: string }) => entry.manufacturerId === manufacturerId),
      [{ manufacturerId, shippingCents: 400, discountCents: 0 }]
    );

    for (const bad of [{ shippingCents: -1, discountCents: 0 }, { shippingCents: 1.5, discountCents: 0 }, { shippingCents: "5", discountCents: 0 }, { shippingCents: 0 }, { shippingCents: 1_000_001, discountCents: 0 }]) {
      assert.equal((await call("put", url, bob, bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call("put", url, bob, { shippingCents: 0, discountCents: 0, manufacturerId: "x" })).status, 400);
    assert.equal((await call("put", "/api/wishlist/costs/keine-uuid", bob, { shippingCents: 0, discountCents: 0 })).status, 400);
    const unknown = "00000000-0000-4000-8000-000000000000";
    assert.equal((await call("put", `/api/wishlist/costs/${unknown}`, bob, { shippingCents: 0, discountCents: 0 })).status, 404);
  });

  it("Aufraeumen erledigter Eintraege loescht die Nebenkosten von Herstellern ohne verbleibende Eintraege, nicht die anderen", async () => {
    const { manufacturerId } = await createCatalogEntries();
    const other = await prisma.manufacturer.upsert({ where: { name: "Anderer Hersteller" }, update: {}, create: { name: "Anderer Hersteller" } });
    await call("put", `/api/wishlist/costs/${manufacturerId}`, alice, { shippingCents: 300, discountCents: 0 });
    await call("put", `/api/wishlist/costs/${other.id}`, alice, { shippingCents: 700, discountCents: 0 });

    const finished = await call("post", "/api/wishlist", alice, { title: "Fertig", manufacturerId });
    await call("patch", `/api/wishlist/${finished.body.data.id}`, alice, { status: "DONE" });
    await call("post", "/api/wishlist", alice, { title: "Noch offen", manufacturerId: other.id });

    await prisma.wishlistItem.deleteMany({ where: { manufacturerId, id: { not: finished.body.data.id } } });
    assert.equal((await call("delete", "/api/wishlist/done", bob)).status, 200);

    assert.equal(await prisma.wishlistOrderCost.count({ where: { manufacturerId } }), 0);
    assert.equal(await prisma.wishlistOrderCost.count({ where: { manufacturerId: other.id } }), 1);
  });
});
