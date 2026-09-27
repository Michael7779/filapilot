import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

describe("Eigene Einstellungen der Spulenliste - Negativ-Tests", () => {
  const app = createApp();
  let userA: TestUser;
  let userB: TestUser;

  before(async () => {
    await resetInventoryData();
    userA = await createLoggedInUser(app, "prefusera");
    userB = await createLoggedInUser(app, "prefuserb");
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const patch = (user: TestUser | null, body: object) => {
    const req = request(app).patch("/api/users/me/preferences");
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await patch(null, { spoolView: "list" })).status, 401);
  });

  it("speichert Ansicht und Seitengroesse nur fuer das eigene Konto, eine fremde userId im Body wird ignoriert", async () => {
    const res = await patch(userA, { spoolView: "compact", spoolPageSize: 48, userId: userB.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.spoolView, "compact");
    assert.equal(res.body.data.spoolPageSize, 48);
    const other = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
    assert.equal(other.spoolView, null);
    assert.equal(other.spoolPageSize, null);
    const me = await request(app).get("/api/users/me").set("Cookie", userA.cookie);
    assert.equal(me.body.data.spoolView, "compact");
  });

  it("weist ungueltige Werte ab (400) und aendert dann nichts", async () => {
    for (const bad of [{ spoolView: "tabelle" }, { spoolPageSize: 7 }, { spoolPageSize: "viele" }, { spoolView: 3 }]) {
      assert.equal((await patch(userA, bad)).status, 400, JSON.stringify(bad));
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    assert.deepEqual([row.spoolView, row.spoolPageSize], ["compact", 48]);
  });

  it("aendert nur die angegebenen Felder; null setzt zurueck auf Standard; 0 (alle) ist erlaubt", async () => {
    assert.equal((await patch(userA, { spoolPageSize: 0 })).body.data.spoolView, "compact");
    const reset = await patch(userA, { spoolView: null, spoolPageSize: null });
    assert.deepEqual([reset.body.data.spoolView, reset.body.data.spoolPageSize], [null, null]);
  });

  it("merkt den gesehenen Aenderungsverlauf im eigenen Konto (nicht mehr nur im Browser), nur fuer sich selbst", async () => {
    const res = await patch(userA, { lastSeenChangelogVersion: "1.2.3", userId: userB.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.lastSeenChangelogVersion, "1.2.3");
    const other = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
    assert.equal(other.lastSeenChangelogVersion, null);
    const me = await request(app).get("/api/users/me").set("Cookie", userA.cookie);
    assert.equal(me.body.data.lastSeenChangelogVersion, "1.2.3");
  });
});
