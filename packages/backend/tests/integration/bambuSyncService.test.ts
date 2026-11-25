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

  it("fuellt die leere Notiz einer vorhandenen Spule aus der Cloud - auch ohne Gewichtsaenderung, nie in einem anderen Lager", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const other = await createInventoryWithMembers("Anderes Sync-Lager", []);
    const base = { materialId, manufacturerId, initialWeightG: 1000, remainingWeightG: 500, bambuCloudId: "cloud-fill" };
    const mine = await prisma.spool.create({ data: { ...base, inventoryId, colorName: "Rot", note: "   " } });
    const foreign = await prisma.spool.create({ data: { ...base, inventoryId: other.id, colorName: "Rot" } });

    const summary = await syncInventoryFromCloud(
      inventoryId,
      [cloudSpool({ id: "cloud-fill", note: "  Trocken lagern  " })],
      actor,
      { id: inventoryId, name: inventoryName }
    );

    const updated = await prisma.spool.findUniqueOrThrow({ where: { id: mine.id } });
    assert.equal(updated.note, "Trocken lagern");
    assert.ok(updated.lastModifiedAt !== null);
    assert.equal(summary.updated, 1);
    assert.equal(summary.unchanged, 0);
    assert.equal((await prisma.spool.findUniqueOrThrow({ where: { id: foreign.id } })).note, null);
  });

  it("gibt auch einer verknuepften ungeoeffneten Spule die Notiz, wenn sie keine hat - eine eigene bleibt", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });
    const manufacturer = await prisma.manufacturer.findUniqueOrThrow({ where: { id: manufacturerId } });
    const inv = { id: inventoryId, name: inventoryName };
    const cloud = (id: string, color: string): BambuSpool =>
      cloudSpool({ id, color, note: "Aus Bambu", filamentVendor: manufacturer.name, filamentName: material.name });
    const unopened = { materialId, manufacturerId, inventoryId, initialWeightG: 1000, remainingWeightG: 1000 };
    const empty = await prisma.spool.create({ data: { ...unopened, colorName: "Rot", colorHex: "#FF0000" } });
    const own = await prisma.spool.create({ data: { ...unopened, colorName: "Blau", colorHex: "#0000FF", note: "Eigene" } });

    const summary = await syncInventoryFromCloud(inventoryId, [cloud("link-red", "#FF0000FF"), cloud("link-blue", "#0000FFFF")], actor, inv);

    assert.equal(summary.linked, 2);
    assert.equal((await prisma.spool.findUniqueOrThrow({ where: { id: empty.id } })).note, "Aus Bambu");
    assert.equal((await prisma.spool.findUniqueOrThrow({ where: { id: own.id } })).note, "Eigene");
  });

  it("uebernimmt die Notiz einer neuen Cloud-Spule, ueberschreibt aber spaeter nie die Notiz in FilaPilot", async () => {
    await createCatalogEntries();
    const inv = { id: inventoryId, name: inventoryName };
    await syncInventoryFromCloud(
      inventoryId,
      [cloudSpool({ id: "cloud-note", note: "Aus Bambu" })],
      actor,
      inv
    );
    const created = await prisma.spool.findFirstOrThrow({
      where: { inventoryId, bambuCloudId: "cloud-note" }
    });
    assert.equal(created.note, "Aus Bambu");

    await prisma.spool.update({ where: { id: created.id }, data: { note: "Meine eigene Notiz" } });
    await syncInventoryFromCloud(
      inventoryId,
      [cloudSpool({ id: "cloud-note", note: "In Bambu geaendert", netWeight: 400 })],
      actor,
      inv
    );
    const after = await prisma.spool.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(after.note, "Meine eigene Notiz");
    assert.equal(after.remainingWeightG, 400);
  });
});
