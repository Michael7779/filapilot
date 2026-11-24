import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeBackupFailure } from "../../src/services/backupStatusService.js";

describe("describeBackupFailure", () => {
  it("entfernt Datenbank-URLs samt Passwort aus der Fehlermeldung", () => {
    const err = new Error(
      "Command failed: pg_dump postgresql://filapilot:geheim123@db:5432/filapilot --no-owner"
    );
    const text = describeBackupFailure(err);
    assert.ok(!text.includes("geheim123"));
    assert.ok(!text.includes("filapilot:"));
    assert.ok(text.includes("pg_dump"));
  });

  it("kuerzt lange Meldungen auf 300 Zeichen", () => {
    assert.equal(describeBackupFailure(new Error("x".repeat(1000))).length, 300);
  });

  it("kommt auch mit Nicht-Fehlern zurecht", () => {
    assert.equal(describeBackupFailure("kaputt"), "kaputt");
    assert.equal(describeBackupFailure(undefined), "Unbekannter Fehler");
  });
});
