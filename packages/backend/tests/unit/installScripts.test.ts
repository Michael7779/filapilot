/* eslint-disable sonarjs/no-clear-text-protocols, security/detect-non-literal-fs-filename -- Testdateien liegen in einem selbst angelegten temporaeren Ordner, es gibt keine fremden Pfad-Eingaben. */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCRIPTS_DIR = new URL("../../../../scripts/", import.meta.url);

describe("Installations-Skripte (init-env.sh, set-env.sh)", () => {
  let project = "";

  beforeEach(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "filapilot-install-"));
    await fs.mkdir(path.join(project, "scripts"));
    for (const name of ["init-env.sh", "set-env.sh"]) {
      await fs.copyFile(new URL(name, SCRIPTS_DIR), path.join(project, "scripts", name));
    }
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  const run = (script: string, ...args: string[]) =>
    spawnSync("/bin/bash", [path.join(project, "scripts", script), ...args], { encoding: "utf8" });

  async function readEnv(): Promise<Record<string, string>> {
    const lines = (await fs.readFile(path.join(project, ".env"), "utf8")).split("\n");
    return Object.fromEntries(
      lines.filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
    );
  }

  it("erzeugt eine .env mit zufaelligen 64-stelligen Schluesseln, gibt sie aber nicht aus", async () => {
    const result = run("init-env.sh", "8123", "https://filapilot.example.test");
    assert.equal(result.status, 0, result.stderr);
    const env = await readEnv();
    assert.match(env.POSTGRES_PASSWORD ?? "", /^[0-9a-f]{64}$/);
    assert.match(env.SESSION_SECRET ?? "", /^[0-9a-f]{64}$/);
    assert.notEqual(env.POSTGRES_PASSWORD, env.SESSION_SECRET);
    assert.equal(env.FRONTEND_PORT, "8123");
    assert.equal(env.FRONTEND_ORIGIN, "https://filapilot.example.test");
    assert.ok(!result.stdout.includes(env.POSTGRES_PASSWORD ?? "x") && !result.stdout.includes(env.SESSION_SECRET ?? "x"));
    assert.equal((await fs.stat(path.join(project, ".env"))).mode & 0o777, 0o600);
  });

  it("ueberschreibt eine vorhandene .env nie", async () => {
    await fs.writeFile(path.join(project, ".env"), "POSTGRES_PASSWORD=behalten\n");
    const result = run("init-env.sh");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /nicht ueberschrieben/);
    assert.equal(await fs.readFile(path.join(project, ".env"), "utf8"), "POSTGRES_PASSWORD=behalten\n");
  });

  it("weist ungueltige Ports und Adressen ab und legt dann keine .env an", async () => {
    for (const args of [["80"], ["abc"], ["70000"], ["8090", "ftp://x"], ["8090", "https://x.de/pfad"], ["8090", "https://x.de/"]]) {
      assert.notEqual(run("init-env.sh", ...args).status, 0, args.join(" "));
    }
    await assert.rejects(fs.access(path.join(project, ".env")));
  });

  it("waehlt ohne Angabe einen Port ab 8090 und bildet die Adresse mit ihm", async () => {
    assert.equal(run("init-env.sh").status, 0);
    const env = await readEnv();
    assert.ok(Number(env.FRONTEND_PORT) >= 8090 && Number(env.FRONTEND_PORT) < 8190);
    assert.ok((env.FRONTEND_ORIGIN ?? "").endsWith(`:${env.FRONTEND_PORT ?? ""}`));
  });

  it("set-env.sh aendert nur erlaubte Werte und laesst Passwort und Schluessel unberuehrt", async () => {
    run("init-env.sh", "8123");
    const before = await readEnv();

    assert.equal(run("set-env.sh", "FRONTEND_ORIGIN", "https://neu.example.test:9443").status, 0);
    assert.equal(run("set-env.sh", "FRONTEND_PORT", "8200").status, 0);
    const after = await readEnv();
    assert.equal(after.FRONTEND_ORIGIN, "https://neu.example.test:9443");
    assert.equal(after.FRONTEND_PORT, "8200");
    assert.equal(after.POSTGRES_PASSWORD, before.POSTGRES_PASSWORD);
    assert.equal(after.SESSION_SECRET, before.SESSION_SECRET);

    for (const args of [["SESSION_SECRET", "geklaut"], ["POSTGRES_PASSWORD", "x"], ["FRONTEND_ORIGIN", "kein-link"], ["FRONTEND_PORT", "22"]]) {
      assert.notEqual(run("set-env.sh", ...args).status, 0, args.join(" "));
    }
    assert.deepEqual(await readEnv(), after);
  });

  it("set-env.sh verlangt eine vorhandene .env", () => {
    assert.notEqual(run("set-env.sh", "FRONTEND_PORT", "8200").status, 0);
  });

  it("die Skripte sind gueltiges bash (Syntaxpruefung)", () => {
    for (const name of ["init-env.sh", "set-env.sh", "update-synology.sh"]) {
      execFileSync("/bin/bash", ["-n", path.join(new URL(name, SCRIPTS_DIR).pathname)]);
    }
  });
});
