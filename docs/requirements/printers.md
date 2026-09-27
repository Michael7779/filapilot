# Drucker / Bambu-Sync

## 1.0 Ist-Stand
- `Printer` (Name, IP, Seriennummer, Access-Code, Sync-Modus LIVE/PERIODIC, Sync-Intervall) -
  CRUD ueber `packages/backend/src/routes/printers.ts`.
  Quelle: `packages/backend/prisma/schema.prisma`
- **Seit 0.13.0 gehoert jeder Drucker fest zu einem Lager**: Lesen (Liste, Status) braucht `VIEWER`, Anlegen/Aendern/Loeschen `OWNER`
  des Lagers oder Admin (nicht mehr nur Admin); der Live-Status geht nur an Mitglieder des Lagers. Der Absatz zum SCOPE unten
  beschreibt den Stand davor.
- **SCOPE bewusst gemischt**: Lesen (Liste + Live-Status) ist `SCOPE: user` (jeder eingeloggte
  Nutzer soll den AMS-/Druck-Status sehen), Anlegen/Aendern/Loeschen ist `SCOPE: global`
  (ADMIN-only), weil der Access-Code faktisch das Passwort des Druckers ist.
- `accessCode` geht NIE in einer API-Antwort raus - eigener `PrinterPublic`-Typ ohne dieses Feld
  in `@filapilot/shared`, `toPublicPrinter()`-Mapper in `packages/backend/src/lib/mappers.ts`.
- Laufzeit-Verbindungsverwaltung: `packages/backend/src/services/printerRuntime.ts` haelt pro
  Drucker die aktive MQTT-Verbindung (`bambuConnector.ts`) und den zuletzt bekannten Status
  In-Memory. Bei Serverstart werden alle gespeicherten Drucker automatisch verbunden
  (`connectAllPrinters()` in `server.ts`); bei Anlegen/Aendern eines Druckers wird sofort neu
  verbunden, bei Loeschen sauber getrennt.
- **Sync-Modus-Unterschied**: LIVE broadcastet jede MQTT-Nachricht sofort per Socket.IO
  (`printer:status`-Event). PERIODIC haelt die MQTT-Verbindung genauso staendig offen (ein
  Bambu-Drucker hat nur diesen einen Status-Kanal), broadcastet den zwischengespeicherten Status
  aber nur alle `syncIntervalSeconds`.
- Frontend: `packages/frontend/src/pages/PrintersPage.tsx` - Drucker-Karten mit Live-Status
  (`packages/frontend/src/lib/socket.ts`), Admin-Formular zum Anlegen, ausklappbare
  MQTT-Einrichtungsanleitung (LAN-Modus aktivieren, Access-Code + Seriennummer finden).

- **Socket.IO-Absicherung** (`socket.ts`): Beim Verbindungsaufbau wird das Session-Cookie geprueft (gueltig, nicht
  abgelaufen, kein offener Pflicht-Passwortwechsel), sonst wird die Verbindung abgelehnt (`UNAUTHORIZED`). Jede
  Minute werden bestehende Verbindungen erneut geprueft, damit Abmelden/Widerruf sie beendet.

## 1.1 Offene Punkte
- OP-P1 ✅ (0.17.0): AMS-Fach-Parsing (`bambuConnector.ts::parseAmsSlots`) liest `ams.ams[0].tray[]` (Material,
  Farbe, Restprozent) und `vt_tray` (externe Spule, Slot 254). Die Feld-Namen stammen aus oeffentlich dokumentiertem
  Reverse-Engineering des Bambu-Reports, nicht von einem echten Drucker verifiziert - muss nach dem Update geprueft
  werden. Nur die erste AMS-Einheit wird ausgewertet (mehrere AMS in Reihe werden nicht unterschieden).
- OP-P2 ✅ (0.17.0): Zuordnung Spule ↔ AMS-Slot ueber `GET/PUT /api/printers/:id/ams-slots(/:slotIndex)`, siehe R6.
- OP-P4 ✅ (0.17.0): `PrintJob.printer`/`PrintJob.spool` loeschen jetzt kaskadierend (wie `SpoolWeightLog`) - kein
  Datenbank-Fehler mehr beim Loeschen eines Druckers/einer Spule mit Auftrags-Verlauf.
- OP-P5: Der AMS-Fuellstand-Prozentwert bezieht sich auf das Gewicht, das der Drucker/Bambu Studio fuer die Spule
  kennt - nicht zwingend das in FilaPilot hinterlegte Ursprungsgewicht. Die automatische Gramm-Berechnung ist deshalb
  eine Naeherung.
