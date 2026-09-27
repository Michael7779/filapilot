import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { updateSettings } from "../../src/services/settingsService.js";

describe("Sitzungs-Cookie beim Login", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "cookieuser", email: "cookie@example.test", passwordHash: await hashPassword(pw), role: "USER", mustChangePassword: false }
    });
  });

  after(async () => {
    await updateSettings({ sessionExpiryDays: 30 });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("ist immer HttpOnly und SameSite=Lax, und ohne https-Adresse (Testumgebung: http) ohne Secure - sonst wuerde der Browser es im Heimnetz verwerfen", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "cookieuser", password: pw });
    assert.equal(res.status, 200);
    const header = String((res.headers["set-cookie"] ?? [])[0]);
    assert.match(header, /^fp_session=/);
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.doesNotMatch(header, /Secure/);
  });

  it("richtet sich nach der eingestellten Anmeldedauer (Settings.sessionExpiryDays), nicht nach einem festen Wert", async () => {
    await updateSettings({ sessionExpiryDays: 7 });
    const before = Date.now();
    const res = await request(app).post("/api/auth/login").send({ username: "cookieuser", password: pw });
    assert.equal(res.status, 200);
    const header = String((res.headers["set-cookie"] ?? [])[0]);
    const maxAge = Number(/Max-Age=(\d+)/.exec(header)?.[1]);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(maxAge * 1000 - sevenDaysMs) < 5000, `Max-Age war ${maxAge}s, erwartet ~${sevenDaysMs / 1000}s`);

    const session = await prisma.session.findFirst({ where: { user: { username: "cookieuser" } }, orderBy: { createdAt: "desc" } });
    assert.ok(session);
    assert.ok(Math.abs(session.expiresAt.getTime() - (before + sevenDaysMs)) < 5000);
  });
});
