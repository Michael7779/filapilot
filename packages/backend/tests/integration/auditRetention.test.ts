import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { pruneAuditLog, retentionCutoff } from "../../src/services/auditRetentionService.js";

describe("Protokoll-Aufbewahrung", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");

  before(async () => {
    await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.settings.update({ where: { id: 1 }, data: { auditRetentionMonths: 12 } });
  });

  after(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.settings.update({ where: { id: 1 }, data: { auditRetentionMonths: 12 } });
    await prisma.$disconnect();
  });

  async function entry(description: string, createdAt: Date): Promise<void> {
    await prisma.auditLog.create({
      data: { username: "tester", action: "CREATE", area: "SPOOL", description, createdAt }
    });
  }

  it("berechnet die Grenze als jetzt minus N Monate", () => {
    assert.equal(retentionCutoff(12, now).toISOString(), "2025-09-24T12:00:00.000Z");
    assert.equal(retentionCutoff(1, now).toISOString(), "2026-08-24T12:00:00.000Z");
  });

  it("loescht nur Eintraege, die aelter als die eingestellten Monate sind, und protokolliert das Aufraeumen", async () => {
    await entry("alt", new Date("2025-08-01T00:00:00.000Z"));
    await entry("gerade noch drin", new Date("2025-10-01T00:00:00.000Z"));
    await entry("neu", new Date("2026-09-20T00:00:00.000Z"));

    assert.equal(await pruneAuditLog(now), 1);

    const rest = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((row) => row.description);
    assert.equal(rest.length, 3);
    assert.ok(!rest.includes("alt"));
    assert.ok(rest.includes("gerade noch drin") && rest.includes("neu"));
    const event = await prisma.auditLog.findFirst({ where: { username: "System" } });
    assert.match(event?.description ?? "", /1 Einträge älter als 12 Monate/);
  });

  it("loescht bei 0 Monaten (unbegrenzt) nichts", async () => {
    await prisma.settings.update({ where: { id: 1 }, data: { auditRetentionMonths: 0 } });
    await entry("uralt", new Date("2020-01-01T00:00:00.000Z"));
    assert.equal(await pruneAuditLog(now), 0);
    assert.equal(await prisma.auditLog.count(), 1);
  });

  it("schreibt keinen Eintrag, wenn nichts zu loeschen war", async () => {
    await entry("neu", new Date("2026-09-20T00:00:00.000Z"));
    assert.equal(await pruneAuditLog(now), 0);
    assert.equal(await prisma.auditLog.count(), 1);
  });
});