- OP-P6 ✅ (0.21.3): Der Zwischenstand liegt jetzt auch in der Datenbank (`Printer.lastKnownPrintState`/
  `activeJobName`/`activeJobStartedAt`), nicht mehr nur im Arbeitsspeicher - ein Serverneustart mitten im Druck
  verliert die Kalibrierung nicht mehr. Siehe R7.
- OP-P7: Mehrere AMS-Einheiten in Reihe an einem Drucker werden nicht unterschieden (nur die erste wird gelesen).

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer kann die Drucker-Liste und den Live-Status lesen, aber nie den
  `accessCode`. Test: `packages/backend/tests/security/printers.test.ts`
- **R2**: Nur `ADMIN` darf Drucker anlegen, aendern oder loeschen.
  Test: `packages/backend/tests/security/printers.test.ts`
- **R3**: Anonyme Requests werden auf allen Drucker-Routen mit 401 abgelehnt.
  Test: `packages/backend/tests/security/printers.test.ts`
- **R4**: Der Socket.IO-Endpunkt nimmt nur Verbindungen mit gueltiger Sitzung an (kein Cookie, unbekanntes Token,
  offener Passwortwechsel -> abgelehnt). Test: `tests/realtime/socketAuth.test.ts`
- **R5**: Ab 0.13.0: Drucker-Rechte im Lager (Fremde 404, Betrachter/Bearbeiter 403 beim Schreiben, Besitzer und Admin duerfen),
  der accessCode verlaesst den Server nie, das Lager eines Druckers laesst sich nicht aendern. Test: `tests/security/printers.test.ts`

## 1.3 Automatischer Verbrauch pro Druck und Kosten (ab 0.17.0)
- **R6**: `GET /api/printers/:id/ams-slots` (VIEWER) zeigt je Slot (0-3, plus 254 = externe Spule) die Rohangaben des Druckers
  (Material, Farbe, Fuellstand) und die zugeordnete Spule; `PUT /api/printers/:id/ams-slots/:slotIndex` (EDITOR) ordnet zu
  oder loest (`spoolId: null`). Die Spule muss serverseitig geprueft im selben Lager wie der Drucker liegen (sonst 400),
  darf nicht archiviert sein (400); Fremde 404, Betrachter 403, anonym 401, ungueltiger Slot 400.
  Test: `tests/security/amsSlots.test.ts`
- **R7**: `services/printJobTracker.ts` bucht bei jedem MQTT-Status eines Druckers (unabhaengig vom Sync-Modus)
  automatisch Verbrauch: Beginnt ein Druck (Status laeuft/pausiert), wird je zugeordnetem Slot mit bekanntem
  Fuellstand ein Kalibrierungspunkt gesetzt; endet er (fertig/fehlgeschlagen/Leerlauf), wird die Differenz in Gramm
  gebucht (`SpoolWeightLog`, Quelle `PRINT`), ein `PrintJob` mit Kosten (Momentaufnahme des Kaufpreises) und
  Erfolg/Misserfolg angelegt, und die Kalibrierung aufgefrischt. Pause/Fortsetzen beendet keinen Auftrag. Ohne
  Zuordnung, ohne bekannten Fuellstand oder wenn die Spule inzwischen in einem anderen Lager liegt, wird nichts
  gebucht. Ein Fehler hier darf die Status-Anzeige nie stoeren (nur geloggt).
  Ab 0.21.3: Zustand (letzter Status, laufender Auftrag) wird zusaetzlich am Drucker gespeichert, nicht mehr nur im
  Arbeitsspeicher gehalten - bei jeder tatsaechlichen Aenderung geschrieben (nicht bei jedem gleichbleibenden Status),
  und beim ersten Status je Drucker aus der DB zurueckgelesen. Ein Serverneustart mitten im Druck erkennt den Auftrag
  dadurch weiterhin als laufend, statt ihn faelschlich neu zu beginnen und die bisherige Kalibrierung zu verwerfen.
  Tests: `tests/unit/printJobTracker.test.ts` (reine Logik), `tests/integration/printJobTracker.test.ts` (mit DB,
  inkl. simuliertem Neustart)
- **R8**: `GET /api/print-jobs?inventoryId=<uuid|all>&printerId=&spoolId=&limit=&cursor=` (VIEWER, cursor-basierte
  Seiten à max. 50) zeigt den Auftrags-Verlauf mit Anzeigenamen; "all" nur eigene Lager, ein fremder Drucker/Spule-Filter
  404. Auf der Statistik-Seite als "Letzte Druckaufträge" (`PrintJobHistory.tsx`) und in den Drucker-Einstellungen als
  AMS-Zuordnung (`AmsSlotsPanel.tsx`). Test: `tests/security/printJobs.test.ts`
