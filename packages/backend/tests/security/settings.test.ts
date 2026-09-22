import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Settings - Negativ-Tests", () => {
  const app = createApp();

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        username: "normaluser",
        email: "normal2@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
  });

  after(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt Aenderung der Einstellungen durch nicht-Admin ab (403)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "correct-horse-battery-staple" });
    const cookie = login.headers["set-cookie"];

    const res = await request(app)
      .patch("/api/settings")
      .set("Cookie", cookie)
      .send({ photoUploadEnabled: false });

    assert.equal(res.status, 403);
  });

  it("lehnt manuellen Backup-Trigger durch nicht-Admin ab (403)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "correct-horse-battery-staple" });
    const cookie = login.headers["set-cookie"];

    const res = await request(app).post("/api/settings/backup").set("Cookie", cookie);

    assert.equal(res.status, 403);
  });
});
