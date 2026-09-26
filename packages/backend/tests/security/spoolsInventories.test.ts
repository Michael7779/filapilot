import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createCatalogEntries,
  createInventoryWithMembers,
  createLoggedInUser,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Spulen - Rechte im Lager (Negativ-Tests)", () => {
  const app = createApp();
  let admin: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerA = "";
  let lagerB = "";
  let materialId = "";
  let manufacturerId = "";

  before(async () => {
    await resetInventoryData();
    admin = await createLoggedInUser(app, "spadmin", "ADMIN");
    editor = await createLoggedInUser(app, "speditor");
    viewer = await createLoggedInUser(app, "spviewer");
    outsider = await createLoggedInUser(app, "spoutsider");
    lagerA = (
      await createInventoryWithMembers("Lager A", [
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    lagerB = (await createInventoryWithMembers("Lager B", [{ userId: outsider.id, role: "OWNER" }, { userId: editor.id, role: "VIEWER" }])).id;
    ({ materialId, manufacturerId } = await createCatalogEntries());
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const spoolBody = (inventoryId: string) => ({
    materialId,
    manufacturerId,
    inventoryId,
    colorName: "Testfarbe",
    colorHex: "#112233",
    initialWeightG: 1000,
    remainingWeightG: 1000,
    purchasePriceCents: null,
    purchasedAt: null,
    location: null
  });

  it("verlangt beim Auflisten ein Lager (400) und zeigt Fremden das Lager nicht (404)", async () => {
    assert.equal((await request(app).get("/api/spools").set("Cookie", editor.cookie)).status, 400);
    assert.equal((await request(app).get("/api/spools?inventoryId=kein-uuid").set("Cookie", editor.cookie)).status, 400);
    assert.equal((await request(app).get(`/api/spools?inventoryId=${lagerA}`).set("Cookie", outsider.cookie)).status, 404);
  });

  it("verweigert Betrachtern das Schreiben (403) und Fremden jeden Zugriff (404)", async () => {
    assert.equal((await request(app).post("/api/spools").set("Cookie", viewer.cookie).send(spoolBody(lagerA))).status, 403);
    assert.equal((await request(app).post("/api/spools").set("Cookie", outsider.cookie).send(spoolBody(lagerA))).status, 404);
    assert.equal((await request(app).post("/api/spools").set("Cookie", editor.cookie).send({ ...spoolBody(lagerA), inventoryId: undefined })).status, 400);

    const spool = await createSpoolIn(lagerA);
    assert.equal((await request(app).get(`/api/spools/${spool.id}`).set("Cookie", viewer.cookie)).status, 200);
    assert.equal((await request(app).patch(`/api/spools/${spool.id}`).set("Cookie", viewer.cookie).send({ remainingWeightG: 1 })).status, 403);
    assert.equal((await request(app).delete(`/api/spools/${spool.id}`).set("Cookie", viewer.cookie)).status, 403);
    for (const method of ["get", "patch", "delete"] as const) {
      assert.equal((await request(app)[method](`/api/spools/${spool.id}`).set("Cookie", outsider.cookie).send({ remainingWeightG: 1 })).status, 404, method);
    }
    assert.equal((await prisma.spool.findUnique({ where: { id: spool.id } }))?.remainingWeightG, 800);
  });

  it("'all' liefert nur Spulen aus Lagern mit Mitgliedschaft (Admins alle), mit Lager-Namen", async () => {
    await createSpoolIn(lagerA, "In A");
    await createSpoolIn(lagerB, "In B");
    const mine = await request(app).get("/api/spools?inventoryId=all").set("Cookie", outsider.cookie);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data.length > 0);
    assert.ok(mine.body.data.every((spool: { inventoryId: string; inventoryName: string }) => spool.inventoryId === lagerB && spool.inventoryName === "Lager B"));

    const both = await request(app).get("/api/spools?inventoryId=all").set("Cookie", editor.cookie);
    assert.deepEqual([...new Set(both.body.data.map((spool: { inventoryName: string }) => spool.inventoryName))].sort(), ["Lager A", "Lager B"]);

    const everything = await request(app).get("/api/spools?inventoryId=all").set("Cookie", admin.cookie);
    assert.deepEqual([...new Set(everything.body.data.map((spool: { inventoryName: string }) => spool.inventoryName))].sort(), ["Lager A", "Lager B"]);
  });

  it("Verschieben braucht Bearbeiten im Quell- und im Ziel-Lager", async () => {
    const spool = await createSpoolIn(lagerA, "Wanderer");
    // editor ist in Lager B nur Betrachter -> Ziel nicht erlaubt (403), Fremder ohne Zugriff aufs Ziel -> 404
    assert.equal((await request(app).patch(`/api/spools/${spool.id}`).set("Cookie", editor.cookie).send({ inventoryId: lagerB })).status, 403);
    const stranger = await createLoggedInUser(app, "spstranger");
    await prisma.inventoryMember.create({ data: { inventoryId: lagerA, userId: stranger.id, role: "EDITOR" } });
    assert.equal((await request(app).patch(`/api/spools/${spool.id}`).set("Cookie", stranger.cookie).send({ inventoryId: lagerB })).status, 404);
    assert.equal((await prisma.spool.findUnique({ where: { id: spool.id } }))?.inventoryId, lagerA);

    // Mit Bearbeiten in beiden Lagern klappt es, und das Protokoll haelt es fest
    await prisma.inventoryMember.update({ where: { inventoryId_userId: { inventoryId: lagerB, userId: editor.id } }, data: { role: "EDITOR" } });
    const moved = await request(app).patch(`/api/spools/${spool.id}`).set("Cookie", editor.cookie).send({ inventoryId: lagerB });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.inventoryId, lagerB);
    const entry = await prisma.auditLog.findFirst({ where: { entityId: spool.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    assert.equal((entry?.before as { inventoryName?: string } | null)?.inventoryName, "Lager A");
    assert.equal((entry?.after as { inventoryName?: string } | null)?.inventoryName, "Lager B");
    await prisma.inventoryMember.update({ where: { inventoryId_userId: { inventoryId: lagerB, userId: editor.id } }, data: { role: "VIEWER" } });
  });

  it("Fotos folgen dem Lager: Betrachter sehen, aber laden nicht hoch; Fremde sehen nichts", async () => {
    const spool = await createSpoolIn(lagerA, "Fotospule");
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("x")]);
    const upload = (user: TestUser) => request(app).put(`/api/spools/${spool.id}/photo`).set("Cookie", user.cookie).set("Content-Type", "image/png").send(png);
    assert.equal((await upload(viewer)).status, 403);
    assert.equal((await upload(outsider)).status, 404);
    assert.equal((await upload(editor)).status, 200);
    assert.equal((await request(app).get(`/api/spools/${spool.id}/photo`).set("Cookie", viewer.cookie)).status, 200);
    assert.equal((await request(app).get(`/api/spools/${spool.id}/photo`).set("Cookie", outsider.cookie)).status, 404);
    assert.equal((await request(app).delete(`/api/spools/${spool.id}/photo`).set("Cookie", viewer.cookie)).status, 403);
    assert.equal((await request(app).delete(`/api/spools/${spool.id}/photo`).set("Cookie", outsider.cookie)).status, 404);
    assert.equal((await request(app).delete(`/api/spools/${spool.id}/photo`).set("Cookie", editor.cookie)).status, 200);
  });
});
