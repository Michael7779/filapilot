import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { BambuSpool } from "@filapilot/shared";
import { prisma } from "../../src/prisma.js";
import { syncInventoryFromCloud } from "../../src/services/bambuSyncService.js";
import { createCatalogEntries, createInventoryWithMembers, resetInventoryData } from "../helpers/fixtures.js";

function cloudSpool(over: Partial<BambuSpool> & { id: string }): BambuSpool {
  return {
    filamentVendor: "Test Hersteller",
    filamentType: "PLA",
    filamentName: "Test PLA",
    color: "FF0000",
    netWeight: 500,
    totalNetWeight: 1000,
    status: 0,
    inPrinter: false,
    deviceName: null,
    ...over
  };
}

// R26: lastModifiedAt soll beim automatischen Bambu-Cloud-Abgleich nur gesetzt werden, wenn sich dabei
// tatsaechlich ein Wert geaendert hat (Restgewicht oder Archiv-Status) - nicht bei jedem Abgleichlauf.
describe("Bambu-Cloud-Abgleich: lastModifiedAt nur bei echter Aenderung (R26)", () => {
  let inventoryId = "";
  let inventoryName = "";
  const actor = { id: null, username: "system" };

  before(async () => {
    await resetInventoryData();
  });

  beforeEach(async () => {
    await prisma.spool.deleteMany();
    await prisma.inventory.deleteMany();
    const inventory = await createInventoryWithMembers("Sync-Lager", []);
    inventoryId = inventory.id;
    inventoryName = inventory.name;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("setzt lastModifiedAt nicht, wenn der Abgleich das Restgewicht nicht aendert", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const spool = await prisma.spool.create({
      data: { materialId, manufacturerId, inventoryId, colorName: "Rot", initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: "cloud-1" }
    });
    await syncInventoryFromCloud(inventoryId, [cloudSpool({ id: "cloud-1", netWeight: 500 })], actor, { id: inventoryId, name: inventoryName });
    const unchanged = await prisma.spool.findUniqueOrThrow({ where: { id: spool.id } });
    assert.equal(unchanged.remainingWeightG, 500);
    assert.equal(unchanged.lastModifiedAt, null);
  });

  it("setzt lastModifiedAt, wenn der Abgleich das Restgewicht aendert", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const spool = await prisma.spool.create({
      data: { materialId, manufacturerId, inventoryId, colorName: "Blau", initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: "cloud-2" }
    });
    await syncInventoryFromCloud(inventoryId, [cloudSpool({ id: "cloud-2", netWeight: 300 })], actor, { id: inventoryId, name: inventoryName });
    const changed = await prisma.spool.findUniqueOrThrow({ where: { id: spool.id } });
    assert.equal(changed.remainingWeightG, 300);
    assert.ok(changed.lastModifiedAt !== null);
  });

  it("setzt lastModifiedAt, wenn eine Spule in der Cloud nicht mehr gefunden und archiviert wird", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const spool = await prisma.spool.create({
      data: { materialId, manufacturerId, inventoryId, colorName: "Gruen", initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: "cloud-3" }
    });
    // Eine andere Cloud-Spule haelt cloudIds nicht leer, damit die Sicherheitsbremse (leere Cloud-Antwort) nicht greift.
    await syncInventoryFromCloud(inventoryId, [cloudSpool({ id: "cloud-other", netWeight: 100 })], actor, { id: inventoryId, name: inventoryName });
    const archived = await prisma.spool.findUniqueOrThrow({ where: { id: spool.id } });
    assert.ok(archived.archivedAt !== null);
    assert.equal(archived.archiveReason, "CLOUD_REMOVED");
    assert.ok(archived.lastModifiedAt !== null);
  });
});
