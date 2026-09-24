/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../src/prisma.js";
import {
  startRestore,
  getRestoreStatus,
  resetRestoreStatusForTests,
  type RestoreDependencies
} from "../../src/services/restoreService.js";

const TIMESTAMP = "2026-09-24T01-00-00-008Z";
const DB_URL = "postgresql://filapilot:geheim123@postgres:5432/filapilot";

describe("Wiederherstellung - Ablauf (Kommandos nachgestellt, keine echte Datenbank angefasst)", () => {
  let folder = "";
  let uploads = "";
  let calls: string[] = [];

  function deps(overrides: Partial<RestoreDependencies> = {}): Partial<RestoreDependencies> {
    return {
      folder,
      databaseUrl: DB_URL,
      uploadsFolder: uploads,
      syncSchema: true,
      createSafetyBackup: async () => {
        calls.push("safety-backup");
        return "sicherung";
      },
      afterDatabaseRestore: async () => {
        calls.push("after-database");
      },
      afterAllRestored: async () => {
        calls.push("after-all");
      },
      run: async (command, args) => {
        calls.push(`${command} ${args[0] === DB_URL ? "<db>" : args[0]}`);
      },
      ...overrides
    };
  }

  before(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-restore-"));
    uploads = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-uploads-"));
    await fs.writeFile(path.join(folder, `filapilot-db-${TIMESTAMP}.sql`), "-- dump");
  });

  beforeEach(async () => {
    calls = [];
    resetRestoreStatusForTests();
    await fs.rm(path.join(folder, `filapilot-uploads-${TIMESTAMP}.tar.gz`), { force: true });
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(uploads, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("sichert zuerst den aktuellen Stand, spielt dann in einer Transaktion ein und meldet 'done'", async () => {
    let psqlArgs: string[] = [];
    const { finished } = await startRestore(
      TIMESTAMP,
      deps({
        run: async (command, args) => {
          calls.push(command);
          if (command === "psql") {
            psqlArgs = args;
          }
        }
      })
    );
    await finished;

    assert.deepEqual(calls, ["safety-backup", "psql", "after-database", "node_modules/.bin/prisma", "after-all"]);
    assert.ok(psqlArgs.includes("--single-transaction"));
    assert.ok(psqlArgs.includes("ON_ERROR_STOP=1"));
    assert.ok(psqlArgs.some((arg) => arg.endsWith(`filapilot-db-${TIMESTAMP}.sql`)));
    assert.equal(getRestoreStatus().state, "done");
  });

  it("spielt die Uploads nur ein, wenn die Sicherung ein Archiv enthaelt, und leert vorher den Ordner", async () => {
    await fs.writeFile(path.join(folder, `filapilot-uploads-${TIMESTAMP}.tar.gz`), "archiv");
    await fs.writeFile(path.join(uploads, "alt.jpg"), "alt");
    const { finished } = await startRestore(TIMESTAMP, deps({ syncSchema: false }));
    await finished;

    assert.ok(calls.some((call) => call.startsWith("tar ")));
    assert.deepEqual(await fs.readdir(uploads), []);
  });

  it("meldet 'failed' ohne Geheimnisse, wenn das Einspielen scheitert, und macht danach weiter moeglich", async () => {
    const { finished } = await startRestore(
      TIMESTAMP,
      deps({
        run: async () => {
          throw Object.assign(new Error("psql fehlgeschlagen"), { stderr: `FEHLER bei ${DB_URL}` });
        }
      })
    );
    await finished;

    const status = getRestoreStatus();
    assert.equal(status.state, "failed");
    assert.equal(status.step, "database");
    assert.ok(status.message?.includes("FEHLER"));
    assert.equal(status.message?.includes("geheim123"), false);
    assert.equal(calls.includes("after-all"), false);

    const again = await startRestore(TIMESTAMP, deps());
    await again.finished;
    assert.equal(getRestoreStatus().state, "done");
  });

  it("bricht ab, wenn die Sicherung des aktuellen Stands fehlschlaegt - die Datenbank wird dann nicht angefasst", async () => {
    const { finished } = await startRestore(
      TIMESTAMP,
      deps({
        createSafetyBackup: async () => {
          throw new Error("kein Platz");
        }
      })
    );
    await finished;

    assert.equal(getRestoreStatus().state, "failed");
    assert.equal(calls.includes("psql"), false);
  });

  it("lehnt eine zweite gleichzeitige Wiederherstellung ab (409) und gibt die Sperre danach wieder frei", async () => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const first = await startRestore(TIMESTAMP, deps({ createSafetyBackup: () => gate.then(() => "x") }));

    await assert.rejects(() => startRestore(TIMESTAMP, deps()), { code: "CONFLICT" });

    unblock();
    await first.finished;
    const third = await startRestore(TIMESTAMP, deps());
    await third.finished;
    assert.equal(getRestoreStatus().state, "done");
  });

  it("lehnt ungueltige Zeitstempel (Path-Traversal) und unbekannte Sicherungen ab", async () => {
    await assert.rejects(() => startRestore("../../etc/passwd", deps()), { code: "VALIDATION_ERROR" });
    await assert.rejects(() => startRestore("2020-01-01T00-00-00-000Z", deps()), { code: "NOT_FOUND" });
  });
});
