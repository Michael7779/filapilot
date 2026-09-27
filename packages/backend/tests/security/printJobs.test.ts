import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Druckauftrags-Verlauf - Negativ-Tests", () => {
  const app = createApp();
  let viewer: TestUser;
  let outsider: TestUser;
  let lagerId = "";
  let otherLagerId = "";
  let printerId = "";
  let otherPrinterId = "";
  let spoolId = "";
  let otherSpoolId = "";

  before(async () => {
    await resetInventoryData();
    viewer = await createLoggedInUser(app, "jobsviewer");
    outsider = await createLoggedInUser(app, "jobsoutsider");
    const lager = await createInventoryWithMembers("Job-Lager", [{ userId: viewer.id, role: "VIEWER" }]);
    lagerId = lager.id;
    const other = await createInventoryWithMembers("Job-Fremd", [{ userId: outsider.id, role: "OWNER" }]);
    otherLagerId = other.id;
    printerId = (await createPrinterIn(lagerId, "Job-Drucker")).id;
    otherPrinterId = (await createPrinterIn(otherLagerId, "Job-Fremd-Drucker")).id;
    spoolId = (await createSpoolIn(lagerId, "Gruen")).id;
    otherSpoolId = (await createSpoolIn(otherLagerId, "Fremd")).id;

    await prisma.printJob.create({
      data: { printerId, spoolId, name: "Eigener Auftrag", filamentUsedG: 50, costCents: 100, startedAt: new Date(), finishedAt: new Date() }
    });
    await prisma.printJob.create({
      data: { printerId: otherPrinterId, spoolId: otherSpoolId, name: "Fremder Auftrag", filamentUsedG: 50, startedAt: new Date(), finishedAt: new Date() }
    });
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const list = (user: TestUser | null, query: string) => {
    const req = request(app).get("/api/print-jobs?" + query);
    return user ? req.set("Cookie", user.cookie) : req;
  };

  it("lehnt anonyme Zugriffe ab (401) und ein fremdes Lager (404)", async () => {
    assert.equal((await list(null, "inventoryId=" + lagerId)).status, 401);
    assert.equal((await list(outsider, "inventoryId=" + lagerId)).status, 404);
  });

  it("zeigt im eigenen Lager nur dessen Auftraege", async () => {
    const res = await list(viewer, "inventoryId=" + lagerId);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.jobs.length, 1);
    assert.equal(res.body.data.jobs[0].name, "Eigener Auftrag");
    assert.equal(res.body.data.jobs[0].printerName, "Job-Drucker");
    assert.equal(res.body.data.jobs[0].spoolLabel.includes("Gruen"), true);
  });

  it("'all' enthaelt nie fremde Auftraege", async () => {
    const res = await list(viewer, "inventoryId=all");
    assert.equal(res.body.data.jobs.every((job: { name: string }) => job.name !== "Fremder Auftrag"), true);
  });

  it("lehnt einen fremden Drucker/Spule als Filter ab (404)", async () => {
    assert.equal((await list(viewer, `inventoryId=${lagerId}&printerId=${otherPrinterId}`)).status, 404);
    assert.equal((await list(viewer, `inventoryId=${lagerId}&spoolId=${otherSpoolId}`)).status, 404);
  });

  it("prueft Eingaben (ungueltiges Lager, zu grosses limit)", async () => {
    assert.equal((await list(viewer, "inventoryId=kein-uuid")).status, 400);
    assert.equal((await list(viewer, `inventoryId=${lagerId}&limit=999`)).status, 400);
  });
});
