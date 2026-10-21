import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homePath, visibleNavItems } from "../../src/lib/navItems.js";

const keys = (access: { filament: boolean; sizzle: boolean }): string[] => visibleNavItems(access).map((item) => item.key);

describe("Navigation nach Freigaben", () => {
  it("zeigt mit Filament-Freigabe die Filament-Punkte, ohne Sizzle", () => {
    assert.deepEqual(keys({ filament: true, sizzle: false }), ["dashboard", "spools", "printers", "stats", "wunschliste", "settings"]);
  });

  it("zeigt mit beiden Freigaben zusaetzlich SizzleBrothers (vor den Einstellungen)", () => {
    assert.deepEqual(keys({ filament: true, sizzle: true }), ["dashboard", "spools", "printers", "stats", "wunschliste", "sizzle", "settings"]);
  });

  it("zeigt nur SizzleBrothers und die Einstellungen, wenn die Filamentverwaltung nicht freigegeben ist", () => {
    assert.deepEqual(keys({ filament: false, sizzle: true }), ["sizzle", "settings"]);
  });

  it("laesst ohne jede Freigabe nur die Einstellungen (eigenes Konto)", () => {
    assert.deepEqual(keys({ filament: false, sizzle: false }), ["settings"]);
  });

  it("die Startseite ist die erste freigegebene", () => {
    assert.equal(homePath({ filament: true, sizzle: true }), "/");
    assert.equal(homePath({ filament: false, sizzle: true }), "/sizzle");
    assert.equal(homePath({ filament: false, sizzle: false }), "/settings");
  });
});
