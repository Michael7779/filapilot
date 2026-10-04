import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { TEST_PASSWORD, createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

interface Suggestion {
  manufacturerId: string;
  materialId: string;
  isRefill: boolean;
  priceCents: number;
}

describe("Spulen: Preis-Vorschlaege und Nachfuellung - Negativ-Tests", () => {
  const app = createApp();
  let owner: TestUser;
  let stranger: TestUser;
  let admin: TestUser;
  let ownLager = "";
  let foreignLager = "";
  let materialId = "";
  let manufacturerId = "";

  async function addSpool(inventoryId: string, over: { colorName: string; priceCents: number | null; isRefill?: boolean; createdAt: Date; archived?: boolean }): Promise<void> {
    await prisma.spool.create({
      data: {
        materialId,
        manufacturerId,
        inventoryId,
        colorName: over.colorName,
        initialWeightG: 1000,
        remainingWeightG: 1000,
        purchasePriceCents: over.priceCents,
        isRefill: over.isRefill ?? false,
        createdAt: over.createdAt,
        archivedAt: over.archived ? new Date() : null
      }
    });
  }

  before(async () => {
    await resetInventoryData();
    owner = await createLoggedInUser(app, "preisowner");
    stranger = await createLoggedInUser(app, "preisfremder");
    admin = await createLoggedInUser(app, "preisadmin", "ADMIN");
    ownLager = (await createInventoryWithMembers("Preis-Lager", [{ userId: owner.id, role: "EDITOR" }])).id;
    foreignLager = (await createInventoryWithMembers("Fremdes Preis-Lager", [{ userId: stranger.id, role: "OWNER" }])).id;
    ({ materialId, manufacturerId } = await createCatalogEntries());
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff ab (401) und verlangt abgeschlossenen Passwortwechsel (403)", async () => {
    assert.equal((await request(app).get("/api/spools/price-suggestions")).status, 401);
    await prisma.user.create({
      data: { username: "preisfrisch", email: "preisfrisch@example.test", passwordHash: await hashPassword(TEST_PASSWORD), role: "USER", mustChangePassword: true }
    });
    const login = await request(app).post("/api/auth/login").send({ username: "preisfrisch", password: TEST_PASSWORD });
    const res = await request(app).get("/api/spools/price-suggestions").set("Cookie", login.headers["set-cookie"] as unknown as string[]);
    assert.equal(res.status, 403);
  });

  it("liefert je Hersteller+Material+Art den zuletzt eingetragenen Preis (farbunabhaengig, auch archiviert) - nie aus fremden Lagern", async () => {
    await addSpool(ownLager, { colorName: "Rot", priceCents: 1999, createdAt: new Date("2026-01-01") });
    await addSpool(ownLager, { colorName: "Blau", priceCents: 1199, createdAt: new Date("2026-02-01"), archived: true });
    await addSpool(ownLager, { colorName: "Gruen", priceCents: null, createdAt: new Date("2026-03-01") });
    await addSpool(ownLager, { colorName: "Gelb", priceCents: 1019, isRefill: true, createdAt: new Date("2026-02-15") });
    // Neuerer Preis in einem Lager, in dem der Nutzer kein Mitglied ist - darf nie auftauchen
    await addSpool(foreignLager, { colorName: "Schwarz", priceCents: 4242, createdAt: new Date("2026-04-01") });

    const res = await request(app).get("/api/spools/price-suggestions").set("Cookie", owner.cookie);
    assert.equal(res.status, 200);
    const data = res.body.data as Suggestion[];
    assert.equal(data.length, 2);
    assert.equal(data.find((entry) => !entry.isRefill)?.priceCents, 1199);
    assert.equal(data.find((entry) => entry.isRefill)?.priceCents, 1019);
    assert.ok(data.every((entry) => entry.priceCents !== 4242));
    assert.ok(data.every((entry) => Object.keys(entry).sort().join() === "isRefill,manufacturerId,materialId,priceCents"));

    const strangerRes = await request(app).get("/api/spools/price-suggestions").set("Cookie", stranger.cookie);
    assert.deepEqual((strangerRes.body.data as Suggestion[]).map((entry) => entry.priceCents), [4242]);
  });

  it("speichert isRefill beim Anlegen, verwirft Nicht-Boolean (400) und setzt den Wert bei einem PATCH ohne isRefill nicht zurueck", async () => {
    const base = { materialId, manufacturerId, inventoryId: ownLager, colorName: "Weiss", colorHex: null, initialWeightG: 1000, remainingWeightG: 1000, purchasePriceCents: 1019, purchasedAt: null, location: null };
    const bad = await request(app).post("/api/spools").set("Cookie", owner.cookie).send({ ...base, isRefill: "ja" });
    assert.equal(bad.status, 400);
    const created = await request(app).post("/api/spools").set("Cookie", owner.cookie).send({ ...base, isRefill: true });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.isRefill, true);
    const patched = await request(app).patch(`/api/spools/${created.body.data.id as string}`).set("Cookie", owner.cookie).send({ colorName: "Weiss 2" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.isRefill, true);
  });

  it("Richtpreise am Material: Nutzer duerfen sie nicht aendern (403), Admins nur gueltige Werte (negativ -> 400)", async () => {
    const forbidden = await request(app).patch(`/api/materials/${materialId}`).set("Cookie", owner.cookie).send({ priceRefillCents: 1 });
    assert.equal(forbidden.status, 403);
    const negative = await request(app).patch(`/api/materials/${materialId}`).set("Cookie", admin.cookie).send({ priceWithSpoolCents: -5 });
    assert.equal(negative.status, 400);
    const fraction = await request(app).patch(`/api/materials/${materialId}`).set("Cookie", admin.cookie).send({ priceRefillCents: 10.5 });
    assert.equal(fraction.status, 400);
    const ok = await request(app).patch(`/api/materials/${materialId}`).set("Cookie", admin.cookie).send({ priceRefillCents: 1019, priceWithSpoolCents: 1199 });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.data.priceRefillCents, ok.body.data.priceWithSpoolCents], [1019, 1199]);
  });
});
