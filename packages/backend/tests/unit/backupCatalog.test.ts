/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listBackups, timestampToIso } from "../../src/services/backupCatalog.js";

describe("Backup-Katalog", () => {
  let folder = "";

  before(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-catalog-"));
    const write = (name: string, size: number) => fs.writeFile(path.join(folder, name), "x".repeat(size));
    await write("filapilot-db-2026-09-23T01-00-00-021Z.sql", 100);
    await write("filapilot-settings-2026-09-23T01-00-00-021Z.json", 10);
    await write("filapilot-uploads-2026-09-23T01-00-00-021Z.tar.gz", 50);
    await write("filapilot-db-2026-09-24T01-00-00-008Z.sql", 200);
    // Satz ohne Datenbank-Dump: nicht wiederherstellbar, darf nicht erscheinen
    await write("filapilot-uploads-2026-09-22T01-00-00-007Z.tar.gz", 50);
    // Fremde Dateien und ungueltige Zeitstempel werden ignoriert
    await write("notizen.txt", 5);
    await write("filapilot-db-../../etc/passwd.sql".replace(/\//g, "_"), 5);
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it("listet nur wiederherstellbare Saetze, neueste zuerst, mit Groesse und Inhalt", async () => {
    const list = await listBackups(folder);
    assert.deepEqual(
      list.map((b) => b.timestamp),
      ["2026-09-24T01-00-00-008Z", "2026-09-23T01-00-00-021Z"]
    );
    assert.equal(list[0]?.sizeBytes, 200);
    assert.equal(list[0]?.hasUploads, false);
    assert.equal(list[1]?.sizeBytes, 160);
    assert.equal(list[1]?.hasUploads, true);
  });

  it("liefert eine leere Liste, wenn der Ordner nicht existiert", async () => {
    assert.deepEqual(await listBackups(path.join(folder, "gibt-es-nicht")), []);
  });

  it("wandelt den Zeitstempel in ein gueltiges ISO-Datum um", () => {
    assert.equal(timestampToIso("2026-09-24T01-00-00-008Z"), "2026-09-24T01:00:00.008Z");
    assert.ok(!Number.isNaN(Date.parse(timestampToIso("2026-09-24T01-00-00-008Z"))));
  });
});
