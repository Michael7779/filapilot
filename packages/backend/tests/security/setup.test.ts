import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";

describe("Einrichtung (erster Admin) - Negativ-Tests", () => {
  const app = createApp();
  const input = { username: "ersteradmin", email: "erster@example.test", password: "ein-langes-passwort-123" };

  before(async () => {
    await prisma.user.deleteMany();
  });

  after(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("meldet needsSetup=true auf leerer Instanz und legt den ersten Admin samt Sitzung an", async () => {
    const status = await request(app).get("/api/setup/status");
    assert.equal(status.body.data.needsSetup, true);

    const res = await request(app).post("/api/setup").send(input);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.role, "ADMIN");
    assert.equal(res.body.data.mustChangePassword, false);
    assert.equal("passwordHash" in res.body.data, false);

    const me = await request(app).get("/api/users/me").set("Cookie", res.headers["set-cookie"]);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.username, "ersteradmin");
  });

  it("lehnt jede weitere Einrichtung ab, sobald ein Benutzer existiert (403), und meldet needsSetup=false", async () => {
    const res = await request(app)
      .post("/api/setup")
      .send({ username: "angreifer", email: "angreifer@example.test", password: "ein-langes-passwort-123" });
    assert.equal(res.status, 403);
    assert.equal(await prisma.user.count({ where: { username: "angreifer" } }), 0);

    const status = await request(app).get("/api/setup/status");
    assert.equal(status.body.data.needsSetup, false);
  });

  it("lehnt zu kurze Passwoerter und ungueltige Eingaben ab (400)", async () => {
    await prisma.user.deleteMany();
    const res = await request(app).post("/api/setup").send({ ...input, password: "kurz" });
    assert.equal(res.status, 400);
    assert.equal(await prisma.user.count(), 0);
  });

  it("laesst bei gleichzeitigen Aufrufen genau einen Admin entstehen", async () => {
    await prisma.user.deleteMany();
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        request(app)
          .post("/api/setup")
          .send({ username: `parallel${n}`, email: `parallel${n}@example.test`, password: "ein-langes-passwort-123" })
      )
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(await prisma.user.count(), 1);
  });
});
