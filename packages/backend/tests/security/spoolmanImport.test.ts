import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

const IMPORT_VENDORS = ["Spoolman-Test-Hersteller"];

const SPOOLS = [
  {
    id: 501,
    remaining_weight: 780,
    initial_weight: 1000,
    spool_weight: 210,
    location: "Regal 3",
    comment: "Aus altem Bestand",
    filament: {
      name: "PLA Rot",
      material: "PLA",
      density: 1.24,
      diameter: 1.75,
      color_hex: "D14343",
      settings_extruder_temp: 210,
      settings_bed_temp: 60,
      vendor: { name: "Spoolman-Test-Hersteller" }
    }
  },
  { id: 502, filament: null }, // kaputt: kein Filament -> uebersprungen
  "kein objekt", // kaputt: falscher Typ -> uebersprungen
  {
    id: 503,
    remaining_weight: 400,
    initial_weight: 1000,
    filament: { material: "PETG", vendor: { name: "Spoolman-Test-Hersteller" } }
  }
];

describe("Spoolman-Import - Negativ-Tests und Ablauf", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";

  before(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: IMPORT_VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    editor = await createLoggedInUser(app, "smeditor");
    viewer = await createLoggedInUser(app, "smviewer");
    outsider = await createLoggedInUser(app, "smoutsider");
    lagerId = (
      await createInventoryWithMembers("Spoolman-Lager", [
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    otherLagerId = (await createInventoryWithMembers("Anderes Spoolman-Lager", [{ userId: outsider.id, role: "OWNER" }])).id;
  });

  after(async () => {
    await prisma.spool.deleteMany();
    await prisma.material.deleteMany({ where: { manufacturer: { name: { in: IMPORT_VENDORS } } } });
    await prisma.manufacturer.deleteMany({ where: { name: { in: IMPORT_VENDORS } } });
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const base = (id = lagerId) => `/api/inventories/${id}/spoolman-import`;
  const post = (url: string, user: TestUser | null, body: unknown) => {
    const req = request(app).post(url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body as object);
  };

  it("lehnt anonyme Zugriffe ab (401)", async () => {
    assert.equal((await post(`${base()}/file`, null, { spools: [] })).status, 401);
  });

  it("verweigert Fremden (404) und Betrachtern (403)", async () => {
    assert.equal((await post(`${base()}/file`, outsider, { spools: SPOOLS })).status, 404);
    assert.equal((await post(`${base()}/file`, viewer, { spools: SPOOLS })).status, 403);
  });

  it("prueft die Datei: kein Array, oder zu viele Eintraege -> 400", async () => {
    assert.equal((await post(`${base()}/file`, editor, { spools: "kein array" })).status, 400);
    assert.equal((await post(`${base()}/file`, editor, { spools: Array.from({ length: 2001 }, () => ({})) })).status, 400);
  });

  it("weist eine Datei ohne verwertbare Spulen ab (400)", async () => {
    assert.equal((await post(`${base()}/file`, editor, { spools: [{ id: 1 }, "unsinn"] })).status, 400);
  });

  it("importiert gueltige Eintraege, ueberspringt kaputte, legt Hersteller/Material an", async () => {
    const res = await post(`${base()}/file`, editor, { spools: SPOOLS });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { created: 2, updated: 0, skipped: 2, manufacturersCreated: 1, materialsCreated: 2 });

    const spools = await prisma.spool.findMany({
      where: { inventoryId: lagerId },
      include: { material: true, manufacturer: true },
      orderBy: { remainingWeightG: "desc" }
    });
    assert.equal(spools.length, 2);
    const red = spools[0];
    assert.deepEqual(
      [red?.manufacturer.name, red?.material.name, red?.colorHex, red?.remainingWeightG, red?.tareWeightG, red?.location, red?.note],
      ["Spoolman-Test-Hersteller", "PLA", "#D14343", 780, 210, "Regal 3", "Aus altem Bestand"]
    );
  });

  it("verhindert Doppelimport (gleiche Spoolman-ID) und aktualisiert stattdessen das Restgewicht", async () => {
    await prisma.spool.updateMany({ where: { inventoryId: lagerId, remainingWeightG: 780 }, data: { remainingWeightG: 300 } });
    const res = await post(`${base()}/file`, editor, { spools: SPOOLS });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { created: 0, updated: 1, skipped: 3, manufacturersCreated: 0, materialsCreated: 0 });
    assert.equal(await prisma.spool.count({ where: { inventoryId: lagerId } }), 2);
  });

  it("importiert nichts in ein anderes Lager und trennt gleiche Spoolman-IDs je Lager", async () => {
    assert.equal(await prisma.spool.count({ where: { inventoryId: otherLagerId } }), 0);
    const res = await post(`${base(otherLagerId)}/file`, outsider, { spools: SPOOLS });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.created, 2);
    assert.equal(await prisma.spool.count({ where: { inventoryId: otherLagerId } }), 2);
  });

  it("legt einen Verlauf-Eintrag je angelegter Spule an", async () => {
    const spool = await prisma.spool.findFirst({ where: { inventoryId: lagerId, remainingWeightG: 400 } });
    assert.ok(spool);
    const history = await request(app).get(`/api/spools/${spool.id}/history`).set("Cookie", editor.cookie);
    assert.equal(history.status, 200);
    assert.ok(history.body.data.some((row: { action: string }) => row.action === "CREATE"));
  });
});
