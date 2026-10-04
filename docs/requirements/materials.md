# Material-Stammdaten

## 1.0 Ist-Stand
- `Material` (Name, Hersteller optional, Duesen-Temperaturbereich, Betttemperatur) als eigene
  Tabelle, damit Spulen darauf verweisen statt Material-Angaben pro Spule zu duplizieren.
  `manufacturerId = null` heisst "allgemein" (gilt fuer jeden Hersteller), sonst ist es ein Produkt
  dieses Herstellers (z.B. "PLA Basic" von Bambu Lab) mit dessen Richttemperaturen.
  Quelle: `packages/backend/prisma/schema.prisma`, `packages/backend/src/routes/materials.ts`
- Name ist je Hersteller eindeutig (ohne Gross-/Kleinschreibung), geprueft im Code, weil ein
  DB-Unique mit `NULL` mehrere allgemeine Duplikate zulassen wuerde.
- Mitgelieferte Vorlagen (ca. 90 Materialien fuer 22 Hersteller + allgemeine, Stand 0.21.2) in
  `packages/backend/src/services/catalogData.ts`, eingespielt von `catalogService.ts` beim ersten
  Abruf der Listen. `Settings.catalogVersion` merkt sich den Stand; bei Version-Erhoehung werden nur
  *fehlende* Eintraege nachgetragen, geaenderte/geloeschte bleiben unberuehrt. Die Temperaturen sind
  Richtwerte aus allgemeinem Wissen, nicht einzeln am Datenblatt geprueft.
- Lesen + Anlegen: `SCOPE: user`. Aendern + Loeschen: `SCOPE: global` (nur Admin), Pflege im
  Frontend unter Einstellungen -> Hersteller/Materialien (`CatalogSettings.tsx`).
- Spulen-Formular: erst Hersteller waehlen, dann Material. Ab 0.23.2 (`availableMaterialsFor()`,
  `packages/shared/src/availableMaterials.ts`): zeigt NUR die eigenen Produkte des Herstellers, wenn er
  welche hat (z.B. nur Bambu Labs eigene Linien, kein fremdes generisches "PLA" darunter); allgemeine
  Materialien (kein Hersteller) erscheinen nur als Fallback fuer einen Hersteller ganz ohne eigenes
  Material (frisch angelegt/unbekannt) oder solange noch keiner gewaehlt ist. Temperaturen werden unter
  der Auswahl und auf der Spulenkarte angezeigt. Der Server lehnt ein herstellerfremdes Material an einer
  Spule ab.
  Befund (behoben 0.23.2): bis 0.23.1 wurden zusaetzlich alle allgemeinen Materialien angezeigt, deren
  Name nicht EXAKT mit einem eigenen Produkt des Herstellers kollidierte - bei Herstellern mit eigenen
  Markennamen (z.B. Bambu Lab "PLA Basic" statt "PLA") blieben so fremde generische Eintraege wie "PLA"
  sichtbar, obwohl der Hersteller sie gar nicht unter diesem Namen fuehrt.

- Statistik nach Material-Typ: `materialTypeOf()` (`packages/shared/src/materialType.ts`) ordnet Produktnamen
  ("PolyLite PLA", "PLA Silk", "PLA+") ihrem Grundmaterial ("PLA") zu; PETG, PETG-CF, PLA-CF, PA-CF getrennt.
  Es ist eine Namens-Heuristik, kein gepflegtes Feld: Unbekanntes bleibt unter seinem eigenen Namen stehen.
  Die Statistik-Seite zeigt zusaetzlich zur Auswertung nach Material-Name eine nach Typ.

- Ab 0.23.0: Die Farb-Vorauswahl im Spulen-Formular (`SpoolColorFields.tsx`) richtet sich nach der
  gewaehlten Hersteller+Material-Kombination (`getColorPresets()`, `packages/shared/src/manufacturerColorCatalog.ts`) -
  z.B. zeigt Bambu Lab PLA Basic "Jade-Weiß" statt eines generischen "Weiß". Manuell im Code gepflegte
  Momentaufnahme (Stand 2026-09, aktuell nur Bambu Lab), kein automatischer Abgleich mit Hersteller-Shops
  (siehe OP-M3). Ohne passende Kombination (oder bevor Hersteller/Material gewaehlt sind) gilt die bisherige
  generische Liste als Fallback - nie eine kombinierte Liste ueber mehrere Materialien hinweg.

