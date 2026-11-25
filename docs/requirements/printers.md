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
  werden. Mehrere AMS-Einheiten: siehe OP-P7 / R9.
- OP-P2 ✅ (0.17.0): Zuordnung Spule ↔ AMS-Slot ueber `GET/PUT /api/printers/:id/ams-slots(/:slotIndex)`, siehe R6.
- OP-P4 ✅ (0.17.0): `PrintJob.printer`/`PrintJob.spool` loeschen jetzt kaskadierend (wie `SpoolWeightLog`) - kein
  Datenbank-Fehler mehr beim Loeschen eines Druckers/einer Spule mit Auftrags-Verlauf.
- OP-P5: Der AMS-Fuellstand-Prozentwert bezieht sich auf das Gewicht, das der Drucker/Bambu Studio fuer die Spule
  kennt - nicht zwingend das in FilaPilot hinterlegte Ursprungsgewicht. Die automatische Gramm-Berechnung ist deshalb
  eine Naeherung.
- OP-P6 ✅ (0.21.3): Der Zwischenstand liegt jetzt auch in der Datenbank (`Printer.lastKnownPrintState`/
  `activeJobName`/`activeJobStartedAt`), nicht mehr nur im Arbeitsspeicher - ein Serverneustart mitten im Druck
  verliert die Kalibrierung nicht mehr. Siehe R7.
- OP-P7 ✅ (0.43.0): Mehrere AMS-Einheiten in Reihe werden unterschieden, siehe R9. Wie die uebrige AMS-Auswertung (OP-P1) noch nicht an einem echten Drucker mit mehreren AMS geprueft;
  AMS HT (eigene Kennung ab 128) wird bewusst nicht ausgewertet, weil sein Aufbau nicht verifiziert ist.

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
- **R9**: Ab 0.43.0: `parseAmsSlots` liest alle AMS-Einheiten (`ams.ams[]`, Einheit 0-3 laut `id`, ohne `id` zaehlt die Position). Slot-Index = Einheit * 4 + Kammer (0-15), die externe
  Spule bleibt 254; die erste Einheit behaelt die Indizes 0-3, bestehende Zuordnungen bleiben gueltig. `isValidAmsSlotIndex` (shared) gilt fuer Live-Status und `PUT /api/printers/:id/ams-slots/:slotIndex`
  (0-15 oder 254, sonst 400; Rechte unveraendert: EDITOR, Fremder 404, Betrachter 403). `AmsSlotsPanel` zeigt die erste Einheit immer, weitere sobald gemeldet oder zugeordnet, bei mehr als einer
  Einheit mit "AMS n - Slot m" (`lib/amsUnits.ts`). Test: `tests/unit/bambuConnector.test.ts`, `tests/security/amsSlots.test.ts`, `packages/frontend/tests/unit/amsUnits.test.ts`.

## 1.4 Verbindung ueber die Bambu Cloud (ab 0.44.0)
Threat-Model: (1) Missbrauch koennte ein eingeloggter Benutzer ohne Besitzer-Recht versuchen, um mit der gemerkten Bambu-Anmeldung eines Lagers Drucker auszulesen. (2) Serverseitig erzwungen: Anlegen/Aendern nur als OWNER des Lagers, genutzt wird nur die Bambu-Verbindung des Lagers, in dem der Drucker liegt, Broker und Adressen sind fest je Region, das Token verlaesst den Server nie. (3) Negativ-Tests: `tests/security/printerCloudMode.test.ts`.

- **R10**: Ein Drucker hat eine Verbindungsart `connectionMode` (`LOCAL`, Standard ohne Angabe, oder `CLOUD`). `LOCAL` braucht IP-Adresse und Access-Code, `CLOUD` darf beides nicht haben (400). Beim Aendern auf `CLOUD` werden gespeicherte Werte geleert, zurueck auf `LOCAL` sind beide neu anzugeben.
  Test: `tests/security/printerCloudMode.test.ts`.
- **R11**: Bei `CLOUD` kommt der Status ueber den MQTT-Broker der Bambu Cloud (`us.mqtt.bambulab.com` bzw. `cn.mqtt.bambulab.com`, Port 8883, Benutzer `u_<uid>`, Passwort = gemerktes Token, `bambuCloudConnector.ts`). Fehlt die gemerkte Verbindung, meldet der Status `issue: cloud_no_account`; lehnt die Cloud das Token ab, `issue: cloud_rejected` (kein Dauer-Neuversuch). Nach neuer Anmeldung, Trennen oder abgelaufenem Token verbinden die Cloud-Drucker des Lagers neu. Ist die Cloud nur nicht erreichbar, folgt nach 60 Sekunden ein neuer Versuch.
  Test: `tests/unit/bambuReportStream.test.ts`, `tests/unit/bambuCloudClient.test.ts`, `tests/security/printerCloudMode.test.ts`.
- **R12**: Lokal und Cloud fordern nach dem Verbinden den vollen Stand an (`pushall`) und fuehren Teil-Reports mit dem letzten Stand zusammen (`bambuReportStream.ts`), damit ein Teil-Report die AMS-Anzeige nicht leert.
  Test: `tests/unit/bambuReportStream.test.ts`.
- **R13**: Besitzer aendern die Verbindungsart eines vorhandenen Druckers in der Oberflaeche (`PrinterConnectionModal.tsx`, `PATCH /api/printers/:id`). Der Access-Code wird nie angezeigt; bleibt das Feld bei einem lokalen Drucker leer, behaelt der Server ihn. Rechte und Pruefung wie R10.
  Test: `tests/security/printerCloudMode.test.ts`.
- OP-P8: Die Cloud-Verbindung ist nur gegen nachgestellte Antworten getestet, noch nicht gegen die echte Bambu Cloud und keinen echten Drucker. Die Angaben zu Broker, Benutzername und `uid` stammen aus inoffiziellen, von der Community dokumentierten Quellen; die China-Adresse des Brokers ist dort nicht belegt.
