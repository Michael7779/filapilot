import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { ensureDefaultInventory } from "../../src/services/inventoryService.js";
import { createCatalogEntries, resetInventoryData } from "../helpers/fixtures.js";

describe("Datenuebernahme ins Hauptlager", () => {
  let adminId = "";
  let userId = "";
  let materialId = "";
  let manufacturerId = "";

  before(async () => {
    ({ materialId, manufacturerId } = await createCatalogEntries());
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

  async function orphans(): Promise<{ spoolId: string; printerId: string }> {
    const spool = await prisma.spool.create({ data: { materialId, manufacturerId, colorName: "Alt", initialWeightG: 1000, remainingWeightG: 500 } });
    const printer = await prisma.printer.create({ data: { name: "Alt", ipAddress: "192.0.2.20", serialNumber: `MIG-${Date.now()}`, accessCode: "12345678" } });
    return { spoolId: spool.id, printerId: printer.id };
  }

  it("legt das Hauptlager an, macht Admins zu Besitzern und andere zu Bearbeitern und ordnet Spulen und Drucker zu", async () => {
    const { spoolId, printerId } = await orphans();
    await ensureDefaultInventory();

    const inventories = await prisma.inventory.findMany({ include: { members: true } });
    assert.equal(inventories.length, 1);
    assert.equal(inventories[0]?.name, "Hauptlager");
    const roles = Object.fromEntries((inventories[0]?.members ?? []).map((member) => [member.userId, member.role]));
    assert.deepEqual(roles, { [adminId]: "OWNER", [userId]: "EDITOR" });
    assert.equal((await prisma.spool.findUnique({ where: { id: spoolId } }))?.inventoryId, inventories[0]?.id);
    assert.equal((await prisma.printer.findUnique({ where: { id: printerId } }))?.inventoryId, inventories[0]?.id);
  });

  it("ist wiederholbar ohne Wirkung und legt kein zweites Lager an", async () => {
    await orphans();
    await ensureDefaultInventory();
    const before = await prisma.inventoryMember.count();
    await ensureDefaultInventory();
    await ensureDefaultInventory();
    assert.equal(await prisma.inventory.count(), 1);
    assert.equal(await prisma.inventoryMember.count(), before);
  });

  it("ordnet Waisen dem aeltesten vorhandenen Lager zu, statt ein neues anzulegen (z.B. nach dem Einspielen einer alten Sicherung)", async () => {
    const first = await prisma.inventory.create({ data: { name: "Erstes", createdAt: new Date("2020-01-01") } });
    await prisma.inventory.create({ data: { name: "Zweites", createdAt: new Date("2021-01-01") } });
    const { spoolId } = await orphans();
    await ensureDefaultInventory();
    assert.equal(await prisma.inventory.count(), 2);
    assert.equal((await prisma.spool.findUnique({ where: { id: spoolId } }))?.inventoryId, first.id);
    assert.equal(await prisma.inventoryMember.count(), 0);
  });
});
