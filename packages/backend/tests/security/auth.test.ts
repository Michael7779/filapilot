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

  it("ignoriert Gross-/Kleinschreibung beim Benutzernamen im Login", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "NormalUser", password: "correct-horse-battery-staple" });
    assert.equal(res.status, 200);
  });

  it("vermerkt die letzte Aktivitaet bei authentifizierten Anfragen (hoechstens einmal pro Minute)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "correct-horse-battery-staple" });
    await prisma.user.updateMany({ where: { username: "normaluser" }, data: { lastActiveAt: null } });
    await request(app).get("/api/users/me").set("Cookie", login.headers["set-cookie"]);
    const first = await prisma.user.findFirstOrThrow({ where: { username: "normaluser" } });
    assert.ok(first.lastActiveAt instanceof Date);

    await request(app).get("/api/users/me").set("Cookie", login.headers["set-cookie"]);
    const second = await prisma.user.findFirstOrThrow({ where: { username: "normaluser" } });
    assert.equal(second.lastActiveAt?.getTime(), first.lastActiveAt.getTime());
  });

  it("vermerkt beim Login das Datum des letzten Logins", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ username: "normaluser", password: "correct-horse-battery-staple" });
    const user = await prisma.user.findFirstOrThrow({ where: { username: "normaluser" } });
    assert.ok(user.lastLoginAt instanceof Date);
    assert.ok(Date.now() - user.lastLoginAt.getTime() < 60_000);
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

  it("gibt das Start-Passwort in der Antwort zurueck, wenn kein SMTP konfiguriert ist (sonst nie)", async () => {
    await prisma.user.deleteMany({ where: { username: "adminFuerUserTest" } });
    await prisma.user.create({
      data: {
        username: "adminFuerUserTest",
        email: "admin-user-test@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        mustChangePassword: false
      }
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "adminFuerUserTest", password: "correct-horse-battery-staple" });
    const cookie = login.headers["set-cookie"];

    const res = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ username: "brandneuernutzer", email: "brandneu@example.test", role: "USER" });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.data.temporaryPassword, "string");
    assert.ok(res.body.data.temporaryPassword.length > 0);
    assert.equal(res.body.data.lastLoginAt, null);
    assert.ok(!Number.isNaN(Date.parse(res.body.data.createdAt)));

    const duplicate = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ username: "BrandNeuerNutzer", email: "andere@example.test", role: "USER" });
    assert.equal(duplicate.status, 409);
  });

  describe("Benutzerverwaltung (Bearbeiten, Loeschen, Passwort zuruecksetzen)", () => {
    const pw = "correct-horse-battery-staple";
    let adminCookie: string[] = [];
    let userCookie: string[] = [];
    let adminId = "";
    let userId = "";

    before(async () => {
      await prisma.user.deleteMany({ where: { username: { in: ["verwadmin", "verwuser", "verwziel"] } } });
      const admin = await prisma.user.create({
        data: { username: "verwadmin", email: "verwadmin@example.test", passwordHash: await hashPassword(pw), role: "ADMIN", mustChangePassword: false }
      });
      adminId = admin.id;
      const user = await prisma.user.create({
        data: { username: "verwuser", email: "verwuser@example.test", passwordHash: await hashPassword(pw), role: "USER", mustChangePassword: false }
      });
      userId = user.id;
      adminCookie = (await request(app).post("/api/auth/login").send({ username: "verwadmin", password: pw })).headers["set-cookie"];
      userCookie = (await request(app).post("/api/auth/login").send({ username: "verwuser", password: pw })).headers["set-cookie"];
    });

    it("lehnt Aendern, Loeschen und Passwort-Reset ohne Login (401) und als Nutzer (403) ab", async () => {
      for (const [method, path] of [["patch", "/api/users/" + adminId], ["delete", "/api/users/" + adminId], ["post", "/api/users/" + adminId + "/reset-password"]] as const) {
        assert.equal((await request(app)[method](path).send({ role: "USER" })).status, 401);
        assert.equal((await request(app)[method](path).set("Cookie", userCookie).send({ role: "USER" })).status, 403);
      }
    });

    it("Admin kann einen Benutzer bearbeiten; doppelte Namen (auch anders geschrieben) werden abgelehnt", async () => {
      const ok = await request(app).patch("/api/users/" + userId).set("Cookie", adminCookie).send({ username: "verwziel", email: "verwziel@example.test" });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.data.username, "verwziel");
      const dup = await request(app).patch("/api/users/" + userId).set("Cookie", adminCookie).send({ username: "VERWADMIN" });
      assert.equal(dup.status, 409);
    });

    it("schuetzt den letzten Admin und das eigene Konto (409)", async () => {
      await prisma.user.updateMany({ where: { role: "ADMIN", NOT: { id: adminId } }, data: { role: "USER" } });
      const demote = await request(app).patch("/api/users/" + adminId).set("Cookie", adminCookie).send({ role: "USER" });
      assert.equal(demote.status, 409);
      const self = await request(app).delete("/api/users/" + adminId).set("Cookie", adminCookie);
      assert.equal(self.status, 409);
      const selfReset = await request(app).post("/api/users/" + adminId + "/reset-password").set("Cookie", adminCookie);
      assert.equal(selfReset.status, 409);
    });

    it("setzt ein Passwort zurueck (Start-Passwort, Zwangswechsel, Sitzungen weg) und loescht einen Benutzer", async () => {
      const reset = await request(app).post("/api/users/" + userId + "/reset-password").set("Cookie", adminCookie);
      assert.equal(reset.status, 200);
      assert.equal(typeof reset.body.data.temporaryPassword, "string");
      const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      assert.equal(after.mustChangePassword, true);
      assert.equal(await prisma.session.count({ where: { userId } }), 0);

      const del = await request(app).delete("/api/users/" + userId).set("Cookie", adminCookie);
      assert.equal(del.status, 200);
      assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
    });
  });
});
