import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createCatalogEntries,
  createInventoryWithMembers,
  createLoggedInUser,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

const BASE_RANGE = "from=2026-09-22T00:00:00.000Z&to=2026-09-27T00:00:00.000Z";

describe("Verbrauchs-Statistik - Negativ-Tests und Rechnung", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerA = "";
  let lagerB = "";

  async function log(spoolId: string, inventoryId: string, at: string, deltaG: number): Promise<void> {
    await prisma.spoolWeightLog.create({ data: { spoolId, inventoryId, at: new Date(at), deltaG, remainingG: 500, source: "MANUAL" } });
  }

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "statseditor");
    viewer = await createLoggedInUser(app, "statsviewer");
    outsider = await createLoggedInUser(app, "statsoutsider");
    lagerA = (await createInventoryWithMembers("Stats A", [{ userId: editor.id, role: "EDITOR" }, { userId: viewer.id, role: "VIEWER" }])).id;
    lagerB = (await createInventoryWithMembers("Stats B", [{ userId: outsider.id, role: "OWNER" }])).id;

    const { manufacturerId } = await createCatalogEntries();
    const petg =
      (await prisma.material.findFirst({ where: { name: "Test PETG", manufacturerId } })) ??
      (await prisma.material.create({ data: { name: "Test PETG", manufacturerId, printTempMinC: 220, printTempMaxC: 250 } }));
    const a1 = await createSpoolIn(lagerA, "PLA mit Preis");
    await prisma.spool.update({ where: { id: a1.id }, data: { purchasePriceCents: 2500 } });
    const a2 = await createSpoolIn(lagerA, "PETG archiviert");
    await prisma.spool.update({ where: { id: a2.id }, data: { materialId: petg.id, archivedAt: new Date(), archiveReason: "MANUAL" } });
    const b1 = await createSpoolIn(lagerB, "Fremd");

    await log(a1.id, lagerA, "2026-09-20T08:00:00.000Z", 10); // vor dem Zeitraum, aber frueheste Erfassung
    await log(a1.id, lagerA, "2026-09-24T10:00:00.000Z", 100);
    await log(a1.id, lagerA, "2026-09-24T18:00:00.000Z", 50);
    await log(a1.id, lagerA, "2026-09-25T12:00:00.000Z", -300); // Gewicht erhoeht: zaehlt nicht als Verbrauch
    await log(a1.id, lagerA, "2026-09-26T09:00:00.000Z", 200);
    await log(a1.id, lagerA, "2026-09-26T22:30:00.000Z", 10); // in Berlin schon am 27.09.
    await log(a2.id, lagerA, "2026-09-25T09:00:00.000Z", 400); // archivierte Spule zaehlt mit
    await log(b1.id, lagerB, "2026-09-25T09:00:00.000Z", 999);
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const stats = (user: TestUser | null, query: string) => {
    const req = request(app).get("/api/stats/consumption?" + query);
    return user ? req.set("Cookie", user.cookie) : req;
  };
  const dayMap = (response: request.Response): Record<string, number> =>
    Object.fromEntries(response.body.data.buckets.map((bucket: { key: string; consumedG: number }) => [bucket.key, bucket.consumedG]));

  it("lehnt anonyme Zugriffe ab (401) und zeigt Fremden das Lager nicht (404)", async () => {
    assert.equal((await stats(null, "inventoryId=" + lagerA + "&period=day")).status, 401);
    assert.equal((await stats(outsider, "inventoryId=" + lagerA + "&period=day")).status, 404);
  });

  it("prueft Eingaben: fehlendes Lager, unbekannte Periode, verdrehter oder riesiger Zeitraum, ungueltige Zeitzone", async () => {
    const id = "inventoryId=" + lagerA;
    for (const bad of [
      "period=day",
      id,
      id + "&period=stunde",
      "inventoryId=kein-uuid&period=day",
      id + "&period=day&from=2026-09-27T00:00:00.000Z&to=2026-09-22T00:00:00.000Z",
      id + "&period=day&from=gestern",
      id + "&period=day&from=2000-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
      id + "&period=day&timeZone=Mars/Olympus"
    ]) {
      assert.equal((await stats(editor, bad)).status, 400, bad);
    }
  });

  it("rechnet den Verbrauch je Tag: nur positive Aenderungen, archivierte Spulen zaehlen mit, Kosten aus dem Kaufpreis", async () => {
    const res = await stats(viewer, "inventoryId=" + lagerA + "&period=day&" + BASE_RANGE);
    assert.equal(res.status, 200);
    assert.deepEqual(dayMap(res), {
      "2026-09-22": 0, "2026-09-23": 0, "2026-09-24": 150, "2026-09-25": 400, "2026-09-26": 210, "2026-09-27": 0
    });
    assert.deepEqual(res.body.data.totals, { consumedG: 760, costCents: 900 });
    assert.deepEqual(res.body.data.byType, [{ label: "PETG", consumedG: 400 }, { label: "PLA", consumedG: 360 }]);
    assert.deepEqual(res.body.data.byManufacturer, [{ label: "Test Hersteller", consumedG: 760 }]);
    assert.equal(res.body.data.trackingSince, "2026-09-20T08:00:00.000Z");
    const cost = Object.fromEntries(res.body.data.buckets.map((b: { key: string; costCents: number }) => [b.key, b.costCents]));
    assert.deepEqual([cost["2026-09-24"], cost["2026-09-25"], cost["2026-09-26"]], [375, 0, 525]);
  });

  it("fasst nach Woche, Monat und Jahr zusammen", async () => {
    const q = "inventoryId=" + lagerA + "&" + BASE_RANGE;
    assert.deepEqual(dayMap(await stats(editor, q + "&period=week")), { "2026-09-21": 760 });
    assert.deepEqual(dayMap(await stats(editor, q + "&period=month")), { "2026-09": 760 });
    assert.deepEqual(dayMap(await stats(editor, q + "&period=year")), { "2026": 760 });
  });

  it("rechnet in der Zeitzone des Benutzers: 22:30 UTC ist in Berlin schon der naechste Tag", async () => {
    const res = await stats(editor, "inventoryId=" + lagerA + "&period=day&" + BASE_RANGE + "&timeZone=Europe/Berlin");
    assert.equal(dayMap(res)["2026-09-26"], 200);
    assert.equal(dayMap(res)["2026-09-27"], 10);
  });

  it("'all' enthaelt nur Lager mit Mitgliedschaft und nie fremde Daten", async () => {
    const mine = await stats(editor, "inventoryId=all&period=month&" + BASE_RANGE);
    assert.equal(mine.body.data.totals.consumedG, 760);
    const theirs = await stats(outsider, "inventoryId=all&period=month&" + BASE_RANGE);
    assert.equal(theirs.body.data.totals.consumedG, 999);
    assert.deepEqual(theirs.body.data.byType, [{ label: "PLA", consumedG: 999 }]);
  });

  it("nutzt ohne Zeitraum einen Standard (30 Tage) und meldet leere Lager ohne Fehler", async () => {
    const res = await stats(editor, "inventoryId=" + lagerA + "&period=day");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.buckets.length, 30);
    const empty = await createInventoryWithMembers("Stats leer", [{ userId: editor.id, role: "EDITOR" }]);
    const none = await stats(editor, "inventoryId=" + empty.id + "&period=week");
    assert.equal(none.status, 200);
    assert.deepEqual([none.body.data.totals.consumedG, none.body.data.trackingSince], [0, null]);
  });
});
