# Aenderungsverlauf in der App

## 1.0 Ist-Stand
- Quelle ist das `CHANGELOG.md` im Projektstamm; `parseChangelog()` (`packages/shared/src/changelog.ts`) macht daraus beim
  Bauen des Frontends (`vite.config.ts`, Konstante `__CHANGELOG__`) eine Liste. Es gibt keine Route und keine
  Datenbank-Tabelle - der Verlauf ist fest in der gebauten App (Dockerfile kopiert `CHANGELOG.md` mit).
- Oben rechts neben der Versionsnummer: "i"-Knopf (`components/ChangelogButton.tsx`), Klick oeffnet den Dialog
  (`ChangelogModal.tsx`; ESC, X und Klick daneben schliessen). Jeder Punkt hat eine Vorsilbe (Neu, Geaendert, Behoben,
  Sicherheit). Abschnitte "Hinweis zum Update" (fuer Admins) erscheinen bewusst nicht.
- Blinkt rot (`animate-blink-red`), solange die neueste Version nicht als gesehen im `localStorage` (`fp_changelog_seen`)
  steht; Oeffnen des Dialogs markiert sie als gesehen. Bei "reduzierte Bewegung" blinkt nichts, der Knopf bleibt rot.
- Der Text kommt nur aus dem eigenen Changelog und wird als Text (nie als HTML) dargestellt.

## 1.1 Offene Punkte
- OP-CL1: Der Verlauf ist nur deutsch (das CHANGELOG.md ist deutsch), auch bei englischer Oberflaeche.
- OP-CL2: "Gesehen" wird pro Browser gespeichert, nicht pro Konto.

## 1.2 Anforderungen
- **R1**: Der Parser liest Versionen, Datum und Punkte mit Vorsilbe, fasst Folgezeilen zusammen und laesst Admin-Hinweise
  weg; das echte `CHANGELOG.md` ist lesbar. Test: `packages/backend/tests/unit/changelog.test.ts`
- **R2**: Knopf, Dialog und rotes Blinken bei neuer Version - manuell per Browser geprueft (siehe Commit).
