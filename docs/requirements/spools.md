# Spulen-Verwaltung

## 1.0 Ist-Stand
- `Spool` (Material-Referenz, Hersteller-Referenz, Farbe, Ursprungs-/Restgewicht, Foto-URL,
  Kaufpreis/-datum, Lagerort) - CRUD ueber `packages/backend/src/routes/spools.ts`.
  `manufacturerId` verweist auf `Manufacturer` (siehe `manufacturers.md`), kein freier Text mehr.
  Quelle: `packages/backend/prisma/schema.prisma`
- **Seit 0.13.0 gehoert jede Spule zu einem Lager** (siehe `lager.md`): Lesen braucht `VIEWER`, Schreiben `EDITOR` im Lager der
  Spule; Auflisten verlangt `?inventoryId=<id>` (oder `all`). Der Absatz zum SCOPE-Modell unten beschreibt den Stand davor.
- **SCOPE-Modell bewusst `user`, nicht `self`**: Spulen gehoeren nicht einem einzelnen Nutzer,
  sondern dem geteilten Filament-Bestand der Instanz (2-5 Nutzer, siehe CLAUDE.md). Jeder
  eingeloggte Nutzer darf lesen/anlegen/aendern/loeschen - keine Owner-Pruefung noetig, weil es
  keinen Owner gibt. Das unterscheidet sich bewusst vom `self`-Scope bei z.B. der eigenen
  Akzentfarbe.
- Restgewicht wird aktuell nur manuell per `PATCH` gepflegt - der automatische Abzug ueber
  Druckauftraege (`PrintJob`) ist ein eigenes, noch nicht gebautes Subsystem (`stats.md`).
- Foto-Upload (`routes/spoolPhotos.ts`, `services/spoolPhotoService.ts`): `PUT/GET/DELETE /api/spools/:id/photo`
  (SCOPE user), max. 5 MB, nur JPEG/PNG/WebP (Erkennung an den Anfangsbytes, kein SVG), abgelegt unter
  `<UPLOADS_FOLDER_PATH>/spool-photos/<Spulen-ID>` (also Teil von Sicherung/Wiederherstellung), Auslieferung nur
  mit Login. Upload nur, wenn `Settings.photoUploadEnabled` an ist (sonst 403); `GET /api/spools/photo-settings`
  meldet den Schalter an die Oberflaeche. `photoUrl` ist server-verwaltet und nicht mehr ueber Anlegen/Aendern
  setzbar. Die Oberflaeche verkleinert Fotos vor dem Upload auf max. 1600 px (JPEG).
- Niedriger Bestand: Spulenkarten zeigen ab `LOW_STOCK_THRESHOLD_RATIO` (15 %) das Kennzeichen "Fast leer".
- QR-Label-Druck: rein client-seitig, kein Backend-Endpunkt noetig. Pro Spule ein Button
  ("QR-Label"), oeffnet `packages/frontend/src/components/SpoolLabelModal.tsx` mit einem
  clientseitig via `qrcode`-Paket erzeugten QR-Code (kodiert `filapilot:spool:<id>`), Material,
  Farbe und Hersteller als Text. "Drucken" ruft `window.print()`; eine globale
  `.print-only`/`visibility`-Regel in `index.css` sorgt dafuer, dass nur das Label gedruckt wird,
  unabhaengig davon, wo das Modal im DOM haengt. Dependency-Begruendung: QR-Kodierung (inkl.
  Reed-Solomon-Fehlerkorrektur) ist kein Bordmittel und nicht sinnvoll in 50 Zeilen selbst
  machbar; `qrcode` ist aktiv gepflegt und hat >5 Mio. Downloads/Woche.

## 1.1 Offene Punkte
- OP-SP3 ✅ (0.21.2): `AmsSlotAssignment.spoolId` hat jetzt `onDelete: SetNull` - Loeschen einer zugeordneten
  Spule leert das AMS-Fach, statt das Loeschen zu verhindern (`PrintJob` cascadiert schon seit 0.17.0).

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer kann alle Spulen auflisten (inkl. Material-Name).
  Test: `tests/security/spools.test.ts`
- **R2**: Jeder eingeloggte Nutzer kann eine neue Spule anlegen; Eingaben werden serverseitig
  validiert (positives Ursprungsgewicht, Restgewicht ≥ 0, gueltige `materialId`).
  Test: `tests/security/spools.test.ts`
- **R3**: Anonyme Requests (kein Session-Cookie) werden auf allen Spulen-Routen mit 401
  abgelehnt. Test: `tests/security/spools.test.ts`
