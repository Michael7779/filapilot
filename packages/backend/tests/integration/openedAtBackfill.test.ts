import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { ensureOpenedAtBackfilled } from "../../src/services/openedAtBackfill.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";
import { createApp } from "../../src/app.js";

describe("Nachtrag: bestehende Spulen als geoeffnet markieren (openedAt)", () => {
  const app = createApp();
  let user: TestUser;
  let inventoryId = "";
  let materialId = "";
  let manufacturerId = "";

  before(async () => {
    await resetInventoryData();
    user = await createLoggedInUser(app, "backfilluser");
    inventoryId = (await createInventoryWithMembers("Backfill-Lager", [{ userId: user.id, role: "EDITOR" }])).id;
    ({ materialId, manufacturerId } = await createCatalogEntries());
  });

  beforeEach(async () => {
    await prisma.spool.deleteMany({ where: { inventoryId } });
    // Zurueck auf "noch nicht nachgetragen", damit jeder Test unabhaengig vom vorherigen laeuft.
    await prisma.settings.upsert({ where: { id: 1 }, update: { openedAtBackfilled: false }, create: { id: 1 } });
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  async function spoolWithOpenedAt(openedAt: Date | null, createdAt: Date): Promise<string> {
    const spool = await prisma.spool.create({
      data: { materialId, manufacturerId, inventoryId, colorName: "Alt", initialWeightG: 1000, remainingWeightG: 1000, createdAt, openedAt }
    });
    return spool.id;
  }

  it("setzt openedAt=createdAt fuer bestehende Spulen ohne openedAt, laesst bereits geoeffnete unveraendert", async () => {
    const createdAt = new Date("2026-01-15T10:00:00.000Z");
    const untouchedId = await spoolWithOpenedAt(null, createdAt);
    const alreadyOpenedAt = new Date("2026-02-01T00:00:00.000Z");
    const alreadyOpenedId = await spoolWithOpenedAt(alreadyOpenedAt, createdAt);

    await ensureOpenedAtBackfilled();

    const untouched = await prisma.spool.findUniqueOrThrow({ where: { id: untouchedId } });
    assert.equal(untouched.openedAt?.toISOString(), createdAt.toISOString());
    const alreadyOpened = await prisma.spool.findUniqueOrThrow({ where: { id: alreadyOpenedId } });
    assert.equal(alreadyOpened.openedAt?.toISOString(), alreadyOpenedAt.toISOString());

    assert.equal((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).openedAtBackfilled, true);
  });

  it("laeuft nur einmal: eine danach neu angelegte, echte ungeoeffnete Spule bleibt bei einem zweiten Lauf unangetastet", async () => {
    await ensureOpenedAtBackfilled();
    const freshId = await spoolWithOpenedAt(null, new Date());

    await ensureOpenedAtBackfilled();
    await ensureOpenedAtBackfilled();

    const fresh = await prisma.spool.findUniqueOrThrow({ where: { id: freshId } });
    assert.equal(fresh.openedAt, null);
  });
});
