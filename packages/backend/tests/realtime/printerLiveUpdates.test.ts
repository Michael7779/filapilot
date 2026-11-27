import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { prisma } from "../../src/prisma.js";
import { autoAssignAmsSlots } from "../../src/services/amsAutoAssign.js";
import {
  connectPrinter,
  disconnectPrinter,
  getLatestStatus,
  reportConnectionLost,
  reportPrinterStatus,
  whenPrinterConnectStarted
} from "../../src/services/printerRuntime.js";
import { inventoryRoom } from "../../src/socket.js";
import { createCatalogEntries, createInventoryWithMembers, createPrinterIn, resetInventoryData } from "../helpers/fixtures.js";
import { captureSocketEmissions } from "../helpers/socketSpy.js";

const emissions = captureSocketEmissions();

function connectedStatus(printerId: string): PrinterLiveStatus {
  return {
    printerId,
    connected: true,
    printing: false,
    printState: "idle",
    currentJobName: null,
    progressPercent: null,
    remainingSeconds: null,
    amsSlots: [{ slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FFFFFF", remainingPercent: 50 }]
  };
}

async function setup(name: string) {
  const inventory = await createInventoryWithMembers(name, []);
  const { id } = await createPrinterIn(inventory.id);
  const printer = await prisma.printer.findUniqueOrThrow({ where: { id } });
  return { inventory, printer };
}

describe("Drucker-Seite: Aenderungen werden gemeldet", () => {
  before(resetInventoryData);
  beforeEach(() => {
    emissions.length = 0;
  });
  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("meldet eine verlorene Verbindung einmal an das Lager des Druckers", async () => {
    const { inventory, printer } = await setup("Live-Verlust");
    reportPrinterStatus(printer, connectedStatus(printer.id));
    emissions.length = 0;

    reportConnectionLost(printer);
    reportConnectionLost(printer);

    assert.equal(getLatestStatus(printer.id).connected, false);
    assert.equal(emissions.length, 1);
    assert.equal(emissions[0]?.room, inventoryRoom(inventory.id));
    assert.equal(emissions[0]?.event, "printer:status");
    assert.deepEqual(emissions[0]?.payload, getLatestStatus(printer.id));
  });

  it("meldet den Grund, wenn ein Cloud-Drucker keine Bambu-Verbindung findet", async () => {
    const { inventory, printer } = await setup("Live-OhneKonto");
    connectPrinter({ ...printer, connectionMode: "CLOUD" });
    await whenPrinterConnectStarted(printer.id);
    disconnectPrinter(printer.id);

    assert.deepEqual(
      emissions.map((entry) => [entry.room, (entry.payload as PrinterLiveStatus).issue]),
      [[inventoryRoom(inventory.id), "cloud_no_account"]]
    );
  });

  it("meldet eine automatische AMS-Zuordnung, aber nur wenn sich etwas aendert", async () => {
    const { inventory, printer } = await setup("Live-Auto");
    const { materialId, manufacturerId } = await createCatalogEntries();
    await prisma.spool.create({
      data: { materialId, manufacturerId, inventoryId: inventory.id, colorName: "Weiss", initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: "live-1" }
    });
    const cloud = [
      { id: "live-1", filamentType: "PLA", color: "#FFFFFFFF", inPrinter: true, devId: printer.serialNumber, amsId: 0, slotId: 0 }
    ];
    const deps = { statusOf: connectedStatus };
    const actor = { id: null, username: "system" };

    await autoAssignAmsSlots(inventory, cloud, actor, deps);
    assert.deepEqual(emissions, [{ room: inventoryRoom(inventory.id), event: "ams:changed", payload: { inventoryId: inventory.id } }]);

    emissions.length = 0;
    await autoAssignAmsSlots(inventory, cloud, actor, deps);
    assert.deepEqual(emissions, []);
  });
});
