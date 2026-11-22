import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPushCommand, ensureDatabaseSchema } from "../../src/services/schemaBootstrap.js";

function deps(tableCounts: number[], pushError?: Error): { calls: string[]; deps: Parameters<typeof ensureDatabaseSchema>[0] } {
  const calls: string[] = [];
  const queue = [...tableCounts];
  return {
    calls,
    deps: {
      countTables: async () => {
        calls.push("count");
        return queue.shift() ?? 0;
      },
      pushSchema: async () => {
        calls.push("push");
        if (pushError) {
          throw pushError;
        }
      }
    }
  };
}

describe("Datenbank-Schema beim Start (frische Installation)", () => {
  it("legt das Schema an, wenn die Datenbank noch gar keine Tabellen hat", async () => {
    const { calls, deps: d } = deps([0, 25]);
    assert.equal(await ensureDatabaseSchema(d), "created");
    assert.deepEqual(calls, ["count", "push", "count"]);
  });

  it("fasst eine Datenbank mit vorhandenen Tabellen nie an (Updates laufen ueber das Update-Skript)", async () => {
    const { calls, deps: d } = deps([1]);
    assert.equal(await ensureDatabaseSchema(d), "present");
    assert.deepEqual(calls, ["count"]);
  });

  it("fasst auch eine Datenbank mit wenigen, fremden Tabellen nicht an", async () => {
    const { calls, deps: d } = deps([3]);
    assert.equal(await ensureDatabaseSchema(d), "present");
    assert.ok(!calls.includes("push"));
  });

  it("gibt einen fehlgeschlagenen Abgleich weiter, statt ihn zu verschlucken", async () => {
    const { deps: d } = deps([0], new Error("prisma kaputt"));
    await assert.rejects(ensureDatabaseSchema(d), /prisma kaputt/);
  });

  it("meldet einen Fehler, wenn nach dem Abgleich trotzdem keine Tabellen da sind", async () => {
    const { deps: d } = deps([0, 0]);
    await assert.rejects(ensureDatabaseSchema(d), /keine Tabellen/);
  });
});

describe("Aufruf des Prisma-Abgleichs", () => {
  it("laeuft ohne Shell mit festem Argument-Array und ohne Freigabe fuer Datenverlust", () => {
    const { command, args } = buildPushCommand();
    assert.equal(command, process.execPath);
    assert.ok(args.includes("db") && args.includes("push") && args.includes("--skip-generate"));
    for (const forbidden of ["--accept-data-loss", "--force-reset"]) {
      assert.ok(!args.includes(forbidden), `${forbidden} darf nie gesetzt werden`);
    }
    assert.ok(args.slice(1).every((arg) => !/[;&|`$]/.test(arg)), "keine Shell-Zeichen in den festen Argumenten");
  });
});
