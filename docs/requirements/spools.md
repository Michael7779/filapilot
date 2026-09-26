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
- OP-SP3: Loeschen einer Spule, die noch in `AmsSlotAssignment` oder `PrintJob` referenziert wird -
  aktuell durch die DB-FK einfach verhindert (Fehler 500 statt sauberer Fehlermeldung). Sollte
  spaeter ein eigener Fehlercode werden (`CONFLICT`), sobald Drucker-Zuordnung gebaut ist.

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
