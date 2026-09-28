import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, createSpoolIn, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

// Threat-Model: Ein Betrachter oder ein Nutzer ohne Zugriff auf das Lager der Spule koennte versuchen, eine fremde
// oder nicht zugaengliche Spule ueber "Als geoeffnet markieren" zu manipulieren, oder ueber das Anlegen/Bearbeiten
// den ungeoeffnet-Status einer fremden Spule veraendern. Serverseitig erzwungen: dieselbe EDITOR-Pruefung wie beim
// normalen Bearbeiten (requireAccessToObjectInventory), openedAt wird nie direkt vom Client geschrieben - nur
// serverseitig ueber alreadyOpened (nur beim Anlegen), echte Gewichtsaenderung, AMS-Zuordnung oder diese Route.
describe("Ungeoeffnete Spulen - Negativ-Tests und Ablauf", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let inventoryId = "";
  let materialId = "";
  let manufacturerId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "openededitor");
    viewer = await createLoggedInUser(app, "openedviewer");
    outsider = await createLoggedInUser(app, "openedoutsider");
    const inventory = await createInventoryWithMembers("Ungeoeffnet-Lager", [
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    inventoryId = inventory.id;
    const catalog = await createCatalogEntries();
    materialId = catalog.materialId;
    manufacturerId = catalog.manufacturerId;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  function spoolBody(over: object = {}): object {
    return {
      materialId,
      manufacturerId,
      inventoryId,
      colorName: "Ungeoeffnet-Test",
      colorHex: null,
      initialWeightG: 1000,
      remainingWeightG: 1000,
      purchasePriceCents: null,
      purchasedAt: null,
      location: null,
      ...over
    };
  }

  it("eine neu angelegte Spule ist standardmaessig ungeoeffnet", async () => {
    const res = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody());
    assert.equal(res.status, 201);
    assert.equal(res.body.data.openedAt, null);
  });

  it("alreadyOpened=true legt die Spule sofort als geoeffnet an", async () => {
    const res = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody({ alreadyOpened: true }));
    assert.equal(res.status, 201);
    assert.ok(res.body.data.openedAt !== null);
  });

  it("eine echte Aenderung des Restgewichts (PATCH) macht eine ungeoeffnete Spule geoeffnet", async () => {
    const created = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody());
    const id = created.body.data.id as string;
    assert.equal(created.body.data.openedAt, null);

    const patched = await request(app).patch(`/api/spools/${id}`).set("Cookie", editor.cookie).send({ remainingWeightG: 900 });
    assert.equal(patched.status, 200);
    assert.ok(patched.body.data.openedAt !== null);
  });

  it("ein Bearbeiten OHNE Aenderung des Restgewichts bleibt ungeoeffnet", async () => {
    const created = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody());
    const id = created.body.data.id as string;

    const patched = await request(app).patch(`/api/spools/${id}`).set("Cookie", editor.cookie).send({ location: "Regal C3" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.openedAt, null);
  });

  it("mark-opened: lehnt anonym (401), Betrachter (403) und fremde Spulen (404) ab", async () => {
    const spool = await createSpoolIn(inventoryId, "Fuer-mark-opened");
    assert.equal((await request(app).post(`/api/spools/${spool.id}/mark-opened`)).status, 401);
    assert.equal((await request(app).post(`/api/spools/${spool.id}/mark-opened`).set("Cookie", viewer.cookie)).status, 403);
    assert.equal((await request(app).post(`/api/spools/${spool.id}/mark-opened`).set("Cookie", outsider.cookie)).status, 404);
    assert.equal(
      (await request(app).post("/api/spools/00000000-0000-0000-0000-000000000000/mark-opened").set("Cookie", editor.cookie)).status,
      404
    );
  });

  it("mark-opened: markiert eine ungeoeffnete Spule als geoeffnet, protokolliert es, und ist danach ein No-op", async () => {
    const spool = await createSpoolIn(inventoryId, "Fuer-mark-opened-2");
    assert.equal((await prisma.spool.findUniqueOrThrow({ where: { id: spool.id } })).openedAt, null);

    const res = await request(app).post(`/api/spools/${spool.id}/mark-opened`).set("Cookie", editor.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.openedAt !== null);
    const firstOpenedAt = res.body.data.openedAt;

    const history = await request(app).get(`/api/spools/${spool.id}/history`).set("Cookie", editor.cookie);
    assert.ok(history.body.data.some((row: { action: string; description: string }) => row.action === "EVENT" && row.description.includes("geoeffnet")));

    // Ein zweiter Aufruf aendert nichts mehr (bereits geoeffnet) und legt keinen weiteren Protokoll-Eintrag an
    const second = await request(app).post(`/api/spools/${spool.id}/mark-opened`).set("Cookie", editor.cookie);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.openedAt, firstOpenedAt);
    const historyAfter = await request(app).get(`/api/spools/${spool.id}/history`).set("Cookie", editor.cookie);
    assert.equal(historyAfter.body.data.length, history.body.data.length);
  });
});
