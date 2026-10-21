import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_INTERVAL_MS, SCHEDULE_MIN_AGE_MS, runScheduledSync, type SchedulerDependencies } from "../../src/services/sizzleCatalogScheduler.js";

const NOW = new Date("2026-10-21T12:00:00Z");

function deps(lastSyncedAt: Date | null, sync: () => Promise<unknown>): { deps: SchedulerDependencies; calls: () => number } {
  let count = 0;
  return {
    deps: {
      lastSyncedAt: () => Promise.resolve(lastSyncedAt),
      sync: () => {
        count += 1;
        return sync();
      },
      now: () => NOW
    },
    calls: () => count
  };
}

describe("regelmaessiger Abgleich des Sizzle-Katalogs", () => {
  it("laeuft mehrmals taeglich", () => {
    assert.ok(SCHEDULE_INTERVAL_MS <= 12 * 3_600_000);
    assert.ok(SCHEDULE_MIN_AGE_MS < SCHEDULE_INTERVAL_MS, "sonst wuerde jeder zweite Durchlauf uebersprungen");
  });

  it("gleicht ab, wenn noch nie abgeglichen wurde", async () => {
    const { deps: d, calls } = deps(null, () => Promise.resolve());
    assert.equal(await runScheduledSync(d), "synced");
    assert.equal(calls(), 1);
  });

  it("gleicht ab, wenn der letzte Abgleich lange her ist", async () => {
    const { deps: d, calls } = deps(new Date(NOW.getTime() - SCHEDULE_MIN_AGE_MS - 1000), () => Promise.resolve());
    assert.equal(await runScheduledSync(d), "synced");
    assert.equal(calls(), 1);
  });

  it("ueberspringt den Abgleich, wenn der Katalog noch frisch ist (z.B. nach einem Neustart)", async () => {
    const { deps: d, calls } = deps(new Date(NOW.getTime() - 3_600_000), () => Promise.resolve());
    assert.equal(await runScheduledSync(d), "skipped");
    assert.equal(calls(), 0);
  });

  it("faengt Fehler des Shops ab, statt den Prozess zu beenden", async () => {
    const { deps: d } = deps(null, () => Promise.reject(new Error("Shop down")));
    assert.equal(await runScheduledSync(d), "failed");
  });

  it("faengt auch Datenbankfehler beim Pruefen ab (Schema noch nicht abgeglichen)", async () => {
    const failing: SchedulerDependencies = { lastSyncedAt: () => Promise.reject(new Error("Tabelle fehlt")), sync: () => Promise.resolve(), now: () => NOW };
    assert.equal(await runScheduledSync(failing), "failed");
  });
});
