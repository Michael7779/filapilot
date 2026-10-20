import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spoolPackaging } from "@filapilot/shared";

describe("spoolPackaging: Lieferform nur bei ungeoeffneten Spulen", () => {
  it("liefert Nachfuellung oder Filament mit Spule, solange die Spule ungeoeffnet ist", () => {
    assert.equal(spoolPackaging({ openedAt: null, archivedAt: null, isRefill: true }), "REFILL");
    assert.equal(spoolPackaging({ openedAt: null, archivedAt: null, isRefill: false }), "WITH_SPOOL");
  });

  it("liefert nichts, sobald die Spule angefangen wurde", () => {
    assert.equal(spoolPackaging({ openedAt: new Date("2026-10-01"), archivedAt: null, isRefill: true }), null);
    assert.equal(spoolPackaging({ openedAt: "2026-10-01T00:00:00.000Z", archivedAt: null, isRefill: false }), null);
  });

  it("liefert nichts fuer archivierte Spulen", () => {
    assert.equal(spoolPackaging({ openedAt: null, archivedAt: new Date("2026-10-02"), isRefill: true }), null);
  });
});
