/* eslint-disable sonarjs/no-hardcoded-ip -- Test-Fixture-Adresse im privaten Bereich, wird nie erreicht (Verbindungsversuch scheitert bewusst). */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";
import { disconnectAllPrinters } from "../../src/services/printerRuntime.js";

interface Item {
  username: string;
  action: string;
  area: string;
  description: string;
  inventoryName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

describe("Aenderungsprotokoll - Negativ-Tests und Aufzeichnung", () => {
  const app = createApp();
  const pw = "correct-horse-battery-staple";
  let adminCookie: string[] = [];
  let userCookie: string[] = [];
  let materialId = "";
  let manufacturerId = "";
  let inventoryId = "";

  async function list(query = ""): Promise<{ items: Item[]; total: number; usernames: string[]; inventories: { id: string; name: string }[] }> {
    const res = await request(app).get(`/api/audit-log${query}`).set("Cookie", adminCookie);
    assert.equal(res.status, 200);
    return res.body.data;
  }

  before(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "auditadmin", email: "auditadmin@example.test", passwordHash: await hashPassword(pw), role: "ADMIN", mustChangePassword: false }
    });
    const auditUser = await prisma.user.create({
      data: { username: "audituser", email: "audituser@example.test", passwordHash: await hashPassword(pw), role: "USER", mustChangePassword: false }
    });
    inventoryId = (
      await prisma.inventory.create({ data: { name: "Audit-Lager", members: { create: { userId: auditUser.id, role: "EDITOR" } } } })
    ).id;
    adminCookie = (await request(app).post("/api/auth/login").send({ username: "auditadmin", password: pw })).headers["set-cookie"];
    userCookie = (await request(app).post("/api/auth/login").send({ username: "audituser", password: pw })).headers["set-cookie"];

