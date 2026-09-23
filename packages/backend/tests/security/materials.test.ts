import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Materials - Negativ-Tests", () => {
  const app = createApp();
  let activeUserCookie: string[] = [];
  let adminCookie: string[] = [];

  before(async () => {
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.create({
      data: {
        username: "materialuser",
        email: "materialuser@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "materialuser", password: "correct-horse-battery-staple" });
    activeUserCookie = login.headers["set-cookie"];

    await prisma.user.create({
      data: {
        username: "materialadmin",
        email: "materialadmin@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "materialadmin", password: "correct-horse-battery-staple" });
    adminCookie = adminLogin.headers["set-cookie"];
  });

  after(async () => {
    await prisma.material.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff auf die Material-Liste ab (401)", async () => {
    const res = await request(app).get("/api/materials");
    assert.equal(res.status, 401);
  });

  it("legt ein Material an und listet es danach auf", async () => {
    const createRes = await request(app)
      .post("/api/materials")
      .set("Cookie", activeUserCookie)
      .send({ name: "PETG HF Test", printTempMinC: 230, printTempMaxC: 250, bedTempC: 70 });
    assert.equal(createRes.status, 201);

    const listRes = await request(app).get("/api/materials").set("Cookie", activeUserCookie);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((m: { name: string }) => m.name === "PETG HF Test"));
  });

  it("lehnt doppelten Material-Namen ab (409 CONFLICT)", async () => {
    await request(app)
      .post("/api/materials")
      .set("Cookie", activeUserCookie)
      .send({ name: "ABS Test", printTempMinC: 230, printTempMaxC: 250, bedTempC: 90 });

    const res = await request(app)
      .post("/api/materials")
      .set("Cookie", activeUserCookie)
      .send({ name: "ABS Test", printTempMinC: 230, printTempMaxC: 250, bedTempC: 90 });

    assert.equal(res.status, 409);
  });

  const sample = { printTempMinC: 200, printTempMaxC: 220, bedTempC: 60, manufacturerId: null };

  it("lehnt Aendern und Loeschen ohne Login ab (401) und durch nicht-Admin (403)", async () => {
    const material = await prisma.material.create({ data: { name: "Nur Test 403", printTempMinC: 1, printTempMaxC: 2 } });
    assert.equal((await request(app).patch(`/api/materials/${material.id}`).send({ name: "x" })).status, 401);
    assert.equal((await request(app).delete(`/api/materials/${material.id}`)).status, 401);
    const patch = await request(app).patch(`/api/materials/${material.id}`).set("Cookie", activeUserCookie).send({ name: "x" });
    assert.equal(patch.status, 403);
    const del = await request(app).delete(`/api/materials/${material.id}`).set("Cookie", activeUserCookie);
    assert.equal(del.status, 403);
  });

  it("Admin kann Material aendern und loeschen; Namen sind je Hersteller ohne Gross-/Kleinschreibung eindeutig", async () => {
    const created = await request(app).post("/api/materials").set("Cookie", adminCookie).send({ ...sample, name: "Aendern Test" });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const dup = await request(app).post("/api/materials").set("Cookie", adminCookie).send({ ...sample, name: "AENDERN test" });
    assert.equal(dup.status, 409);

    const patched = await request(app).patch(`/api/materials/${id}`).set("Cookie", adminCookie).send({ printTempMaxC: 235 });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.printTempMaxC, 235);

    const del = await request(app).delete(`/api/materials/${id}`).set("Cookie", adminCookie);
    assert.equal(del.status, 200);
  });

  it("lehnt Loeschen eines Materials ab, das noch von Spulen genutzt wird (409)", async () => {
    const manufacturer = await prisma.manufacturer.create({ data: { name: "Mat Test Hersteller" } });
    const material = await prisma.material.create({ data: { name: "Benutzt Test", printTempMinC: 1, printTempMaxC: 2 } });
    await prisma.spool.create({
      data: { materialId: material.id, manufacturerId: manufacturer.id, colorName: "Rot", initialWeightG: 1000, remainingWeightG: 1000 }
    });
    const res = await request(app).delete(`/api/materials/${material.id}`).set("Cookie", adminCookie);
    assert.equal(res.status, 409);
    await prisma.spool.deleteMany();
    await prisma.manufacturer.delete({ where: { id: manufacturer.id } });
  });

  it("spielt die mitgelieferten Materialien ein (z.B. PLA Basic von Bambu Lab)", async () => {
    const manufacturers = await request(app).get("/api/manufacturers").set("Cookie", activeUserCookie);
    const bambu = manufacturers.body.data.find((m: { name: string }) => m.name === "Bambu Lab");
    const list = await request(app).get("/api/materials").set("Cookie", activeUserCookie);
    assert.ok(
      list.body.data.some(
        (m: { name: string; manufacturerId: string | null }) => m.name === "PLA Basic" && m.manufacturerId === bambu.id
      )
    );
  });
});
