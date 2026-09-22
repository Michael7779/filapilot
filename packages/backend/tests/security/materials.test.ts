import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Materials - Negativ-Tests", () => {
  const app = createApp();
  let activeUserCookie: string[] = [];

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
});