    const manufacturer = await prisma.manufacturer.upsert({ where: { name: "Audit Hersteller" }, update: {}, create: { name: "Audit Hersteller" } });
    manufacturerId = manufacturer.id;
    const material = await prisma.material.create({ data: { name: "Audit PLA", manufacturerId, printTempMinC: 190, printTempMaxC: 220 } });
    materialId = material.id;
  });

  after(async () => {
    // Das Anlegen eines Druckers baut eine MQTT-Verbindung auf - sonst haengt der Testprozess an den Reconnect-Timern.
    disconnectAllPrinters();
    await prisma.auditLog.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.printer.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany({ where: { id: materialId } });
    await prisma.manufacturer.deleteMany({ where: { id: manufacturerId } });
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt das Lesen ohne Login (401) und als Benutzer (403) ab und validiert die Filter (400)", async () => {
    assert.equal((await request(app).get("/api/audit-log")).status, 401);
    assert.equal((await request(app).get("/api/audit-log").set("Cookie", userCookie)).status, 403);
    for (const bad of ["?pageSize=7", "?area=GIBTSNICHT", "?action=X", "?from=gestern", "?page=0"]) {
      assert.equal((await request(app).get(`/api/audit-log${bad}`).set("Cookie", adminCookie)).status, 400, bad);
    }
  });

  it("bietet keine Route zum Aendern oder Loeschen von Eintraegen", async () => {
    for (const method of ["post", "patch", "put", "delete"] as const) {
      const res = await request(app)[method]("/api/audit-log").set("Cookie", adminCookie).send({});
      assert.ok([404, 405].includes(res.status), `${method} -> ${res.status}`);
    }
  });

  it("protokolliert Anlegen, Aendern (mit Vorher/Nachher) und Loeschen einer Spule - aber keine Aenderung ohne Wirkung", async () => {
    const body = {
      materialId,
      manufacturerId,
      colorName: "Audit-Rot",
      colorHex: "#D14343",
      initialWeightG: 1000,
      remainingWeightG: 1000,
      inventoryId,
      purchasePriceCents: null,
      purchasedAt: null,
      location: null
    };
    const created = await request(app).post("/api/spools").set("Cookie", userCookie).send(body);
    assert.equal(created.status, 201);
    const id = created.body.data.id as string;

    await request(app).patch(`/api/spools/${id}`).set("Cookie", userCookie).send({ remainingWeightG: 900 });
    await request(app).patch(`/api/spools/${id}`).set("Cookie", userCookie).send({ remainingWeightG: 900 });
    await request(app).delete(`/api/spools/${id}`).set("Cookie", userCookie);

    const { items } = await list("?area=SPOOL");
    assert.deepEqual(items.map((i) => i.action), ["DELETE", "UPDATE", "CREATE"]);
    assert.ok(items.every((i) => i.username === "audituser"));
    assert.ok(items[0]?.description.includes("Audit-Rot"));
    assert.equal(items[1]?.before?.remainingWeightG, 1000);
    assert.equal(items[1]?.after?.remainingWeightG, 900);
    assert.equal(items[2]?.after?.materialName, "Audit PLA");
    // Jeder Eintrag kennt sein Lager, und der Filter danach funktioniert
    assert.ok(items.every((i) => i.inventoryName === "Audit-Lager"));
    const filtered = await list(`?inventoryId=${inventoryId}`);
    assert.equal(filtered.items.length, items.length);
    assert.ok(filtered.inventories.some((entry) => entry.id === inventoryId && entry.name === "Audit-Lager"));
    assert.equal((await list("?inventoryId=11111111-1111-4111-8111-111111111111")).items.length, 0);
    assert.equal((await request(app).get("/api/audit-log?inventoryId=kein-uuid").set("Cookie", adminCookie)).status, 400);
  });

  it("schreibt nie Geheimnisse ins Protokoll (Zugangscode, SMTP-Passwort, Passwort-Hash, Start-Passwort)", async () => {
    const printer = await request(app).post("/api/printers").set("Cookie", adminCookie).send({
      name: "Audit-Drucker", ipAddress: "192.168.1.77", serialNumber: "AUDIT-SN-1", accessCode: "GEHEIMER-ZUGANGSCODE", syncMode: "LIVE", syncIntervalSeconds: 60, inventoryId
    });
    assert.equal(printer.status, 201);
    await request(app).patch(`/api/printers/${printer.body.data.id}`).set("Cookie", adminCookie).send({ accessCode: "NOCH-GEHEIMER-CODE" });
    await request(app).patch("/api/settings").set("Cookie", adminCookie).send({
      smtp: { host: "smtp.example.test", port: 587, secure: false, username: "bot@example.test", fromAddress: "bot@example.test", password: "GEHEIMES-SMTP-PASSWORT" }
    });
    const created = await request(app).post("/api/users").set("Cookie", adminCookie).send({ username: "auditneu", email: "auditneu@example.test", role: "USER" });
    const tempPassword = created.body.data.temporaryPassword as string | undefined;

    const all = JSON.stringify(await prisma.auditLog.findMany());
    for (const secret of ["GEHEIMER-ZUGANGSCODE", "NOCH-GEHEIMER-CODE", "GEHEIMES-SMTP-PASSWORT", "passwordHash", "$2"]) {
      assert.equal(all.includes(secret), false, secret);
    }
    if (tempPassword) {
      assert.equal(all.includes(tempPassword), false);
    }
    const { items } = await list("?area=PRINTER&action=UPDATE");
    assert.equal(items[0]?.after?.accessCodeChanged, true);
    const settings = await list("?area=SETTINGS");
    assert.equal(settings.items[0]?.after?.smtpPasswordChanged, true);
  });

  it("filtert nach Suche, Bereich, Aktion, Benutzer und Zeitraum und teilt in Seiten", async () => {
    const base = Date.parse("2026-01-15T12:00:00Z");
    await prisma.auditLog.createMany({
      data: Array.from({ length: 12 }, (_, n) => ({
        createdAt: new Date(base + n * 1000),
        username: n % 2 === 0 ? "auditadmin" : "audituser",
        action: "UPDATE" as const,
        area: "MANUFACTURER" as const,
        description: `Massenhersteller ${n}`
      }))
    });

    const search = await list("?search=massenhersteller%205");
    assert.equal(search.total, 1);
    const byUser = await list("?area=MANUFACTURER&username=audituser");
    assert.equal(byUser.total, 6);
    const none = await list("?area=MANUFACTURER&action=DELETE");
    assert.equal(none.total, 0);
    const range = await list(`?area=MANUFACTURER&from=${encodeURIComponent("2026-01-15T12:00:03Z")}&to=${encodeURIComponent("2026-01-15T12:00:05Z")}`);
    assert.equal(range.total, 3);

    const page1 = await list("?area=MANUFACTURER&pageSize=10&page=1");
    const page2 = await list("?area=MANUFACTURER&pageSize=10&page=2");
    assert.equal(page1.total, 12);
    assert.equal(page1.items.length, 10);
    assert.equal(page2.items.length, 2);
    assert.equal(page1.items[0]?.description, "Massenhersteller 11");
    assert.ok(page1.usernames.includes("audituser") && page1.usernames.includes("auditadmin"));
  });
});
