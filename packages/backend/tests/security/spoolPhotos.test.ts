import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/env.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { MAX_PHOTO_BYTES } from "../../src/services/spoolPhotoService.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("testdaten")]);
const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

describe("Spulen-Fotos - Negativ-Tests", () => {
  const app = createApp();
  let spoolId = "";
  let cookie: string[] = [];

  before(async () => {
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.settings.upsert({ where: { id: 1 }, update: { photoUploadEnabled: true }, create: { id: 1 } });
    const material = await prisma.material.create({ data: { name: "Foto PLA", printTempMinC: 190, printTempMaxC: 220 } });
    const manufacturer = await prisma.manufacturer.create({ data: { name: "Foto Hersteller" } });
    const photoUser = await prisma.user.create({
      data: { username: "photouser", email: "photo@example.test", passwordHash: await hashPassword("correct-horse-battery-staple"), role: "USER", mustChangePassword: false }
    });
    const inventory = await prisma.inventory.create({
      data: { name: "Foto-Testlager", members: { create: { userId: photoUser.id, role: "EDITOR" } } }
    });
    const spool = await prisma.spool.create({
      data: { materialId: material.id, manufacturerId: manufacturer.id, inventoryId: inventory.id, colorName: "Rot", initialWeightG: 1000, remainingWeightG: 800 }
    });
    spoolId = spool.id;
    const login = await request(app).post("/api/auth/login").send({ username: "photouser", password: "correct-horse-battery-staple" });
    cookie = login.headers["set-cookie"];
  });

  after(async () => {
    await prisma.settings.update({ where: { id: 1 }, data: { photoUploadEnabled: true } });
    await prisma.spool.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  function upload(id: string, body: Buffer, type = "image/png") {
    return request(app).put(`/api/spools/${id}/photo`).set("Cookie", cookie).set("Content-Type", type).send(body);
  }

  it("lehnt anonymen Zugriff auf alle Foto-Routen ab (401)", async () => {
    assert.equal((await request(app).put(`/api/spools/${spoolId}/photo`).set("Content-Type", "image/png").send(PNG)).status, 401);
    assert.equal((await request(app).get(`/api/spools/${spoolId}/photo`)).status, 401);
    assert.equal((await request(app).delete(`/api/spools/${spoolId}/photo`)).status, 401);
  });

  it("lehnt eine ungueltige Spulen-ID (400) und eine unbekannte Spule (404) ab", async () => {
    assert.equal((await upload("nicht-eine-uuid", PNG)).status, 400);
    assert.equal((await upload(UNKNOWN_ID, PNG)).status, 404);
    assert.equal((await request(app).get(`/api/spools/${UNKNOWN_ID}/photo`).set("Cookie", cookie)).status, 404);
  });

  it("lehnt Dateien ab, die kein Bild sind - auch wenn der Content-Type ein Bild vortaeuscht (400)", async () => {
    const html = await upload(spoolId, Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
    assert.equal(html.status, 400);
    const svg = await upload(spoolId, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/svg+xml");
    assert.equal(svg.status, 400);
    const text = await upload(spoolId, Buffer.from("hallo"), "text/plain");
    assert.equal(text.status, 400);
  });

  it("lehnt zu grosse Dateien ab (400)", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    assert.equal((await upload(spoolId, big)).status, 400);
  });

  it("lehnt den Upload ab, wenn Foto-Upload in den Einstellungen ausgeschaltet ist (403)", async () => {
    await prisma.settings.update({ where: { id: 1 }, data: { photoUploadEnabled: false } });
    try {
      assert.equal((await upload(spoolId, PNG)).status, 403);
    } finally {
      await prisma.settings.update({ where: { id: 1 }, data: { photoUploadEnabled: true } });
    }
  });

  it("erlaubt dem Client nicht, photoUrl selbst zu setzen", async () => {
    const res = await request(app).patch(`/api/spools/${spoolId}`).set("Cookie", cookie).send({ photoUrl: "http://boese.example/x.png" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.photoUrl, null);
  });

  it("speichert, liefert mit dem erkannten Typ aus und entfernt ein Foto; Loeschen der Spule raeumt die Datei auf", async () => {
    const res = await upload(spoolId, PNG);
    assert.equal(res.status, 200);
    assert.ok((res.body.data.photoUrl as string).startsWith(`/api/spools/${spoolId}/photo?v=`));

    const listed = await prisma.spool.findUnique({ where: { id: spoolId }, select: { inventoryId: true } });
    const list = await request(app).get(`/api/spools?inventoryId=${listed?.inventoryId ?? ""}`).set("Cookie", cookie);
    assert.equal(list.body.data[0].photoUrl, res.body.data.photoUrl);

    const image = await request(app).get(`/api/spools/${spoolId}/photo`).set("Cookie", cookie).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (chunk: Buffer) => chunks.push(chunk));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers["content-type"], "image/png");
    assert.ok((image.body as Buffer).equals(PNG));

    assert.equal((await request(app).delete(`/api/spools/${spoolId}/photo`).set("Cookie", cookie)).status, 200);
    assert.equal((await request(app).get(`/api/spools/${spoolId}/photo`).set("Cookie", cookie)).status, 404);

    await upload(spoolId, PNG);
    const file = path.join(env.UPLOADS_FOLDER_PATH, "spool-photos", spoolId);
    await fs.access(file);
    assert.equal((await request(app).delete(`/api/spools/${spoolId}`).set("Cookie", cookie)).status, 200);
    await assert.rejects(fs.access(file));
  });
});

describe("Spulen-Fotos - Einstellung fuer die Oberflaeche", () => {
  const app = createApp();

  it("lehnt die Abfrage ohne Login ab (401) und meldet mit Login den Schalter", async () => {
    assert.equal((await request(app).get("/api/spools/photo-settings")).status, 401);
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "photoset", email: "photoset@example.test", passwordHash: await hashPassword("correct-horse-battery-staple"), role: "USER", mustChangePassword: false }
    });
    await prisma.settings.upsert({ where: { id: 1 }, update: { photoUploadEnabled: false }, create: { id: 1, photoUploadEnabled: false } });
    const login = await request(app).post("/api/auth/login").send({ username: "photoset", password: "correct-horse-battery-staple" });
    const res = await request(app).get("/api/spools/photo-settings").set("Cookie", login.headers["set-cookie"]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { enabled: false });
    await prisma.settings.update({ where: { id: 1 }, data: { photoUploadEnabled: true } });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });
});
