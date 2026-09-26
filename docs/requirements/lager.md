# Mehrere Lager

Design: `docs/design/lager.md` (abgestimmt 2026-09-26). Umgesetzt in Version 0.13.0.

## 1.0 Ist-Stand
- Ein **Lager** (`Inventory`) ist ein benannter Filament-Bestand mit eigenen Spulen, Druckern, Dashboard, Statistik und
  Mitgliedern (`InventoryMember` mit Rolle `OWNER`/`EDITOR`/`VIEWER`). Hersteller, Materialien, Benutzer, E-Mail und
  Sicherungen bleiben gemeinsam. Jeder angemeldete Benutzer darf ein Lager anlegen und wird dessen Besitzer; Admins sind in
  jedem Lager Besitzer, ohne Mitglied zu sein.
- Zugriff wird serverseitig bei jeder Route aus der Datenbank berechnet (`services/inventoryAccess.ts`): ohne Zugriff 404
  (das Lager bleibt unsichtbar), zu wenig Rechte 403. Lesen `VIEWER`, Spulen schreiben `EDITOR`, Lager/Mitglieder/Drucker
  verwalten `OWNER`, Verschieben braucht `EDITOR` im Quell- und Ziel-Lager.
- Routen: `/api/inventories` (+ Mitglieder, Kandidaten), Spulen/Fotos/Drucker/Protokoll mit `inventoryId`
  (`inventoryId=all` = alle eigenen Lager, nur lesen). Ein Lager loeschen raeumt Spulen, Fotos, Drucker, Druckauftraege und
  Mitgliedschaften in einer Transaktion auf und verlangt den exakten Namen.
- Live-Status der Drucker (Socket.IO) geht nur an den Raum des Lagers `inventory:<id>`; Raeume folgen den Mitgliedschaften
  (Abgleich nach jeder Aenderung und jede Minute).
- Datenuebernahme: `ensureDefaultInventory()` legt beim Start (und nach dem Einspielen einer alten Sicherung) das
  "Hauptlager" an, macht bestehende Benutzer zu Mitgliedern (Admins Besitzer, andere Bearbeiter) und ordnet Spulen und Drucker
  ohne Lager zu. `inventoryId` ist in der Datenbank zunaechst optional (`db push` kann keine Daten umschreiben).
- Oberflaeche: Umschalter (Seitenleiste, am Handy Kopfzeile; bei nur einem Lager ohne Auswahlliste), "Alle Lager"-Dashboard,
  Einstellungen -> Lager (anlegen, umbenennen, Farbe, Mitglieder, Loeschen mit Namen), Spule in anderes Lager verschieben,
  Lager-Filter im Protokoll. Ohne Lager zeigt die App eine Einladung zum Anlegen.

## 1.1 Offene Punkte
- OP-L1: Import aus der Bambu-Cloud pro Lager: umgesetzt in 0.14.0, siehe `bambu-import.md`.
- OP-L2: `inventoryId` ist in der Datenbank noch optional (`String?`); auf Pflicht stellen, sobald alle Installationen migriert sind.
- OP-L3: Ein Drucker laesst sich nicht in ein anderes Lager verschieben (bewusst: loeschen und neu anlegen).
- OP-L4: Beim Loeschen eines Benutzers werden seine Mitgliedschaften entfernt; ein Lager ohne Besitzer bleibt nur fuer Admins verwaltbar.
- OP-L5: Sichtbarkeit: Lager-Besitzer sehen das Protokoll nicht (nur Admins); ein Lager-Protokoll fuer Besitzer waere eine Erweiterung.

## 1.2 Anforderungen
- **R1** ✅ Zugriff auf ein Lager nur fuer Mitglieder und Admins; ohne Zugriff 404 (Lager, Mitglieder, Spulen, Fotos, Drucker, Status).
  Tests: `tests/security/inventories.test.ts`, `spoolsInventories.test.ts`, `printers.test.ts`
- **R2** ✅ Rollen: `VIEWER` nur lesen (Schreiben 403), `EDITOR` Spulen aendern, `OWNER` Lager, Mitglieder und Drucker verwalten.
  Tests: `tests/security/inventories.test.ts`, `spoolsInventories.test.ts`, `printers.test.ts`
- **R3** ✅ Lager anlegen (jeder Angemeldete wird Besitzer), Name eindeutig ohne Gross-/Kleinschreibung (409), Eingaben validiert (400).
  Test: `tests/security/inventories.test.ts`
- **R4** ✅ Der letzte Besitzer kann nicht entfernt oder herabgestuft werden (409); Mitglieder verlassen ein Lager selbst, fremde entfernt nur ein Besitzer.
  Test: `tests/security/inventories.test.ts`
- **R5** ✅ Spulenliste und Statistik je Lager; `inventoryId=all` nur ueber eigene Lager (Admins alle); ohne Angabe 400.
  Test: `tests/security/spoolsInventories.test.ts`
- **R6** ✅ Spule verschieben braucht `EDITOR` im Quell- und Ziel-Lager; das Protokoll haelt Vorher/Nachher-Lager fest.
  Test: `tests/security/spoolsInventories.test.ts`
- **R7** ✅ Drucker gehoeren zu einem Lager (Anlegen/Aendern/Loeschen: Besitzer und Admin), das Lager laesst sich nicht wechseln; der Live-Status
  geht nur an Mitglieder des Lagers. Tests: `tests/security/printers.test.ts`, `tests/realtime/inventoryRooms.test.ts`
- **R8** ✅ Migration: Bestehende Spulen/Drucker landen im "Hauptlager", bestehende Benutzer werden Mitglieder; wiederholbar ohne Aenderung; Waisen kommen ins aelteste Lager.
  Test: `tests/integration/inventoryMigration.test.ts`
- **R9** ✅ Das Protokoll speichert das Lager (Name als Momentaufnahme) und laesst sich danach filtern; Lager-Vorgaenge werden protokolliert.
  Tests: `tests/security/audit.test.ts`, `tests/security/inventories.test.ts`
- **R10** ✅ Lager loeschen: nur `OWNER`, nur mit exaktem Namen (sonst 400), raeumt Spulen, Fotos, Drucker und Mitgliedschaften auf, andere Lager bleiben unberuehrt.
  Test: `tests/security/inventories.test.ts`
- **R11** ✅ Oberflaeche (Umschalter, "Alle Lager", Einstellungen -> Lager, Mitglieder-Dialog, Loeschen mit Namen, Betrachter ohne Bearbeiten-Knoepfe):
  manuell per Browser mit zwei Benutzern geprueft (2026-09-26).
