# Spulen-Verwaltung

## 1.0 Ist-Stand
- `Spool` (Material-Referenz, Hersteller-Referenz, Farbe, Ursprungs-/Restgewicht, Foto-URL,
  Kaufpreis/-datum, Lagerort) - CRUD ueber `packages/backend/src/routes/spools.ts`.
  `manufacturerId` verweist auf `Manufacturer` (siehe `manufacturers.md`), kein freier Text mehr.
  Quelle: `packages/backend/prisma/schema.prisma`
- **SCOPE-Modell bewusst `user`, nicht `self`**: Spulen gehoeren nicht einem einzelnen Nutzer,
  sondern dem geteilten Filament-Bestand der Instanz (2-5 Nutzer, siehe CLAUDE.md). Jeder
  eingeloggte Nutzer darf lesen/anlegen/aendern/loeschen - keine Owner-Pruefung noetig, weil es
  keinen Owner gibt. Das unterscheidet sich bewusst vom `self`-Scope bei z.B. der eigenen
  Akzentfarbe.
- Restgewicht wird aktuell nur manuell per `PATCH` gepflegt - der automatische Abzug ueber
  Druckauftraege (`PrintJob`) ist ein eigenes, noch nicht gebautes Subsystem (`stats.md`).
- Foto-Upload (Datei, nicht nur `photoUrl`-Text) ist NICHT Teil dieser Runde - `photoUrl` existiert
  im Schema, aber es gibt noch keinen Upload-Endpunkt und keine Pruefung des
  `Settings.photoUploadEnabled`-Schalters. Siehe OP-SP2.

## 1.1 Offene Punkte
- OP-SP1: Kein Low-Stock-Hinweis/Badge im Frontend, obwohl `LOW_STOCK_THRESHOLD_RATIO` in
  `@filapilot/shared` schon definiert ist - noch nicht verdrahtet.
- OP-SP2: Datei-Upload fuer Spulen-Fotos (inkl. Pruefung von `Settings.photoUploadEnabled`) fehlt
  komplett - eigene Runde.
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
