import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

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

  const call = (method: "get" | "post" | "patch" | "delete", url: string, user: TestUser | null, body: object = {}) => {
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
});
