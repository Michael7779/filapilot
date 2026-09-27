import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

// Threat-Model: Ein Bearbeiter/Betrachter oder ein Nutzer ohne jeden Zugriff auf das Lager koennte versuchen, dessen
// Protokoll zu lesen; ein Besitzer koennte versuchen, ueber Filter an Eintraege eines fremden Lagers oder an
// admin-weite Bereiche (Nutzerverwaltung, Einstellungen) zu kommen. Serverseitig erzwungen: Rolle OWNER im Lager
// (fremd 404, Bearbeiter/Betrachter 403); "inventoryId" ist serverseitig fest gesetzt (listInventoryAudit), ein
// mitgeschickter inventoryId-Filter aus der Anfrage wird ignoriert.
describe("Lager-Protokoll fuer Besitzer (OP-L5) - Negativ-Tests", () => {
  const app = createApp();
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "auditowner");
    editor = await createLoggedInUser(app, "auditeditor");
    viewer = await createLoggedInUser(app, "auditviewer");
    outsider = await createLoggedInUser(app, "auditoutsider");
    const lager = await createInventoryWithMembers("Protokoll-Lager", [
      { userId: owner.id, role: "OWNER" },
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    lagerId = lager.id;
    otherLagerId = (await createInventoryWithMembers("Protokoll-Fremd", [{ userId: outsider.id, role: "OWNER" }])).id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const get = (id: string, user: TestUser | null, query = "") => {
    const req = request(app).get(`/api/inventories/${id}/audit-log${query}`);
    return user ? req.set("Cookie", user.cookie) : req;
  };

  it("lehnt anonyme Zugriffe ab (401), Fremde (404) und Bearbeiter/Betrachter (403)", async () => {
    assert.equal((await get(lagerId, null)).status, 401);
    assert.equal((await get(lagerId, outsider)).status, 404);
    assert.equal((await get(lagerId, editor)).status, 403);
    assert.equal((await get(lagerId, viewer)).status, 403);
  });

  it("zeigt dem Besitzer nur Eintraege dieses Lagers, mit Vorher/Nachher-Werten", async () => {
    const catalog = await createCatalogEntries();
    const created = await request(app)
      .post("/api/spools")
      .set("Cookie", editor.cookie)
      .send({
        materialId: catalog.materialId,
        manufacturerId: catalog.manufacturerId,
        inventoryId: lagerId,
        colorName: "Protokoll-Test",
        colorHex: null,
        initialWeightG: 1000,
        remainingWeightG: 1000,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    assert.equal(created.status, 201);

    const res = await get(lagerId, owner);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.length >= 1);
    const entry = res.body.data.items.find((row: { entityId: string }) => row.entityId === created.body.data.id);
    assert.ok(entry);
    assert.equal(entry.action, "CREATE");
    assert.equal(entry.after.colorName, "Protokoll-Test");

    // Kein Eintrag des fremden Lagers taucht auf, egal was gefiltert wird.
    assert.ok(res.body.data.items.every((row: { inventoryId: string | null }) => row.inventoryId === lagerId));
  });

  it("ein inventoryId-Filter aus der Anfrage wird ignoriert - es bleibt immer nur dieses eine Lager", async () => {
    const res = await get(lagerId, owner, `?inventoryId=${otherLagerId}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.every((row: { inventoryId: string | null }) => row.inventoryId === lagerId));
  });

  it("weist ungueltige Filter ab (400) und liefert keine admin-weiten Auswahllisten", async () => {
    assert.equal((await get(lagerId, owner, "?pageSize=7")).status, 400);
    const res = await get(lagerId, owner);
    assert.equal("usernames" in res.body.data, false);
    assert.equal("inventories" in res.body.data, false);
  });

  it("ein Admin (ohne Mitgliedschaft) darf ebenfalls lesen, wie ein Besitzer", async () => {
    const globalAdmin = await createLoggedInUser(app, "auditglobaladmin", "ADMIN");
    assert.equal((await get(lagerId, globalAdmin)).status, 200);
  });
});