- **R4**: Ein Nutzer mit `mustChangePassword=true` erreicht keine Spulen-Route (403), bis das
  Passwort geaendert wurde. Test: `tests/security/spools.test.ts`
- **R5**: Aendern und Loeschen einer Spule ist fuer jeden eingeloggten Nutzer moeglich (kein
  Owner-Konzept, siehe Ist-Stand). Test: `tests/security/spools.test.ts`
- **R6**: Jede Spule kann als druckbares QR-Label dargestellt werden (Material, Farbe, Hersteller
  + QR-Code der Spulen-ID). Rein clientseitig, keine sicherheitsrelevante Route - manuell per
  Browser-Klickpfad verifiziert (QR-Code-Canvas nicht leer, Druck-Button loest `window.print()`
  aus, ESC schliesst das Modal).
- **R7**: Foto-Routen: 401 ohne Login, 400 bei ungueltiger ID, 404 bei unbekannter Spule, 400 bei Nicht-Bildern
  (auch mit vorgetaeuschtem Content-Type, SVG) und zu grossen Dateien, 403 wenn der Foto-Upload ausgeschaltet
  ist; ein Client kann `photoUrl` nicht selbst setzen; Loeschen der Spule raeumt die Datei auf.
  Test: `tests/security/spoolPhotos.test.ts`
- **R8**: Das Kennzeichen "Fast leer" auf Spulenkarten ist rein clientseitig - manuell per Browser geprueft.
- **R9**: Ab 0.13.0: Spulen und Fotos folgen den Rechten im Lager (Fremde 404, Betrachter 403 beim Schreiben, Verschieben nur mit
  Bearbeiten in beiden Lagern). Tests: `tests/security/spoolsInventories.test.ts`, `tests/security/spools.test.ts`
- **R11**: Ab 0.14.3 lassen sich Spulen archivieren und wiederherstellen (Bearbeiter; Betrachter 403, Fremde 404, anonym 401); Listen blenden
  Archivierte standardmaessig aus (`?archived=exclude|include|only`), Restbestand/"Fast leer" zaehlen nur aktive, der Verbrauch alle. Ein Client kann
  `archivedAt`/`archiveReason` nicht selbst setzen. Test: `tests/security/spoolArchive.test.ts`
- **R12**: Jede echte Aenderung von `remainingWeightG` (manuell, Import mit Aktualisieren, spaeter Cloud-Abgleich) schreibt einen Eintrag in
  `SpoolWeightLog` (nie beim Anlegen, nie ohne Aenderung); Loeschen einer Spule entfernt ihren Verlauf, Archivieren behaelt ihn.
  Tests: `tests/security/spoolArchive.test.ts`, `tests/security/bambuImport.test.ts`
- **R10**: Ab 0.14.0 lassen sich Spulen aus der Bambu-Cloud importieren (siehe `bambu-import.md`); `Spool.bambuCloudId` markiert importierte Spulen.
- **R13**: Ab 0.15.0 lassen sich Spulen im Browser durchsuchen, filtern (Hersteller, Material, Farbe, Lagerort, Restgewicht, Kaufpreis, Fast leer), sortieren
  und zaehlen; die Logik ist rein (`packages/shared/src/spoolFilter.ts`), Oberflaeche `SpoolFilterBar.tsx`. Die Liste ist bereits auf das Lager begrenzt (keine
  serverseitige Filterung, keine Rechte-Auswirkung). Test: `tests/unit/spoolFilter.test.ts`; die Oberflaeche wurde manuell geprueft.
- **R14**: Ab 0.16.0: Ansicht (standard/compact/list/swatch) und Seitengroesse (12/24/48/96/alle) der Spulenliste werden pro Konto gespeichert
  (`PATCH /api/users/me/preferences`, SCOPE self, nur feste Werte, fremde userId ignoriert; Browser-Merker nur als Startwert). Die Liste zeigt alle Angaben der Spule.
  Tests: `tests/security/preferences.test.ts`; die Oberflaeche wurde manuell geprueft.
