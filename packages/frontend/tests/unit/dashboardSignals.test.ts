import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BambuConnectionInfo } from "@filapilot/shared";
import { BACKUP_STALE_AFTER_HOURS, backupSignal, bambuSignal } from "../../src/lib/dashboardSignals.js";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function connection(overrides: Partial<BambuConnectionInfo> = {}): BambuConnectionInfo {
  return {
    connected: true,
    region: "global",
    connectedByName: "Micky",
    connectedAt: hoursAgo(1000),
    tokenExpiresAt: null,
    lastSyncAt: hoursAgo(1),
    lastSyncSummary: "ok",
    lastAttemptAt: hoursAgo(1),
    lastSyncAuto: true,
    lastSyncError: null,
    autoSyncMinutes: 360,
    ...overrides
  };
}

describe("backupSignal - fehlgeschlagener Backup-Job", () => {
  const failure = { at: hoursAgo(2), reason: "pg_dump: Verbindung abgelehnt" };

  it("meldet den Fehlschlag mit Grund, auch wenn die letzte Sicherung noch frisch ist", () => {
    assert.deepEqual(backupSignal(true, [{ createdAt: hoursAgo(9) }], NOW, failure), {
      kind: "failed",
      reason: failure.reason
    });
  });

  it("der Fehlschlag hat Vorrang vor 'noch keine Sicherung' und 'zu alt'", () => {
    assert.deepEqual(backupSignal(true, [], NOW, failure), {
      kind: "failed",
      reason: failure.reason
    });
    assert.deepEqual(backupSignal(true, [{ createdAt: hoursAgo(500) }], NOW, failure), {
      kind: "failed",
      reason: failure.reason
    });
  });

  it("meldet bei ausgeschalteter Sicherung auch einen alten Fehlschlag nicht", () => {
    assert.equal(backupSignal(false, [], NOW, failure), null);
  });

  it("ohne Fehlschlag (null) bleibt das bisherige Verhalten", () => {
    assert.equal(backupSignal(true, [{ createdAt: hoursAgo(9) }], NOW, null), null);
  });
});

describe("backupSignal - Sicherungen im Blick", () => {
  it("meldet nichts, wenn die automatische Sicherung ausgeschaltet ist (bewusste Entscheidung des Admins)", () => {
    assert.equal(backupSignal(false, [], NOW), null);
    assert.equal(backupSignal(false, [{ createdAt: hoursAgo(500) }], NOW), null);
  });

  it("meldet 'noch keine Sicherung', wenn sie aktiv ist, aber keine existiert", () => {
    assert.deepEqual(backupSignal(true, [], NOW), { kind: "never" });
  });

  it("meldet nichts bei einer frischen Sicherung", () => {
    assert.equal(backupSignal(true, [{ createdAt: hoursAgo(9) }], NOW), null);
    assert.equal(backupSignal(true, [{ createdAt: hoursAgo(BACKUP_STALE_AFTER_HOURS - 1) }], NOW), null);
  });

  it("meldet eine zu alte Sicherung ab der Grenze, mit der Zahl der ganzen Tage", () => {
    assert.deepEqual(backupSignal(true, [{ createdAt: hoursAgo(BACKUP_STALE_AFTER_HOURS) }], NOW), { kind: "stale", days: 1 });
    assert.deepEqual(backupSignal(true, [{ createdAt: hoursAgo(24 * 5 + 3) }], NOW), { kind: "stale", days: 5 });
  });

  it("bewertet nur die neueste Sicherung, egal in welcher Reihenfolge die Liste kommt", () => {
    const list = [{ createdAt: hoursAgo(400) }, { createdAt: hoursAgo(5) }, { createdAt: hoursAgo(200) }];
    assert.equal(backupSignal(true, list, NOW), null);
  });

  it("ignoriert unlesbare Zeitstempel, statt sie als frisch zu werten", () => {
    assert.deepEqual(backupSignal(true, [{ createdAt: "kaputt" }], NOW), { kind: "never" });
  });
});

describe("bambuSignal - Bambu-Cloud-Verbindung im Blick", () => {
  it("meldet nichts ohne Verbindung (nichts eingerichtet = nichts zu warnen)", () => {
    assert.equal(bambuSignal(connection({ connected: false, lastSyncError: "x" }), NOW), null);
  });

  it("meldet nichts bei gesunder Verbindung", () => {
    assert.equal(bambuSignal(connection(), NOW), null);
    assert.equal(bambuSignal(connection({ tokenExpiresAt: hoursAgo(-24 * 30) }), NOW), null);
  });

  it("meldet einen fehlgeschlagenen Abgleich mit dem Grund", () => {
    assert.deepEqual(bambuSignal(connection({ lastSyncError: "Cloud nicht erreichbar" }), NOW), {
      kind: "syncFailed",
      reason: "Cloud nicht erreichbar"
    });
  });

  it("meldet ein abgelaufenes Token vor einem alten Fehler", () => {
    assert.deepEqual(bambuSignal(connection({ tokenExpiresAt: hoursAgo(2), lastSyncError: "401" }), NOW), { kind: "tokenExpired" });
  });

  it("warnt kurz vor Ablauf des Tokens, mit der Zahl der verbleibenden Tage", () => {
    assert.deepEqual(bambuSignal(connection({ tokenExpiresAt: hoursAgo(-24 * 2 - 5) }), NOW), { kind: "tokenExpiresSoon", days: 3 });
  });

  it("laesst einen Fehler vor der blossen Ablauf-Vorwarnung gelten", () => {
    const info = connection({ tokenExpiresAt: hoursAgo(-24), lastSyncError: "Timeout" });
    assert.deepEqual(bambuSignal(info, NOW), { kind: "syncFailed", reason: "Timeout" });
  });
});
