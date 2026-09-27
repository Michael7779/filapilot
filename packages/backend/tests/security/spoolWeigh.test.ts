import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createCatalogEntries, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

// Threat-Model: Ein Betrachter oder ein Nutzer ohne Zugriff auf das Lager der Spule koennte versuchen, ueber diese
// Route das Restgewicht einer fremden/nicht zugaenglichen Spule zu setzen. Serverseitig erzwungen: dieselbe
// EDITOR-Pruefung wie beim Bearbeiten der Spule, Zod-Validierung des gemessenen Gewichts (0-10000 g); ohne
// hinterlegtes Leergewicht wird abgelehnt (400); nicht existente Spule -> 404.
describe("Spule wiegen - Negativ-Tests", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let inventoryId = "";
  let spoolWithTareId = "";
  let spoolWithoutTareId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "weigheditor");
    viewer = await createLoggedInUser(app, "weighviewer");
    outsider = await createLoggedInUser(app, "weighoutsider");
    const inventory = await createInventoryWithMembers("Waage-Lager", [
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    inventoryId = inventory.id;
    const catalog = await createCatalogEntries();
    const spoolBody = (over: object = {}) => ({
      materialId: catalog.materialId,
      manufacturerId: catalog.manufacturerId,
      inventoryId,
      colorName: "Waage-Test",
      colorHex: null,
      initialWeightG: 1000,
      remainingWeightG: 1000,
      purchasePriceCents: null,
      purchasedAt: null,
      location: null,
      ...over
    });
    const withTare = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody({ tareWeightG: 200 }));
    spoolWithTareId = withTare.body.data.id;
    const withoutTare = await request(app).post("/api/spools").set("Cookie", editor.cookie).send(spoolBody());
    spoolWithoutTareId = withoutTare.body.data.id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const weigh = (user: TestUser | null, id: string, body: object) => {
    const req = request(app).post(`/api/spools/${id}/weigh`);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await weigh(null, spoolWithTareId, { measuredWeightG: 800 })).status, 401);
  });

  it("verweigert Betrachtern (403) und Fremden (404)", async () => {
    assert.equal((await weigh(viewer, spoolWithTareId, { measuredWeightG: 800 })).status, 403);
    assert.equal((await weigh(outsider, spoolWithTareId, { measuredWeightG: 800 })).status, 404);
  });

  it("weist eine nicht existente Spule ab (404)", async () => {
    assert.equal((await weigh(editor, "00000000-0000-0000-0000-000000000000", { measuredWeightG: 800 })).status, 404);
  });

  it("prueft das gemessene Gewicht: negativ oder zu gross -> 400", async () => {
    assert.equal((await weigh(editor, spoolWithTareId, { measuredWeightG: -1 })).status, 400);
    assert.equal((await weigh(editor, spoolWithTareId, { measuredWeightG: 10_001 })).status, 400);
  });

  it("lehnt ab, solange kein Leergewicht hinterlegt ist (400)", async () => {
    const res = await weigh(editor, spoolWithoutTareId, { measuredWeightG: 800 });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Leergewicht/);
  });

  it("zieht die Tara vom gemessenen Gewicht ab und schreibt den Verlauf", async () => {
    const res = await weigh(editor, spoolWithTareId, { measuredWeightG: 950 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.remainingWeightG, 750);

    const log = await prisma.spoolWeightLog.findFirst({ where: { spoolId: spoolWithTareId }, orderBy: { at: "desc" } });
    assert.deepEqual([log?.remainingG, log?.source], [750, "WEIGHED"]);

    const history = await request(app).get(`/api/spools/${spoolWithTareId}/history`).set("Cookie", editor.cookie);
    const entry = history.body.data.find((row: { action: string }) => row.action === "UPDATE");
    assert.ok(entry);
  });

  it("ein Ergebnis unter 0 wird auf 0 begrenzt", async () => {
    const res = await weigh(editor, spoolWithTareId, { measuredWeightG: 50 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.remainingWeightG, 0);
  });
});
