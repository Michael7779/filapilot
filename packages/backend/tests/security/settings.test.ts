import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Settings - Negativ-Tests", () => {
  const app = createApp();
  let adminCookie: string[] = [];

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
    await prisma.user.create({
      data: {
        username: "settingsadmin",
        email: "settingsadmin@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        mustChangePassword: false
      }
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "settingsadmin", password: "correct-horse-battery-staple" });
    adminCookie = adminLogin.headers["set-cookie"];
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

  it("gibt das SMTP-Passwort nie an den Client zurueck, auch nicht dem Admin", async () => {
    await request(app)
      .patch("/api/settings")
      .set("Cookie", adminCookie)
      .send({
        smtp: {
          host: "smtp.example.test",
          port: 587,
          secure: true,
          username: "bot@example.test",
          fromAddress: "bot@example.test",
          password: "super-geheimes-smtp-passwort"
        }
      });

    const res = await request(app).get("/api/settings").set("Cookie", adminCookie);
    assert.equal(res.status, 200);
    assert.equal("password" in res.body.data.smtp, false);
    assert.equal(JSON.stringify(res.body).includes("super-geheimes-smtp-passwort"), false);
  });

  it("legt Nutzer trotzdem an und zeigt das Start-Passwort, wenn der SMTP-Versand fehlschlaegt", async () => {
    // smtp.example.test aus dem Test davor ist nicht erreichbar -> sendMail wirft.
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", adminCookie)
      .send({ username: "mailfehler", email: "mailfehler@example.test", role: "USER" });
    assert.equal(res.status, 201);
    assert.equal(typeof res.body.data.temporaryPassword, "string");
  });
});