- **R15**: Ab 0.19.0: Eine Spule hat eine optionale zweite Farbe (`colorHex2`, zweifarbiges Filament), eine Notiz (max. 500 Zeichen) und
  Werte fuer die Admin-definierten Zusatzfelder (`customFields`, siehe `custom-fields.md`); neue Felder sind beim Anlegen optional (Weglassen = kein Wert).
  `GET /api/spools/:id/history` (VIEWER) zeigt das Aenderungsprotokoll genau dieser Spule (aus dem allgemeinen Protokoll gefiltert auf `area=SPOOL`
  und diese `entityId`, anders als das admin-only Gesamt-Protokoll). `GET /api/spools/export?inventoryId=&format=csv|json` (VIEWER, "all" nur eigene
  Lager) liefert den Bestand als Datei (CSV mit BOM fuer Excel, oder JSON). Loeschen von Drucker/Spule raeumt `PrintJob`-Eintraege jetzt kaskadierend
  auf (wie der Gewichtsverlauf). Tests: `tests/security/spoolExtras.test.ts`; die Oberflaeche (Formular, Listenansicht, Verlauf, Export-Links) wurde
  manuell im Browser geprueft. Ab 0.20.1 zeigt der Verlauf pro Eintrag zusaetzlich die Art (Angelegt/Geaendert/Ereignis) und bei Aenderungen die betroffenen Werte direkt als "vorher -> nachher" (`components/SpoolHistoryModal.tsx`), statt nur Beschreibung/Datum/Person.
- **R16**: Der CSV-Export trennt Spalten mit Semikolon (nicht Komma) und beginnt mit einer UTF-8-BOM, damit Excel mit
  deutscher Spracheinstellung die Datei per Doppelklick korrekt in Spalten aufteilt und Umlaute richtig zeigt (deutsche
  Windows-Installationen nutzen das Semikolon als Listentrennzeichen); der Kaufpreis nutzt das Komma als Dezimaltrennzeichen.
  Test: `tests/security/spoolExtras.test.ts`
