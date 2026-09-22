import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

// Benoetigt eine echte Test-Datenbank (DATABASE_URL) - keine DB-Mocks (siehe CLAUDE.md Tests).
// Vor dem Lauf: `pnpm --filter backend exec prisma db push` gegen eine Test-DB.
describe("Auth - Negativ-Tests", () => {
  const app = createApp();

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        username: "normaluser",
        email: "normal@example.test",
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

  it("lehnt Login mit falschem Passwort ab (401)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "falsch" });
    assert.equal(res.status, 401);
  });

  it("lehnt Login fuer unbekannten Benutzernamen mit gleicher Meldung ab (kein User-Enumeration-Leak)", async () => {
    const resUnknown = await request(app)
      .post("/api/auth/login")
      .send({ username: "gibtsnicht", password: "irgendwas" });
    const resWrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "falsch" });

    assert.equal(resUnknown.status, 401);
    assert.equal(resUnknown.body.error.message, resWrongPassword.body.error.message);
  });

  it("lehnt Zugriff auf /api/users/me ohne Session-Cookie ab (401)", async () => {
    const res = await request(app).get("/api/users/me");
    assert.equal(res.status, 401);
  });

  it("lehnt Nutzer-Anlage durch nicht-Admin ab (403)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "correct-horse-battery-staple" });
    const cookie = login.headers["set-cookie"];

    const res = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ username: "neuernutzer", email: "neu@example.test", role: "USER" });

    assert.equal(res.status, 403);
  });

  it("lehnt jede Route ausser change-password/logout ab, solange mustChangePassword=true ist (403)", async () => {
    await prisma.user.create({
      data: {
        username: "frischerAdmin",
        email: "frisch@example.test",
        passwordHash: await hashPassword("start-passwort-123456"),
        role: "ADMIN",
        mustChangePassword: true
      }
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "frischerAdmin", password: "start-passwort-123456" });
    const cookie = login.headers["set-cookie"];

    const blocked = await request(app).get("/api/users").set("Cookie", cookie);
    assert.equal(blocked.status, 403);

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "start-passwort-123456", newPassword: "ein-neues-sicheres-passwort" });
    assert.equal(changed.status, 200);

    const allowedNow = await request(app).get("/api/users").set("Cookie", cookie);
    assert.equal(allowedNow.status, 200);
  });
});
