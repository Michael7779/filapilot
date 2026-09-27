import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChangelog } from "@filapilot/shared";

const SAMPLE = `# Changelog

## [0.2.0] - 2026-09-25

### Hinzugefuegt
- Erstes Neu
  laeuft auf zwei Zeilen mit \`Code\`.
- Zweites Neu

### Behoben
- Ein Fehler

### Hinweis zum Update
- Nur fuer Admins

## [0.1.0] - 2026-09-20

### Hinweis zum Update
- Nichts Sichtbares
`;

describe("Aenderungsverlauf-Parser", () => {
  it("liest Versionen, Datum und Punkte mit Vorsilbe, fasst Folgezeilen zusammen und laesst Admin-Hinweise weg", () => {
    assert.deepEqual(parseChangelog(SAMPLE), [
      {
        version: "0.2.0",
        date: "2026-09-25",
        items: ["Neu: Erstes Neu laeuft auf zwei Zeilen mit Code.", "Neu: Zweites Neu", "Behoben: Ein Fehler"]
      }
    ]);
  });

  it("liest das echte CHANGELOG.md: neueste Version zuerst, jede Version mit Datum und Punkten", () => {
    const markdown = realChangelog();
    const entries = parseChangelog(markdown);
    assert.ok(entries.length >= 10);
    assert.match(entries[0]?.version ?? "", /^\d+\.\d+\.\d+$/);
    for (const entry of entries) {
      assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(entry.items.every((item) => /^(Neu|Geändert|Behoben|Sicherheit): /.test(item)));
    }
  });

  // Regression: Eine falsch geschriebene Ueberschrift (z.B. "Hinzugefügt" mit Umlaut statt "Hinzugefuegt", oder
  // eine erfundene Ueberschrift wie "Bekannte Einschränkungen") wird vom Parser stillschweigend uebergangen - die
  // Version verschwindet dann komplett aus dem Aenderungsverlauf der App, ohne Fehler. Diese zwei Tests waeren bei
  // genau diesem Fehler (0.15.0-0.17.0, September 2026) fehlgeschlagen.
  it("jede Versions-Ueberschrift im echten CHANGELOG.md ergibt auch einen Eintrag mit Punkten", () => {
    const markdown = realChangelog();
    const headingVersions = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);
    const entries = parseChangelog(markdown);
    const parsedVersions = new Set(entries.map((entry) => entry.version));
    for (const version of headingVersions) {
      assert.ok(parsedVersions.has(version), `Version ${version} fehlt im Aenderungsverlauf (Ueberschrift falsch geschrieben?)`);
    }
  });

  it("jede Abschnitts-Ueberschrift im echten CHANGELOG.md ist eine bekannte (oder die Admin-Ueberschrift)", () => {
    const markdown = realChangelog();
    const headings = [...markdown.matchAll(/^### (.+)$/gm)].map((match) => match[1]?.trim());
    const known = new Set(["Hinzugefuegt", "Geändert", "Geaendert", "Behoben", "Sicherheit", "Hinweis zum Update"]);
    for (const heading of headings) {
      assert.ok(heading && known.has(heading), `Unbekannte Abschnitts-Ueberschrift "${heading}" - Punkte darunter werden stillschweigend verworfen.`);
    }
  });
});

function realChangelog(): string {
  // Fester relativer Pfad zum CHANGELOG.md des Projekts, kein Nutzer-Input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFileSync(new URL("../../../../CHANGELOG.md", import.meta.url), "utf8");
}
