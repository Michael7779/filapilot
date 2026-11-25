import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AmsSlotStatus, BambuSpool, PrinterLiveStatus, PrintState } from "@filapilot/shared";
import { prisma } from "../../src/prisma.js";
import { autoAssignAmsSlots, cloudSlotIndex } from "../../src/services/amsAutoAssign.js";
import { assignAmsSlot } from "../../src/services/amsSlotService.js";
import { createCatalogEntries, createInventoryWithMembers, createPrinterIn, resetInventoryData } from "../helpers/fixtures.js";

const actor = { id: null, username: "system" };

interface Setup {
  inventory: { id: string; name: string };
  printerId: string;
  serial: string;
}

function live(slotIndex: number, material: string | null, colorHex: string | null): AmsSlotStatus {
  return { slotIndex, reportedMaterial: material, reportedColorHex: colorHex, remainingPercent: 50 };
}

function statusWith(slots: AmsSlotStatus[], printState: PrintState = "idle", connected = true) {
  return {
    statusOf: (printerId: string): PrinterLiveStatus => ({
      printerId,
      connected,
      printing: printState === "running",
      printState,
      currentJobName: null,
      progressPercent: null,
      remainingSeconds: null,
      amsSlots: slots
    })
  };
}

function cloud(id: string, serial: string, amsId: unknown, slotId: unknown, over: Partial<BambuSpool> = {}): BambuSpool {
  return { id, filamentType: "PLA", color: "#FFFFFFFF", inPrinter: true, devId: serial, amsId, slotId, ...over };
}

async function setup(name: string): Promise<Setup> {
  const inventory = await createInventoryWithMembers(name, []);
  const printer = await createPrinterIn(inventory.id);
  const row = await prisma.printer.findUniqueOrThrow({ where: { id: printer.id }, select: { serialNumber: true } });
  return { inventory: { id: inventory.id, name: inventory.name }, printerId: printer.id, serial: row.serialNumber };
}

async function spoolWith(inventoryId: string, cloudId: string): Promise<string> {
  const { materialId, manufacturerId } = await createCatalogEntries();
  const spool = await prisma.spool.create({
    data: { materialId, manufacturerId, inventoryId, colorName: cloudId, initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: cloudId }
  });
  return spool.id;
}

async function assignments(printerId: string): Promise<[number, string | null, boolean][]> {
  const rows = await prisma.amsSlotAssignment.findMany({ where: { printerId }, orderBy: { slotIndex: "asc" } });
  return rows.map((row) => [row.slotIndex, row.spoolId, row.autoAssigned]);
}

describe("cloudSlotIndex", () => {
  it("rechnet AMS und Fach in den Slot-Index um, 254/255 ist die externe Spule, alles andere zaehlt nicht", () => {
    assert.equal(cloudSlotIndex(0, 0), 0);
    assert.equal(cloudSlotIndex("1", "2"), 6);
    assert.equal(cloudSlotIndex(255, 0), 254);
    assert.equal(cloudSlotIndex("254", null), 254);
    for (const [ams, slot] of [[4, 0], [0, 4], [-1, 0], [null, 0], [0, ""], ["x", 1], [128, 0]]) {
      assert.equal(cloudSlotIndex(ams, slot), null, `${String(ams)}/${String(slot)}`);
    }
  });
});

