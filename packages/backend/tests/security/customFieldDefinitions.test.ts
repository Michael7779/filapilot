import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

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

  it("nur Admin darf loeschen (403 fuer USER), danach ist sie weg", async () => {
    const created = await call("post", "/api/custom-field-definitions", admin, { name: "Bewertung", kind: "NUMBER" });
    const id = created.body.data.id;
    assert.equal((await call("delete", `/api/custom-field-definitions/${id}`, user)).status, 403);
    assert.equal((await call("delete", `/api/custom-field-definitions/${id}`, admin)).status, 200);
    assert.equal(await prisma.customFieldDefinition.count({ where: { id } }), 0);
  });
});
