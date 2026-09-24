/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in selbst angelegten temporaeren Ordnern, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { validateArchiveEntries } from "../../src/services/backupImportService.js";

const TS = "2026-09-25T01-00-00-000Z";

describe("Sicherung hochladen - Negativ-Tests", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";
  let folder = "";
  let work = "";
  let adminCookie: string[] = [];
  let userCookie: string[] = [];

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { username: "upadmin", email: "upadmin@example.test", passwordHash: await hashPassword(pw), role: "ADMIN", mustChangePassword: false } });
    await prisma.user.create({ data: { username: "upuser", email: "upuser@example.test", passwordHash: await hashPassword(pw), role: "USER", mustChangePassword: false } });
    adminCookie = (await request(app).post("/api/auth/login").send({ username: "upadmin", password: pw })).headers["set-cookie"];
    userCookie = (await request(app).post("/api/auth/login").send({ username: "upuser", password: pw })).headers["set-cookie"];
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-up-folder-"));
    work = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-up-work-"));
    await request(app).patch("/api/settings").set("Cookie", adminCookie).send({ backupFolderPath: folder });
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  async function makeTar(name: string, files: Record<string, string>, extraArgs: string[] = []): Promise<Buffer> {
    const dir = await fs.mkdtemp(path.join(work, "src-"));
    for (const [file, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, file), content);
    }
    const target = path.join(work, `${name}.tar`);
    execFileSync("/usr/bin/tar", ["-cf", target, "-C", dir, ...extraArgs, ...Object.keys(files)]);
    return fs.readFile(target);
  }

  const upload = (cookie: string[], body: Buffer | string, type = "application/x-tar") =>
    request(app).post("/api/settings/backups/upload").set("Cookie", cookie).set("Content-Type", type).send(body);

  async function folderEntries(): Promise<string[]> {
    return (await fs.readdir(folder)).sort();
  }

  it("lehnt den Upload ohne Login (401) und als Benutzer (403) ab", async () => {
    assert.equal((await request(app).post("/api/settings/backups/upload").set("Content-Type", "application/x-tar").send("x")).status, 401);
    assert.equal((await upload(userCookie, "x")).status, 403);
  });

  it("lehnt andere Content-Types (400) und Dateien ohne tar-Format (400) ab", async () => {
    assert.equal((await upload(adminCookie, "hallo", "text/plain")).status, 400);
    assert.equal((await upload(adminCookie, "das ist kein tar-Archiv")).status, 400);
    assert.deepEqual(await folderEntries(), []);
  });

  it("lehnt Archive mit fremden Dateien, Pfaden oder ohne Datenbank-Dump ab - und entpackt nichts", async () => {
    const foreign = await makeTar("foreign", { [`filapilot-db-${TS}.sql`]: "-- dump", "evil.sh": "rm -rf /" });
    assert.equal((await upload(adminCookie, foreign)).status, 400);

    const noDump = await makeTar("nodump", { [`filapilot-settings-${TS}.json`]: "{}" });
    assert.equal((await upload(adminCookie, noDump)).status, 400);

    const traversal = await makeTar("traversal", { [`filapilot-db-${TS}.sql`]: "-- dump" }, ["-P", "--transform", `s,^,../,`]);
    assert.equal((await upload(adminCookie, traversal)).status, 400);

    assert.deepEqual(await folderEntries(), []);
    await assert.rejects(fs.access(path.join(folder, "..", `filapilot-db-${TS}.sql`)));
  });

  it("lehnt Verknuepfungen im Archiv ab", async () => {
    const dir = await fs.mkdtemp(path.join(work, "link-"));
    await fs.symlink("/etc/passwd", path.join(dir, `filapilot-db-${TS}.sql`));
    const target = path.join(work, "link.tar");
    execFileSync("/usr/bin/tar", ["-cf", target, "-C", dir, `filapilot-db-${TS}.sql`]);
    assert.equal((await upload(adminCookie, await fs.readFile(target))).status, 400);
    assert.deepEqual(await folderEntries(), []);
  });

  it("nimmt eine gueltige Sicherung an, zeigt sie in der Uebersicht und lehnt dieselbe ein zweites Mal ab (409)", async () => {
    const valid = await makeTar("valid", { [`filapilot-db-${TS}.sql`]: "-- dump", [`filapilot-settings-${TS}.json`]: "{}" });
    const ok = await upload(adminCookie, valid);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.timestamp, TS);
    assert.deepEqual(await folderEntries(), [`filapilot-db-${TS}.sql`, `filapilot-settings-${TS}.json`]);

    const list = await request(app).get("/api/settings/backups").set("Cookie", adminCookie);
    assert.deepEqual(list.body.data.map((b: { timestamp: string }) => b.timestamp), [TS]);

    assert.equal((await upload(adminCookie, valid)).status, 409);
    assert.deepEqual(await folderEntries(), [`filapilot-db-${TS}.sql`, `filapilot-settings-${TS}.json`]);
  });

  it("prueft die Namensliste streng (Einheitentest)", () => {
    assert.equal(validateArchiveEntries([`filapilot-db-${TS}.sql`], ["-"]), TS);
    assert.throws(() => validateArchiveEntries([], []));
    assert.throws(() => validateArchiveEntries([`./filapilot-db-${TS}.sql`], ["-"]));
    assert.throws(() => validateArchiveEntries([`filapilot-db-${TS}.sql`, `filapilot-db-${TS}.sql`], ["-", "-"]));
    assert.throws(() => validateArchiveEntries([`filapilot-db-${TS}.sql`, `filapilot-uploads-2020-01-01T00-00-00-000Z.tar.gz`], ["-", "-"]));
    assert.throws(() => validateArchiveEntries([`filapilot-db-${TS}.sql`], ["d"]));
    assert.throws(() => validateArchiveEntries(["filapilot-db-../x.sql"], ["-"]));
  });
});
