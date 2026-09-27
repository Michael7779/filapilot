import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

// Threat-Model: Ein Betrachter (nur Leserecht) oder ein Nutzer ohne Zugriff auf das Lager der Spule koennte versuchen,
// fuer eine fremde/nicht zugaengliche Spule einen Trocknungs-Eintrag anzulegen. Serverseitig erzwungen: dieselbe
// EDITOR-Pruefung wie beim Bearbeiten der Spule selbst, Zod-Validierung von Temperatur (1-150 Grad) und Dauer
// (1-2880 Minuten), Notiz auf 300 Zeichen begrenzt; nicht existente Spule -> 404.
describe("Trocknungs-Protokoll einer Spule - Negativ-Tests", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let inventoryId = "";
  let spoolId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "dryeditor");
    viewer = await createLoggedInUser(app, "dryviewer");
    outsider = await createLoggedInUser(app, "dryoutsider");
    const inventory = await createInventoryWithMembers("Trocken-Lager", [
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    inventoryId = inventory.id;
    const catalog = await createCatalogEntries();
    const created = await request(app)
      .post("/api/spools")
      .set("Cookie", editor.cookie)
      .send({
        materialId: catalog.materialId,
        manufacturerId: catalog.manufacturerId,
        inventoryId,
        colorName: "Trocken-Test",
        colorHex: null,
        initialWeightG: 1000,
        remainingWeightG: 800,
        purchasePriceCents: null,
        purchasedAt: null,
        location: null
      });
    spoolId = created.body.data.id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const post = (user: TestUser | null, id: string, body: object) => {
    const req = request(app).post(`/api/spools/${id}/drying`);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await post(null, spoolId, { temperatureC: 60, durationMinutes: 240 })).status, 401);
  });

  it("verweigert Betrachtern (403) und Fremden (404)", async () => {
    assert.equal((await post(viewer, spoolId, { temperatureC: 60, durationMinutes: 240 })).status, 403);
    assert.equal((await post(outsider, spoolId, { temperatureC: 60, durationMinutes: 240 })).status, 404);
  });

  it("weist eine nicht existente Spule ab (404)", async () => {
    assert.equal((await post(editor, "00000000-0000-0000-0000-000000000000", { temperatureC: 60, durationMinutes: 240 })).status, 404);
  });

  it("prueft die Eingaben: Temperatur und Dauer ausserhalb der Grenzen, zu lange Notiz", async () => {
    assert.equal((await post(editor, spoolId, { temperatureC: 0, durationMinutes: 240 })).status, 400);
    assert.equal((await post(editor, spoolId, { temperatureC: 151, durationMinutes: 240 })).status, 400);
    assert.equal((await post(editor, spoolId, { temperatureC: 60, durationMinutes: 0 })).status, 400);
    assert.equal((await post(editor, spoolId, { temperatureC: 60, durationMinutes: 2881 })).status, 400);
    assert.equal((await post(editor, spoolId, { temperatureC: 60, durationMinutes: 240, note: "x".repeat(301) })).status, 400);
  });

  it("legt einen Eintrag im Verlauf dieser Spule an, mit Temperatur/Dauer/Notiz und ohne Notiz ohne den Schluessel leer zu lassen", async () => {
    const res = await post(editor, spoolId, { temperatureC: 55, durationMinutes: 180, note: "PETG, vor dem Druck" });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data, { logged: true });

    const history = await request(app).get(`/api/spools/${spoolId}/history`).set("Cookie", viewer.cookie);
    const entry = history.body.data.find((row: { action: string }) => row.action === "EVENT");
    assert.ok(entry);
    assert.match(entry.description, /Getrocknet: 55 °C, 3 Std\b.*PETG, vor dem Druck/);
    assert.deepEqual(entry.after, { temperatureC: 55, durationMinutes: 180, note: "PETG, vor dem Druck" });

    const withoutNote = await post(editor, spoolId, { temperatureC: 60, durationMinutes: 45 });
    assert.equal(withoutNote.status, 201);
    const historyAfter = await request(app).get(`/api/spools/${spoolId}/history`).set("Cookie", editor.cookie);
    const second = historyAfter.body.data.find((row: { after?: { durationMinutes?: number } }) => row.after?.durationMinutes === 45);
    assert.equal(second.after.note, null);
    assert.match(second.description, /Getrocknet: 60 °C, 45 Min/);
  });
});
