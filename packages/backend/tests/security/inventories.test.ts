import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/env.js";
import { prisma } from "../../src/prisma.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

describe("Lager - Negativ-Tests und Verwaltung", () => {
  const app = createApp();
  let admin: TestUser;
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";

  before(async () => {
    await resetInventoryData();
    admin = await createLoggedInUser(app, "lagadmin", "ADMIN");
    owner = await createLoggedInUser(app, "lagowner");
    editor = await createLoggedInUser(app, "lageditor");
    viewer = await createLoggedInUser(app, "lagviewer");
    outsider = await createLoggedInUser(app, "lagoutsider");
    const lager = await createInventoryWithMembers("Werkstatt", [
      { userId: owner.id, role: "OWNER" },
      { userId: editor.id, role: "EDITOR" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    lagerId = lager.id;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const api = (method: "get" | "post" | "patch" | "delete", url: string, user?: TestUser) => {
    const req = request(app)[method](url);
    return user ? req.set("Cookie", user.cookie) : req;
  };

  it("lehnt anonyme Zugriffe auf alle Lager-Routen ab (401)", async () => {
    for (const [method, url] of [
      ["get", "/api/inventories"],
      ["post", "/api/inventories"],
      ["patch", `/api/inventories/${lagerId}`],
      ["delete", `/api/inventories/${lagerId}`],
      ["get", `/api/inventories/${lagerId}/members`],
      ["get", `/api/inventories/${lagerId}/member-candidates`],
      ["post", `/api/inventories/${lagerId}/members`]
    ] as const) {
      assert.equal((await api(method, url)).status, 401, `${method} ${url}`);
    }
  });

  it("zeigt Fremden das Lager nicht: Liste ohne Lager, alle Einzelrouten 404", async () => {
    const list = await api("get", "/api/inventories", outsider);
    assert.equal(list.status, 200);
    assert.ok(!list.body.data.some((inventory: { id: string }) => inventory.id === lagerId));

    assert.equal((await api("get", `/api/inventories/${lagerId}/members`, outsider)).status, 404);
    assert.equal((await api("get", `/api/inventories/${lagerId}/member-candidates`, outsider)).status, 404);
    assert.equal((await api("patch", `/api/inventories/${lagerId}`, outsider).send({ name: "Meins" })).status, 404);
    assert.equal((await api("delete", `/api/inventories/${lagerId}`, outsider).send({ confirmName: "Werkstatt" })).status, 404);
    assert.equal(
      (await api("post", `/api/inventories/${lagerId}/members`, outsider).send({ userId: outsider.id, role: "OWNER" })).status,
      404
    );
    assert.equal((await api("get", `/api/inventories/${UNKNOWN_ID}/members`, outsider)).status, 404);
  });

  it("verweigert Betrachtern und Bearbeitern das Verwalten (403), erlaubt ihnen aber die Mitgliederliste", async () => {
    for (const user of [viewer, editor]) {
      assert.equal((await api("patch", `/api/inventories/${lagerId}`, user).send({ name: "Umbenannt" })).status, 403, user.username);
      assert.equal((await api("delete", `/api/inventories/${lagerId}`, user).send({ confirmName: "Werkstatt" })).status, 403);
      assert.equal((await api("get", `/api/inventories/${lagerId}/member-candidates`, user)).status, 403);
      assert.equal(
        (await api("post", `/api/inventories/${lagerId}/members`, user).send({ userId: outsider.id, role: "VIEWER" })).status,
        403
      );
      assert.equal((await api("patch", `/api/inventories/${lagerId}/members/${viewer.id}`, user).send({ role: "OWNER" })).status, 403);
      assert.equal((await api("delete", `/api/inventories/${lagerId}/members/${owner.id}`, user)).status, 403);
      assert.equal((await api("get", `/api/inventories/${lagerId}/members`, user)).status, 200);
    }
  });

  it("legt ein Lager an (jeder Angemeldete wird Besitzer) und prueft Eingaben und doppelte Namen ohne Beachtung der Gross-/Kleinschreibung", async () => {
    const created = await api("post", "/api/inventories", outsider).send({ name: "Büro", color: "#1D9E75" });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.role, "OWNER");
    assert.equal(created.body.data.color, "#1D9E75");

    assert.equal((await api("post", "/api/inventories", editor).send({ name: "büro" })).status, 409);
    assert.equal((await api("post", "/api/inventories", editor).send({ name: "  " })).status, 400);
    assert.equal((await api("post", "/api/inventories", editor).send({ name: "x".repeat(61) })).status, 400);
    assert.equal((await api("post", "/api/inventories", editor).send({ name: "Farbtest", color: "#123456" })).status, 400);

    const own = await api("get", "/api/inventories", outsider);
    assert.deepEqual(own.body.data.map((inventory: { name: string }) => inventory.name), ["Büro"]);
  });

  it("laesst Besitzer umbenennen, aber keinen doppelten Namen zu (409)", async () => {
    const renamed = await api("patch", `/api/inventories/${lagerId}`, owner).send({ name: "Werkstatt Nord", color: "#D85A30" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.name, "Werkstatt Nord");
    assert.equal((await api("patch", `/api/inventories/${lagerId}`, owner).send({ name: "büro" })).status, 409);
    await api("patch", `/api/inventories/${lagerId}`, owner).send({ name: "Werkstatt" });
  });

  it("verwaltet Mitglieder: hinzufuegen, doppelt (409), unbekannt (404), Rolle aendern, letzten Besitzer schuetzen (409), selbst verlassen", async () => {
    const candidates = await api("get", `/api/inventories/${lagerId}/member-candidates`, owner);
    assert.deepEqual(candidates.body.data.map((c: { username: string }) => c.username).sort(), ["lagadmin", "lagoutsider"]);
    assert.ok(candidates.body.data.every((c: Record<string, unknown>) => Object.keys(c).sort().join() === "id,username"));

    const added = await api("post", `/api/inventories/${lagerId}/members`, owner).send({ userId: outsider.id, role: "VIEWER" });
    assert.equal(added.status, 201);
    assert.equal((await api("post", `/api/inventories/${lagerId}/members`, owner).send({ userId: outsider.id, role: "VIEWER" })).status, 409);
    assert.equal((await api("post", `/api/inventories/${lagerId}/members`, owner).send({ userId: UNKNOWN_ID, role: "VIEWER" })).status, 404);
    assert.equal((await api("post", `/api/inventories/${lagerId}/members`, owner).send({ userId: viewer.id, role: "BOSS" })).status, 400);

    const promoted = await api("patch", `/api/inventories/${lagerId}/members/${outsider.id}`, owner).send({ role: "EDITOR" });
    assert.equal(promoted.body.data.role, "EDITOR");

    assert.equal((await api("patch", `/api/inventories/${lagerId}/members/${owner.id}`, owner).send({ role: "EDITOR" })).status, 409);
    assert.equal((await api("delete", `/api/inventories/${lagerId}/members/${owner.id}`, owner)).status, 409);

    // Zweiten Besitzer ernennen, dann darf der erste herabgestuft werden
    await api("patch", `/api/inventories/${lagerId}/members/${outsider.id}`, owner).send({ role: "OWNER" });
    assert.equal((await api("patch", `/api/inventories/${lagerId}/members/${owner.id}`, outsider).send({ role: "EDITOR" })).status, 200);
    await api("patch", `/api/inventories/${lagerId}/members/${owner.id}`, outsider).send({ role: "OWNER" });

    // Jedes Mitglied darf sich selbst entfernen, fremde nicht
    assert.equal((await api("delete", `/api/inventories/${lagerId}/members/${viewer.id}`, editor)).status, 403);
    assert.equal((await api("delete", `/api/inventories/${lagerId}/members/${editor.id}`, editor)).status, 200);
    assert.equal((await api("get", `/api/inventories/${lagerId}/members`, editor)).status, 404);
    await api("post", `/api/inventories/${lagerId}/members`, owner).send({ userId: editor.id, role: "EDITOR" });
    await api("delete", `/api/inventories/${lagerId}/members/${outsider.id}`, owner);
  });

  it("gibt Admins Zugriff auf alle Lager als Besitzer, ohne Mitglied zu sein", async () => {
    const list = await api("get", "/api/inventories", admin);
    const entry = list.body.data.find((inventory: { id: string }) => inventory.id === lagerId);
    assert.equal(entry.role, "OWNER");
    assert.equal((await api("get", `/api/inventories/${lagerId}/members`, admin)).status, 200);
    assert.equal((await api("patch", `/api/inventories/${lagerId}`, admin).send({ color: "#7F56D9" })).status, 200);
  });

  it("loescht ein Lager nur mit exaktem Namen und raeumt Spulen, Fotos, Drucker und Mitgliedschaften auf", async () => {
    const doomed = await createInventoryWithMembers("Zum Loeschen", [
      { userId: owner.id, role: "OWNER" },
      { userId: viewer.id, role: "VIEWER" }
    ]);
    const spool = await createSpoolIn(doomed.id);
    await createPrinterIn(doomed.id);
    const safe = await createSpoolIn(lagerId, "Blau");
    await prisma.spool.update({ where: { id: spool.id }, data: { photoUrl: "/api/spools/x/photo?v=1" } });
    const photoFile = path.join(env.UPLOADS_FOLDER_PATH, "spool-photos", spool.id);
    await fs.mkdir(path.dirname(photoFile), { recursive: true });
    await fs.writeFile(photoFile, "bild");

    assert.equal((await api("delete", `/api/inventories/${doomed.id}`, owner).send({})).status, 400);
    assert.equal((await api("delete", `/api/inventories/${doomed.id}`, owner).send({ confirmName: "zum loeschen" })).status, 400);
    assert.equal((await api("delete", `/api/inventories/${doomed.id}`, viewer).send({ confirmName: "Zum Loeschen" })).status, 403);
    assert.equal(await prisma.spool.count({ where: { inventoryId: doomed.id } }), 1);

    const deleted = await api("delete", `/api/inventories/${doomed.id}`, owner).send({ confirmName: "Zum Loeschen" });
    assert.equal(deleted.status, 200);
    assert.deepEqual([deleted.body.data.spools, deleted.body.data.printers], [1, 1]);
    assert.equal(await prisma.inventory.count({ where: { id: doomed.id } }), 0);
    assert.equal(await prisma.spool.count({ where: { id: spool.id } }), 0);
    assert.equal(await prisma.printer.count({ where: { inventoryId: doomed.id } }), 0);
    assert.equal(await prisma.inventoryMember.count({ where: { inventoryId: doomed.id } }), 0);
    await assert.rejects(fs.access(photoFile));
    // Ein anderes Lager bleibt unberuehrt
    assert.equal(await prisma.spool.count({ where: { id: safe.id } }), 1);
  });

  it("protokolliert Lager-Vorgaenge mit dem Lager", async () => {
    const entries = await prisma.auditLog.findMany({ where: { area: "INVENTORY" } });
    assert.ok(entries.some((entry) => entry.description.includes("Mitglied hinzugefügt") && entry.inventoryName === "Werkstatt"));
    assert.ok(entries.some((entry) => entry.action === "DELETE" && entry.inventoryName === "Zum Loeschen"));
  });

  it("sperrt Benutzer mit ausstehendem Passwortwechsel (403)", async () => {
    await prisma.user.update({ where: { id: viewer.id }, data: { mustChangePassword: true } });
    assert.equal((await api("get", "/api/inventories", viewer)).status, 403);
    await prisma.user.update({ where: { id: viewer.id }, data: { mustChangePassword: false } });
  });
});
