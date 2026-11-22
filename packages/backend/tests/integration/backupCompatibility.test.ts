/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppError } from "../../src/lib/apiResult.js";
import { assertBackupHasInventories } from "../../src/services/backupCompatibility.js";

describe("Sicherung vor den Lagern (vor 0.13.0) wird vor dem Einspielen abgewiesen", () => {
  let folder = "";

  before(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-compat-"));
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  async function dump(name: string, content: string): Promise<string> {
    const file = path.join(folder, name);
    await fs.writeFile(file, content);
    return file;
  }

  it("akzeptiert einen Dump, der die Lager-Tabelle enthaelt", async () => {
    const file = await dump("neu.sql", "SET x = 1;\nCREATE TABLE public.inventories (\n    id text NOT NULL\n);\n");
    await assert.doesNotReject(assertBackupHasInventories(file));
  });

  it("weist einen Dump ohne Lager-Tabelle mit verstaendlichem Hinweis ab (400, nichts wird veraendert)", async () => {
    const file = await dump("alt.sql", "CREATE TABLE public.spools (\n    id text NOT NULL\n);\n");
    await assert.rejects(assertBackupHasInventories(file), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, "VALIDATION_ERROR");
      assert.match(err.message, /0\.13/);
      return true;
    });
  });

  it("findet die Lager-Tabelle auch, wenn der Suchtext genau auf einer Lesegrenze liegt", async () => {
    const needle = "CREATE TABLE public.inventories (";
    const file = await dump("grenze.sql", `${"x".repeat(100)}${needle}${"y".repeat(100)}`);
    for (const chunkSize of [7, 16, 33, 64, 101, 116]) {
      await assert.doesNotReject(assertBackupHasInventories(file, chunkSize), `Lesegroesse ${chunkSize}`);
    }
  });

  it("lehnt einen Dump ab, der nur aehnlich heisst (z.B. andere Tabelle mit Praefix)", async () => {
    const file = await dump("aehnlich.sql", "CREATE TABLE public.inventories_old (\n id text\n);\n");
    await assert.rejects(assertBackupHasInventories(file));
  });
});
