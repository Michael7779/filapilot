import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { TEST_PASSWORD, createInventoryWithMembers, createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

describe("Spulen: Mehrfach-Anlage (POST /api/spools/bulk) - Negativ-Tests", () => {
  const app = createApp();
  let editor: TestUser;
  let viewer: TestUser;
  let stranger: TestUser;
  let lager = "";
  let manufacturerId = "";
  let otherManufacturerId = "";
  let materialId = "";
  let ownMaterialId = "";

  const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    manufacturerId,
    materialId,
    colorName: "Rot",
    colorHex: "#C12E1F",
    isRefill: false,
    initialWeightG: 1000,
    purchasePriceCents: 1199,
    count: 2,
    ...over
  });
  const post = (user: TestUser | null, body: unknown) => {
    const req = request(app).post("/api/spools/bulk");
    return (user ? req.set("Cookie", user.cookie) : req).send(body as object);
  };
  const countSpools = (): Promise<number> => prisma.spool.count({ where: { inventoryId: lager } });

  before(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    editor = await createLoggedInUser(app, "bulkeditor");
    viewer = await createLoggedInUser(app, "bulkviewer");
    stranger = await createLoggedInUser(app, "bulkfremder");
    lager = (await createInventoryWithMembers("Bulk-Lager", [{ userId: editor.id, role: "EDITOR" }, { userId: viewer.id, role: "VIEWER" }])).id;
    manufacturerId = (await prisma.manufacturer.create({ data: { name: "Bulk Hersteller" } })).id;
    otherManufacturerId = (await prisma.manufacturer.create({ data: { name: "Anderer Bulk Hersteller" } })).id;
    materialId = (await prisma.material.create({ data: { name: "Bulk PLA", printTempMinC: 190, printTempMaxC: 220, bedTempC: 60 } })).id;
    ownMaterialId = (await prisma.material.create({ data: { name: "Bulk PETG", manufacturerId, printTempMinC: 220, printTempMaxC: 250, bedTempC: 70 } })).id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff (401) und mustChangePassword (403) ab", async () => {
    assert.equal((await post(null, { inventoryId: lager, items: [item()] })).status, 401);
    await prisma.user.create({
      data: { username: "bulkfrisch", email: "bulkfrisch@example.test", passwordHash: await hashPassword(TEST_PASSWORD), role: "USER", mustChangePassword: true }
    });
    const login = await request(app).post("/api/auth/login").send({ username: "bulkfrisch", password: TEST_PASSWORD });
    const res = await request(app).post("/api/spools/bulk").set("Cookie", login.headers["set-cookie"] as unknown as string[]).send({ inventoryId: lager, items: [item()] });
    assert.equal(res.status, 403);
    assert.equal(await countSpools(), 0);
  });

  it("legt nichts in fremden Lagern an (Fremder 404) und nichts als Betrachter (403)", async () => {
    assert.equal((await post(stranger, { inventoryId: lager, items: [item()] })).status, 404);
    assert.equal((await post(viewer, { inventoryId: lager, items: [item()] })).status, 403);
    assert.equal(await countSpools(), 0);
  });

  it("verwirft zu grosse oder ungueltige Anfragen (400) und legt dabei nichts an", async () => {
    const tooMany = [item({ count: 50 }), item({ count: 50, colorName: "B" }), item({ count: 50, colorName: "C" }), item({ count: 50, colorName: "D" }), item({ count: 1, colorName: "E" })];
    assert.equal((await post(editor, { inventoryId: lager, items: tooMany })).status, 400);
    assert.equal((await post(editor, { inventoryId: lager, items: [] })).status, 400);
    assert.equal((await post(editor, { inventoryId: lager, items: [item({ count: 0 })] })).status, 400);
    assert.equal((await post(editor, { inventoryId: lager, items: [item({ purchasePriceCents: -1 })] })).status, 400);
    assert.equal((await post(editor, { inventoryId: lager, items: [item({ colorHex: "rot" })] })).status, 400);
    assert.equal((await post(editor, { inventoryId: lager, items: [item({ isRefill: "ja" })] })).status, 400);
    assert.equal(await countSpools(), 0);
  });

  it("lehnt eine falsche Material/Hersteller-Kombination ab und legt dann auch die gueltigen Zeilen nicht an (alles oder nichts)", async () => {
    const res = await post(editor, { inventoryId: lager, items: [item(), item({ materialId: ownMaterialId, manufacturerId: otherManufacturerId, colorName: "Blau" })] });
    assert.equal(res.status, 400);
    const unknown = await post(editor, { inventoryId: lager, items: [item({ materialId: "00000000-0000-4000-8000-0000000000ff" })] });
    assert.equal(unknown.status, 400);
    assert.equal(await countSpools(), 0);
  });

  it("legt als Bearbeiter alle Spulen mit Anzahl, Lieferform, Preis, Lagerort an und protokolliert jede", async () => {
    const res = await post(editor, {
      inventoryId: lager,
      location: "Regal 3",
      items: [item({ count: 2 }), item({ colorName: "Blau", colorHex: "#0056B8", isRefill: true, purchasePriceCents: 1019, count: 1 }), item({ materialId: ownMaterialId, colorName: "Grau", colorHex: null, count: 1 })]
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.created, 4);
    const spools = await prisma.spool.findMany({ where: { inventoryId: lager }, orderBy: { colorName: "asc" } });
    assert.equal(spools.length, 4);
    assert.ok(spools.every((spool) => spool.location === "Regal 3" && spool.openedAt === null && spool.remainingWeightG === spool.initialWeightG));
    const blue = spools.find((spool) => spool.colorName === "Blau");
    assert.deepEqual([blue?.isRefill, blue?.purchasePriceCents], [true, 1019]);
    assert.equal(await prisma.auditLog.count({ where: { area: "SPOOL", action: "CREATE", inventoryId: lager } }), 4);
  });

  it("setzt bei 'schon angebrochen' openedAt und ignoriert die Lieferform", async () => {
    const res = await post(editor, { inventoryId: lager, alreadyOpened: true, items: [item({ colorName: "Gelb", isRefill: true, count: 1 })] });
    assert.equal(res.status, 201);
    const spool = await prisma.spool.findFirst({ where: { inventoryId: lager, colorName: "Gelb" } });
    assert.ok(spool?.openedAt);
    assert.equal(spool?.isRefill, false);
  });
});
