import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

const VENDOR = "Spoolman-Archiv-Hersteller";

function spoolmanSpool(over: Record<string, unknown>): Record<string, unknown> {
  return {
    remaining_weight: 0,
    initial_weight: 1000,
    filament: { name: "PLA", material: "PLA", color_hex: "112233", vendor: { name: VENDOR } },
    ...over
  };
}

describe("Spoolman-Import: archivierte Spulen und lange Kommentare", () => {
  const app = createApp();
  let editor: TestUser;
  let lagerId = "";

  before(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany({ where: { manufacturer: { name: VENDOR } } });
    await prisma.manufacturer.deleteMany({ where: { name: VENDOR } });
    editor = await createLoggedInUser(app, "smarcheditor");
    lagerId = (
      await createInventoryWithMembers("Spoolman-Archiv-Lager", [
        { userId: editor.id, role: "EDITOR" }
      ])
    ).id;
  });

  after(async () => {
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany({ where: { manufacturer: { name: VENDOR } } });
    await prisma.manufacturer.deleteMany({ where: { name: VENDOR } });
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const importFile = (spools: unknown[]) =>
    request(app)
      .post(`/api/inventories/${lagerId}/spoolman-import/file`)
      .set("Cookie", editor.cookie)
      .send({ spools });

  it("legt in Spoolman archivierte Spulen als archiviert an (kein Fehlalarm 'fast leer' im Bestand)", async () => {
    const res = await importFile([
      spoolmanSpool({ id: 901, archived: true }),
      spoolmanSpool({ id: 902, archived: false, remaining_weight: 600 })
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.created, 2);
    const archived = await prisma.spool.findFirstOrThrow({
      where: { inventoryId: lagerId, spoolmanId: "901" }
    });
    assert.ok(archived.archivedAt);
    assert.equal(archived.archiveReason, "MANUAL");
    const active = await prisma.spool.findFirstOrThrow({
      where: { inventoryId: lagerId, spoolmanId: "902" }
    });
    assert.equal(active.archivedAt, null);
  });

  it("verknuepft eine archivierte Spule nie mit einer ungeoeffneten Spule des Bestands", async () => {
    const manufacturer = await prisma.manufacturer.findFirstOrThrow({ where: { name: VENDOR } });
    const material = await prisma.material.findFirstOrThrow({
      where: { manufacturerId: manufacturer.id }
    });
    const unopened = await prisma.spool.create({
      data: {
        inventoryId: lagerId,
        manufacturerId: manufacturer.id,
        materialId: material.id,
        colorName: "Blau",
        colorHex: "#112233",
        initialWeightG: 1000,
        remainingWeightG: 1000
      }
    });
    const res = await importFile([spoolmanSpool({ id: 903, archived: true })]);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.linked, 0);
    assert.equal(res.body.data.created, 1);
    assert.equal(
      (await prisma.spool.findUniqueOrThrow({ where: { id: unopened.id } })).spoolmanId,
      null
    );
    // Aufraeumen, sonst wuerde sie im naechsten Test (nicht archiviert, gleiche Farbe) automatisch verknuepft.
    await prisma.spool.delete({ where: { id: unopened.id } });
  });

  it("kuerzt einen Kommentar ueber 500 Zeichen, statt die ganze Spule zu verwerfen", async () => {
    const res = await importFile([
      spoolmanSpool({ id: 904, remaining_weight: 300, comment: "k".repeat(800) })
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.skipped, 0);
    const spool = await prisma.spool.findFirstOrThrow({
      where: { inventoryId: lagerId, spoolmanId: "904" }
    });
    assert.equal(spool.note?.length, 500);
  });
});
