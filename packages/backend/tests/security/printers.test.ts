import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { disconnectAllPrinters } from "../../src/services/printerRuntime.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Printers - Negativ-Tests (Rechte im Lager)", () => {
  const app = createApp();
  let admin: TestUser;
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";
  let serialCounter = 0;

  const printerBody = (inventoryId: string) => {
    serialCounter += 1;
    return {
      name: "Werkstatt",
      ipAddress: "192.0.2.50",
      serialNumber: `TEST-SN-${Date.now()}-${serialCounter}`,
      accessCode: "12345678",
      syncMode: "LIVE",
      syncIntervalSeconds: 60,
      inventoryId
    };
  };

  before(async () => {
    await resetInventoryData();
    admin = await createLoggedInUser(app, "printadmin", "ADMIN");
    owner = await createLoggedInUser(app, "printowner");
    editor = await createLoggedInUser(app, "printeditor");
    viewer = await createLoggedInUser(app, "printviewer");
    outsider = await createLoggedInUser(app, "printoutsider");
    lagerId = (
      await createInventoryWithMembers("Druck-Lager", [
        { userId: owner.id, role: "OWNER" },
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    otherLagerId = (await createInventoryWithMembers("Anderes Lager", [{ userId: outsider.id, role: "OWNER" }])).id;
  });

  after(async () => {
    // POST /api/printers baut sofort eine (Hintergrund-)MQTT-Verbindung auf - jede Verbindung muss wieder getrennt
    // werden, sonst haengt der Testlauf an offenen Reconnect-Timern.
    disconnectAllPrinters();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff ab (401) und verlangt ein Lager beim Auflisten (400)", async () => {
    assert.equal((await request(app).get(`/api/printers?inventoryId=${lagerId}`)).status, 401);
    assert.equal((await request(app).post("/api/printers").send(printerBody(lagerId))).status, 401);
    assert.equal((await request(app).get("/api/printers").set("Cookie", owner.cookie)).status, 400);
  });

  it("lehnt Anlegen ab: Betrachter/Bearbeiter 403, Fremder 404 (Lager bleibt unsichtbar)", async () => {
    for (const user of [viewer, editor]) {
      assert.equal((await request(app).post("/api/printers").set("Cookie", user.cookie).send(printerBody(lagerId))).status, 403, user.username);
    }
    assert.equal((await request(app).post("/api/printers").set("Cookie", outsider.cookie).send(printerBody(lagerId))).status, 404);
    assert.equal(await prisma.printer.count(), 0);
  });

  it("erlaubt Besitzern und Admins das Anlegen; der accessCode taucht nie in einer Antwort auf; doppelte Seriennummer 409", async () => {
    const body = printerBody(lagerId);
    const created = await request(app).post("/api/printers").set("Cookie", owner.cookie).send(body);
    assert.equal(created.status, 201);
    assert.equal("accessCode" in created.body.data, false);
    assert.equal(created.body.data.inventoryId, lagerId);
    assert.equal((await request(app).post("/api/printers").set("Cookie", owner.cookie).send(body)).status, 409);

    const byAdmin = await request(app).post("/api/printers").set("Cookie", admin.cookie).send(printerBody(otherLagerId));
    assert.equal(byAdmin.status, 201);

    const list = await request(app).get(`/api/printers?inventoryId=${lagerId}`).set("Cookie", viewer.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.ok(list.body.data.every((printer: object) => !("accessCode" in printer)));
    assert.ok(!JSON.stringify(created.body).includes("12345678"));

    const status = await request(app).get(`/api/printers/${created.body.data.id}/status`).set("Cookie", viewer.cookie);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.printerId, created.body.data.id);
  });

  it("zeigt Fremden weder Liste noch Status: 404, und 'all' enthaelt nur eigene Lager", async () => {
    const printer = await createPrinterIn(lagerId, "Nur Druck-Lager");
    assert.equal((await request(app).get(`/api/printers?inventoryId=${lagerId}`).set("Cookie", outsider.cookie)).status, 404);
    assert.equal((await request(app).get(`/api/printers/${printer.id}/status`).set("Cookie", outsider.cookie)).status, 404);

    const all = await request(app).get("/api/printers?inventoryId=all").set("Cookie", outsider.cookie);
    assert.equal(all.status, 200);
    assert.ok(all.body.data.every((entry: { inventoryId: string }) => entry.inventoryId === otherLagerId));
    assert.ok(!all.body.data.some((entry: { id: string }) => entry.id === printer.id));
  });

  it("lehnt Aendern und Loeschen ab: Betrachter/Bearbeiter 403, Fremder 404; Besitzer darf, aber das Lager laesst sich nicht wechseln", async () => {
    const printer = await createPrinterIn(lagerId, "Aenderbar");
    for (const user of [viewer, editor]) {
      assert.equal((await request(app).patch(`/api/printers/${printer.id}`).set("Cookie", user.cookie).send({ name: "X" })).status, 403);
      assert.equal((await request(app).delete(`/api/printers/${printer.id}`).set("Cookie", user.cookie)).status, 403);
    }
    assert.equal((await request(app).patch(`/api/printers/${printer.id}`).set("Cookie", outsider.cookie).send({ name: "X" })).status, 404);
    assert.equal((await request(app).delete(`/api/printers/${printer.id}`).set("Cookie", outsider.cookie)).status, 404);

    const renamed = await request(app)
      .patch(`/api/printers/${printer.id}`)
      .set("Cookie", owner.cookie)
      .send({ name: "Umbenannt", inventoryId: otherLagerId });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.name, "Umbenannt");
    assert.equal(renamed.body.data.inventoryId, lagerId);

    assert.equal((await request(app).delete(`/api/printers/${printer.id}`).set("Cookie", owner.cookie)).status, 200);
    assert.equal(await prisma.printer.count({ where: { id: printer.id } }), 0);
  });
});