## 1.1 Offene Punkte
- OP-M2 ✅ (0.21.2): Betttemperatur kann jetzt ein Bereich sein, siehe R9.
- OP-M3: Farb-Vorauswahl nur fuer Bambu Lab gepflegt (PLA Basic/Matte/Silk, PETG HF, ABS, ASA); andere
  Hersteller nutzen die generische Liste. Automatischer Abgleich mit Hersteller-Shops wurde bewusst
  verworfen (keine offizielle API, Daten tief im JS-DOM, Bruchgefahr bei Shop-Aenderungen, moegliche
  AGB-Konflikte) - Erweiterung auf weitere Hersteller bleibt manuelle Pflege in
  `manufacturerColorCatalog.ts`, wenn der User das moechte.

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
- **R8**: Ab 0.18.0 hat ein Material eine optionale Dichte (g/cm³, 0 < x ≤ 10, sonst 400) fuer die ungefaehre
  Restlaengen-Anzeige der Spule (`estimateRemainingLengthM`, Standard-Durchmesser 1,75mm, keine Messung). Die
  mitgelieferten Materialien bekommen eine typische Dichte anhand ihres Namens (`catalogData.ts::densityFor`);
  bestehende Materialien ohne Dichte werden beim Update einmalig nachgetragen (nur wenn noch leer), Admin-Aenderungen
  bleiben unberuehrt. Test: `tests/security/materials.test.ts`, `tests/unit/spoolLength.test.ts`
- **R9**: Ab 0.21.2 hat ein Material zusaetzlich zu `bedTempC` ein optionales `bedTempMaxC` (0-150 °C) fuer einen
  Bett-Temperatur-Bereich (z.B. "60-80 °C"); weglassen (`null`) bedeutet weiterhin ein Einzelwert wie zuvor.
  Test: `tests/security/materials.test.ts`
- **R10**: Ab 0.23.0 liefert `getColorPresets(manufacturerName, materialName)` fuer eine bekannte
  Hersteller+Material-Kombination deren eigene Farbnamen, sonst die generische Liste; unterschiedliche
  Material-Linien desselben Herstellers liefern unterschiedliche Listen (keine kombinierte Gesamtliste).
  Test: `tests/unit/manufacturerColorCatalog.test.ts`
- **R11**: Ab 0.23.2 liefert `availableMaterialsFor(materials, manufacturerId)` nur die eigenen Produkte
  eines Herstellers, sofern er welche hat; generische (herstellerlose) Materialien nur als Fallback ohne
  gewaehlten Hersteller oder fuer einen Hersteller ganz ohne eigenes Produkt. Test: `tests/unit/availableMaterials.test.ts`
- **R12**: Ab 0.26.0: Ein Material hat zwei optionale Richtpreise in Cent je Spule (`priceRefillCents` =
  Nachfuellung, `priceWithSpoolCents` = Filament mit Spule; `Int?`, 0 bis 1.000.000). Pflege nur ueber die
  Admin-Routen der Materialien (Nutzer -> 403; negative oder krumme Werte -> 400), Eingabe in Einstellungen ->
  Filamente. Sie dienen als Vorbelegung des Kaufpreises (siehe `spools.md` R29). Die mitgelieferte Vorlage
  (`catalogData.ts`, `CATALOG_VERSION` 4) enthaelt fuer Bambu Lab die guenstigsten Staffelpreise (ab 10 Spulen, je
  1 kg) aus dem Bambu-Lab-EU-Shop, Stand 2026-10-04; PVA nur als 0,5-kg-Spule. Beim Einspielen der Vorlage werden
  Preise bei bestehenden Materialien nur nachgetragen, wenn BEIDE Preise leer sind - nie ueberschrieben. Neu in der
  Vorlage: Bambu Lab "PETG Basic" und "PETG Translucent". Tests: `tests/integration/catalogPrices.test.ts`,
  `tests/security/spoolPriceSuggestions.test.ts`.
- **R13**: Ab 0.27.0: `getColorPresets()` kennt eigene Farben fuer Bambu Lab "PETG Basic" und "PETG Translucent" (Namen
  wie im Bambu-Lab-EU-Shop, Stand 2026-10-04; die Hex-Werte sind aus den Farbmustern dort gemessene Naeherungen, kein
  offizieller Farbcode). Test: `tests/unit/manufacturerColorCatalog.test.ts`.
