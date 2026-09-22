# Hersteller-Stammdaten

## 1.0 Ist-Stand
- `Manufacturer` (nur Name, eindeutig) als eigene Tabelle - Spulen referenzieren `manufacturerId`
  statt eines freien Textfelds, analog zu `Material` (siehe `materials.md`).
  Quelle: `packages/backend/prisma/schema.prisma`, `packages/backend/src/routes/manufacturers.ts`
- Liste wird automatisch mit den bekanntesten FDM-Filament-Herstellern vorbefuellt, sobald sie
  zum ersten Mal abgefragt wird und noch leer ist (kein manuelles Seed-Kommando noetig):
  Bambu Lab, Polymaker, eSun, Prusament, Sunlu, Overture, Devil Design, Fillamentum, ColorFabb,
  Extrudr, Hatchbox, 3DJake.
- Jeder eingeloggte Nutzer darf lesen und anlegen (geteilter Bestand, wie bei Material).
- Frontend: Im Spulen-Formular ein Dropdown statt Freitext, mit "+ Neuer Hersteller"-Kurzweg
  (`packages/frontend/src/components/SpoolFormModal.tsx`).

## 1.1 Offene Punkte
- OP-MF1: Keine dedizierte Einstellungen-Seite zum Verwalten (Umbenennen/Loeschen) der Hersteller-
  und Material-Listen - aktuell nur Lesen + Anlegen ueber die API, wie bei Material (siehe
  `materials.md` OP-M1). Eigene Runde, sobald die Einstellungen-Seite gebaut wird.

## 1.2 Anforderungen
- **R1**: Nur eingeloggte Nutzer koennen Hersteller lesen. Test: `tests/security/manufacturers.test.ts`
- **R2**: Die Liste wird beim ersten leeren Abruf automatisch mit bekannten Herstellern befuellt.
  Test: `tests/security/manufacturers.test.ts`
- **R3**: Nur eingeloggte Nutzer koennen Hersteller anlegen; Name ist eindeutig.
  Test: `tests/security/manufacturers.test.ts`
