# Drucker / Bambu-Sync

## 1.0 Ist-Stand
- `Printer` (Name, IP, Seriennummer, Access-Code, Sync-Modus LIVE/PERIODIC, Sync-Intervall) -
  CRUD ueber `packages/backend/src/routes/printers.ts`.
  Quelle: `packages/backend/prisma/schema.prisma`
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

## 1.1 Offene Punkte
- OP-P1: **AMS-Fach-Parsing ist noch nicht implementiert** (`amsSlots` liefert immer `[]`) - das
  exakte Feld-Layout der Bambu-MQTT-`report`-Nachricht fuer AMS-Daten (Fach-Index, Material,
  Farbe, Restmenge) ist ohne Zugriff auf einen echten Drucker nicht zuverlaessig verifizierbar.
  Die bereits geparsten Top-Level-Felder (`gcode_state`, `subtask_name`, `mc_percent`,
  `mc_remaining_time`) sind gut dokumentierte, oeffentlich bekannte Bambu-MQTT-Felder - die
  AMS-Struktur ist komplexer/nicht so einheitlich dokumentiert. Muss gegen einen echten Drucker
  verifiziert und dann in `bambuConnector.ts::parseBambuReport` ergaenzt werden.
- OP-P2: Kein automatisches Verknuepfen von AMS-Faechern zu Spulen (`AmsSlotAssignment`-Tabelle
  existiert im Schema, wird aber noch nirgends befuellt) - haengt an OP-P1.
- OP-P3: Der Socket.IO-Server prueft aktuell keine Session/Auth beim Verbindungsaufbau - jeder,
  der den Socket.IO-Endpunkt erreicht, bekommt Status-Broadcasts. Bei Selbsthosting im eigenen
  Netzwerk ein kleineres Risiko, sollte aber nachgezogen werden (Cookie beim Handshake pruefen).
- OP-P4: Keine Loesch-Sperre, wenn ein Drucker noch in `PrintJob` referenziert wird (kein
  `onDelete`-Verhalten definiert) - relevant erst, sobald PrintJob-Erfassung existiert (siehe
  `stats.md`).

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer kann die Drucker-Liste und den Live-Status lesen, aber nie den
  `accessCode`. Test: `packages/backend/tests/security/printers.test.ts`
- **R2**: Nur `ADMIN` darf Drucker anlegen, aendern oder loeschen.
  Test: `packages/backend/tests/security/printers.test.ts`
- **R3**: Anonyme Requests werden auf allen Drucker-Routen mit 401 abgelehnt.
  Test: `packages/backend/tests/security/printers.test.ts`
