import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { runScheduledBackup } from "../../src/services/backupScheduler.js";
import { getBackupFailure } from "../../src/services/backupStatusService.js";

describe("Taeglicher Backup-Job meldet seinen Ausfall", () => {
  before(async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      update: { backupEnabled: true },
      create: { id: 1, backupFolderPath: "backup-test" }
    });
  });

  beforeEach(async () => {
    await prisma.settings.update({
      where: { id: 1 },
      data: { backupEnabled: true, lastBackupFailedAt: null, lastBackupFailureReason: null }
    });
    await prisma.auditLog.deleteMany({ where: { area: "BACKUP" } });
  });

  after(async () => {
    await prisma.settings.update({
      where: { id: 1 },
      data: { lastBackupFailedAt: null, lastBackupFailureReason: null }
    });
    await prisma.$disconnect();
  });

  it("merkt sich einen Fehlschlag (ohne Zugangsdaten) und schreibt ihn ins Protokoll", async () => {
    await runScheduledBackup({
      createBackup: () =>
        Promise.reject(new Error("pg_dump postgresql://u:secret@db/x: Verbindung abgelehnt"))
    });
    const failure = await getBackupFailure();
    assert.ok(failure);
    assert.ok(!failure.reason.includes("secret"));
    assert.ok(Math.abs(Date.now() - Date.parse(failure.at)) < 60_000);
    const entries = await prisma.auditLog.findMany({ where: { area: "BACKUP" } });
    assert.equal(entries.length, 1);
    assert.match(entries[0]?.description ?? "", /fehlgeschlagen/);
    assert.ok(!(entries[0]?.description ?? "").includes("secret"));
  });

  it("loescht den Fehler wieder, sobald eine Sicherung gelingt", async () => {
    await runScheduledBackup({ createBackup: () => Promise.reject(new Error("kaputt")) });
    assert.ok(await getBackupFailure());
    await runScheduledBackup({ createBackup: () => Promise.resolve("2026-11-24T03-00-00-000Z") });
    assert.equal(await getBackupFailure(), null);
  });

  it("meldet nichts, wenn die automatische Sicherung ausgeschaltet ist", async () => {
    await prisma.settings.update({ where: { id: 1 }, data: { backupEnabled: false } });
    let called = false;
    await runScheduledBackup({
      createBackup: () => {
        called = true;
        return Promise.reject(new Error("darf nicht laufen"));
      }
    });
    assert.equal(called, false);
    assert.equal(await getBackupFailure(), null);
  });
});
