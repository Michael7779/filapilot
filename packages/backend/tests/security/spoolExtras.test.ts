import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createCatalogEntries,
  createInventoryWithMembers,
  createLoggedInUser,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Spulen: zweite Farbe, Notiz, Zusatzfelder, Protokoll und Export - Negativ-Tests", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let inventoryId = "";
  let materialId = "";
  let manufacturerId = "";
  let textFieldId = "";
  let numberFieldId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "extraeditor");
    viewer = await createLoggedInUser(app, "extraviewer");
    outsider = await createLoggedInUser(app, "extraoutsider");
    const inventory = await createInventoryWithMembers("Extra-Lager", [
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    inventoryId = inventory.id;
    const catalog = await createCatalogEntries();
    materialId = catalog.materialId;
    manufacturerId = catalog.manufacturerId;
    const textField = await prisma.customFieldDefinition.create({ data: { name: "Charge Test", kind: "TEXT" } });
    textFieldId = textField.id;
    const numberField = await prisma.customFieldDefinition.create({ data: { name: "Bewertung Test", kind: "NUMBER" } });
    numberFieldId = numberField.id;
  });

  after(async () => {
    await prisma.customFieldDefinition.deleteMany();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const spoolBody = (over: object = {}) => ({
    materialId,
    manufacturerId,
    inventoryId,
    colorName: "Zweifarbig",
    colorHex: "#111111",
    initialWeightG: 1000,
    remainingWeightG: 1000,
    location: null,
    purchasePriceCents: null,
    purchasedAt: null,
    ...over
  });
  const post = (user: TestUser | null, body: object) => {
    const req = request(app).post("/api/spools");
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };
  const patch = (user: TestUser | null, id: string, body: object) => {
    const req = request(app).patch(`/api/spools/${id}`);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };

  it("speichert eine zweite Farbe und eine Notiz mit", async () => {
    const res = await post(editor, spoolBody({ colorHex2: "#F2C94C", note: "Testnotiz" }));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.colorHex2, "#F2C94C");
    assert.equal(res.body.data.note, "Testnotiz");
  });

  it("weist eine ungueltige zweite Farbe ab (400)", async () => {
    assert.equal((await post(editor, spoolBody({ colorHex2: "nicht-hex" }))).status, 400);
  });

  it("speichert bekannte Zusatzfelder typgeprueft und weist unbekannte Schluessel ab (400)", async () => {
    const ok = await post(editor, spoolBody({ customFields: { [textFieldId]: "Charge-42", [numberFieldId]: 4.5 } }));
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.data.customFields, { [textFieldId]: "Charge-42", [numberFieldId]: 4.5 });

    const wrongType = await post(editor, spoolBody({ customFields: { [numberFieldId]: "keine Zahl" } }));
    assert.equal(wrongType.status, 400);

    const unknownKey = await post(editor, spoolBody({ customFields: { "nicht-vorhanden": "x" } }));
    assert.equal(unknownKey.status, 400);
  });

  it("ersetzt die Zusatzfelder beim Aendern vollstaendig, wenn welche mitgeschickt werden", async () => {
    const created = await post(editor, spoolBody({ customFields: { [textFieldId]: "Alt" } }));
    const id = created.body.data.id;
    const updated = await patch(editor, id, { customFields: { [numberFieldId]: 1 } });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.data.customFields, { [numberFieldId]: 1 });
  });

  it("Protokoll einer Spule: Fremde 404, Betrachter duerfen lesen, zeigt nur Eintraege dieser Spule", async () => {
    const created = await post(editor, spoolBody({ colorName: "Protokoll-Test" }));
    const id = created.body.data.id;
    await patch(editor, id, { note: "geaendert" });

    assert.equal((await request(app).get(`/api/spools/${id}/history`)).status, 401);
    assert.equal((await request(app).get(`/api/spools/${id}/history`).set("Cookie", outsider.cookie)).status, 404);

    const res = await request(app).get(`/api/spools/${id}/history`).set("Cookie", viewer.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 2);
    assert.ok(res.body.data.every((entry: { entityId: string }) => entry.entityId === id));
  });

  it("Export: Fremde 404, liefert CSV mit Kopfzeile und JSON mit den Spulen-Feldern", async () => {
    await post(editor, spoolBody({ colorName: "Export-Test" }));
    assert.equal((await request(app).get(`/api/spools/export?inventoryId=${inventoryId}`)).status, 401);
    assert.equal((await request(app).get(`/api/spools/export?inventoryId=${inventoryId}`).set("Cookie", outsider.cookie)).status, 404);

    const csv = await request(app).get(`/api/spools/export?inventoryId=${inventoryId}&format=csv`).set("Cookie", viewer.cookie);
    assert.equal(csv.status, 200);
    assert.match(csv.headers["content-type"], /text\/csv/);
    assert.match(csv.text, /Hersteller/);
    assert.match(csv.text, /Export-Test/);
    // Semikolon statt Komma, sonst oeffnet deutsches Excel die Datei per Doppelklick als eine einzige Spalte.
    assert.match(csv.text, /Hersteller;Material;Farbe;/);

    const json = await request(app).get(`/api/spools/export?inventoryId=${inventoryId}&format=json`).set("Cookie", viewer.cookie);
    assert.equal(json.status, 200);
    assert.ok(Array.isArray(json.body));
    assert.ok(json.body.some((spool: { colorName: string }) => spool.colorName === "Export-Test"));
  });
});
