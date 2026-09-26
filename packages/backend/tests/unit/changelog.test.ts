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
    // Fester relativer Pfad zum CHANGELOG.md des Projekts, kein Nutzer-Input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const entries = parseChangelog(readFileSync(new URL("../../../../CHANGELOG.md", import.meta.url), "utf8"));
    assert.ok(entries.length >= 10);
    assert.match(entries[0]?.version ?? "", /^\d+\.\d+\.\d+$/);
    for (const entry of entries) {
      assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(entry.items.every((item) => /^(Neu|Geändert|Behoben|Sicherheit): /.test(item)));
    }
  });
});
