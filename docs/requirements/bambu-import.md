# Import aus der Bambu-Cloud

Design: `docs/design/bambu-import.md`. Umgesetzt in Version 0.14.0.

## 1.0 Ist-Stand
- Auf der Spulen-Seite eines Lagers (Rolle Bearbeiter oder Besitzer) gibt es **Aus Bambu-Cloud importieren**
  (`components/BambuImportModal.tsx`): Anmelden (E-Mail, Passwort, Region) -> ggf. E-Mail-Code -> Vorschau mit Auswahl ->
  Import mit Ergebnis. Ausweichweg: eine JSON-Datei mit der Filamentliste (Feld `hits` oder eine Liste).
- Backend: `routes/bambuImport.ts` unter `/api/inventories/:id/bambu-import` (`login`, `verify`, `file`, `:sessionId/preview`,
  `:sessionId/import`, `DELETE :sessionId`), `services/bambuCloudClient.ts` (austauschbarer Zugriff auf die inoffizielle Schnittstelle,
  feste Adressen `api.bambulab.com`/`.cn`), `services/bambuImportSessions.ts` (Sitzungen nur im Speicher, 15 Minuten, max. 3 je Benutzer),
  `services/bambuImportService.ts` (Zuordnung, Vorschau, Import in einer Transaktion).
- Zuordnung: Hersteller nach Name (ohne Gross-/Kleinschreibung, sonst angelegt), Material nach Name beim Hersteller oder allgemein (sonst
  angelegt, Temperaturen vom allgemeinen Material gleichen Typs, sonst 190-230/60), Farbname = naechster deutscher Name zum Hex-Wert,
  Gewicht = `netWeight`/`totalNetWeight` (begrenzt), Lagerort = Druckername bei "im Drucker". `Spool.bambuCloudId` (nur Index, keine DB-Eindeutigkeit, siehe `install.md` R3) erkennt schon importierte Spulen je Lager; Doppelimport wird im Code verhindert.
- Passwort und Token werden nie gespeichert, geloggt, protokolliert oder zurueckgegeben; das Token wird nach dem Import, beim Abbrechen,
  nach 15 Minuten und beim Neustart verworfen. Anmeldeversuche sind streng begrenzt (10 je 15 Minuten und IP).
- Neuer Fehlercode `UPSTREAM_ERROR` (502) fuer "Bambu nicht erreichbar / blockiert / unerwartete Antwort".

## 1.1 Offene Punkte
- OP-B1: **Die echte Schnittstelle ist nur teilweise geprueft.** Erster Praxistest (2026-09-26, Konto des Nutzers): Die Anmeldung erreicht die
  Cloud (Bot-Schutz kein Problem, es kam ein E-Mail-Code); der Schritt "Code anfordern" antwortet mit HTTP 200 ohne lesbares JSON und wurde
  zunaechst faelschlich als Fehler gewertet (behoben in 0.14.2, Test mit gefaelschten Antworten). Offen: Anmeldung mit Code, Spulenliste
  und Feldnamen mit echten Daten.
- OP-B6: Ob Bambu beim Anmelden selbst einen Code verschickt oder erst auf "Code anfordern": Im Praxistest kamen bei wenigen Versuchen mehrere
  E-Mails an. Seit 0.14.2 wird kein Code automatisch angefordert, sondern nur auf Wunsch (max. 1x pro Minute); im Protokoll des Servers
  stehen bei Fehlern Schritt, Status und Feldnamen (nie Inhalte).
- OP-B2: Anmeldung per Authenticator-App (TFA) ist nicht unterstuetzt (eigener Pfad mit CSRF-Cookie, nicht verifiziert); die App meldet das
  und verweist auf die JSON-Datei.
- OP-B3: Kein Dauerabgleich und kein Schreiben in die Bambu-Cloud; der Verbrauch wird nicht zurueckgemeldet.
- OP-B4: Notizen und Bambu-Farbcodes der Spulen werden nicht uebernommen (kein Feld in FilaPilot).
- OP-B5: Die Bedeutung der Status-Werte ausser 0 ist nicht dokumentiert; solche Spulen sind in der Vorschau abgewaehlt, aber waehlbar.

## 1.2 Anforderungen
- **R1** ✅ Import nur mit Rolle Bearbeiter/Besitzer im Lager (Fremde 404, Betrachter 403, anonym 401); Eingaben werden validiert (Region, Konto,
  IDs, Dateigroesse/-format). Test: `tests/security/bambuImport.test.ts`
- **R2** ✅ Eine Import-Sitzung gehoert einem Benutzer und einem Lager (fremde, andere Lager, abgelaufene: 404), wird nach dem Import
  verworfen. Test: `tests/security/bambuImport.test.ts`
- **R3** ✅ Passwort und Token tauchen weder in Antworten noch im Protokoll auf; Fehler nennen nur die Art (falsche Zugangsdaten 400,
  Bot-Schutz 502, TFA nicht unterstuetzt). Test: `tests/security/bambuImport.test.ts`
- **R4** ✅ Import legt fehlende Hersteller/Materialien an, verhindert Doppelimport je Lager und aktualisiert auf Wunsch das Restgewicht;
  gleiche Bambu-IDs in verschiedenen Lagern sind getrennt. Test: `tests/security/bambuImport.test.ts`
- **R5** ✅ Zuordnung von Spulen (Gewicht begrenzt, Ersatzwerte, Farbnamen, kaputte Eintraege gezaehlt). Test: `tests/unit/bambuMapping.test.ts`
- **R6** ✅ Anmeldeversuche sind begrenzt (429 ueber dem Limit). Test: `tests/unit/bambuRateLimit.test.ts`
- **R8** ✅ Code-Schritt: kein automatisches Anfordern, "Code senden" nur auf Wunsch, hoechstens einmal pro Minute und nur fuer die eigene Sitzung;
  der Client wertet HTTP 200 mit leerer Antwort als Erfolg und meldet Fehler mit Schritt/Status. Tests: `tests/security/bambuImport.test.ts`,
  `tests/unit/bambuCloudClient.test.ts`
- **R7** ✅ Oberflaeche (Assistent, Datei-Weg, Vorschau, Ergebnis): manuell per Browser mit dem Datei-Weg geprueft (2026-09-26); der Weg ueber
  die echte Cloud ist nicht geprueft (OP-B1).
