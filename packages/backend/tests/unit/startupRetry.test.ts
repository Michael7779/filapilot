import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWithStartupRetry } from "../../src/lib/startupRetry.js";

function run(task: () => Promise<void>, attempts: number): Promise<{ retries: number[]; gaveUp: boolean }> {
  return new Promise((resolve) => {
    const retries: number[] = [];
    runWithStartupRetry(
      async () => {
        await task();
        resolve({ retries, gaveUp: false });
      },
      { attempts, delayMs: 1, onRetry: (attempt) => retries.push(attempt), onGiveUp: () => resolve({ retries, gaveUp: true }) }
    );
  });
}

describe("Start-Wiederholung (Update mit noch nicht abgeglichener Datenbank)", () => {
  it("laeuft ohne Wiederholung durch, wenn die Aufgabe klappt", async () => {
    assert.deepEqual(await run(() => Promise.resolve(), 5), { retries: [], gaveUp: false });
  });

  it("versucht es nach Fehlern erneut, bis es klappt", async () => {
    let calls = 0;
    const result = await run(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new Error("Tabelle fehlt")) : Promise.resolve();
    }, 5);
    assert.equal(calls, 3);
    assert.deepEqual(result, { retries: [1, 2], gaveUp: false });
  });

  it("gibt nach der letzten Wiederholung auf und meldet es", async () => {
    let calls = 0;
    const result = await run(() => {
      calls += 1;
      return Promise.reject(new Error("immer kaputt"));
    }, 3);
    assert.equal(calls, 3);
    assert.deepEqual(result, { retries: [1, 2], gaveUp: true });
  });
});
