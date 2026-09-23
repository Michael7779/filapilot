import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Manufacturers - Negativ-Tests", () => {
  const app = createApp();
  let activeUserCookie: string[] = [];
  let adminCookie: string[] = [];

  before(async () => {
    await prisma.spool.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.create({
      data: {
        username: "manufactureruser",
        email: "manufactureruser@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "manufactureruser", password: "correct-horse-battery-staple" });
    activeUserCookie = login.headers["set-cookie"];

    await prisma.user.create({
      data: {
        username: "manufactureradmin",
        email: "manufactureradmin@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "manufactureradmin", password: "correct-horse-battery-staple" });
    adminCookie = adminLogin.headers["set-cookie"];
  });

  after(async () => {
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff auf die Hersteller-Liste ab (401)", async () => {
    const res = await request(app).get("/api/manufacturers");
    assert.equal(res.status, 401);
  });

  it("befuellt die Liste automatisch mit bekannten Herstellern, wenn sie leer ist", async () => {
    const res = await request(app).get("/api/manufacturers").set("Cookie", activeUserCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 10);
    assert.ok(res.body.data.some((m: { name: string }) => m.name === "Bambu Lab"));
  });

  it("legt einen Hersteller an und listet ihn danach auf", async () => {
    const createRes = await request(app)
      .post("/api/manufacturers")
      .set("Cookie", activeUserCookie)
      .send({ name: "Voxelab Test" });
    assert.equal(createRes.status, 201);

    const listRes = await request(app).get("/api/manufacturers").set("Cookie", activeUserCookie);
    assert.ok(listRes.body.data.some((m: { name: string }) => m.name === "Voxelab Test"));
  });

  it("lehnt doppelten Hersteller-Namen ab (409 CONFLICT)", async () => {
    await request(app)
      .post("/api/manufacturers")
      .set("Cookie", activeUserCookie)
      .send({ name: "Doppel Test" });

    const res = await request(app)
      .post("/api/manufacturers")
      .set("Cookie", activeUserCookie)
      .send({ name: "Doppel Test" });

    assert.equal(res.status, 409);
  });

  it("lehnt Aendern und Loeschen ohne Login ab (401) und durch nicht-Admin (403)", async () => {
    const m = await prisma.manufacturer.create({ data: { name: "Nur Test 403" } });
    assert.equal((await request(app).patch(`/api/manufacturers/${m.id}`).send({ name: "x" })).status, 401);
    assert.equal((await request(app).delete(`/api/manufacturers/${m.id}`)).status, 401);
    const patch = await request(app).patch(`/api/manufacturers/${m.id}`).set("Cookie", activeUserCookie).send({ name: "x" });
    assert.equal(patch.status, 403);
    const del = await request(app).delete(`/api/manufacturers/${m.id}`).set("Cookie", activeUserCookie);
    assert.equal(del.status, 403);
  });

  it("Admin kann Hersteller umbenennen und loeschen (samt seiner Materialien)", async () => {
    const m = await prisma.manufacturer.create({ data: { name: "Umbenennen Test" } });
    await prisma.material.create({ data: { name: "Eigenes Produkt", manufacturerId: m.id, printTempMinC: 1, printTempMaxC: 2 } });
    const patched = await request(app).patch(`/api/manufacturers/${m.id}`).set("Cookie", adminCookie).send({ name: "Umbenannt" });
    assert.equal(patched.status, 200);
    const dup = await request(app).patch(`/api/manufacturers/${m.id}`).set("Cookie", adminCookie).send({ name: "bambu lab" });
    assert.equal(dup.status, 409);
    const del = await request(app).delete(`/api/manufacturers/${m.id}`).set("Cookie", adminCookie);
    assert.equal(del.status, 200);
    assert.equal(await prisma.material.count({ where: { manufacturerId: m.id } }), 0);
  });

  it("lehnt Loeschen eines Herstellers ab, den noch Spulen nutzen (409)", async () => {
    const m = await prisma.manufacturer.create({ data: { name: "Benutzt Test" } });
    const material = await prisma.material.create({ data: { name: "Allg Test", printTempMinC: 1, printTempMaxC: 2 } });
    await prisma.spool.create({
      data: { materialId: material.id, manufacturerId: m.id, colorName: "Rot", initialWeightG: 1000, remainingWeightG: 1000 }
    });
    const res = await request(app).delete(`/api/manufacturers/${m.id}`).set("Cookie", adminCookie);
    assert.equal(res.status, 409);
    await prisma.spool.deleteMany();
    await prisma.material.delete({ where: { id: material.id } });
  });
});
