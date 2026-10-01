# Hersteller-Stammdaten

## 1.0 Ist-Stand
- `Manufacturer` (nur Name, eindeutig) als eigene Tabelle - Spulen referenzieren `manufacturerId`
  statt eines freien Textfelds, analog zu `Material` (siehe `materials.md`).
  Quelle: `packages/backend/prisma/schema.prisma`, `packages/backend/src/routes/manufacturers.ts`
- Liste wird automatisch mit bekannten FDM-Filament-Herstellern vorbefuellt, sobald sie zum ersten
  Mal abgefragt wird und noch leer ist (kein manuelles Seed-Kommando noetig) - Stand 0.21.2 22
  Hersteller (`services/catalogData.ts`, `CATALOG_VERSION`); eine neue Version traegt beim naechsten
  Zugriff nur fehlende Eintraege nach, bestehende und geloeschte bleiben unberuehrt.
- Jeder eingeloggte Nutzer darf lesen und anlegen (geteilter Bestand, wie bei Material).
- Frontend: Im Spulen-Formular ein Dropdown statt Freitext, mit "+ Neuer Hersteller"-Kurzweg
  (`packages/frontend/src/components/SpoolFormModal.tsx`).

- Ab 0.23.0: `Settings.defaultManufacturerId` kann auf einen Hersteller verweisen (siehe `settings.md` R12);
  Loeschen dieses Herstellers raeumt die Einstellung automatisch auf (SetNull), statt das Loeschen zu blockieren.

## 1.1 Offene Punkte
- OP-MF1 ✅: Umbenennen/Loeschen gibt es seit `components/CatalogSettings.tsx` (Einstellungen ->
  Stammdaten) - siehe R4 unten, das war hier nur nicht mehr aktualisiert.

## 1.2 Anforderungen
- **R1**: Nur eingeloggte Nutzer koennen Hersteller lesen. Test: `tests/security/manufacturers.test.ts`
- **R2**: Die Liste wird beim ersten leeren Abruf automatisch mit bekannten Herstellern befuellt.
  Test: `tests/security/manufacturers.test.ts`
- **R3**: Nur eingeloggte Nutzer koennen Hersteller anlegen; Name ist eindeutig.
  Test: `tests/security/manufacturers.test.ts`
- **R4**: Aendern/Loeschen nur durch Admin (401 ohne Login, 403 als Nutzer); Umbenennen auf einen
  vorhandenen Namen (ohne Gross-/Kleinschreibung) ergibt 409. Test: `tests/security/manufacturers.test.ts`
- **R5**: Ein Hersteller, den noch Spulen nutzen, kann nicht geloescht werden (409); sonst werden
  seine Materialien mitgeloescht. Test: `tests/security/manufacturers.test.ts`
