import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { ensureDefaultInventory } from "../../src/services/inventoryService.js";
import { createCatalogEntries, resetInventoryData } from "../helpers/fixtures.js";

describe("Hauptlager beim Start", () => {
  let adminId = "";
  let userId = "";

  before(async () => {
    await createCatalogEntries();
  });

  beforeEach(async () => {
    await resetInventoryData();
    const hash = await hashPassword("correct-horse-battery-staple");
    adminId = (await prisma.user.create({ data: { username: "migadmin", email: "migadmin@example.test", passwordHash: hash, role: "ADMIN", mustChangePassword: false } })).id;
    userId = (await prisma.user.create({ data: { username: "miguser", email: "miguser@example.test", passwordHash: hash, role: "USER", mustChangePassword: false } })).id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("legt das Hauptlager an und macht Admins zu Besitzern und andere zu Bearbeitern", async () => {
    await ensureDefaultInventory();

    const inventories = await prisma.inventory.findMany({ include: { members: true } });
    assert.equal(inventories.length, 1);
    assert.equal(inventories[0]?.name, "Hauptlager");
    const roles = Object.fromEntries((inventories[0]?.members ?? []).map((member) => [member.userId, member.role]));
    assert.deepEqual(roles, { [adminId]: "OWNER", [userId]: "EDITOR" });
  });

  it("ist wiederholbar ohne Wirkung und legt kein zweites Lager an", async () => {
    await ensureDefaultInventory();
    const before = await prisma.inventoryMember.count();
    await ensureDefaultInventory();
    await ensureDefaultInventory();
    assert.equal(await prisma.inventory.count(), 1);
    assert.equal(await prisma.inventoryMember.count(), before);
  });

  it("legt kein neues Lager an, wenn es schon eines gibt, und macht niemanden zum Mitglied", async () => {
    await prisma.inventory.create({ data: { name: "Erstes", createdAt: new Date("2020-01-01") } });
    await ensureDefaultInventory();
    assert.equal(await prisma.inventory.count(), 1);
    assert.equal(await prisma.inventoryMember.count(), 0);
  });
});

describe("Spulen und Drucker gehoeren immer zu einem Lager (Pflichtfeld in der Datenbank)", () => {
  let materialId = "";
  let manufacturerId = "";

  before(async () => {
    ({ materialId, manufacturerId } = await createCatalogEntries());
  });

  beforeEach(async () => {
    await resetInventoryData();
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("verweigert eine Spule ohne Lager schon in der Datenbank (nicht nur im Programmcode)", async () => {
    await assert.rejects(
      prisma.$executeRaw`INSERT INTO spools (id, "materialId", "manufacturerId", "colorName", "initialWeightG", "remainingWeightG", "updatedAt")
        VALUES (gen_random_uuid()::text, ${materialId}, ${manufacturerId}, 'Ohne Lager', 1000, 500, now())`,
      /23502|not-null|inventoryId/i
    );
    assert.equal(await prisma.spool.count(), 0);
  });

  it("verweigert einen Drucker ohne Lager schon in der Datenbank", async () => {
    await assert.rejects(
      prisma.$executeRaw`INSERT INTO printers (id, name, "ipAddress", "serialNumber", "accessCode")
        VALUES (gen_random_uuid()::text, 'Ohne Lager', '192.0.2.30', 'NOINV-1', '12345678')`,
      /23502|not-null|inventoryId/i
    );
    assert.equal(await prisma.printer.count(), 0);
  });

  it("verweigert Spule und Drucker mit einem Lager, das es nicht gibt (Fremdschluessel)", async () => {
    await assert.rejects(
      prisma.$executeRaw`INSERT INTO spools (id, "materialId", "manufacturerId", "colorName", "initialWeightG", "remainingWeightG", "updatedAt", "inventoryId")
        VALUES (gen_random_uuid()::text, ${materialId}, ${manufacturerId}, 'Waise', 1000, 500, now(), 'gibt-es-nicht')`,
      /23503|foreign key/i
    );
  });
});
