export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

// Ueberschriften des CHANGELOG.md -> Vorsilbe im Aenderungsverlauf der App. "Hinweis zum Update" ist fuer
// Admins gedacht (Datenbank, Skripte) und erscheint bewusst nicht in der App.
const SECTION_LABELS: Record<string, string> = {
  Hinzugefuegt: "Neu",
  Geändert: "Geändert",
  Geaendert: "Geändert",
  Behoben: "Behoben",
  Sicherheit: "Sicherheit"
};

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_PREFIX = "### ";

// Liest das CHANGELOG.md (Keep-a-Changelog-Format) in eine Liste, neueste Version zuerst wie in der Datei.
// Zeilen, die mit zwei Leerzeichen beginnen, setzen den vorherigen Punkt fort.
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let label: string | null = null;
  let lastItemIndex = -1;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const versionMatch = VERSION_HEADING.exec(rawLine);
    if (versionMatch?.[1] && versionMatch[2]) {
      current = { version: versionMatch[1], date: versionMatch[2], items: [] };
      entries.push(current);
      label = null;
      continue;
    }
    if (rawLine.startsWith(SECTION_PREFIX)) {
      label = SECTION_LABELS[rawLine.slice(SECTION_PREFIX.length).trim()] ?? null;
      continue;
    }
    if (!current || !label) {
      continue;
    }
    if (rawLine.startsWith("- ")) {
      current.items.push(`${label}: ${rawLine.slice(2).trim()}`);
      lastItemIndex = current.items.length - 1;
    } else if (rawLine.startsWith("  ") && rawLine.trim() && lastItemIndex >= 0) {
      current.items[lastItemIndex] = `${current.items[lastItemIndex] ?? ""} ${rawLine.trim()}`;
    }
  }
  return entries.filter((entry) => entry.items.length > 0).map((entry) => ({ ...entry, items: entry.items.map((item) => item.replaceAll("`", "")) }));
}
