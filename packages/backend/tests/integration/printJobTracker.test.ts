import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { prisma } from "../../src/prisma.js";
import { processPrinterStatus, resetPrintJobTrackerForTests } from "../../src/services/printJobTracker.js";
import { createInventoryWithMembers, createPrinterIn, createSpoolIn, resetInventoryData } from "../helpers/fixtures.js";

function status(over: Partial<PrinterLiveStatus>): PrinterLiveStatus {
  return {
    printerId: "x",
    connected: true,
    printing: false,
    printState: "idle",
    currentJobName: null,
    progressPercent: null,
    remainingSeconds: null,
    amsSlots: [],
    ...over
  };
}

describe("Automatische Verbrauchsbuchung aus dem Druckstatus", () => {
  let inventoryId = "";
  let printerId = "";
  let spoolId = "";
  let otherInventoryId = "";
  let otherSpoolId = "";

  before(async () => {
    await resetInventoryData();
    const inventory = await createInventoryWithMembers("Tracker-Lager", []);
    inventoryId = inventory.id;
    const other = await createInventoryWithMembers("Tracker-Fremd", []);
    otherInventoryId = other.id;
  });

  beforeEach(async () => {
    resetPrintJobTrackerForTests();
    await prisma.printJob.deleteMany();
    await prisma.amsSlotAssignment.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    const printer = await createPrinterIn(inventoryId, "Tracker-Drucker");
    printerId = printer.id;
    const spool = await createSpoolIn(inventoryId, "Rot", 500);
    spoolId = spool.id;
    await prisma.spool.update({ where: { id: spoolId }, data: { purchasePriceCents: 2000 } });
    const otherSpool = await createSpoolIn(otherInventoryId, "Fremd", 500);
    otherSpoolId = otherSpool.id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const printer = () => ({ id: printerId, inventoryId });

  it("bucht Verbrauch, Kosten und einen Druckauftrag beim Wechsel von laufend auf fertig", async () => {
    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 0, spoolId } });

    await processPrinterStatus(printer(), status({ printState: "running", currentJobName: "Testteil", amsSlots: [{ slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FF0000", remainingPercent: 80 }] }));
    await processPrinterStatus(printer(), status({ printState: "finished", amsSlots: [{ slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FF0000", remainingPercent: 60 }] }));

    const spool = await prisma.spool.findUniqueOrThrow({ where: { id: spoolId } });
    assert.equal(spool.remainingWeightG, 300); // 500 - 200 (20% von 1000g)

    const jobs = await prisma.printJob.findMany({ where: { spoolId } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].filamentUsedG, 200);
    assert.equal(jobs[0].costCents, 400); // 200/1000 * 2000
    assert.equal(jobs[0].succeeded, true);
    assert.equal(jobs[0].name, "Testteil");

    const logs = await prisma.spoolWeightLog.findMany({ where: { spoolId } });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].source, "PRINT");
    assert.equal(logs[0].deltaG, 200);
  });

  it("markiert einen fehlgeschlagenen Druck als nicht erfolgreich, bucht den Verbrauch trotzdem", async () => {
    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 0, spoolId } });
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: null, remainingPercent: 50 }] }));
    await processPrinterStatus(printer(), status({ printState: "failed", amsSlots: [{ slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: null, remainingPercent: 40 }] }));

    const jobs = await prisma.printJob.findMany({ where: { spoolId } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].succeeded, false);
    assert.equal(jobs[0].filamentUsedG, 100);
  });

  it("bucht nichts fuer Pause/Weiterdrucken und nicht doppelt bei mehreren 'running'-Meldungen", async () => {
    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 0, spoolId } });
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 90 }] }));
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 85 }] }));
    await processPrinterStatus(printer(), status({ printState: "paused", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 85 }] }));
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 85 }] }));
    await processPrinterStatus(printer(), status({ printState: "finished", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 70 }] }));

    const jobs = await prisma.printJob.findMany({ where: { spoolId } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].filamentUsedG, 200); // 90% -> 70%, der Zwischenstand bei 85% zaehlt nicht als eigener Start
  });

  it("bucht keinen Verbrauch ohne Zuordnung, ohne Fuellstand oder fuer eine Spule aus einem anderen Lager", async () => {
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 80 }] }));
    await processPrinterStatus(printer(), status({ printState: "finished", amsSlots: [{ slotIndex: 0, reportedMaterial: null, reportedColorHex: null, remainingPercent: 40 }] }));
    assert.equal(await prisma.printJob.count(), 0);

    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 1, spoolId } });
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [] }));
    await processPrinterStatus(printer(), status({ printState: "finished", amsSlots: [{ slotIndex: 1, reportedMaterial: null, reportedColorHex: null, remainingPercent: 10 }] }));
    assert.equal(await prisma.printJob.count(), 0);

    await prisma.amsSlotAssignment.deleteMany();
    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 2, spoolId: otherSpoolId } });
    await processPrinterStatus(printer(), status({ printState: "running", amsSlots: [{ slotIndex: 2, reportedMaterial: null, reportedColorHex: null, remainingPercent: 90 }] }));
    await processPrinterStatus(printer(), status({ printState: "finished", amsSlots: [{ slotIndex: 2, reportedMaterial: null, reportedColorHex: null, remainingPercent: 20 }] }));
    assert.equal(await prisma.printJob.count(), 0);
    const untouched = await prisma.spool.findUniqueOrThrow({ where: { id: otherSpoolId } });
    assert.equal(untouched.remainingWeightG, 500);
  });
});
