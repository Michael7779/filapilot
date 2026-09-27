# Zusatzfelder

## 1. Uebersicht
Frei definierbare Felder (z.B. "Charge", "Bewertung"), die im Formular jeder Spule erscheinen - Spoolman-artige,
selbst gepflegte Erweiterung ohne feste Spalten. Modell `CustomFieldDefinition` (Name, Typ TEXT/NUMBER/DATE/BOOLEAN),
vom Admin unter Einstellungen -> Filamente -> Zusatzfelder verwaltet. Die Werte einer Spule liegen in
`Spool.customFields` (JSON, Schluessel = Definitions-ID), serverseitig bei jedem Schreiben gegen die bekannten
Definitionen geprueft (Whitelist der Schluessel, Typ passend zur Definition) - siehe `shared/src/customFields.ts`.

## 1.1 Offene Punkte
- OP-C1 ✅ (0.21.2): Loescht der Admin eine Definition, wird ihr Schluessel jetzt aus `customFields` aller Spulen
  entfernt (eine SQL-Anweisung mit dem Postgres-jsonb-Operator `-`, kein N+1), statt unsichtbar liegen zu bleiben.
- OP-C2 ✅ (0.21.3): Ein Zusatzfeld kann jetzt als Pflichtfeld markiert werden, siehe R5.

## 1.2 Anforderungen
- **R1**: Lesen der Definitionen fuer jeden eingeloggten Nutzer, Anlegen/Loeschen nur Admin (403 sonst); Name ist
  eindeutig (409); unbekannter Typ 400.
- **R2**: Eine Spule kann nur Werte fuer tatsaechlich existierende Definitionen speichern (unbekannter Schluessel 400)
  und nur mit zum Typ passendem Wert (z.B. Zahl bei NUMBER, sonst 400); ein leerer Wert setzt das Feld zurueck (null).
- **R3**: Beim Aendern einer Spule ersetzt ein mitgeschicktes `customFields`-Objekt alle Werte vollstaendig; wird es
  weggelassen, bleiben die vorhandenen Werte unveraendert.
- **R4**: Ab 0.21.2: Loeschen einer Definition raeumt ihre Werte aus allen Spulen auf, in derselben Transaktion wie
  das Loeschen selbst. Test: `tests/security/customFieldDefinitions.test.ts`
- **R5**: Ab 0.21.3: `CustomFieldDefinition.required` (Standard: false, nur Admin per PATCH aenderbar). Ein
  Pflichtfeld muss beim Anlegen einer Spule einen Wert haben, und beim Aendern, sobald `customFields` ueberhaupt
  mitgeschickt wird (R3: das ist ein voller Ersatz) - fehlt es dann, 400. Bleibt `customFields` beim Aendern
  ganz weg, wird nicht erneut geprueft (der vorhandene Wert bleibt ohnehin unveraendert). Nicht rueckwirkend:
  bereits gespeicherte Spulen ohne Wert werden nicht nachtraeglich blockiert. Test: `tests/security/customFieldDefinitions.test.ts`,
  `tests/security/spoolExtras.test.ts`

Tests: `packages/backend/tests/unit/customFields.test.ts` (reine Validierung), `packages/backend/tests/security/customFieldDefinitions.test.ts`,
`packages/backend/tests/security/spoolExtras.test.ts`. Oberflaeche manuell im Browser geprueft.
