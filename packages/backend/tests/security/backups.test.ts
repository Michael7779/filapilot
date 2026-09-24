/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Backups (Uebersicht + Wiederherstellung) - Negativ-Tests", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";
  const TIMESTAMP = "2026-09-24T01-00-00-008Z";
  let folder = "";
  let adminCookie: string[] = [];
  let userCookie: string[] = [];

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "bkadmin", email: "bkadmin@example.test", passwordHash: await hashPassword(pw), role: "ADMIN", mustChangePassword: false }
    });
    await prisma.user.create({
      data: { username: "bkuser", email: "bkuser@example.test", passwordHash: await hashPassword(pw), role: "USER", mustChangePassword: false }
    });
    adminCookie = (await request(app).post("/api/auth/login").send({ username: "bkadmin", password: pw })).headers["set-cookie"];
    userCookie = (await request(app).post("/api/auth/login").send({ username: "bkuser", password: pw })).headers["set-cookie"];

    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-bk-"));
    await fs.writeFile(path.join(folder, `filapilot-db-${TIMESTAMP}.sql`), "-- dump");
    await request(app).patch("/api/settings").set("Cookie", adminCookie).send({ backupFolderPath: folder });
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt Uebersicht, Status und Wiederherstellung ohne Login (401) und als Benutzer (403) ab", async () => {
    const calls = [
      () => request(app).get("/api/settings/backups"),
      () => request(app).get("/api/settings/backups/restore-status"),
      () => request(app).post(`/api/settings/backups/${TIMESTAMP}/restore`).send({ confirmation: "WIEDERHERSTELLEN" })
    ];
    for (const call of calls) {
      assert.equal((await call()).status, 401);
    }
    const asUser = [
      request(app).get("/api/settings/backups").set("Cookie", userCookie),
      request(app).get("/api/settings/backups/restore-status").set("Cookie", userCookie),
      request(app)
        .post(`/api/settings/backups/${TIMESTAMP}/restore`)
        .set("Cookie", userCookie)
        .send({ confirmation: "WIEDERHERSTELLEN" })
    ];
    for (const res of await Promise.all(asUser)) {
      assert.equal(res.status, 403);
    }
  });

  it("zeigt Admins die vorhandenen Sicherungen", async () => {
    const res = await request(app).get("/api/settings/backups").set("Cookie", adminCookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((b: { timestamp: string }) => b.timestamp), [TIMESTAMP]);
  });

  it("lehnt falsches Bestaetigungswort und ungueltige Zeitstempel ab (400) und meldet unbekannte Sicherungen (404)", async () => {
    const wrongWord = await request(app)
      .post(`/api/settings/backups/${TIMESTAMP}/restore`)
      .set("Cookie", adminCookie)
      .send({ confirmation: "ja" });
    assert.equal(wrongWord.status, 400);

    const noBody = await request(app).post(`/api/settings/backups/${TIMESTAMP}/restore`).set("Cookie", adminCookie);
    assert.equal(noBody.status, 400);

    const traversal = await request(app)
      .post("/api/settings/backups/..%2F..%2Fetc%2Fpasswd/restore")
      .set("Cookie", adminCookie)
      .send({ confirmation: "WIEDERHERSTELLEN" });
    assert.equal(traversal.status, 400);

    const unknown = await request(app)
      .post("/api/settings/backups/2020-01-01T00-00-00-000Z/restore")
      .set("Cookie", adminCookie)
      .send({ confirmation: "WIEDERHERSTELLEN" });
    assert.equal(unknown.status, 404);

    const status = await request(app).get("/api/settings/backups/restore-status").set("Cookie", adminCookie);
    assert.equal(status.body.data.state, "idle");
  });
});
