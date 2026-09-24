import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Protokoll: An- und Abmeldungen", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";

  before(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "loginlog", email: "loginlog@example.test", passwordHash: await hashPassword(pw), role: "ADMIN", mustChangePassword: false }
    });
  });

  after(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("protokolliert erfolgreiche Anmeldung und Abmeldung, aber keine fehlgeschlagene (Passwort-Tippfehler bleiben draussen)", async () => {
    const failed = await request(app).post("/api/auth/login").send({ username: "loginlog", password: "falsches-passwort-123" });
    assert.equal(failed.status, 401);
    assert.equal(await prisma.auditLog.count(), 0);

    const login = await request(app).post("/api/auth/login").send({ username: "loginlog", password: pw });
    const cookie = login.headers["set-cookie"];
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    assert.equal(logout.status, 200);

    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((row) => row.description), ["Angemeldet: loginlog", "Abgemeldet: loginlog"]);
    assert.ok(rows.every((row) => row.action === "EVENT" && row.area === "USER" && row.username === "loginlog"));
  });
});
