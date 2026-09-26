# Mehrere Lager

Status: Design abgestimmt in `docs/design/lager.md`, Umsetzung noch nicht begonnen (⬜).

## 1.0 Ist-Stand
- Noch nicht umgesetzt. Alle Spulen und Drucker gehören heute zu einem gemeinsamen Bestand.

## 1.1 Offene Punkte
- OP-L1: Import aus der Bambu-Cloud pro Lager (eigenes Design, Version 0.14.0).
- OP-L2: `inventoryId` bleibt zunächst optional in der Datenbank (Migration per `db push`), Pflicht in einer späteren Version.

## 1.2 Anforderungen (alle ⬜, jeweils mit Test verknüpfen, sobald umgesetzt)
- **R1** ⬜ Zugriff auf ein Lager nur für Mitglieder und Admins; ohne Zugriff 404 (Lager, Spulen, Drucker, Fotos, Mitglieder).
  Test: `tests/security/inventories.test.ts`
- **R2** ⬜ Rollen: `VIEWER` nur lesen, `EDITOR` Spulen ändern, `OWNER` Lager und Mitglieder verwalten. Test: `tests/security/inventories.test.ts`
- **R3** ⬜ Lager anlegen (jeder Angemeldete wird Besitzer), umbenennen (Name eindeutig, 409), löschen nur wenn leer (409).
  Test: `tests/security/inventories.test.ts`
- **R4** ⬜ Der letzte Besitzer kann nicht entfernt oder herabgestuft werden. Test: `tests/security/inventories.test.ts`
- **R5** ⬜ Spulenliste und Statistik je Lager; `inventoryId=all` nur über eigene Lager. Test: `tests/security/spools.test.ts`
- **R6** ⬜ Spule verschieben braucht `EDITOR` in Quell- und Ziel-Lager. Test: `tests/security/spools.test.ts`
- **R7** ⬜ Drucker gehören zu einem Lager; Live-Status nur an Mitglieder dieses Lagers. Tests: `tests/security/printers.test.ts`, `tests/realtime/`
- **R8** ⬜ Migration: Bestehende Spulen/Drucker landen im "Hauptlager", bestehende Benutzer werden Mitglieder; wiederholbar ohne Änderung.
  Test: `tests/integration/inventoryMigration.test.ts`
- **R9** ⬜ Das Protokoll speichert das Lager und lässt sich danach filtern. Test: `tests/security/audit.test.ts`
- **R10** ⬜ Umschalter, "Alle Lager"-Ansicht, Einstellungen → Lager, Verschieben - manuell per Browser geprüft.
