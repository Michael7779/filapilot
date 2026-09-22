import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Manufacturers - Negativ-Tests", () => {
  const app = createApp();
  let activeUserCookie: string[] = [];

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
});