- **R17**: Der Export kennt zusaetzlich `format=xlsx` (echtes Excel-Dateiformat, `exceljs` - Zahlen/Daten bleiben
  Zahl/Datum, keine Datei-Operationen auf der Platte). Die Export- und Zusatzfelder-Aktion einer Spule ("Zur
  Wunschliste") loesen den Download/das Anlegen ueber `fetch`+Blob aus statt ueber einen direkten Link
  (`lib/download.ts`): ein direkter `<a href>` auf `/api/...` wurde vom Service Worker der PWA abgefangen und
  lieferte die App-Huelle statt der Datei (`vite.config.ts`: `navigateFallbackDenylist` schliesst `/api/` jetzt aus).
  Test: `tests/security/spoolExtras.test.ts`; die Oberflaeche wurde manuell im Browser geprueft (Netzwerk-Log
  200 OK, echte `.xlsx`-Datei mit ZIP-Signatur).
- **R18**: Ab 0.21.0: Trocknungs-Protokoll - `POST /api/spools/:id/drying` (EDITOR im Lager der Spule, Zod:
  Temperatur 1-150 Grad, Dauer 1-2880 Minuten, Notiz optional max. 300 Zeichen) legt keinen eigenen Datensatz an,
  sondern einen EVENT-Eintrag im bestehenden Aenderungsprotokoll (`area=SPOOL`), damit er zusammen mit
  Anlegen/Aendern/Cloud-Ereignissen im Verlauf dieser Spule erscheint (`GET /api/spools/:id/history`,
  `components/SpoolHistoryModal.tsx` zeigt Temperatur/Dauer/Notiz direkt in der Liste). Aktion "Trocknen
  protokollieren" bei jeder Spule (`components/SpoolActions.tsx`, `components/SpoolDryingModal.tsx`).
  Test: `tests/security/spoolDrying.test.ts`.
- **R19**: Ab 0.21.1, umgekehrt in 0.22.6: Auf der Spulen-Seite sind die Filter dauerhaft sichtbar
  (`components/SpoolFilterBar.tsx`); nur die manuelle Suche ist hinter einem "Suche"-Knopf eingeklappt (ein Punkt
  am Knopf zeigt einen eingeklappt aktiven Suchtext an). Vor 0.22.6 war es umgekehrt (Filter eingeklappt, Suche
  immer sichtbar) - auf Wunsch getauscht. Alle vier Ansichten (Standard/Kompakt/Liste/Farbkacheln) zeigen die
  Aktionen einer Spule einheitlich ueber ein Drei-Punkte-Menue (`components/SpoolActions.tsx`), das per
  React-Portal an `<body>` gerendert wird, damit es nie von einem scrollenden Vorfahren (z.B. der seitlich
  scrollenden Tabelle der Listenansicht) abgeschnitten wird. Oberflaeche manuell auf Mobil- und Desktop-Breite
  geprueft.
- **R20**: Ab 0.21.2: Eine Spule hat ein optionales Leergewicht (`tareWeightG`, g). `POST /api/spools/:id/weigh`
  (EDITOR im Lager, Zod: 0-10000 g) zieht das Leergewicht vom eingegebenen Gesamtgewicht ab und setzt so das
  Restgewicht (auf 0 begrenzt, nie negativ); ohne hinterlegtes Leergewicht wird abgelehnt (400). Schreibt den
  Gewichtsverlauf (Quelle `WEIGHED`) und einen Verlauf-Eintrag wie eine manuelle Aenderung.
  Test: `tests/security/spoolWeigh.test.ts`.
- **R21**: Ab 0.21.2: Import aus Spoolman - `POST /api/inventories/:id/spoolman-import/file` (EDITOR im Ziel-Lager,
  Zod: max. 2000 Eintraege, jede Spule einzeln geprueft, kaputte/unvollstaendige gezaehlt und uebersprungen) liest
  eine hochgeladene Spoolman-Export-Datei (kein Login noetig, Spoolman ist selbst gehostet), legt fehlende
  Hersteller/Materialien an und importiert Restgewicht, Leergewicht, Notiz und Lagerort; `Spool.spoolmanId`
  verhindert Doppelimport je Lager, wie `bambuCloudId`. Anders als beim Bambu-Import gibt es keine Auswahl - alle
  gueltigen Eintraege werden auf einmal uebernommen. Offener Punkt (OP-SM1): Die Feldnamen stammen aus der
  oeffentlichen Spoolman-API-Dokumentation, sind aber nicht gegen eine echte Spoolman-Installation geprueft (wie
  OP-B1 beim Bambu-Import). Test: `tests/security/spoolmanImport.test.ts`.
- **R22**: Ab 0.22.0: Eine Spule hat `openedAt` (null = ungeoeffnet). Manuell angelegte Spulen sind standardmaessig
  ungeoeffnet (`alreadyOpened: true` im Anlege-Formular legt sie sofort als geoeffnet an); Cloud-/Spoolman-Import
  legen neue Spulen immer als geoeffnet an (dem Drucker/Dienst bereits bekannt). Automatisch geoeffnet wird eine
  Spule bei der ersten echten Restgewicht-Aenderung (manuell, Wiegen, Druckverbrauch - zentral in
  `recordWeightChange()`) oder der ersten AMS-Zuordnung; `POST /api/spools/:id/mark-opened` (EDITOR im Lager)
  markiert sie auch von Hand (kein Weg zurueck). Die Spulen-Seite gruppiert den Bestand in "Ungeoeffnet"/"Angefangen"
  (nur wenn beide nicht leer sind, sonst normale Liste), mit dezenter Kennzeichnung je Karte/Zeile in allen vier
  Ansichten; Filter `unopenedOnly` und Dashboard-/Statistik-Kachel ergaenzen das. Kein Weg zurueck auf "ungeoeffnet".
  Bestehende Spulen aus Installationen vor 0.22.0 haben `openedAt` zunaechst leer (neue, nullable Spalte) - ein
  einmaliger Nachtrag beim ersten Start nach dem Update (`services/openedAtBackfill.ts`, ueber `Settings.openedAtBackfilled`
  abgesichert wie `ensureDefaultInventory`) setzt `openedAt` auf das Anlage-Datum, damit sie nicht faelschlich als
  neuer, ungeoeffneter Bestand erscheinen.
  Tests: `tests/security/spoolOpened.test.ts`, `tests/security/spoolWeigh.test.ts`, `tests/security/amsSlots.test.ts`,
  `tests/integration/openedAtBackfill.test.ts`.
- **R23**: Ab 0.22.0: Bambu-Cloud- und Spoolman-Import erkennen, wenn eine "neue" externe Spule vermutlich bereits als
  ungeoeffnete Spule im Bestand liegt (exakt gleicher Hersteller, gleiches Material, gleiche Farbe (`colorHex`),
  im selben Lager, noch nicht extern verknuepft) - sonst wuerde der Bestand doppelt gezaehlt. Beim interaktiven
  Bambu-Import zeigt die Vorschau einen Vorschlag (`BambuPreviewRow.suggestedMatch`) mit Verknuepfen/Neu-anlegen-Wahl
  (`BambuImportInput.linkToSpoolId`, serverseitig erneut geprueft - der Vorschlag der Vorschau kann inzwischen
  ueberholt sein). Beim unbeaufsichtigten automatischen Bambu-Abgleich und beim Spoolman-Import (kein Benutzer da,
  um zu bestaetigen) wird bei einem eindeutigen Treffer still verknuepft statt neu angelegt (`summary.linked`,
  sichtbar im Protokoll der Spule). Mehrdeutige Treffer (mehr als eine passende ungeoeffnete Spule) werden nicht
  vorgeschlagen. Tests: `tests/security/bambuImport.test.ts`, `tests/security/spoolmanImport.test.ts`.
- **R24**: Ab 0.22.3: Der Restgewicht-Prozentwert ("X % vom Ursprungsgewicht") wird in allen vier Ansichten
  (Standard, Kompakt, Liste, Farbkacheln) einheitlich neben dem Gramm-Wert angezeigt. Zusaetzlich filtert
  `SpoolFilter.remainingMaxPercent` ("hoechstens X %") in festen 10-%-Stufen von 10 bis 90 (Dropdown statt Freitext).
  Reine Client-Logik (`packages/shared/src/spoolFilter.ts`, `remainingPercent()`), keine neue Route.
  Test: `tests/unit/spoolFilter.test.ts`; die Anzeige wurde manuell im Browser geprueft.
- **R25**: Ab 0.22.7: Die Spulen-Seite akzeptiert einen Start-Filter ueber den React-Router-Navigationszustand
  (`location.state.presetFilter`, z.B. von der "Braucht Aufmerksamkeit"-Liste des Dashboards, siehe
  `dashboard.md`) - nur beim ersten Rendern gelesen, rein clientseitig, keine sicherheitsrelevante Aenderung
  (der Filter wirkt nur auf die ohnehin schon geladene, rechtegeprueft geladene Liste). Ohne `state` wie zuvor
  `EMPTY_SPOOL_FILTER`. Die Oberflaeche wurde manuell geprueft (Link von "Fast leer" auf dem Dashboard oeffnet
  die Spulen-Seite mit bereits angehaktem "Nur fast leere").
- **R26**: Ab 0.24.0: Eine Spule hat `lastModifiedAt` (nullable `DateTime`, Prisma `@updatedAt` bleibt intern,
  wird aber nie an den Client gegeben). Gesetzt wird es ausschliesslich serverseitig per `new Date()`, nie vom
  Client (nicht in `updateSpoolInputSchema` enthalten): bei jeder manuellen Aenderung (`PATCH /:id`,
  `/archive`, `/unarchive`, `/mark-opened`, `/weigh`) sowie beim automatischen Bambu-Cloud-Abgleich
  (`bambuSyncService.ts`) und beim automatischen Verbrauch waehrend eines laufenden Drucks
  (`printJobTracker.ts`) - dort jeweils NUR, wenn sich dabei tatsaechlich ein Wert aendert (Restgewicht oder
  Archiv-Status), nicht bei jedem Abgleich-/Status-Lauf. Die manuelle AMS-Fach-Zuordnung (`amsSlotService.ts`,
  setzt nur `openedAt`) und der interaktive Bambu-Import-Assistent (`bambuImportService.ts`, eigener Quelle
  `CLOUD_IMPORT`) zaehlen bewusst NICHT dazu (Entscheidung des Users). Die Spulen-Seite zeigt in der Listenansicht
  eine Spalte "Geaendert am" mit Datum UND Uhrzeit (`lastModifiedAt`, ohne Wert faellt sie auf `createdAt`
  zurueck - `effectiveLastModifiedAt()` in `spoolFilter.ts`); "Hinzugefuegt am" zeigt ab jetzt ebenfalls die
  Uhrzeit (`createdAt` hatte sie in der Datenbank schon immer, nur die Anzeige blendete sie vorher aus - kein
  Nachtrag aus Logs noetig). Neuer Bereichsfilter in `SpoolFilterBar.tsx` ("Geaendert am", zwei `<input
  type="date">`) filtert `SpoolFilter.lastModifiedAfter`/`lastModifiedBefore` (ms, schon auf Tagesanfang/-ende
  umgerechnet) gegen den effektiven Zeitpunkt. Tests: `tests/unit/spoolFilter.test.ts`,
  `tests/security/spools.test.ts` (ignoriert vom Client mitgeschicktes `lastModifiedAt`),
  `tests/security/spoolWeigh.test.ts`, `tests/integration/printJobTracker.test.ts`,
  `tests/integration/bambuSyncService.test.ts`.
