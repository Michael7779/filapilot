import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { inventoryRoom } from "../../src/socket.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";
import { captureSocketEmissions } from "../helpers/socketSpy.js";

describe("Meldung 'AMS geaendert' - Negativ-Tests", () => {
  const app = createApp();
  const emissions = captureSocketEmissions();
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let printerId = "";
  let spoolId = "";

  before(async () => {
    await resetInventoryData();
    editor = await createLoggedInUser(app, "liveeditor");
    viewer = await createLoggedInUser(app, "liveviewer");
    outsider = await createLoggedInUser(app, "liveoutsider");
    lagerId = (
      await createInventoryWithMembers("Live-Lager", [
        { userId: editor.id, role: "EDITOR" },
        { userId: viewer.id, role: "VIEWER" }
      ])
    ).id;
    await createInventoryWithMembers("Live-Fremd", [{ userId: outsider.id, role: "OWNER" }]);
    printerId = (await createPrinterIn(lagerId)).id;
    spoolId = (await createSpoolIn(lagerId)).id;
  });

  beforeEach(() => {
    emissions.length = 0;
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const put = (user: TestUser | null) => {
    const req = request(app).put(`/api/printers/${printerId}/ams-slots/0`).send({ spoolId });
    return user ? req.set("Cookie", user.cookie) : req;
  };

  it("loest bei abgelehnten Aenderungen (anonym, fremd, Betrachter) keine Meldung aus", async () => {
    assert.equal((await put(null)).status, 401);
    assert.equal((await put(outsider)).status, 404);
    assert.equal((await put(viewer)).status, 403);
    assert.deepEqual(emissions, []);
  });

  it("meldet eine erlaubte Aenderung nur an das Lager des Druckers und nur mit dessen Kennung", async () => {
    assert.equal((await put(editor)).status, 200);
    assert.deepEqual(emissions, [{ room: inventoryRoom(lagerId), event: "ams:changed", payload: { inventoryId: lagerId } }]);
  });
});
