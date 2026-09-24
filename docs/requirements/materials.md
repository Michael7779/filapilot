# Material-Stammdaten

## 1.0 Ist-Stand
- `Material` (Name, Hersteller optional, Duesen-Temperaturbereich, Betttemperatur) als eigene
  Tabelle, damit Spulen darauf verweisen statt Material-Angaben pro Spule zu duplizieren.
  `manufacturerId = null` heisst "allgemein" (gilt fuer jeden Hersteller), sonst ist es ein Produkt
  dieses Herstellers (z.B. "PLA Basic" von Bambu Lab) mit dessen Richttemperaturen.
  Quelle: `packages/backend/prisma/schema.prisma`, `packages/backend/src/routes/materials.ts`
- Name ist je Hersteller eindeutig (ohne Gross-/Kleinschreibung), geprueft im Code, weil ein
  DB-Unique mit `NULL` mehrere allgemeine Duplikate zulassen wuerde.
- Mitgelieferte Vorlagen (ca. 70 Materialien fuer 12 Hersteller + allgemeine) in
  `packages/backend/src/services/catalogData.ts`, eingespielt von `catalogService.ts` beim ersten
  Abruf der Listen. `Settings.catalogVersion` merkt sich den Stand; bei Version-Erhoehung werden nur
  *fehlende* Eintraege nachgetragen, geaenderte/geloeschte bleiben unberuehrt. Die Temperaturen sind
  Richtwerte aus allgemeinem Wissen, nicht einzeln am Datenblatt geprueft.
- Lesen + Anlegen: `SCOPE: user`. Aendern + Loeschen: `SCOPE: global` (nur Admin), Pflege im
  Frontend unter Einstellungen -> Hersteller/Materialien (`CatalogSettings.tsx`).
- Spulen-Formular: erst Hersteller waehlen, dann Material (Produkte des Herstellers + allgemeine,
  gleichnamige allgemeine werden ausgeblendet); Temperaturen werden unter der Auswahl und auf der
  Spulenkarte angezeigt. Der Server lehnt ein herstellerfremdes Material an einer Spule ab.

- Statistik nach Material-Typ: `materialTypeOf()` (`packages/shared/src/materialType.ts`) ordnet Produktnamen
  ("PolyLite PLA", "PLA Silk", "PLA+") ihrem Grundmaterial ("PLA") zu; PETG, PETG-CF, PLA-CF, PA-CF getrennt.
  Es ist eine Namens-Heuristik, kein gepflegtes Feld: Unbekanntes bleibt unter seinem eigenen Namen stehen.
  Die Statistik-Seite zeigt zusaetzlich zur Auswertung nach Material-Name eine nach Typ.

## 1.1 Offene Punkte
- OP-M2: Betttemperatur ist ein Einzelwert, kein Bereich.

## 1.2 Anforderungen
- **R1**: Nur eingeloggte Nutzer koennen Materialien lesen. Test: `tests/security/materials.test.ts`
- **R2**: Nur eingeloggte Nutzer koennen Materialien anlegen; Name je Hersteller eindeutig
  (409). Test: `tests/security/materials.test.ts`
- **R3**: Aendern/Loeschen nur durch Admin (401 ohne Login, 403 als Nutzer).
  Test: `tests/security/materials.test.ts`
- **R4**: Ein Material, das noch von Spulen genutzt wird, kann nicht geloescht werden (409).
  Test: `tests/security/materials.test.ts`
- **R5**: Mitgelieferte Materialien werden eingespielt. Test: `tests/security/materials.test.ts`
- **R6**: Eine Spule darf kein Material eines anderen Herstellers haben (400).
  Test: `tests/security/spools.test.ts`
- **R7**: Produktnamen werden dem richtigen Material-Typ zugeordnet, Unbekanntes bleibt unveraendert.
  Test: `tests/unit/materialType.test.ts`
