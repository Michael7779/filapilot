import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { BambuCloudError, setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { getStoredToken, tokenExpiry } from "../../src/services/bambuConnectionService.js";
import { clearSessionsForTests } from "../../src/services/bambuImportSessions.js";
import { createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

const IMPORT_VENDORS = ["Bambu Lab", "eSun"];
const password = "irgendein-passwort";

let cloudHits: unknown[] = [];
let loginCalls = 0;
let lastToken = "";
let expireTokens = false;

function spool(id: number, name: string, remaining: number, extra: object = {}): object {
  return { id, filamentVendor: "Bambu Lab", filamentType: "PLA", filamentName: name, color: "#FFFFFFFF", netWeight: remaining, totalNetWeight: 1000, status: 0, ...extra };
}

function mockClient(): BambuCloudClient {
  return {
    login(_region, account, pw) {
      loginCalls += 1;
      return pw === "code" ? Promise.resolve({ kind: "code_required" as const }) : Promise.resolve({ kind: "ok" as const, token: "TOKEN-" + account });
    },
    sendCode: () => Promise.resolve(),
    loginWithCode: (_region, account) => Promise.resolve("TOKEN-" + account),
    listFilaments(_region, token) {
      lastToken = token;
      return expireTokens ? Promise.reject(new BambuCloudError("unauthorized")) : Promise.resolve(cloudHits);
    }
  };
}

describe("Bambu-Verbindung pro Lager und Abgleich - Negativ-Tests und Ablauf", () => {
  const app = createApp();
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerA = "";
  let lagerB = "";

  before(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: IMPORT_VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    owner = await createLoggedInUser(app, "conowner");
    editor = await createLoggedInUser(app, "coneditor");
    viewer = await createLoggedInUser(app, "conviewer");
    outsider = await createLoggedInUser(app, "conoutsider");
    lagerA = (
      await createInventoryWithMembers("Verbindung A", [
        { userId: owner.id, role: "OWNER" },
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    lagerB = (await createInventoryWithMembers("Verbindung B", [{ userId: outsider.id, role: "OWNER" }])).id;
  });

  beforeEach(async () => {
    setBambuCloudClientForTests(mockClient());
    clearSessionsForTests();
    cloudHits = [];
    loginCalls = 0;
    lastToken = "";
    expireTokens = false;
    await prisma.bambuConnection.deleteMany();
    await prisma.spool.deleteMany();
  });

  after(async () => {
    setBambuCloudClientForTests(null);
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: IMPORT_VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const base = (id: string) => "/api/inventories/" + id + "/bambu-import";
  const call = (method: "get" | "post" | "delete", url: string, user: TestUser | null, body: object = {}) => {
    const req = request(app)[method](url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };
  const login = (user: TestUser, lager: string, account: string, remember: boolean, pw = password) =>
    call("post", base(lager) + "/login", user, { account, password: pw, region: "global", remember });

  async function connect(lager = lagerA, account = "konto-a@example.test", user = owner): Promise<void> {
    assert.equal((await login(user, lager, account, true)).status, 200);
  }

  it("lehnt anonyme Zugriffe ab (401) und zeigt Fremden nichts (404)", async () => {
    for (const [method, url] of [["get", "/connection"], ["delete", "/connection"], ["post", "/sync"], ["post", "/from-connection"]] as const) {
      assert.equal((await call(method, base(lagerA) + url, null)).status, 401, method + url);
      assert.equal((await call(method, base(lagerA) + url, outsider)).status, 404, method + url);
    }
  });

  it("Betrachter sehen nur den Status (403 sonst), Bearbeiter duerfen weder verbinden noch trennen", async () => {
    await connect();
    assert.equal((await call("get", base(lagerA) + "/connection", viewer)).status, 200);
    for (const [method, url] of [["delete", "/connection"], ["post", "/sync"], ["post", "/from-connection"]] as const) {
      assert.equal((await call(method, base(lagerA) + url, viewer)).status, 403, "Betrachter " + method + url);
    }
    assert.equal((await call("delete", base(lagerA) + "/connection", editor)).status, 403);
    const before = loginCalls;
    assert.equal((await login(editor, lagerA, "fremd@example.test", true)).status, 403);
    assert.equal(loginCalls, before, "Bambu wird bei fehlendem Recht gar nicht erst angefragt");
    assert.equal((await prisma.bambuConnection.count()), 1);
  });

  it("merkt die Verbindung nur auf Wunsch des Besitzers, verschluesselt, und nennt das Token nie", async () => {
    assert.equal((await login(owner, lagerA, "konto-a@example.test", false)).status, 200);
    assert.equal(await prisma.bambuConnection.count(), 0);

    const res = await login(owner, lagerA, "konto-a@example.test", true);
    assert.equal(res.status, 200);
    const info = await call("get", base(lagerA) + "/connection", editor);
    assert.deepEqual([info.body.data.connected, info.body.data.region, info.body.data.connectedByName], [true, "global", "conowner"]);
    const row = await prisma.bambuConnection.findFirstOrThrow();
    assert.ok(!row.tokenEncrypted.includes("TOKEN-") && row.tokenEncrypted.split(".").length === 3);
    assert.equal((await getStoredToken(lagerA))?.token, "TOKEN-konto-a@example.test");

    const everything = JSON.stringify([res.body, info.body, await prisma.auditLog.findMany()]);
    assert.ok(!everything.includes("TOKEN-konto-a") && !everything.includes(password));
    assert.ok((await prisma.auditLog.findMany()).some((entry) => entry.description.includes("Bambu-Verbindung gemerkt")));
  });

  it("merkt auch beim Anmelden mit E-Mail-Code und trennt auf Wunsch des Besitzers", async () => {
    const started = await login(owner, lagerA, "code@example.test", true, "code");
    assert.equal(started.body.data.status, "code_required");
    assert.equal(await prisma.bambuConnection.count(), 0);
    const verified = await call("post", base(lagerA) + "/verify", owner, { sessionId: started.body.data.sessionId, code: "123456" });
    assert.equal(verified.status, 200);
    assert.equal(await prisma.bambuConnection.count(), 1);
    assert.equal((await call("delete", base(lagerA) + "/connection", owner)).body.data.removed, true);
    assert.equal((await call("get", base(lagerA) + "/connection", owner)).body.data.connected, false);
  });

  it("haelt die Verbindungen der Lager getrennt (jedes Lager sein eigenes Konto und Token)", async () => {
    await connect(lagerA, "konto-a@example.test", owner);
    await connect(lagerB, "konto-b@example.test", outsider);
    assert.equal((await getStoredToken(lagerA))?.token, "TOKEN-konto-a@example.test");
    assert.equal((await getStoredToken(lagerB))?.token, "TOKEN-konto-b@example.test");
    cloudHits = [spool(1, "PLA Basic", 500)];
    assert.equal((await call("post", base(lagerA) + "/sync", editor)).status, 200);
    assert.equal(lastToken, "TOKEN-konto-a@example.test");
    assert.equal(await prisma.spool.count({ where: { inventoryId: lagerB } }), 0);
    await call("delete", base(lagerA) + "/connection", owner);
    assert.equal((await call("get", base(lagerB) + "/connection", outsider)).body.data.connected, true);
  });

  it("gleicht ohne Auswahl ab: legt neue an, aktualisiert das Restgewicht (mit Verlauf), archiviert Entferntes und stellt Zurueckgekehrtes wieder her", async () => {
    await connect();
    cloudHits = [spool(1, "PLA Basic", 900), spool(2, "PLA Matte", 700), spool(3, "PLA Silk", 400, { status: 1 })];
    const first = await call("post", base(lagerA) + "/sync", editor);
    assert.equal(first.status, 200);
    assert.deepEqual([first.body.data.created, first.body.data.skipped, first.body.data.archived], [2, 1, 0]);
    assert.equal(await prisma.spoolWeightLog.count(), 0, "Neue Spulen sind ein Startwert, kein Verbrauch");

    cloudHits = [spool(1, "PLA Basic", 600)];
    const second = await call("post", base(lagerA) + "/sync", editor);
    assert.deepEqual([second.body.data.updated, second.body.data.archived, second.body.data.created], [1, 1, 0]);
    const one = await prisma.spool.findFirstOrThrow({ where: { bambuCloudId: "1" } });
    assert.equal(one.remainingWeightG, 600);
    const log = await prisma.spoolWeightLog.findFirstOrThrow({ where: { spoolId: one.id } });
    assert.deepEqual([log.deltaG, log.remainingG, log.source], [300, 600, "CLOUD_SYNC"]);
    const two = await prisma.spool.findFirstOrThrow({ where: { bambuCloudId: "2" } });
    assert.deepEqual([two.archiveReason, two.archivedAt !== null], ["CLOUD_REMOVED", true]);

    cloudHits = [spool(1, "PLA Basic", 600), spool(2, "PLA Matte", 650)];
    const third = await call("post", base(lagerA) + "/sync", editor);
    assert.deepEqual([third.body.data.restored, third.body.data.updated, third.body.data.unchanged], [1, 1, 1]);
    assert.equal((await prisma.spool.findFirstOrThrow({ where: { bambuCloudId: "2" } })).archivedAt, null);

    const info = await call("get", base(lagerA) + "/connection", viewer);
    assert.ok(info.body.data.lastSyncAt && info.body.data.lastSyncSummary.includes("aktualisiert"));
    assert.ok((await prisma.auditLog.findMany()).some((entry) => entry.description.includes("Abgleich mit Bambu-Cloud")));
  });

  it("laesst von Hand archivierte Spulen unangetastet", async () => {
    await connect();
    cloudHits = [spool(1, "PLA Basic", 900)];
    await call("post", base(lagerA) + "/sync", editor);
    const created = await prisma.spool.findFirstOrThrow({ where: { bambuCloudId: "1" } });
    await prisma.spool.update({ where: { id: created.id }, data: { archivedAt: new Date(), archiveReason: "MANUAL" } });
    cloudHits = [spool(1, "PLA Basic", 100)];
    const result = await call("post", base(lagerA) + "/sync", editor);
    assert.equal(result.body.data.skipped, 1);
    const after = await prisma.spool.findUniqueOrThrow({ where: { id: created.id } });
    assert.deepEqual([after.remainingWeightG, after.archiveReason], [900, "MANUAL"]);
  });

  it("archiviert bei leerer oder ungewoehnlich lueckenhafter Cloud-Liste NICHTS", async () => {
    await connect();
    cloudHits = Array.from({ length: 8 }, (_, i) => spool(i + 1, "PLA " + String(i), 500));
    await call("post", base(lagerA) + "/sync", editor);

    cloudHits = [];
    const empty = await call("post", base(lagerA) + "/sync", editor);
    assert.deepEqual([empty.body.data.archiveBlocked, empty.body.data.archived], [true, 0]);
    assert.equal(await prisma.spool.count({ where: { archivedAt: { not: null } } }), 0);

    cloudHits = [spool(1, "PLA 0", 500), spool(2, "PLA 1", 500)];
    const gaps = await call("post", base(lagerA) + "/sync", editor);
    assert.deepEqual([gaps.body.data.archiveBlocked, gaps.body.data.archived], [true, 0]);
    assert.equal(await prisma.spool.count({ where: { archivedAt: { not: null } } }), 0);
  });

  it("loescht die Verbindung, wenn Bambu das Token ablehnt (abgelaufen), und verlangt ohne Verbindung eine Anmeldung", async () => {
    assert.equal((await call("post", base(lagerA) + "/sync", editor)).status, 400);
    await connect();
    expireTokens = true;
    const expired = await call("post", base(lagerA) + "/sync", editor);
    assert.equal(expired.status, 400);
    assert.match(expired.body.error.message, /abgelaufen/);
    assert.equal(await prisma.bambuConnection.count(), 0);
  });

  it("behandelt ein nicht entschluesselbares Token (anderes SESSION_SECRET) als nicht verbunden", async () => {
    await connect();
    await prisma.bambuConnection.updateMany({ data: { tokenEncrypted: "aaaa.bbbb.cccc" } });
    assert.equal((await call("get", base(lagerA) + "/connection", owner)).body.data.connected, false);
    assert.equal((await call("post", base(lagerA) + "/sync", editor)).status, 400);
  });

  it("erlaubt den Import mit Auswahl ueber die gemerkte Verbindung, ohne erneutes Anmelden", async () => {
    await connect();
    cloudHits = [spool(7, "PLA Basic", 800)];
    const before = loginCalls;
    const session = await call("post", base(lagerA) + "/from-connection", editor);
    assert.equal(session.status, 200);
    const preview = await call("get", base(lagerA) + "/" + String(session.body.data.sessionId) + "/preview", editor);
    assert.equal(preview.body.data.rows.length, 1);
    assert.equal(lastToken, "TOKEN-konto-a@example.test");
    assert.equal(loginCalls, before);
    const imported = await call("post", base(lagerA) + "/" + String(session.body.data.sessionId) + "/import", editor, { cloudIds: ["7"] });
    assert.equal(imported.body.data.created, 1);
  });

  it("loescht die Verbindung mit dem Lager", async () => {
    await connect(lagerB, "konto-b@example.test", outsider);
    assert.equal(await prisma.bambuConnection.count({ where: { inventoryId: lagerB } }), 1);
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { id: lagerB } });
    const res = await request(app).delete("/api/inventories/" + lagerB).set("Cookie", outsider.cookie).send({ confirmName: inventory.name });
    assert.equal(res.status, 200);
    assert.equal(await prisma.bambuConnection.count({ where: { inventoryId: lagerB } }), 0);
    lagerB = (await createInventoryWithMembers("Verbindung B", [{ userId: outsider.id, role: "OWNER" }])).id;
  });

  it("liest den Ablauf aus dem Token (nur Anzeige) und ignoriert Kaputtes", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_800_000_000 })).toString("base64url");
    assert.equal(tokenExpiry("kopf." + payload + ".sig")?.toISOString(), new Date(1_800_000_000 * 1000).toISOString());
    assert.equal(tokenExpiry("kein-jwt"), null);
    assert.equal(tokenExpiry("a." + Buffer.from("kein json").toString("base64url") + ".c"), null);
    assert.equal(tokenExpiry("a." + Buffer.from('{"exp":"morgen"}').toString("base64url") + ".c"), null);
  });
});
