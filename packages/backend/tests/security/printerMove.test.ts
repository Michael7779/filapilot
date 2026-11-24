import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { disconnectAllPrinters } from "../../src/services/printerRuntime.js";
import {
  createInventoryWithMembers,
  createLoggedInUser,
  createPrinterIn,
  createSpoolIn,
  resetInventoryData,
  type TestUser
} from "../helpers/fixtures.js";

describe("Drucker in ein anderes Lager verschieben - Negativ-Tests", () => {
  const app = createApp();
  let ownerBoth: TestUser;
  let ownerSourceOnly: TestUser;
  let editorSource: TestUser;
  let outsider: TestUser;
  let sourceId = "";
  let targetId = "";
  let strangerLagerId = "";
  let printerId = "";

  let printerCounter = 0;
  async function freshPrinter(): Promise<string> {
    printerCounter += 1;
    const printer = await createPrinterIn(sourceId, `Mover-${printerCounter}`);
    return printer.id;
  }

  before(async () => {
    await resetInventoryData();
    ownerBoth = await createLoggedInUser(app, "mvboth");
    ownerSourceOnly = await createLoggedInUser(app, "mvsource");
    editorSource = await createLoggedInUser(app, "mveditor");
    outsider = await createLoggedInUser(app, "mvoutsider");
    sourceId = (
      await createInventoryWithMembers("Quelle", [
        { userId: ownerBoth.id, role: "OWNER" },
        { userId: ownerSourceOnly.id, role: "OWNER" },
        { userId: editorSource.id, role: "EDITOR" }
      ])
    ).id;
    targetId = (
      await createInventoryWithMembers("Ziel", [
        { userId: ownerBoth.id, role: "OWNER" },
        { userId: editorSource.id, role: "VIEWER" }
      ])
    ).id;
    strangerLagerId = (
      await createInventoryWithMembers("Fremdlager", [{ userId: outsider.id, role: "OWNER" }])
    ).id;
    printerId = await freshPrinter();
  });

  after(async () => {
    // Ein erfolgreiches PATCH baut eine Hintergrund-MQTT-Verbindung auf - sonst haengt der Testlauf an Reconnect-Timern.
    disconnectAllPrinters();
    await resetInventoryData();
    await prisma.$disconnect();
  });

  it("verweigert das Verschieben ohne Anmeldung (401)", async () => {
    const res = await request(app)
      .patch(`/api/printers/${printerId}`)
      .send({ inventoryId: targetId });
    assert.equal(res.status, 401);
  });

  it("verweigert Editoren, die den Drucker nicht verwalten duerfen (403)", async () => {
    const res = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", editorSource.cookie)
      .send({ inventoryId: targetId });
    assert.equal(res.status, 403);
    assert.equal(
      (await prisma.printer.findUniqueOrThrow({ where: { id: printerId } })).inventoryId,
      sourceId
    );
  });

  it("verweigert, wenn der Nutzer im Ziel-Lager nicht Besitzer ist (403 bei Betrachter, 404 ohne Zugriff)", async () => {
    // ownerSourceOnly hat im Ziel gar keinen Zugriff -> das Ziel bleibt unsichtbar (404)
    const unseen = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerSourceOnly.cookie)
      .send({ inventoryId: targetId });
    assert.equal(unseen.status, 404);
    // Betrachter im Ziel + Besitzer in der Quelle: im Ziel zu wenig Rechte
    await prisma.inventoryMember.create({
      data: { inventoryId: targetId, userId: ownerSourceOnly.id, role: "VIEWER" }
    });
    const viewer = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerSourceOnly.cookie)
      .send({ inventoryId: targetId });
    assert.equal(viewer.status, 403);
    assert.equal(
      (await prisma.printer.findUniqueOrThrow({ where: { id: printerId } })).inventoryId,
      sourceId
    );
  });

  it("verweigert ein Ziel-Lager, das es nicht gibt oder das keine gueltige ID ist (404 / 400)", async () => {
    const missing = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerBoth.cookie)
      .send({ inventoryId: "00000000-0000-4000-8000-000000000000" });
    assert.equal(missing.status, 404);
    const invalid = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerBoth.cookie)
      .send({ inventoryId: "kein-uuid" });
    assert.equal(invalid.status, 400);
  });

  it("verweigert ein fremdes Lager, in dem der Nutzer nichts darf (404)", async () => {
    const res = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerBoth.cookie)
      .send({ inventoryId: strangerLagerId });
    assert.equal(res.status, 404);
  });

  it("verschiebt mit Besitzer-Rechten in beiden Lagern, leert die AMS-Faecher und behaelt die Auftraege", async () => {
    const spool = await createSpoolIn(sourceId, "Alt-Rot");
    await prisma.amsSlotAssignment.create({ data: { printerId, slotIndex: 0, spoolId: spool.id } });
    await prisma.printJob.create({
      data: {
        printerId,
        spoolId: spool.id,
        name: "Altjob",
        filamentUsedG: 12,
        startedAt: new Date()
      }
    });

    const res = await request(app)
      .patch(`/api/printers/${printerId}`)
      .set("Cookie", ownerBoth.cookie)
      .send({ inventoryId: targetId });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.inventoryId, targetId);
    assert.equal(JSON.stringify(res.body).includes("accessCode"), false);
    assert.equal(
      await prisma.amsSlotAssignment.count({ where: { printerId, spoolId: { not: null } } }),
      0
    );
    assert.equal(await prisma.printJob.count({ where: { printerId } }), 1);
    const audit = await prisma.auditLog.findFirst({
      where: { area: "PRINTER", entityId: printerId },
      orderBy: { createdAt: "desc" }
    });
    assert.ok(audit);
  });

  it("aendert nichts am Lager, wenn das Ziel gleich dem aktuellen Lager ist (und leert dann keine Faecher)", async () => {
    const id = await freshPrinter();
    const spool = await createSpoolIn(sourceId, "Bleibt");
    await prisma.amsSlotAssignment.create({
      data: { printerId: id, slotIndex: 1, spoolId: spool.id }
    });
    const res = await request(app)
      .patch(`/api/printers/${id}`)
      .set("Cookie", ownerBoth.cookie)
      .send({ inventoryId: sourceId, name: "Umbenannt" });
    assert.equal(res.status, 200);
    assert.equal(
      await prisma.amsSlotAssignment.count({ where: { printerId: id, spoolId: spool.id } }),
      1
    );
  });
});
