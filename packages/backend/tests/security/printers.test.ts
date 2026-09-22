import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { disconnectPrinter } from "../../src/services/printerRuntime.js";

/* eslint-disable sonarjs/no-hardcoded-ip -- Test-Fixture-Adressen im privaten 192.168.0.0/16-Bereich,
   nie erreicht (Verbindungsversuch schlaegt bewusst fehl), kein echtes Ziel. */

describe("Printers - Negativ-Tests", () => {
  const app = createApp();
  let activeUserCookie: string[] = [];
  let adminCookie: string[] = [];

  before(async () => {
    await prisma.printer.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.create({
      data: {
        username: "printeruser",
        email: "printeruser@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
    await prisma.user.create({
      data: {
        username: "printeradmin",
        email: "printeradmin@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "ADMIN",
        mustChangePassword: false
      }
    });

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "printeruser", password: "correct-horse-battery-staple" });
    activeUserCookie = userLogin.headers["set-cookie"];

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "printeradmin", password: "correct-horse-battery-staple" });
    adminCookie = adminLogin.headers["set-cookie"];
  });

  after(async () => {
    // POST /api/printers baut sofort eine (Hintergrund-)MQTT-Verbindung auf, damit der Testlauf
    // nicht wegen offener Reconnect-Timer haengen bleibt, muss jede in diesem Testfile angelegte
    // Verbindung wieder sauber getrennt werden - unabhaengig davon, ob der echte Drucker
    // erreichbar war.
    const remainingPrinters = await prisma.printer.findMany();
    for (const printer of remainingPrinters) {
      disconnectPrinter(printer.id);
    }
    await prisma.printer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt anonymen Zugriff auf die Drucker-Liste ab (401)", async () => {
    const res = await request(app).get("/api/printers");
    assert.equal(res.status, 401);
  });

  it("lehnt Anlegen eines Druckers durch nicht-Admin ab (403)", async () => {
    const res = await request(app)
      .post("/api/printers")
      .set("Cookie", activeUserCookie)
      .send({
        name: "Werkstatt",
        ipAddress: "192.168.1.50",
        serialNumber: "TEST-SN-1",
        accessCode: "12345678",
        syncMode: "LIVE",
        syncIntervalSeconds: 60
      });
    assert.equal(res.status, 403);
  });

  it("Admin kann einen Drucker anlegen; accessCode taucht nie in der Antwort auf", async () => {
    const createRes = await request(app)
      .post("/api/printers")
      .set("Cookie", adminCookie)
      .send({
        name: "Werkstatt",
        ipAddress: "192.168.1.50",
        serialNumber: "TEST-SN-2",
        accessCode: "12345678",
        syncMode: "LIVE",
        syncIntervalSeconds: 60
      });
    assert.equal(createRes.status, 201);
    assert.equal("accessCode" in createRes.body.data, false);
    const printerId: string = createRes.body.data.id;

    const listRes = await request(app).get("/api/printers").set("Cookie", activeUserCookie);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.every((p: object) => !("accessCode" in p)));

    const statusRes = await request(app)
      .get(`/api/printers/${printerId}/status`)
      .set("Cookie", activeUserCookie);
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.printerId, printerId);
  });

  it("lehnt Aendern und Loeschen eines Druckers durch nicht-Admin ab (403)", async () => {
    const created = await prisma.printer.create({
      data: {
        name: "Nur fuer Test",
        ipAddress: "192.168.1.51",
        serialNumber: "TEST-SN-3",
        accessCode: "12345678",
        syncMode: "LIVE",
        syncIntervalSeconds: 60
      }
    });

    const patchRes = await request(app)
      .patch(`/api/printers/${created.id}`)
      .set("Cookie", activeUserCookie)
      .send({ name: "Umbenannt" });
    assert.equal(patchRes.status, 403);

    const deleteRes = await request(app)
      .delete(`/api/printers/${created.id}`)
      .set("Cookie", activeUserCookie);
    assert.equal(deleteRes.status, 403);
  });
});
