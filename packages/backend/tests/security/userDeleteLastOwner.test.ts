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

describe("Benutzer loeschen: letzter Besitzer eines Lagers - Negativ-Tests", () => {
  const app = createApp();
  let admin: TestUser;
  let plainUser: TestUser;
  let soleOwner: TestUser;
  let coOwnerA: TestUser;
  let coOwnerB: TestUser;
  let lastOwnerId = "";

  before(async () => {
    await resetInventoryData();
    admin = await createLoggedInUser(app, "dlo-admin", "ADMIN", { isSuperAdmin: true });
    plainUser = await createLoggedInUser(app, "dlo-user");
    soleOwner = await createLoggedInUser(app, "dlo-sole");
    coOwnerA = await createLoggedInUser(app, "dlo-co-a");
    coOwnerB = await createLoggedInUser(app, "dlo-co-b");
    await createInventoryWithMembers("Einzelbesitz", [
      { userId: soleOwner.id, role: "OWNER" },
      { userId: plainUser.id, role: "EDITOR" }
    ]);
    await createInventoryWithMembers("Gemeinsam", [
      { userId: coOwnerA.id, role: "OWNER" },
      { userId: coOwnerB.id, role: "OWNER" }
    ]);
    lastOwnerId = soleOwner.id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("verweigert das Loeschen des einzigen Besitzers (409) und nennt die Lager", async () => {
    const res = await request(app).delete(`/api/users/${lastOwnerId}`).set("Cookie", admin.cookie);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "CONFLICT");
    assert.match(res.body.error.message, /Einzelbesitz/);
    assert.ok(
      await prisma.user.findUnique({ where: { id: lastOwnerId } }),
      "Benutzer muss erhalten bleiben"
    );
    assert.equal(await prisma.inventoryMember.count({ where: { userId: lastOwnerId } }), 1);
  });

  it("ein normaler Benutzer kommt gar nicht erst so weit (403)", async () => {
    const res = await request(app)
      .delete(`/api/users/${lastOwnerId}`)
      .set("Cookie", plainUser.cookie);
    assert.equal(res.status, 403);
  });

  it("erlaubt das Loeschen, wenn ein anderer Besitzer bleibt", async () => {
    const res = await request(app).delete(`/api/users/${coOwnerA.id}`).set("Cookie", admin.cookie);
    assert.equal(res.status, 200);
    assert.equal(await prisma.inventoryMember.count({ where: { userId: coOwnerA.id } }), 0);
  });

  it("erlaubt das Loeschen, nachdem der Besitzer ersetzt wurde", async () => {
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { name: "Einzelbesitz" } });
    await prisma.inventoryMember.update({
      where: { inventoryId_userId: { inventoryId: inventory.id, userId: plainUser.id } },
      data: { role: "OWNER" }
    });
    const res = await request(app).delete(`/api/users/${lastOwnerId}`).set("Cookie", admin.cookie);
    assert.equal(res.status, 200);
  });

  it("zaehlt Mitglieder ohne Besitzer-Rolle nicht als Besitzer (Viewer-Eigentuemer blockiert nichts)", async () => {
    const res = await request(app).delete(`/api/users/${coOwnerB.id}`).set("Cookie", admin.cookie);
    // coOwnerB ist jetzt der letzte Besitzer von "Gemeinsam" -> geschuetzt
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Gemeinsam/);
  });
});
