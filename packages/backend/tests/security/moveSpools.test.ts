import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createCatalogEntries,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Alle Spulen verschieben - Negativ-Tests", () => {
  const app = createApp();
  let owner: TestUser;
  let editor: TestUser;
  let outsider: TestUser;
  let source = "";
  let target = "";
  let foreign = "";
  let readOnlyTarget = "";

  const move = (user: TestUser | null, from: string, to: string) => {
    const req = request(app).post(`/api/inventories/${from}/move-spools`).send({ targetInventoryId: to });
    return user ? req.set("Cookie", user.cookie) : req;
  };
  const count = (inventoryId: string): Promise<number> => prisma.spool.count({ where: { inventoryId } });

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "moveowner");
    editor = await createLoggedInUser(app, "moveeditor");
    outsider = await createLoggedInUser(app, "moveoutsider");
    source = (await createInventoryWithMembers("Move Quelle", [{ userId: owner.id, role: "OWNER" }, { userId: editor.id, role: "EDITOR" }])).id;
    target = (await createInventoryWithMembers("Move Ziel", [{ userId: owner.id, role: "EDITOR" }])).id;
    readOnlyTarget = (await createInventoryWithMembers("Move Nur lesen", [{ userId: owner.id, role: "VIEWER" }])).id;
    foreign = (await createInventoryWithMembers("Move Fremd", [{ userId: outsider.id, role: "OWNER" }])).id;
    await createCatalogEntries();
    const a = await createSpoolIn(source, "Eins");
    const b = await createSpoolIn(source, "Zwei");
    await prisma.spool.update({ where: { id: b.id }, data: { archivedAt: new Date(), archiveReason: "MANUAL" } });
    await prisma.spoolWeightLog.create({ data: { spoolId: a.id, inventoryId: source, deltaG: 5, remainingG: 95, source: "MANUAL" } });
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("lehnt anonym (401) ab und zeigt Fremden die Lager nicht (404)", async () => {
    assert.equal((await move(null, source, target)).status, 401);
    assert.equal((await move(outsider, source, target)).status, 404);
    assert.equal((await move(owner, source, foreign)).status, 404);
    assert.equal(await count(source), 2);
  });

  it("verlangt Besitzer in der Quelle (403) und Bearbeiter im Ziel (403)", async () => {
    assert.equal((await move(editor, source, target)).status, 403);
    assert.equal((await move(owner, source, readOnlyTarget)).status, 403);
    assert.equal(await count(source), 2);
  });

  it("prueft Eingaben: gleiches Lager und ungueltige ID (400)", async () => {
    assert.equal((await move(owner, source, source)).status, 400);
    assert.equal((await move(owner, source, "kein-uuid")).status, 400);
    assert.equal(await count(source), 2);
  });

  it("verschiebt alle Spulen samt Archiv und Gewichtsverlauf", async () => {
    const res = await move(owner, source, target);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.moved, 2);
    assert.equal(await count(source), 0);
    assert.equal(await count(target), 2);
    assert.equal(await prisma.spoolWeightLog.count({ where: { inventoryId: target } }), 1);
    assert.equal(await prisma.spoolWeightLog.count({ where: { inventoryId: source } }), 0);
  });
});
