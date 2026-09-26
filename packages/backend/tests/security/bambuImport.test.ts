import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  BambuCloudError,
  setBambuCloudClientForTests,
  type BambuCloudClient
} from "../../src/services/bambuCloudClient.js";
import {
  clearSessionsForTests,
  RESEND_COOLDOWN_MS,
  setSessionClockForTests,
  SESSION_TTL_MS
} from "../../src/services/bambuImportSessions.js";
import { createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

const SECRET_TOKEN = "GEHEIMES-TOKEN-123";
const SECRET_PASSWORD = "GEHEIMES-PASSWORT";

// Diese Hersteller legt der Import selbst an - der Test braucht dafuer eine Datenbank ohne sie (auch wenn frueher jemand von Hand
// etwas importiert hat).
const IMPORT_VENDORS = ["Bambu Lab", "eSun", "Polymaker"];

const HITS = [
  { id: 101, filamentVendor: "Bambu Lab", filamentType: "PLA", filamentName: "PLA Basic", color: "#FFFFFFFF", netWeight: 931, totalNetWeight: 1000, status: 0, inPrinter: true, deviceName: "X1C" },
  { id: 102, filamentVendor: "eSun", filamentType: "PETG", filamentName: "PETG Blau", color: "#2F6FEDFF", netWeight: 250, totalNetWeight: 1000, status: 0, inPrinter: false },
  { id: 103, filamentVendor: "Bambu Lab", filamentType: "PLA", filamentName: "PLA Basic", color: "#D14343FF", netWeight: 700, totalNetWeight: 1000, status: 1 },
  { filamentName: "kaputt ohne id" }
];

let sendCodeCalls = 0;

function mockClient(): BambuCloudClient {
  return {
    login(_region, _account, password) {
      switch (password) {
        case "falsch":
          return Promise.reject(new BambuCloudError("credentials"));
        case "blockiert":
          return Promise.reject(new BambuCloudError("blocked"));
        case "code":
          return Promise.resolve({ kind: "code_required" as const });
        case "tfa":
          return Promise.resolve({ kind: "tfa_required" as const });
        default:
          return Promise.resolve({ kind: "ok" as const, token: SECRET_TOKEN });
      }
    },
    sendCode: () => {
      sendCodeCalls += 1;
      return Promise.resolve();
    },
    loginWithCode: (_region, _account, code) =>
      code === "123456" ? Promise.resolve(SECRET_TOKEN) : Promise.reject(new BambuCloudError("credentials")),
    listFilaments: (_region, token) => (token === SECRET_TOKEN ? Promise.resolve(HITS) : Promise.reject(new BambuCloudError("unauthorized")))
  };
}

describe("Bambu-Import - Negativ-Tests und Ablauf", () => {
  const app = createApp();
  let editor: TestUser;
  let colleague: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";

  before(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: IMPORT_VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    await prisma.material.deleteMany({ where: { name: { in: ["PLA Basic", "PETG Blau"] } } });
    editor = await createLoggedInUser(app, "bbeditor");
    colleague = await createLoggedInUser(app, "bbcolleague");
    viewer = await createLoggedInUser(app, "bbviewer");
    outsider = await createLoggedInUser(app, "bboutsider");
    lagerId = (
      await createInventoryWithMembers("Import-Lager", [
        { userId: editor.id, role: "EDITOR" },
        { userId: colleague.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    otherLagerId = (await createInventoryWithMembers("Anderes Import-Lager", [{ userId: outsider.id, role: "OWNER" }])).id;
    await prisma.material.deleteMany({ where: { name: "PLA", manufacturerId: null } });
    await prisma.material.create({ data: { name: "PLA", printTempMinC: 195, printTempMaxC: 225, bedTempC: 55 } });
  });

  beforeEach(() => {
    sendCodeCalls = 0;
    setBambuCloudClientForTests(mockClient());
    clearSessionsForTests();
    setSessionClockForTests(null);
  });

  after(async () => {
    setBambuCloudClientForTests(null);
    setSessionClockForTests(null);
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany({ where: { OR: [{ name: "PLA", manufacturerId: null }, { manufacturer: { name: { in: IMPORT_VENDORS } } }] } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const base = (id = lagerId) => `/api/inventories/${id}/bambu-import`;
  const post = (url: string, user: TestUser | null, body: unknown = {}) => {
    const req = request(app).post(url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body as object);
  };
  const get = (url: string, user: TestUser) => request(app).get(url).set("Cookie", user.cookie);
  const login = (user: TestUser, password = "richtig", region = "global") =>
    post(`${base()}/login`, user, { account: "konto@example.test", password, region });

  async function startSession(user: TestUser): Promise<string> {
    const res = await login(user);
    assert.equal(res.status, 200);
    return res.body.data.sessionId as string;
  }

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await post(`${base()}/login`, null, { account: "x@y.de", password: "p", region: "global" })).status, 401);
    assert.equal((await post(`${base()}/file`, null, { hits: [] })).status, 401);
    assert.equal((await request(app).get(`${base()}/irgendeine-sitzung-id/preview`)).status, 401);
    assert.equal((await post(`${base()}/irgendeine-sitzung-id/import`, null, { cloudIds: ["1"] })).status, 401);
  });

  it("verweigert Fremden (404) und Betrachtern (403) jede Import-Route", async () => {
    for (const [user, status] of [[outsider, 404], [viewer, 403]] as const) {
      assert.equal((await login(user)).status, status, user.username);
      assert.equal((await post(`${base()}/file`, user, { hits: HITS })).status, status);
      assert.equal((await post(`${base()}/verify`, user, { sessionId: "x".repeat(20), code: "123456" })).status, status);
      assert.equal((await post(`${base()}/resend`, user, { sessionId: "x".repeat(20) })).status, status);
      assert.equal((await get(`${base()}/${"x".repeat(20)}/preview`, user)).status, status);
      assert.equal((await post(`${base()}/${"x".repeat(20)}/import`, user, { cloudIds: ["101"] })).status, status);
    }
    assert.equal(await prisma.spool.count(), 0);
  });

  it("prueft Eingaben: ungueltige Region, zu kurzes Konto, fehlendes Passwort, zu viele oder keine IDs, riesiges JSON", async () => {
    assert.equal((await login(editor, "richtig", "mars")).status, 400);
    assert.equal((await post(`${base()}/login`, editor, { account: "ab", password: "p", region: "global" })).status, 400);
    assert.equal((await post(`${base()}/login`, editor, { account: "konto@example.test", region: "global" })).status, 400);
    const sessionId = await startSession(editor);
    await get(`${base()}/${sessionId}/preview`, editor);
    assert.equal((await post(`${base()}/${sessionId}/import`, editor, { cloudIds: [] })).status, 400);
    assert.equal((await post(`${base()}/${sessionId}/import`, editor, { cloudIds: Array.from({ length: 501 }, (_, i) => String(i)) })).status, 400);
    assert.equal((await post(`${base()}/file`, editor, { hits: Array.from({ length: 1001 }, (_, i) => ({ id: i })) })).status, 400);
    assert.equal((await post(`${base()}/file`, editor, { hits: "kein array" })).status, 400);
    assert.equal((await post(`${base()}/file`, editor, { hits: [{ nur: "unsinn" }, 5] })).status, 400);
  });

  it("meldet Anmeldefehler verstaendlich, ohne Text der Cloud: falsche Zugangsdaten 400, Bot-Schutz 502, TFA nicht unterstuetzt", async () => {
    const wrong = await login(editor, "falsch");
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, "VALIDATION_ERROR");
    const blocked = await login(editor, "blockiert");
    assert.equal(blocked.status, 502);
    assert.equal(blocked.body.error.code, "UPSTREAM_ERROR");
    assert.match(blocked.body.error.message, /Bot-Schutz/);
    const tfa = await login(editor, "tfa");
    assert.equal(tfa.status, 200);
    assert.deepEqual(tfa.body.data, { status: "tfa_unsupported", sessionId: null });
  });

  it("fuehrt den Ablauf mit E-Mail-Code durch: falscher Code 400, richtiger Code oeffnet die Sitzung, Vorschau funktioniert", async () => {
    const started = await login(editor, "code");
    assert.equal(started.body.data.status, "code_required");
    const sessionId = started.body.data.sessionId as string;
    // Der Code wird nicht automatisch nochmal angefordert (Bambu schickt beim Anmelden selbst einen), sondern nur auf Wunsch
    assert.equal(sendCodeCalls, 0);
    assert.equal((await get(`${base()}/${sessionId}/preview`, editor)).status, 400);
    assert.equal((await post(`${base()}/verify`, editor, { sessionId, code: "000000" })).status, 400);
    assert.equal((await post(`${base()}/verify`, editor, { sessionId, code: "123456" })).status, 200);
    assert.equal((await get(`${base()}/${sessionId}/preview`, editor)).status, 200);
    // Ohne wartenden Code ist der Schritt nicht moeglich
    assert.equal((await post(`${base()}/verify`, editor, { sessionId, code: "123456" })).status, 400);
    assert.equal((await post(`${base()}/resend`, editor, { sessionId })).status, 400);
  });

  it("fordert einen Code nur auf Wunsch an, hoechstens einmal pro Minute, und nur fuer die eigene Sitzung", async () => {
    const started = await login(editor, "code");
    const sessionId = started.body.data.sessionId as string;
    assert.equal((await post(`${base()}/resend`, colleague, { sessionId })).status, 404);
    assert.equal((await post(`${base()}/resend`, editor, { sessionId })).status, 200);
    assert.equal(sendCodeCalls, 1);
    const tooSoon = await post(`${base()}/resend`, editor, { sessionId });
    assert.equal(tooSoon.status, 400);
    assert.match(tooSoon.body.error.message, /Minute/);
    assert.equal(sendCodeCalls, 1);
    const later = Date.now() + RESEND_COOLDOWN_MS + 1000;
    setSessionClockForTests(() => later);
    assert.equal((await post(`${base()}/resend`, editor, { sessionId })).status, 200);
    assert.equal(sendCodeCalls, 2);
  });

  it("zeigt eine Vorschau mit Zaehlung ungueltiger Eintraege und nutzt fremde Sitzungen nicht (404), auch abgelaufene nicht", async () => {
    const sessionId = await startSession(editor);
    const preview = await get(`${base()}/${sessionId}/preview`, editor);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.rows.length, 3);
    assert.equal(preview.body.data.skipped, 1);
    const first = preview.body.data.rows.find((row: { cloudId: string }) => row.cloudId === "101");
    assert.deepEqual([first.vendor, first.materialName, first.colorHex, first.colorName, first.remainingG, first.totalG, first.deviceName], [
      "Bambu Lab", "PLA Basic", "#FFFFFF", "Weiß", 931, 1000, "X1C"
    ]);
    assert.equal(first.alreadyImported, false);
    assert.equal(first.manufacturerExists, false);

    assert.equal((await get(`${base()}/${sessionId}/preview`, colleague)).status, 404);
    assert.equal((await post(`${base()}/${sessionId}/import`, colleague, { cloudIds: ["101"] })).status, 404);
    assert.equal((await request(app).delete(`${base()}/${sessionId}`).set("Cookie", colleague.cookie)).status, 404);
    // in ein anderes Lager umgeleitet: 404 (Sitzung gehoert zu Lager A)
    assert.equal((await get(`${base(otherLagerId)}/${sessionId}/preview`, outsider)).status, 404);

    const start = Date.now();
    setSessionClockForTests(() => start + SESSION_TTL_MS + 1000);
    assert.equal((await get(`${base()}/${sessionId}/preview`, editor)).status, 404);
  });

  it("importiert die Auswahl, legt fehlende Hersteller und Materialien an, verhindert Doppelimport und aktualisiert auf Wunsch das Restgewicht", async () => {
    const sessionId = await startSession(editor);
    await get(`${base()}/${sessionId}/preview`, editor);
    const imported = await post(`${base()}/${sessionId}/import`, editor, { cloudIds: ["101", "102", "999"] });
    assert.equal(imported.status, 200);
    assert.deepEqual(imported.body.data, { created: 2, updated: 0, skipped: 1, manufacturersCreated: 2, materialsCreated: 2 });

    const spools = await prisma.spool.findMany({ where: { inventoryId: lagerId }, include: { material: true, manufacturer: true }, orderBy: { bambuCloudId: "asc" } });
    assert.equal(spools.length, 2);
    const white = spools[0];
    assert.deepEqual(
      [white?.bambuCloudId, white?.manufacturer.name, white?.material.name, white?.colorName, white?.colorHex, white?.initialWeightG, white?.remainingWeightG, white?.location],
      ["101", "Bambu Lab", "PLA Basic", "Weiß", "#FFFFFF", 1000, 931, "X1C"]
    );
    // Temperaturen kommen vom allgemeinen Material gleichen Typs ("PLA"), sonst Standardwerte
    assert.deepEqual([white?.material.printTempMinC, white?.material.printTempMaxC, white?.material.bedTempC], [195, 225, 55]);
    const blue = spools[1];
    assert.deepEqual([blue?.material.printTempMinC, blue?.material.printTempMaxC, blue?.location], [190, 230, null]);

    // Die Sitzung ist nach dem Import weg (Token verworfen)
    assert.equal((await get(`${base()}/${sessionId}/preview`, editor)).status, 404);

    // Zweiter Durchlauf: bereits importierte sind markiert, nichts wird doppelt angelegt
    const second = await startSession(editor);
    const preview = await get(`${base()}/${second}/preview`, editor);
    const flags = Object.fromEntries(preview.body.data.rows.map((row: { cloudId: string; alreadyImported: boolean }) => [row.cloudId, row.alreadyImported]));
    assert.deepEqual(flags, { 101: true, 102: true, 103: false });
    const again = await post(`${base()}/${second}/import`, editor, { cloudIds: ["101", "102"] });
    assert.deepEqual(again.body.data, { created: 0, updated: 0, skipped: 2, manufacturersCreated: 0, materialsCreated: 0 });
    assert.equal(await prisma.spool.count({ where: { inventoryId: lagerId } }), 2);

    await prisma.spool.updateMany({ where: { bambuCloudId: "101" }, data: { remainingWeightG: 10 } });
    const third = await startSession(editor);
    await get(`${base()}/${third}/preview`, editor);
    const updated = await post(`${base()}/${third}/import`, editor, { cloudIds: ["101"], updateExisting: true });
    assert.equal(updated.body.data.updated, 1);
    assert.equal((await prisma.spool.findFirst({ where: { bambuCloudId: "101" } }))?.remainingWeightG, 931);
  });

  it("importiert nichts in ein anderes Lager und trennt gleiche Bambu-IDs je Lager", async () => {
    assert.equal(await prisma.spool.count({ where: { inventoryId: otherLagerId } }), 0);
    const session = (await post(`${base(otherLagerId)}/file`, outsider, { hits: HITS })).body.data.sessionId as string;
    const result = await post(`${base(otherLagerId)}/${session}/import`, outsider, { cloudIds: ["101"] });
    assert.equal(result.body.data.created, 1);
    assert.equal(await prisma.spool.count({ where: { inventoryId: otherLagerId } }), 1);
    assert.equal(await prisma.spool.count({ where: { bambuCloudId: "101" } }), 2);
  });

  it("nimmt die Ausweich-Datei an und importiert daraus", async () => {
    const file = await post(`${base()}/file`, colleague, { hits: HITS });
    assert.equal(file.status, 200);
    const sessionId = file.body.data.sessionId as string;
    const preview = await get(`${base()}/${sessionId}/preview`, colleague);
    assert.equal(preview.body.data.rows.length, 3);
    assert.equal(preview.body.data.skipped, 1);
    const result = await post(`${base()}/${sessionId}/import`, colleague, { cloudIds: ["103"] });
    assert.equal(result.body.data.created, 1);
  });

  it("gibt Passwort und Token nirgends preis: nicht in Antworten, nicht im Protokoll, nicht in der Datenbank", async () => {
    const responses: string[] = [];
    const res = await login(editor, SECRET_PASSWORD);
    responses.push(JSON.stringify(res.body));
    const sessionId = res.body.data.sessionId as string;
    responses.push(JSON.stringify((await get(`${base()}/${sessionId}/preview`, editor)).body));
    responses.push(JSON.stringify((await post(`${base()}/${sessionId}/import`, editor, { cloudIds: ["102"] })).body));
    responses.push(JSON.stringify((await login(editor, "falsch")).body));
    for (const text of responses) {
      assert.ok(!text.includes(SECRET_TOKEN) && !text.includes(SECRET_PASSWORD));
    }
    const audit = JSON.stringify(await prisma.auditLog.findMany());
    assert.ok(!audit.includes(SECRET_TOKEN) && !audit.includes(SECRET_PASSWORD));
    assert.ok(audit.includes("Import aus Bambu-Cloud"));
  });

  it("bricht ab und verwirft die Sitzung (DELETE)", async () => {
    const sessionId = await startSession(editor);
    assert.equal((await request(app).delete(`${base()}/${sessionId}`).set("Cookie", editor.cookie)).status, 200);
    assert.equal((await get(`${base()}/${sessionId}/preview`, editor)).status, 404);
  });
});
