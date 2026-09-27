import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { isDue, runAutoSyncOnce } from "../../src/services/bambuAutoSync.js";
import { BambuCloudError, setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { getConnectionInfo, saveConnection } from "../../src/services/bambuConnectionService.js";
import { createApp } from "../../src/app.js";
import { createInventoryWithMembers, createLoggedInUser, resetInventoryData } from "../helpers/fixtures.js";

const VENDORS = ["Bambu Lab"];
let listCalls = 0;
let failWith: BambuCloudError | null = null;

const client: BambuCloudClient = {
  login: () => Promise.reject(new Error("nicht erwartet")),
  sendCode: () => Promise.resolve(),
  loginWithCode: () => Promise.reject(new Error("nicht erwartet")),
  listFilaments() {
    listCalls += 1;
    if (failWith) {
      return Promise.reject(failWith);
    }
    return Promise.resolve([{ id: 7, filamentVendor: "Bambu Lab", filamentType: "PLA", filamentName: "PLA Basic", color: "#FF0000FF", netWeight: 400, totalNetWeight: 1000, status: 0 }]);
  }
};

async function setInterval(minutes: number): Promise<void> {
  await prisma.settings.upsert({ where: { id: 1 }, update: { bambuAutoSyncMinutes: minutes }, create: { id: 1, backupFolderPath: "backup-test", bambuAutoSyncMinutes: minutes } });
}

describe("Automatischer Bambu-Abgleich", () => {
  let lager = "";
  const now = new Date("2026-09-26T12:00:00Z");

  before(async () => {
    await resetInventoryData();
    const user = await createLoggedInUser(createApp(), "autosyncowner");
    lager = (await createInventoryWithMembers("Auto-Lager", [{ userId: user.id, role: "OWNER" }])).id;
  });

  beforeEach(async () => {
    setBambuCloudClientForTests(client);
    listCalls = 0;
    failWith = null;
    await prisma.bambuConnection.deleteMany();
    await prisma.spool.deleteMany({ where: { inventoryId: lager } });
    await saveConnection({ inventoryId: lager, region: "global", token: "TOKEN-X", connectedByName: "autosyncowner" });
  });

  after(async () => {
    setBambuCloudClientForTests(null);
    await setInterval(0);
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: VENDORS } } });
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("isDue: nie versucht oder Intervall abgelaufen", () => {
    assert.equal(isDue(null, 60, now), true);
    assert.equal(isDue(new Date("2026-09-26T11:30:00Z"), 60, now), false);
    assert.equal(isDue(new Date("2026-09-26T11:00:00Z"), 60, now), true);
  });

  it("tut nichts, solange das Intervall auf 0 (aus) steht", async () => {
    await setInterval(0);
    assert.equal(await runAutoSyncOnce({ now, pauseMs: 0 }), 0);
    assert.equal(listCalls, 0);
  });

  it("gleicht faellige Verbindungen ab, vermerkt automatisch + Zeit, und versucht es erst nach dem Intervall wieder", async () => {
    await setInterval(60);
    assert.equal(await runAutoSyncOnce({ now, pauseMs: 0 }), 1);
    assert.equal(listCalls, 1);
    const created = await prisma.spool.findFirst({ where: { inventoryId: lager, bambuCloudId: "7" } });
    assert.ok(created);
    const info = await getConnectionInfo(lager);
    assert.equal(info.lastSyncAuto, true);
    assert.ok(info.lastSyncAt);
    assert.equal(info.lastSyncError, null);
    // Die neue Spule bekommt einen eigenen Verlauf-Eintrag (unter "System", da automatisch gelaufen)
    const history = await prisma.auditLog.findMany({ where: { area: "SPOOL", entityId: created.id } });
    assert.equal(history.length, 1);
    assert.equal(history[0]?.action, "CREATE");
    assert.equal(history[0]?.username, "System");

    assert.equal(await runAutoSyncOnce({ now: new Date(Date.now() + 10 * 60_000), pauseMs: 0 }), 0);
    assert.equal(listCalls, 1);

    // Ein weiterer, faelliger Abgleich ohne echte Aenderung (gleicher Cloud-Stand) schreibt keinen weiteren Eintrag
    await prisma.bambuConnection.updateMany({ data: { lastAttemptAt: null } });
    assert.equal(await runAutoSyncOnce({ now, pauseMs: 0 }), 1);
    assert.equal(listCalls, 2);
    assert.equal(await prisma.auditLog.count({ where: { area: "SPOOL", entityId: created.id } }), 1);
  });

  it("merkt Fehler mit Grund und versucht nicht sofort erneut; abgelaufenes Token verwirft die Verbindung", async () => {
    await setInterval(60);
    failWith = new BambuCloudError("blocked");
    assert.equal(await runAutoSyncOnce({ now, pauseMs: 0 }), 1);
    const info = await getConnectionInfo(lager);
    assert.ok(info.lastSyncError);
    assert.equal(info.lastSyncAt, null);
    assert.equal(await runAutoSyncOnce({ now: new Date(Date.now() + 10 * 60_000), pauseMs: 0 }), 0);

    await prisma.bambuConnection.updateMany({ data: { lastAttemptAt: null } });
    failWith = new BambuCloudError("unauthorized");
    await runAutoSyncOnce({ now, pauseMs: 0 });
    assert.equal((await getConnectionInfo(lager)).connected, false);
  });
});
