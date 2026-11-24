import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { recordBackupFailure } from "../../src/services/backupStatusService.js";

describe("Letzter Backup-Fehler (Admin-Route) - Negativ-Tests", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";
  let adminCookie: string[] = [];
  let userCookie: string[] = [];

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        username: "lfadmin",
        email: "lfadmin@example.test",
        passwordHash: await hashPassword(pw),
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    await prisma.user.create({
      data: {
        username: "lfuser",
        email: "lfuser@example.test",
        passwordHash: await hashPassword(pw),
        role: "USER",
        mustChangePassword: false
      }
    });
    adminCookie = (
      await request(app).post("/api/auth/login").send({ username: "lfadmin", password: pw })
    ).headers["set-cookie"];
    userCookie = (
      await request(app).post("/api/auth/login").send({ username: "lfuser", password: pw })
    ).headers["set-cookie"];
    await recordBackupFailure(new Error("pg_dump postgresql://u:topsecret@db/x fehlgeschlagen"));
  });

  after(async () => {
    await prisma.settings.update({
      where: { id: 1 },
      data: { lastBackupFailedAt: null, lastBackupFailureReason: null }
    });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("verlangt Anmeldung (401) und Admin-Rolle (403)", async () => {
    assert.equal((await request(app).get("/api/settings/backups/last-failure")).status, 401);
    const asUser = await request(app)
      .get("/api/settings/backups/last-failure")
      .set("Cookie", userCookie);
    assert.equal(asUser.status, 403);
    assert.equal(JSON.stringify(asUser.body).includes("pg_dump"), false);
  });

  it("zeigt dem Admin den Fehler ohne Zugangsdaten", async () => {
    const res = await request(app)
      .get("/api/settings/backups/last-failure")
      .set("Cookie", adminCookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.error, null);
    assert.ok(res.body.data.reason.includes("pg_dump"));
    assert.equal(JSON.stringify(res.body).includes("topsecret"), false);
    assert.ok(typeof res.body.data.at === "string");
  });
});
