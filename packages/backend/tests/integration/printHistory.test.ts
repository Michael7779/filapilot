import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { BambuCloudError, setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { saveConnection } from "../../src/services/bambuConnectionService.js";
import { recordPrintHistory, schedulePrintHistoryCheck } from "../../src/services/printHistory.js";
import { createInventoryWithMembers, createPrinterIn, createSpoolIn, resetInventoryData } from "../helpers/fixtures.js";

const ACTOR = { id: null, username: "System" };

describe("Verbrauch aus der Druckhistorie buchen", () => {
  let inventoryId = "";
  let printerId = "";
  let serialNumber = "";
  let spoolId = "";
  let tasks: unknown[] = [];
  let calls = 0;
  let fail = false;

  const client = {
    listTasks() {
      calls += 1;
      return fail ? Promise.reject(new BambuCloudError("blocked")) : Promise.resolve(tasks);
    }
  } as unknown as BambuCloudClient;

  const task = (over: Record<string, unknown> = {}, filament: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 1,
    status: 2,
    deviceId: serialNumber,
    designTitle: "Testteil",
    startTime: new Date(Date.now() + 1000).toISOString(),
    endTime: new Date(Date.now() + 60_000).toISOString(),
    amsDetailMapping: [{ amsId: 0, slotId: 0, weight: 31.36, filamentType: "PLA", targetColor: "FF0000FF", ...filament }],
    ...over
  });

  const remaining = async (): Promise<number> => (await prisma.spool.findUniqueOrThrow({ where: { id: spoolId } })).remainingWeightG;
  const assign = (slotIndex = 0, id = spoolId) => prisma.amsSlotAssignment.create({ data: { printerId, slotIndex, spoolId: id } });

  before(async () => {
    await resetInventoryData();
    inventoryId = (await createInventoryWithMembers("Historie-Lager", [])).id;
  });

  beforeEach(async () => {
    setBambuCloudClientForTests(client);
    tasks = [];
    calls = 0;
    fail = false;
    await prisma.printJob.deleteMany();
    await prisma.amsSlotAssignment.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.bambuConnection.deleteMany();
    await saveConnection({ inventoryId, region: "global", token: "TOKEN-H", connectedByName: "test" });
    printerId = (await createPrinterIn(inventoryId, "P1S")).id;
    const printer = await prisma.printer.update({ where: { id: printerId }, data: { connectionMode: "CLOUD" } });
    serialNumber = printer.serialNumber;
    spoolId = (await createSpoolIn(inventoryId, "Rot", 500)).id;
    await prisma.spool.update({ where: { id: spoolId }, data: { colorHex: "#FF0000", purchasePriceCents: 2000, bambuCloudId: "77" } });
    tasks = [task()];
  });

  after(async () => {
    setBambuCloudClientForTests(null);
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("legt fuer eine Cloud-Spule den Druckauftrag mit Kosten an, ohne das Gewicht ein zweites Mal abzuziehen", async () => {
    await assign();
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 1);

    const [job] = await prisma.printJob.findMany();
    assert.deepEqual(
      [job?.printerId, job?.spoolId, job?.name, job?.filamentUsedG, job?.costCents, job?.succeeded],
      [printerId, spoolId, "Testteil", 31, 62, true]
    );
    assert.equal(await remaining(), 500);
    assert.equal(await prisma.spoolWeightLog.count({ where: { spoolId } }), 0);
    assert.ok((await prisma.spool.findUniqueOrThrow({ where: { id: spoolId } })).openedAt);
    assert.equal(await prisma.auditLog.count({ where: { area: "PRINTER", entityId: printerId } }), 1);
  });

  it("zieht bei einer Spule ohne Cloud-Verknuepfung das Gewicht ab und schreibt den Verlauf", async () => {
    await prisma.spool.update({ where: { id: spoolId }, data: { bambuCloudId: null } });
    await assign();
    await recordPrintHistory(inventoryId, ACTOR);
    assert.equal(await remaining(), 469);
    const [log] = await prisma.spoolWeightLog.findMany({ where: { spoolId } });
    assert.deepEqual([log?.deltaG, log?.remainingG, log?.source], [31, 469, "PRINT"]);
  });

  it("bucht denselben Druck nie zweimal, auch nicht bei gleichzeitigen Aufrufen", async () => {
    await prisma.spool.update({ where: { id: spoolId }, data: { bambuCloudId: null } });
    await assign();
    await Promise.all([recordPrintHistory(inventoryId, ACTOR), recordPrintHistory(inventoryId, ACTOR)]);
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    assert.equal(await prisma.printJob.count(), 1);
    assert.equal(await remaining(), 469);
  });

  it("bucht weder haengende noch Drucke von vor Beginn der Erfassung", async () => {
    await assign();
    tasks = [task({ id: 2, status: 1 }), task({ id: 3, startTime: "2026-01-01T10:00:00Z", endTime: "2026-01-01T11:00:00Z" })];
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    assert.equal(await prisma.printJob.count(), 0);
  });

  it("bucht nichts bei leerem Fach, anderem Material oder anderer Farbe - spaeter nachholbar", async () => {
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    await assign();
    tasks = [task({}, { filamentType: "PETG" })];
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    tasks = [task({}, { targetColor: "0000FFFF" })];
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    tasks = [task()];
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 1);
  });

  it("fragt die Cloud ohne Cloud-Drucker oder ohne gemerkte Verbindung gar nicht ab", async () => {
    await prisma.printer.update({ where: { id: printerId }, data: { connectionMode: "LOCAL" } });
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    await prisma.printer.update({ where: { id: printerId }, data: { connectionMode: "CLOUD" } });
    await prisma.bambuConnection.deleteMany();
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    assert.equal(calls, 0);
  });

  it("wirft nicht, wenn die Cloud die Abfrage ablehnt", async () => {
    fail = true;
    assert.equal(await recordPrintHistory(inventoryId, ACTOR), 0);
    assert.equal(calls, 1);
  });

  it("prueft nach dem Druckende zweimal verzoegert; ein neues Ende ersetzt die ausstehenden Pruefungen", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const run = mock.fn(() => Promise.resolve(0));
      schedulePrintHistoryCheck("lager-x", { delaysMs: [1000, 5000], run });
      mock.timers.tick(500);
      schedulePrintHistoryCheck("lager-x", { delaysMs: [1000, 5000], run });
      mock.timers.tick(999);
      assert.equal(run.mock.callCount(), 0);
      mock.timers.tick(1);
      assert.equal(run.mock.callCount(), 1);
      mock.timers.tick(10_000);
      assert.equal(run.mock.callCount(), 2);
    } finally {
      mock.timers.reset();
    }
  });
});
