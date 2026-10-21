import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { socketInventoryIds } from "../../src/socket.js";
import { createInventoryWithMembers, resetInventoryData } from "../helpers/fixtures.js";

describe("Socket.IO: Live-Druckerstatus nur mit Freigabe der Filamentverwaltung", () => {
  const userData = (username: string, extra: { canUseFilament?: boolean; isSuperAdmin?: boolean; role?: "ADMIN" | "USER" }) => ({
    username,
    email: `${username}@example.test`,
    passwordHash: "unused",
    mustChangePassword: false,
    ...extra
  });
  let inventoryId = "";
  let allowedId = "";
  let blockedId = "";
  let superBlockedId = "";

  before(async () => {
    await resetInventoryData();
    allowedId = (await prisma.user.create({ data: userData("sockallowed", {}) })).id;
    blockedId = (await prisma.user.create({ data: userData("sockblocked", { canUseFilament: false }) })).id;
    superBlockedId = (await prisma.user.create({ data: userData("socksuper", { canUseFilament: false, isSuperAdmin: true, role: "ADMIN" }) })).id;
    inventoryId = (
      await createInventoryWithMembers("Socket-Lager", [
        { userId: allowedId, role: "OWNER" },
        { userId: blockedId, role: "OWNER" }
      ])
    ).id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("gibt Mitgliedern mit Freigabe ihre Lager-Raeume", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: allowedId } });
    assert.deepEqual(await socketInventoryIds(user), [inventoryId]);
  });

  it("gibt Mitgliedern ohne Filament-Freigabe keinen Raum, obwohl sie Mitglied sind", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: blockedId } });
    assert.deepEqual(await socketInventoryIds(user), []);
  });

  it("ein Super-Admin hat immer Zugriff, auch ohne gesetzte Freigabe", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: superBlockedId } });
    assert.deepEqual(await socketInventoryIds(user), [inventoryId]);
  });
});
