import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Spools - Negativ-Tests", () => {
  const app = createApp();
  let materialId = "";
  let manufacturerId = "";
  let activeUserCookie: string[] = [];
  let inventoryId = "";

  before(async () => {
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();

    const material = await prisma.material.create({
      data: { name: "PLA Basic Test", printTempMinC: 190, printTempMaxC: 220, bedTempC: 60 }
    });
    materialId = material.id;

    const manufacturer = await prisma.manufacturer.create({ data: { name: "Bambu Lab Test" } });
    manufacturerId = manufacturer.id;

    const spoolUser = await prisma.user.create({
      data: {
        username: "spooluser",
        email: "spooluser@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
    const inventory = await prisma.inventory.create({
      data: { name: "Spulen-Testlager", members: { create: { userId: spoolUser.id, role: "EDITOR" } } }
    });
    inventoryId = inventory.id;
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "spooluser", password: "correct-horse-battery-staple" });
    activeUserCookie = login.headers["set-cookie"];
  });

  after(async () => {
    await prisma.spool.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff auf die Spulen-Liste ab (401)", async () => {
    const res = await request(app).get("/api/spools");
    assert.equal(res.status, 401);
  });

  it("lehnt anonymes Anlegen einer Spule ab (401)", async () => {
    const res = await request(app).post("/api/spools").send({});
    assert.equal(res.status, 401);
  });

  it("lehnt Zugriff ab, solange mustChangePassword=true ist (403)", async () => {
    await prisma.user.create({
      data: {
        username: "frischerNutzer",
        email: "frisch2@example.test",
        passwordHash: await hashPassword("start-passwort-123456"),
        role: "USER",
        mustChangePassword: true
      }
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "frischerNutzer", password: "start-passwort-123456" });
    const cookie = login.headers["set-cookie"];

    const res = await request(app).get("/api/spools").set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("lehnt Anlegen mit negativem Restgewicht ab (400 VALIDATION_ERROR)", async () => {
    const res = await request(app)
      .post("/api/spools")
      .set("Cookie", activeUserCookie)
      .send({
        materialId,
        manufacturerId,
        colorName: "Schwarz",
        colorHex: "#1A1A1A",
        initialWeightG: 1000,
        remainingWeightG: -5,
        inventoryId,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("lehnt ein Material eines anderen Herstellers ab (400 VALIDATION_ERROR)", async () => {
    const other = await prisma.manufacturer.create({ data: { name: "Anderer Hersteller Test" } });
    const foreign = await prisma.material.create({
      data: { name: "Fremdes Produkt", manufacturerId: other.id, printTempMinC: 1, printTempMaxC: 2 }
    });
    const res = await request(app)
      .post("/api/spools")
      .set("Cookie", activeUserCookie)
      .send({
        materialId: foreign.id,
        manufacturerId,
        colorName: "Schwarz",
        colorHex: null,
        initialWeightG: 1000,
        remainingWeightG: 1000,
        inventoryId,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("lehnt Anlegen mit unbekannter materialId ab (400 VALIDATION_ERROR)", async () => {
    const res = await request(app)
      .post("/api/spools")
      .set("Cookie", activeUserCookie)
      .send({
        materialId: "00000000-0000-0000-0000-000000000000",
        manufacturerId,
        colorName: "Schwarz",
        colorHex: "#1A1A1A",
        initialWeightG: 1000,
        remainingWeightG: 1000,
        inventoryId,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    assert.equal(res.status, 400);
  });

  it("lehnt Anlegen mit unbekannter manufacturerId ab (400 VALIDATION_ERROR)", async () => {
    const res = await request(app)
      .post("/api/spools")
      .set("Cookie", activeUserCookie)
      .send({
        materialId,
        manufacturerId: "00000000-0000-0000-0000-000000000000",
        colorName: "Schwarz",
        colorHex: "#1A1A1A",
        initialWeightG: 1000,
        remainingWeightG: 1000,
        inventoryId,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    assert.equal(res.status, 400);
  });

  it("legt eine Spule an, listet, aendert und loescht sie (voller Ablauf fuer einen normalen Nutzer)", async () => {
    const createRes = await request(app)
      .post("/api/spools")
      .set("Cookie", activeUserCookie)
      .send({
        materialId,
        manufacturerId,
        colorName: "Schwarz",
        colorHex: "#1A1A1A",
        initialWeightG: 1000,
        remainingWeightG: 1000,
        inventoryId,
        purchasePriceCents: 2490,
        purchasedAt: null,
        location: "Regal A1"
      });
    assert.equal(createRes.status, 201);
    const spoolId: string = createRes.body.data.id;

    const listRes = await request(app).get(`/api/spools?inventoryId=${inventoryId}`).set("Cookie", activeUserCookie);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((s: { id: string }) => s.id === spoolId));
    const listed = listRes.body.data.find((s: { id: string }) => s.id === spoolId);
    assert.equal(listed.materialName, "PLA Basic Test");
    assert.equal(listed.manufacturerName, "Bambu Lab Test");

    const patchRes = await request(app)
      .patch(`/api/spools/${spoolId}`)
      .set("Cookie", activeUserCookie)
      .send({ remainingWeightG: 820 });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.remainingWeightG, 820);

    const deleteRes = await request(app)
      .delete(`/api/spools/${spoolId}`)
      .set("Cookie", activeUserCookie);
    assert.equal(deleteRes.status, 200);

    const getAfterDelete = await request(app)
      .get(`/api/spools/${spoolId}`)
      .set("Cookie", activeUserCookie);
    assert.equal(getAfterDelete.status, 404);
  });
});
