import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { ensureSuperAdmin } from "../../src/services/superAdminService.js";
import { resetInventoryData } from "../helpers/fixtures.js";

async function makeUser(username: string, role: "ADMIN" | "USER", createdAt: Date, isSuperAdmin = false): Promise<void> {
  await prisma.user.create({
    data: { username, email: `${username}@example.test`, passwordHash: "unused", role, createdAt, isSuperAdmin, mustChangePassword: false }
  });
}

describe("ensureSuperAdmin (immer mindestens ein Super-Admin)", () => {
  beforeEach(resetInventoryData);
  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("ernennt den aeltesten Admin, wenn es keinen Super-Admin gibt", async () => {
    await makeUser("sauser", "USER", new Date("2020-01-01"));
    await makeUser("saneuer", "ADMIN", new Date("2025-01-01"));
    await makeUser("saaelter", "ADMIN", new Date("2022-01-01"));
    assert.equal(await ensureSuperAdmin(), "saaelter");
    const supers = await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { username: true } });
    assert.deepEqual(supers.map((user) => user.username), ["saaelter"]);
  });

  it("tut nichts, solange es schon einen gibt (idempotent)", async () => {
    await makeUser("saeins", "ADMIN", new Date("2022-01-01"));
    await makeUser("sazwei", "ADMIN", new Date("2023-01-01"), true);
    assert.equal(await ensureSuperAdmin(), null);
    assert.equal(await ensureSuperAdmin(), null);
    assert.deepEqual(
      (await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { username: true } })).map((user) => user.username),
      ["sazwei"]
    );
  });

  it("ernennt niemanden, wenn es keinen Admin gibt", async () => {
    await makeUser("saeinfach", "USER", new Date("2022-01-01"));
    assert.equal(await ensureSuperAdmin(), null);
    assert.equal(await prisma.user.count({ where: { isSuperAdmin: true } }), 0);
  });

  it("tut bei leerer Datenbank nichts", async () => {
    assert.equal(await ensureSuperAdmin(), null);
  });
});
