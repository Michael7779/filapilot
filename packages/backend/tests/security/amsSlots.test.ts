import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("AMS-Slot-Zuordnung - Negativ-Tests", () => {
  const app = createApp();
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";
  let printerId = "";
  let spoolId = "";
  let foreignSpoolId = "";
  let archivedSpoolId = "";

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "amsowner");
    editor = await createLoggedInUser(app, "amseditor");
    viewer = await createLoggedInUser(app, "amsviewer");
    outsider = await createLoggedInUser(app, "amsoutsider");
    const lager = await createInventoryWithMembers("AMS-Lager", [
      { userId: owner.id, role: "OWNER" },
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    lagerId = lager.id;
    const other = await createInventoryWithMembers("AMS-Fremd", [{ userId: outsider.id, role: "OWNER" }]);
    otherLagerId = other.id;
    printerId = (await createPrinterIn(lagerId, "AMS-Drucker")).id;
    spoolId = (await createSpoolIn(lagerId, "Blau")).id;
    foreignSpoolId = (await createSpoolIn(otherLagerId, "Fremd")).id;
    const archived = await createSpoolIn(lagerId, "Archiviert");
    archivedSpoolId = archived.id;
    await prisma.spool.update({ where: { id: archivedSpoolId }, data: { archivedAt: new Date(), archiveReason: "MANUAL" } });
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const get = (user: TestUser | null) => {
    const req = request(app).get(`/api/printers/${printerId}/ams-slots`);
    return user ? req.set("Cookie", user.cookie) : req;
  };
  const put = (user: TestUser | null, slot: number | string, spool: string | null) => {
    const req = request(app).put(`/api/printers/${printerId}/ams-slots/${slot}`).send({ spoolId: spool });
    return user ? req.set("Cookie", user.cookie) : req;
  };

  it("lehnt anonyme Zugriffe ab (401) und zeigt Fremden nichts (404)", async () => {
    assert.equal((await get(null)).status, 401);
    assert.equal((await get(outsider)).status, 404);
    assert.equal((await put(null, 0, spoolId)).status, 401);
    assert.equal((await put(outsider, 0, spoolId)).status, 404);
  });

  it("Betrachter duerfen lesen, aber nicht zuordnen (403)", async () => {
    assert.equal((await get(viewer)).status, 200);
    assert.equal((await put(viewer, 0, spoolId)).status, 403);
  });

  it("lehnt eine Spule aus einem anderen Lager (400) und einen ungueltigen Slot (400) ab", async () => {
    assert.equal((await put(editor, 0, foreignSpoolId)).status, 400);
    assert.equal((await put(editor, 4, spoolId)).status, 400);
    assert.equal((await put(editor, -1, spoolId)).status, 400);
    assert.equal((await put(editor, "abc", spoolId)).status, 400);
  });

  it("lehnt eine archivierte Spule ab (400)", async () => {
    assert.equal((await put(editor, 0, archivedSpoolId)).status, 400);
  });

  it("ordnet zu (Bearbeiter reicht), zeigt es beim Lesen, und loest mit spoolId=null wieder", async () => {
    const assign = await put(editor, 0, spoolId);
    assert.equal(assign.status, 200);
    const slot0 = assign.body.data.find((s: { slotIndex: number }) => s.slotIndex === 0);
    assert.equal(slot0.spoolId, spoolId);
    assert.ok(slot0.spoolLabel.includes("Blau"));

    const cleared = await put(owner, 0, null);
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.find((s: { slotIndex: number }) => s.slotIndex === 0), undefined);
    assert.equal(await prisma.amsSlotAssignment.count({ where: { printerId, slotIndex: 0 } }), 0);
  });

  it("erlaubt die externe Spule (Slot 254)", async () => {
    assert.equal((await put(editor, 254, spoolId)).status, 200);
    await put(editor, 254, null);
  });

  it("loescht eine zugeordnete Spule, ohne dass das Loeschen scheitert - das Fach wird stattdessen leer (kein 500)", async () => {
    const toDelete = (await createSpoolIn(lagerId, "Wird geloescht")).id;
    assert.equal((await put(editor, 1, toDelete)).status, 200);

    const deleted = await request(app).delete(`/api/spools/${toDelete}`).set("Cookie", editor.cookie);
    assert.equal(deleted.status, 200);

    const assignment = await prisma.amsSlotAssignment.findUnique({ where: { printerId_slotIndex: { printerId, slotIndex: 1 } } });
    assert.ok(assignment);
    assert.equal(assignment.spoolId, null);
  });
});
