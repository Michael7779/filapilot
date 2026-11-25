import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { BambuCloudError, setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { saveConnection } from "../../src/services/bambuConnectionService.js";
import { disconnectAllPrinters, whenPrinterConnectStarted } from "../../src/services/printerRuntime.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

const SECRET_TOKEN = "GEHEIMES-CLOUD-TOKEN-4711";

function rejectingClient(): BambuCloudClient {
  return {
    login: () => Promise.reject(new Error("nicht erwartet")),
    sendCode: () => Promise.reject(new Error("nicht erwartet")),
    loginWithCode: () => Promise.reject(new Error("nicht erwartet")),
    listFilaments: () => Promise.reject(new Error("nicht erwartet")),
    getUserId: () => Promise.reject(new BambuCloudError("unauthorized", { step: "Nutzer-ID", status: 401 }))
  };
}

describe("Drucker ueber die Bambu Cloud - Negativ-Tests", () => {
  const app = createApp();
  let owner: TestUser;
  let editor: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let serialCounter = 0;

  function cloudPrinter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    serialCounter += 1;
    return {
      name: `Cloud-${serialCounter}`,
      connectionMode: "CLOUD",
      serialNumber: `CLOUD-SERIAL-${Date.now()}-${serialCounter}`,
      syncMode: "LIVE",
      syncIntervalSeconds: 60,
      inventoryId: lagerId,
      ...overrides
    };
  }

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "cloudowner");
    editor = await createLoggedInUser(app, "cloudeditor");
    outsider = await createLoggedInUser(app, "cloudoutsider");
    lagerId = (
      await createInventoryWithMembers("Cloud-Lager", [
        { userId: owner.id, role: "OWNER" },
        { userId: editor.id, role: "EDITOR" }
      ])
    ).id;
  });

  afterEach(() => {
    setBambuCloudClientForTests(null);
  });

  after(async () => {
    disconnectAllPrinters();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("verweigert das Anlegen ohne Anmeldung (401)", async () => {
    const res = await request(app).post("/api/printers").send(cloudPrinter());
    assert.equal(res.status, 401);
  });

  it("verweigert Bearbeitern das Anlegen eines Cloud-Druckers (403) und Fremden den Zugriff aufs Lager", async () => {
    const asEditor = await request(app).post("/api/printers").set("Cookie", editor.cookie).send(cloudPrinter());
    assert.equal(asEditor.status, 403);
    const asOutsider = await request(app).post("/api/printers").set("Cookie", outsider.cookie).send(cloudPrinter());
    assert.ok([403, 404].includes(asOutsider.status), `Status war ${asOutsider.status}`);
    assert.equal(await prisma.printer.count({ where: { inventoryId: lagerId } }), 0);
  });

  it("legt als Besitzer einen Cloud-Drucker ohne IP und Access-Code an - die Antwort enthaelt keinen Access-Code", async () => {
    const res = await request(app).post("/api/printers").set("Cookie", owner.cookie).send(cloudPrinter());
    assert.equal(res.status, 201);
    assert.equal(res.body.data.connectionMode, "CLOUD");
    assert.equal(res.body.data.ipAddress, null);
    assert.ok(!("accessCode" in res.body.data));
    await whenPrinterConnectStarted(res.body.data.id);
  });

  it("lehnt IP-Adresse oder Access-Code bei einem Cloud-Drucker ab (400)", async () => {
    const withIp = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send(cloudPrinter({ ipAddress: "192.0.2.50" }));
    assert.equal(withIp.status, 400);
    const withCode = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send(cloudPrinter({ accessCode: "12345678" }));
    assert.equal(withCode.status, 400);
  });

  it("verlangt bei einem lokalen Drucker weiterhin IP und Access-Code (400) - auch ohne Angabe des Modus", async () => {
    const noCode = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send(cloudPrinter({ connectionMode: "LOCAL", ipAddress: "192.0.2.50" }));
    assert.equal(noCode.status, 400);
    const legacy = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send({
        name: "Alt",
        serialNumber: `LEGACY-${Date.now()}`,
        ipAddress: "192.0.2.60",
        accessCode: "12345678",
        syncMode: "LIVE",
        syncIntervalSeconds: 60,
        inventoryId: lagerId
      });
    assert.equal(legacy.status, 201);
    assert.equal(legacy.body.data.connectionMode, "LOCAL");
    disconnectAllPrinters();
  });

  it("zeigt bei einem Cloud-Drucker in einem Lager ohne Bambu-Verbindung den Grund 'cloud_no_account'", async () => {
    const created = await request(app).post("/api/printers").set("Cookie", owner.cookie).send(cloudPrinter());
    await whenPrinterConnectStarted(created.body.data.id);
    const status = await request(app).get(`/api/printers/${created.body.data.id}/status`).set("Cookie", owner.cookie);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.connected, false);
    assert.equal(status.body.data.issue, "cloud_no_account");
  });

  it("zeigt 'cloud_rejected', wenn die Cloud das gemerkte Token ablehnt - und gibt das Token nie preis", async () => {
    await saveConnection({ inventoryId: lagerId, region: "global", token: SECRET_TOKEN, connectedByName: "cloudowner" });
    setBambuCloudClientForTests(rejectingClient());
    const created = await request(app).post("/api/printers").set("Cookie", owner.cookie).send(cloudPrinter());
    await whenPrinterConnectStarted(created.body.data.id);
    const status = await request(app).get(`/api/printers/${created.body.data.id}/status`).set("Cookie", owner.cookie);
    assert.equal(status.body.data.issue, "cloud_rejected");

    const list = await request(app).get(`/api/printers?inventoryId=${lagerId}`).set("Cookie", owner.cookie);
    assert.ok(!JSON.stringify(list.body).includes(SECRET_TOKEN));
    assert.ok(!JSON.stringify(status.body).includes(SECRET_TOKEN));
    await prisma.bambuConnection.deleteMany({ where: { inventoryId: lagerId } });
  });

  it("verbirgt den Status eines Cloud-Druckers vor Fremden (404)", async () => {
    const created = await request(app).post("/api/printers").set("Cookie", owner.cookie).send(cloudPrinter());
    const res = await request(app).get(`/api/printers/${created.body.data.id}/status`).set("Cookie", outsider.cookie);
    assert.equal(res.status, 404);
  });

  it("behaelt den Access-Code eines lokalen Druckers, wenn beim Aendern nur die IP geschickt wird", async () => {
    const created = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send(cloudPrinter({ connectionMode: "LOCAL", ipAddress: "192.0.2.80", accessCode: "KEEP1234" }));
    const id: string = created.body.data.id;
    const res = await request(app)
      .patch(`/api/printers/${id}`)
      .set("Cookie", owner.cookie)
      .send({ connectionMode: "LOCAL", ipAddress: "192.0.2.81" });
    assert.equal(res.status, 200);
    const row = await prisma.printer.findUniqueOrThrow({ where: { id } });
    assert.equal(row.accessCode, "KEEP1234");
    assert.equal(row.ipAddress, "192.0.2.81");
    disconnectAllPrinters();
  });

  it("raeumt beim Wechsel nach CLOUD IP und Access-Code ab und verlangt sie beim Wechsel zurueck (400)", async () => {
    const created = await request(app)
      .post("/api/printers")
      .set("Cookie", owner.cookie)
      .send(cloudPrinter({ connectionMode: "LOCAL", ipAddress: "192.0.2.70", accessCode: "ABCD1234" }));
    const id: string = created.body.data.id;
    assert.equal(created.status, 201);

    const toCloud = await request(app).patch(`/api/printers/${id}`).set("Cookie", owner.cookie).send({ connectionMode: "CLOUD" });
    assert.equal(toCloud.status, 200);
    assert.equal(toCloud.body.data.ipAddress, null);
    const row = await prisma.printer.findUniqueOrThrow({ where: { id } });
    assert.equal(row.accessCode, null);

    const back = await request(app).patch(`/api/printers/${id}`).set("Cookie", owner.cookie).send({ connectionMode: "LOCAL" });
    assert.equal(back.status, 400);
    const stillCloud = await prisma.printer.findUniqueOrThrow({ where: { id } });
    assert.equal(stillCloud.connectionMode, "CLOUD");

    const cloudWithCode = await request(app)
      .patch(`/api/printers/${id}`)
      .set("Cookie", owner.cookie)
      .send({ accessCode: "NEU12345" });
    assert.equal(cloudWithCode.status, 400);

    const editorTry = await request(app).patch(`/api/printers/${id}`).set("Cookie", editor.cookie).send({ connectionMode: "LOCAL", ipAddress: "192.0.2.71", accessCode: "ABCD1234" });
    assert.equal(editorTry.status, 403);
    disconnectAllPrinters();
  });
});