describe("Automatische AMS-Zuordnung aus der Bambu-Cloud", () => {
  before(async () => {
    await resetInventoryData();
  });
  beforeEach(async () => {
    await resetInventoryData();
  });
  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("ordnet AMS-Fach und externe Spule zu, wenn der Drucker dort dasselbe Material und die Farbe meldet", async () => {
    const { inventory, printerId, serial } = await setup("Auto-1");
    const white = await spoolWith(inventory.id, "c-white");
    const tpu = await spoolWith(inventory.id, "c-tpu");

    const result = await autoAssignAmsSlots(
      inventory,
      [cloud("c-white", serial.toLowerCase(), "0", "1"), cloud("c-tpu", serial, 255, 0, { filamentType: "TPU", color: "#000000" })],
      actor,
      statusWith([live(1, "PLA", "#FEFEFE"), live(254, "TPU", "#000000")])
    );

    assert.deepEqual(result, { assigned: 2, cleared: 0 });
    assert.deepEqual(await assignments(printerId), [[1, white, true], [254, tpu, true]]);
    assert.ok((await prisma.spool.findUniqueOrThrow({ where: { id: white } })).openedAt !== null);
  });

  it("ordnet nichts zu, wenn Material oder Farbe nicht passen, das Fach nicht gemeldet wird oder der Drucker fehlt", async () => {
    const { inventory, printerId, serial } = await setup("Auto-2");
    await spoolWith(inventory.id, "c-1");
    const spools = [cloud("c-1", serial, 0, 0)];
    for (const deps of [
      statusWith([live(0, "PETG", "#FFFFFF")]),
      statusWith([live(0, "PLA", "#000000")]),
      statusWith([live(0, null, null)]),
      statusWith([live(1, "PLA", "#FFFFFF")]),
      statusWith([live(0, "PLA", "#FFFFFF")], "idle", false)
    ]) {
      await autoAssignAmsSlots(inventory, spools, actor, deps);
    }
    await autoAssignAmsSlots(inventory, [cloud("c-1", "ANDERE-SERIE", 0, 0)], actor, statusWith([live(0, "PLA", "#FFFFFF")]));
    await autoAssignAmsSlots(inventory, [cloud("c-1", serial, 0, 0, { inPrinter: false })], actor, statusWith([live(0, "PLA", "#FFFFFF")]));
    assert.deepEqual(await assignments(printerId), []);
  });

  it("raet nicht, wenn zwei Cloud-Spulen dasselbe Fach beanspruchen", async () => {
    const { inventory, printerId, serial } = await setup("Auto-3");
    await spoolWith(inventory.id, "c-a");
    await spoolWith(inventory.id, "c-b");
    await autoAssignAmsSlots(inventory, [cloud("c-a", serial, 0, 0), cloud("c-b", serial, 0, 0)], actor, statusWith([live(0, "PLA", "#FFFFFF")]));
    assert.deepEqual(await assignments(printerId), []);
  });

  it("ueberschreibt nie eine selbst gewaehlte Spule und legt sie nicht zusaetzlich in ein zweites Fach", async () => {
    const { inventory, printerId, serial } = await setup("Auto-4");
    const mine = await spoolWith(inventory.id, "c-mine");
    await spoolWith(inventory.id, "c-cloud");
    await assignAmsSlot(printerId, inventory.id, 0, mine);

    await autoAssignAmsSlots(
      inventory,
      [cloud("c-cloud", serial, 0, 0), cloud("c-mine", serial, 0, 1)],
      actor,
      statusWith([live(0, "PLA", "#FFFFFF"), live(1, "PLA", "#FFFFFF")])
    );

    assert.deepEqual(await assignments(printerId), [[0, mine, false]]);
  });

  it("folgt bei automatischen Zuordnungen der Cloud: Spulenwechsel ersetzt, entnommene Spule leert das Fach", async () => {
    const { inventory, printerId, serial } = await setup("Auto-5");
    await spoolWith(inventory.id, "c-old");
    const fresh = await spoolWith(inventory.id, "c-new");
    const deps = statusWith([live(0, "PLA", "#FFFFFF")]);
    await autoAssignAmsSlots(inventory, [cloud("c-old", serial, 0, 0)], actor, deps);

    await autoAssignAmsSlots(inventory, [cloud("c-new", serial, 0, 0)], actor, deps);
    assert.deepEqual(await assignments(printerId), [[0, fresh, true]]);

    const result = await autoAssignAmsSlots(inventory, [], actor, deps);
    assert.deepEqual(result, { assigned: 0, cleared: 1 });
    assert.deepEqual(await assignments(printerId), []);
  });

  it("aendert waehrend eines Drucks (auch pausiert) nichts", async () => {
    const { inventory, printerId, serial } = await setup("Auto-6");
    const old = await spoolWith(inventory.id, "c-old");
    await spoolWith(inventory.id, "c-new");
    await autoAssignAmsSlots(inventory, [cloud("c-old", serial, 0, 0)], actor, statusWith([live(0, "PLA", "#FFFFFF")]));
    for (const state of ["running", "paused"] as const) {
      await autoAssignAmsSlots(inventory, [cloud("c-new", serial, 0, 0)], actor, statusWith([live(0, "PLA", "#FFFFFF")], state));
    }
    assert.deepEqual(await assignments(printerId), [[0, old, true]]);
  });

  it("bleibt im eigenen Lager: weder Drucker noch Spulen eines anderen Lagers werden benutzt", async () => {
    const mine = await setup("Auto-7");
    const other = await setup("Auto-7-fremd");
    await spoolWith(other.inventory.id, "c-foreign");
    await spoolWith(mine.inventory.id, "c-here");
    const deps = statusWith([live(0, "PLA", "#FFFFFF")]);

    await autoAssignAmsSlots(mine.inventory, [cloud("c-foreign", mine.serial, 0, 0)], actor, deps);
    await autoAssignAmsSlots(mine.inventory, [cloud("c-here", other.serial, 0, 0)], actor, deps);

    assert.deepEqual(await assignments(mine.printerId), []);
    assert.deepEqual(await assignments(other.printerId), []);
  });

  it("gibt beim Wahl von Hand die automatische Zuordnung derselben Spule anderswo auf", async () => {
    const { inventory, printerId, serial } = await setup("Auto-8");
    const spool = await spoolWith(inventory.id, "c-move");
    await autoAssignAmsSlots(inventory, [cloud("c-move", serial, 0, 0)], actor, statusWith([live(0, "PLA", "#FFFFFF")]));
    await assignAmsSlot(printerId, inventory.id, 2, spool);
    assert.deepEqual(await assignments(printerId), [[2, spool, false]]);
  });
});
