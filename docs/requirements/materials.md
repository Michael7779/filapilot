# Material-Stammdaten

## 1.0 Ist-Stand
- `Material` (Name, Druck-Temperaturbereich, Betttemperatur) als eigene Tabelle, damit Spulen
  darauf verweisen statt Material-Angaben pro Spule zu duplizieren.
  Quelle: `packages/backend/prisma/schema.prisma`, `packages/backend/src/routes/materials.ts`
- Jeder eingeloggte Nutzer darf Materialien lesen und anlegen (geteilter Bestand, keine
  Owner-Trennung) - siehe `spools.md` fuer die Begruendung des `SCOPE: user`-Modells.

## 1.1 Offene Punkte
- OP-M1: Kein Update/Delete fuer Materialien - bisher nur Lesen + Anlegen. Loeschen waere riskant,
  solange Spulen darauf verweisen (FK); erst mit Bedarf nachziehen.

## 1.2 Anforderungen
- **R1**: Nur eingeloggte Nutzer koennen Materialien lesen. Test: `tests/security/materials.test.ts`
- **R2**: Nur eingeloggte Nutzer koennen Materialien anlegen; Name ist eindeutig (Unique-Constraint).
  Test: `tests/security/materials.test.ts`
