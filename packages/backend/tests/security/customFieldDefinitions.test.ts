import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

describe("Zusatzfeld-Definitionen - Negativ-Tests", () => {
  const app = createApp();
  let user: TestUser;
  let admin: TestUser;

  before(async () => {
    await resetInventoryData();
    user = await createLoggedInUser(app, "customuser");
    admin = await createLoggedInUser(app, "customadmin", "ADMIN");
  });

  after(async () => {
    await prisma.customFieldDefinition.deleteMany();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const call = (method: "get" | "post" | "delete", url: string, who: TestUser | null, body: object = {}) => {
    const req = request(app)[method](url);
    return (who ? req.set("Cookie", who.cookie) : req).send(body);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await call("get", "/api/custom-field-definitions", null)).status, 401);
    assert.equal((await call("post", "/api/custom-field-definitions", null, { name: "Charge", kind: "TEXT" })).status, 401);
  });

  it("jeder eingeloggte Nutzer darf lesen, aber nur Admin anlegen (403 fuer USER)", async () => {
    assert.equal((await call("get", "/api/custom-field-definitions", user)).status, 200);
    assert.equal((await call("post", "/api/custom-field-definitions", user, { name: "Charge", kind: "TEXT" })).status, 403);
  });

  it("Admin legt eine Definition an, ein doppelter Name wird abgelehnt (409)", async () => {
    const created = await call("post", "/api/custom-field-definitions", admin, { name: "Charge", kind: "TEXT" });
    assert.equal(created.status, 201);
    const dup = await call("post", "/api/custom-field-definitions", admin, { name: "Charge", kind: "NUMBER" });
    assert.equal(dup.status, 409);
  });

  it("weist einen unbekannten Typ ab (400)", async () => {
    assert.equal((await call("post", "/api/custom-field-definitions", admin, { name: "Sonstiges", kind: "TABELLE" })).status, 400);
  });

  it("kann als Pflichtfeld angelegt werden (Standard: nein) und die Pflicht laesst sich umschalten", async () => {
    const created = await call("post", "/api/custom-field-definitions", admin, { name: "Pflicht-Feld", kind: "TEXT", required: true });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.required, true);

    const withoutFlag = await call("post", "/api/custom-field-definitions", admin, { name: "Optional-Feld", kind: "TEXT" });
    assert.equal(withoutFlag.body.data.required, false);

    const id = created.body.data.id;
    assert.equal((await call("patch", `/api/custom-field-definitions/${id}`, user, { required: false })).status, 403);
    const toggled = await call("patch", `/api/custom-field-definitions/${id}`, admin, { required: false });
    assert.equal(toggled.status, 200);
    assert.equal(toggled.body.data.required, false);
    assert.equal((await call("patch", "/api/custom-field-definitions/00000000-0000-0000-0000-000000000000", admin, { required: true })).status, 404);
  });

  it("nur Admin darf loeschen (403 fuer USER), danach ist sie weg", async () => {
    const created = await call("post", "/api/custom-field-definitions", admin, { name: "Bewertung", kind: "NUMBER" });
    const id = created.body.data.id;
    assert.equal((await call("delete", `/api/custom-field-definitions/${id}`, user)).status, 403);
    assert.equal((await call("delete", `/api/custom-field-definitions/${id}`, admin)).status, 200);
    assert.equal(await prisma.customFieldDefinition.count({ where: { id } }), 0);
  });

  it("raeumt Werte des geloeschten Feldes aus bestehenden Spulen auf, laesst andere Felder unberuehrt", async () => {
    const chargeField = await call("post", "/api/custom-field-definitions", admin, { name: "Charge-Aufraeumen", kind: "TEXT" });
    const ratingField = await call("post", "/api/custom-field-definitions", admin, { name: "Bewertung-Aufraeumen", kind: "NUMBER" });
    const chargeId = chargeField.body.data.id;
    const ratingId = ratingField.body.data.id;

    const inventory = await createInventoryWithMembers("Zusatzfeld-Aufraeum-Lager", [{ userId: admin.id, role: "EDITOR" }]);
    const catalog = await createCatalogEntries();
    const spool = await request(app)
      .post("/api/spools")
      .set("Cookie", admin.cookie)
      .send({
        materialId: catalog.materialId,
        manufacturerId: catalog.manufacturerId,
        inventoryId: inventory.id,
        colorName: "Aufraeum-Test",
        colorHex: null,
        initialWeightG: 1000,
        remainingWeightG: 1000,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null,
        customFields: { [chargeId]: "Los-42", [ratingId]: 5 }
      });
    assert.equal(spool.status, 201);

    assert.equal((await call("delete", `/api/custom-field-definitions/${chargeId}`, admin)).status, 200);

    const after = await prisma.spool.findUnique({ where: { id: spool.body.data.id } });
    assert.deepEqual(after?.customFields, { [ratingId]: 5 });
  });
});
