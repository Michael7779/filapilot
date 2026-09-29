/* eslint-disable security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../src/prisma.js";
import { createBackupUnlocked, type CommandRunner } from "../../src/services/backupService.js";

// Ein Ordner-/URL-Wert, wie ihn ein boesartiger oder kompromittierter Admin ueber die Einstellungen
// (Zod erlaubt aktuell jedes Zeichen in backupFolderPath) eintragen koennte. Mit der alten exec()-Implementierung
// (String-Interpolation ueber eine Shell) haette das einen zweiten Befehl eingeschleust (CWE-78).
const SHELL_METACHARACTERS = '"; touch /tmp/should-not-exist; echo "';

describe("Backup-Erstellung - keine Befehls-Einschleusung ueber Admin-Einstellungen", () => {
  let folder = "";
  let uploads = "";

  before(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-backup-"));
    uploads = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-uploads-"));
    await fs.writeFile(path.join(uploads, "spule.jpg"), "bild");
  });

  after(async () => {
    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(uploads, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("uebergibt pg_dump und tar Argumente einzeln (execFile) statt als Shell-String", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const run: CommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    await createBackupUnlocked({ targetFolder: folder, databaseUrl: "postgresql://u:p@host/db", uploadsFolder: uploads, run });

    const pgDump = calls.find((c) => c.command === "pg_dump");
    const tar = calls.find((c) => c.command === "tar");
    assert.ok(pgDump, "pg_dump wurde nicht aufgerufen");
    assert.ok(tar, "tar wurde nicht aufgerufen");
    // Die Datenbank-URL ist ein eigenes Argument, kein Teil eines zusammengesetzten Shell-Strings.
    assert.equal(pgDump?.args[0], "postgresql://u:p@host/db");
    assert.ok(tar?.args.includes(uploads));
  });

  it("behandelt Shell-Metazeichen im Backup-Ordner (aus den Admin-Einstellungen) als reinen Text, nicht als Befehl", async () => {
    const maliciousFolder = `${folder}${SHELL_METACHARACTERS}`;
    const calls: { command: string; args: string[] }[] = [];
    const run: CommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    // targetFolder selbst bleibt der echte (existierende) Temp-Ordner - nur der Wert, der als Argument an
    // pg_dump/tar weitergereicht wird, simuliert die bösartigen Metazeichen ueber die databaseUrl/uploadsFolder,
    // die genauso wie backupFolderPath ungeprueft in die Kommandos einfliessen.
    await createBackupUnlocked({
      targetFolder: folder,
      databaseUrl: `postgresql://u:p@host/db${SHELL_METACHARACTERS}`,
      uploadsFolder: uploads,
      run
    });

    const pgDump = calls.find((c) => c.command === "pg_dump");
    assert.ok(pgDump);
    // Das gesamte Metazeichen-Konstrukt landet unveraendert als EIN Argument - execFile ruft pg_dump direkt auf,
    // ohne eine Shell dazwischen, die ";"/"&&"/Backticks als Befehlstrenner lesen koennte.
    assert.equal(pgDump?.args[0], `postgresql://u:p@host/db${SHELL_METACHARACTERS}`);
    await fs.access(maliciousFolder).then(
      () => assert.fail("ein per Metazeichen eingeschleuster Befehl haette hier keinen Ordner anlegen duerfen"),
      () => undefined
    );
  });
});
