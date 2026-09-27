# Zusatzfelder

## 1. Uebersicht
Frei definierbare Felder (z.B. "Charge", "Bewertung"), die im Formular jeder Spule erscheinen - Spoolman-artige,
selbst gepflegte Erweiterung ohne feste Spalten. Modell `CustomFieldDefinition` (Name, Typ TEXT/NUMBER/DATE/BOOLEAN),
vom Admin unter Einstellungen -> Filamente -> Zusatzfelder verwaltet. Die Werte einer Spule liegen in
`Spool.customFields` (JSON, Schluessel = Definitions-ID), serverseitig bei jedem Schreiben gegen die bekannten
Definitionen geprueft (Whitelist der Schluessel, Typ passend zur Definition) - siehe `shared/src/customFields.ts`.

## 1.1 Offene Punkte
- OP-C1: Loescht der Admin eine Definition, bleiben bereits gespeicherte Werte in `Spool.customFields` bestehen
  (nicht mehr sichtbar, da die Oberflaeche nur bekannte Definitionen zeigt) - keine automatische Bereinigung.
- OP-C2: Kein Pflichtfeld-Merkmal (jedes Zusatzfeld ist optional).

## 1.2 Anforderungen
- **R1**: Lesen der Definitionen fuer jeden eingeloggten Nutzer, Anlegen/Loeschen nur Admin (403 sonst); Name ist
  eindeutig (409); unbekannter Typ 400.
- **R2**: Eine Spule kann nur Werte fuer tatsaechlich existierende Definitionen speichern (unbekannter Schluessel 400)
  und nur mit zum Typ passendem Wert (z.B. Zahl bei NUMBER, sonst 400); ein leerer Wert setzt das Feld zurueck (null).
- **R3**: Beim Aendern einer Spule ersetzt ein mitgeschicktes `customFields`-Objekt alle Werte vollstaendig; wird es
  weggelassen, bleiben die vorhandenen Werte unveraendert.

Tests: `packages/backend/tests/unit/customFields.test.ts` (reine Validierung), `packages/backend/tests/security/customFieldDefinitions.test.ts`,
`packages/backend/tests/security/spoolExtras.test.ts`. Oberflaeche manuell im Browser geprueft.
