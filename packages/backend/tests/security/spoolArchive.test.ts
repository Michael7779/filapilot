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

describe("Spulen archivieren und Gewichtsverlauf - Negativ-Tests", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "arceditor");
    viewer = await createLoggedInUser(app, "arcviewer");
    outsider = await createLoggedInUser(app, "arcoutsider");
    lagerId = (
      await createInventoryWithMembers("Archiv-Lager", [
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const post = (url: string, user: TestUser | null) => {
    const req = request(app).post(url);
    return user ? req.set("Cookie", user.cookie) : req;
  };
  const list = (user: TestUser, archived?: string): Promise<request.Response> => {
    const filter = archived ? "&archived=" + archived : "";
    return request(app).get("/api/spools?inventoryId=" + lagerId + filter).set("Cookie", user.cookie);
  };

  it("verweigert Archivieren und Wiederherstellen ohne Login (401), Betrachtern (403) und Fremden (404)", async () => {
    const spool = await createSpoolIn(lagerId, "Nur Test");
    for (const action of ["archive", "unarchive"]) {
      assert.equal((await post(`/api/spools/${spool.id}/${action}`, null)).status, 401);
      assert.equal((await post(`/api/spools/${spool.id}/${action}`, viewer)).status, 403);
      assert.equal((await post(`/api/spools/${spool.id}/${action}`, outsider)).status, 404);
    }
    assert.equal((await prisma.spool.findUnique({ where: { id: spool.id } }))?.archivedAt, null);
  });

  it("archiviert und stellt wieder her: Standardliste blendet Archivierte aus, 'include' und 'only' zeigen sie, ungueltige Filter 400", async () => {
    const active = await createSpoolIn(lagerId, "Aktiv");
    const old = await createSpoolIn(lagerId, "Alt");
    const archived = await post(`/api/spools/${old.id}/archive`, editor);
    assert.equal(archived.status, 200);
    assert.ok(archived.body.data.archivedAt);
    assert.equal(archived.body.data.archiveReason, "MANUAL");
    // zweites Archivieren aendert nichts und erzeugt keinen zweiten Protokoll-Eintrag
    await post(`/api/spools/${old.id}/archive`, editor);
    assert.equal(await prisma.auditLog.count({ where: { entityId: old.id, description: { contains: "archiviert" } } }), 1);

    const ids = (response: request.Response) => response.body.data.map((spool: { id: string }) => spool.id);
    assert.ok(ids(await list(viewer)).includes(active.id) && !ids(await list(viewer)).includes(old.id));
    assert.ok(ids(await list(viewer, "include")).includes(old.id) && ids(await list(viewer, "include")).includes(active.id));
    assert.deepEqual(ids(await list(viewer, "only")), [old.id]);
    assert.equal((await list(viewer, "kaputt")).status, 400);

    const restored = await post(`/api/spools/${old.id}/unarchive`, editor);
    assert.equal(restored.body.data.archivedAt, null);
    assert.equal(restored.body.data.archiveReason, null);
    assert.ok(ids(await list(viewer)).includes(old.id));
  });

  it("haelt Aenderungen des Restgewichts mit Datum fest - nur bei echter Aenderung, nie beim Anlegen", async () => {
    const spool = await createSpoolIn(lagerId, "Verlauf", 800);
    assert.equal(await prisma.spoolWeightLog.count({ where: { spoolId: spool.id } }), 0);

    const patch = (body: object) => request(app).patch(`/api/spools/${spool.id}`).set("Cookie", editor.cookie).send(body);
    assert.equal((await patch({ remainingWeightG: 600 })).status, 200);
    await patch({ remainingWeightG: 600 });
    await patch({ location: "Regal 3" });
    assert.equal((await patch({ remainingWeightG: 900 })).status, 200);

    const logs = await prisma.spoolWeightLog.findMany({ where: { spoolId: spool.id }, orderBy: { at: "asc" } });
    assert.deepEqual(logs.map((log) => [log.deltaG, log.remainingG, log.source, log.inventoryId]), [
      [200, 600, "MANUAL", lagerId],
      [-300, 900, "MANUAL", lagerId]
    ]);
    assert.ok(logs[0] && Math.abs(Date.now() - logs[0].at.getTime()) < 60_000);
  });

  it("legt ueber die Anlegen-Route keinen Verlauf an, und ein Client kann Verlauf oder Archiv nicht selbst setzen", async () => {
    const { materialId, manufacturerId } = await createCatalogEntries();
    const created = await request(app)
      .post("/api/spools")
      .set("Cookie", editor.cookie)
      .send({
        materialId,
        manufacturerId,
        inventoryId: lagerId,
        colorName: "Neu",
        colorHex: null,
        initialWeightG: 1000,
        remainingWeightG: 400,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null,
        archivedAt: "2020-01-01T00:00:00.000Z",
        archiveReason: "MANUAL"
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.archivedAt, null);
    assert.equal(await prisma.spoolWeightLog.count({ where: { spoolId: created.body.data.id } }), 0);

    const patched = await request(app)
      .patch(`/api/spools/${created.body.data.id}`)
      .set("Cookie", editor.cookie)
      .send({ archivedAt: "2020-01-01T00:00:00.000Z", archiveReason: "CLOUD_REMOVED" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.archivedAt, null);
  });

  it("Loeschen einer Spule entfernt auch ihren Verlauf (Archivieren behaelt ihn)", async () => {
    const kept = await createSpoolIn(lagerId, "Behalten", 500);
    const gone = await createSpoolIn(lagerId, "Weg", 500);
    for (const spool of [kept, gone]) {
      await request(app).patch(`/api/spools/${spool.id}`).set("Cookie", editor.cookie).send({ remainingWeightG: 100 });
    }
    await post(`/api/spools/${kept.id}/archive`, editor);
    assert.equal((await request(app).delete(`/api/spools/${gone.id}`).set("Cookie", editor.cookie)).status, 200);
    assert.equal(await prisma.spoolWeightLog.count({ where: { spoolId: kept.id } }), 1);
    assert.equal(await prisma.spoolWeightLog.count({ where: { spoolId: gone.id } }), 0);
  });
});
