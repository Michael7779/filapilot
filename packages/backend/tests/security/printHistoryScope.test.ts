import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { saveConnection } from "../../src/services/bambuConnectionService.js";
import { recordPrintHistory } from "../../src/services/printHistory.js";
import { disconnectAllPrinters } from "../../src/services/printerRuntime.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

const ACTOR = { id: null, username: "System" };

describe("Druckhistorie - Negativ-Tests (nur eigenes Lager, nur mit Recht)", () => {
  const app = createApp();
  let owner: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let mine = "";
  let foreign = "";
  let tasks: unknown[] = [];
  let calls = 0;

  const client = {
    listFilaments: () => Promise.resolve([]),
    getUserId: () => Promise.resolve("1"),
    listTasks() {
      calls += 1;
      return Promise.resolve(tasks);
    }
  } as unknown as BambuCloudClient;

  const task = (serialNumber: string): Record<string, unknown> => ({
    id: 9,
    status: 2,
    deviceId: serialNumber,
    designTitle: "Geheimes Teil",
    endTime: new Date(Date.now() + 60_000).toISOString(),
    amsDetailMapping: [{ amsId: 0, slotId: 0, weight: 20, filamentType: "PLA" }]
  });

  async function cloudPrinter(inventoryId: string): Promise<{ id: string; serialNumber: string }> {
    const { id } = await createPrinterIn(inventoryId);
    return prisma.printer.update({ where: { id }, data: { connectionMode: "CLOUD" }, select: { id: true, serialNumber: true } });
  }

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "histowner");
    viewer = await createLoggedInUser(app, "histviewer");
    outsider = await createLoggedInUser(app, "histoutsider");
    mine = (await createInventoryWithMembers("Hist A", [{ userId: owner.id, role: "OWNER" }, { userId: viewer.id, role: "VIEWER" }])).id;
    foreign = (await createInventoryWithMembers("Hist B", [{ userId: owner.id, role: "OWNER" }, { userId: outsider.id, role: "OWNER" }])).id;
  });

  beforeEach(async () => {
    setBambuCloudClientForTests(client);
    tasks = [];
    calls = 0;
    await prisma.printJob.deleteMany();
    await prisma.amsSlotAssignment.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.bambuConnection.deleteMany();
    await saveConnection({ inventoryId: mine, region: "global", token: "TOKEN-A", connectedByName: "histowner" });
  });

  after(async () => {
    disconnectAllPrinters();
    setBambuCloudClientForTests(null);
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("bucht nie auf Drucker eines anderen Lagers, auch wenn das verbundene Konto dessen Drucke nennt", async () => {
    await cloudPrinter(mine);
    const other = await cloudPrinter(foreign);
    const spool = await createSpoolIn(foreign);
    await prisma.amsSlotAssignment.create({ data: { printerId: other.id, slotIndex: 0, spoolId: spool.id } });
    tasks = [task(other.serialNumber)];
    assert.equal(await recordPrintHistory(mine, ACTOR), 0);
    assert.equal(await prisma.printJob.count(), 0);
  });

  it("bucht nie auf eine Spule eines anderen Lagers, die noch im Fach steht", async () => {
    const printer = await cloudPrinter(mine);
    const spool = await createSpoolIn(foreign);
    await prisma.amsSlotAssignment.create({ data: { printerId: printer.id, slotIndex: 0, spoolId: spool.id } });
    tasks = [task(printer.serialNumber)];
    assert.equal(await recordPrintHistory(mine, ACTOR), 0);
    assert.equal((await prisma.spool.findUniqueOrThrow({ where: { id: spool.id } })).remainingWeightG, 800);
  });

  it("Anonyme, Fremde und Betrachter koennen die Abfrage nicht ausloesen", async () => {
    await cloudPrinter(mine);
    const url = `/api/inventories/${mine}/bambu-import/sync`;
    assert.equal((await request(app).post(url)).status, 401);
    assert.equal((await request(app).post(url).set("Cookie", outsider.cookie)).status, 404);
    assert.equal((await request(app).post(url).set("Cookie", viewer.cookie)).status, 403);
    assert.equal(calls, 0);
    assert.equal((await request(app).post(url).set("Cookie", owner.cookie)).status, 200);
    assert.equal(calls, 1);
  });

  it("nach dem Verschieben oder Aendern der Verbindungsart werden fruehere Drucke nicht uebernommen", async () => {
    const printer = await cloudPrinter(mine);
    const past = new Date("2026-01-01T00:00:00Z");
    const historyFrom = async (): Promise<number> => (await prisma.printer.findUniqueOrThrow({ where: { id: printer.id } })).historyFrom.getTime();
    const patch = (body: Record<string, unknown>) => request(app).patch(`/api/printers/${printer.id}`).set("Cookie", owner.cookie).send(body);

    await prisma.printer.update({ where: { id: printer.id }, data: { historyFrom: past } });
    assert.equal((await patch({ name: "Nur umbenannt" })).status, 200);
    assert.equal(await historyFrom(), past.getTime());

    assert.equal((await patch({ inventoryId: foreign })).status, 200);
    assert.ok((await historyFrom()) > past.getTime());

    await prisma.printer.update({ where: { id: printer.id }, data: { historyFrom: past } });
    assert.equal((await patch({ connectionMode: "LOCAL", ipAddress: "192.0.2.9", accessCode: "12345678" })).status, 200);
    assert.ok((await historyFrom()) > past.getTime());
  });

  it("gibt die interne Buchungskennung nicht an den Client", async () => {
    const printer = await cloudPrinter(mine);
    const spool = await createSpoolIn(mine);
    await prisma.amsSlotAssignment.create({ data: { printerId: printer.id, slotIndex: 0, spoolId: spool.id } });
    tasks = [task(printer.serialNumber)];
    assert.equal(await recordPrintHistory(mine, ACTOR), 1);
    const res = await request(app).get(`/api/print-jobs?inventoryId=${mine}`).set("Cookie", viewer.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.jobs.length, 1);
    assert.equal("cloudTaskKey" in res.body.data.jobs[0], false);
  });
});
