# Installation (Synology)

## 1.0 Ist-Stand
- Anleitung fuer Einsteiger: `docs/installation/synology.md` (Pakete, App-Dateien laden, `.env` erzeugen,
  Container Manager, Datenbank-Schema, Update-Aufgabe, Zugriff von aussen mit DDNS/Zertifikat/Reverse-Proxy/
  Portfreigabe, E-Mail, Sicherungen, Umzug, haeufige Fragen). Kurzfassung im `README.md`.
- `scripts/init-env.sh`: erzeugt die `.env` (Zufalls-Passwort und -Sitzungs-Schluessel je 64 Hex-Zeichen, freier
  Port ab 8090, Adresse aus der NAS-IP oder als Argument), Rechte 600, gibt keine Geheimnisse aus, ueberschreibt nie
  eine vorhandene Datei.
- `scripts/set-env.sh`: aendert nur `FRONTEND_ORIGIN` und `FRONTEND_PORT` (validiert), nie Passwort/Schluessel.
- Das Sitzungs-Cookie hat das Flag `secure` nur bei https (`lib/sessionCookie.ts`): sonst speichert der Browser es
  ueber eine `http://`-Heimnetz-Adresse nicht und die Anmeldung scheitert.
- `.gitattributes` erzwingt LF-Zeilenenden fuer `*.sh` (sonst brechen Skripte auf der NAS ab).

## 1.1 Offene Punkte
- OP-I1: Die Anleitung wurde nach den Aufgabenplaner-/DSM-Menuenamen der Autologbuch-Anleitung und dem eigenen
  Ablauf geschrieben, aber nicht Schritt fuer Schritt auf einer frisch installierten zweiten NAS durchgespielt.
- OP-I2 ✅ (0.42.0): Das Backend legt das Datenbank-Schema bei der Erstinstallation beim Start selbst an (R4); die Aufgabe "Datenbank anlegen"
  aus der Anleitung entfaellt.
- OP-I3: Die Anleitung ist noch nicht auf einer oeffentlichen Website veroeffentlicht.

## 1.2 Anforderungen
- **R1**: `init-env.sh` erzeugt eine gueltige `.env` mit Zufallswerten, ueberschreibt nie eine vorhandene, weist
  ungueltige Ports/Adressen ab; `set-env.sh` aendert nur erlaubte Werte. Test: `tests/unit/installScripts.test.ts`
- **R2**: Das `secure`-Flag des Sitzungs-Cookies folgt https (Adresse oder Request). Test: `tests/unit/sessionCookie.test.ts`
- **R3** (Release-Gate): Vor jedem Release mit Schema-Aenderung `bash scripts/check-schema-upgrade.sh <alter-Stand>` ausfuehren: Es
  simuliert das Update (altes Schema mit Daten, neues Schema per `prisma db push` OHNE `--accept-data-loss`) und bricht ab, wenn
  Prisma eine Freigabe verlangt (neue Eindeutigkeitsregel, Pflichtspalte auf gefuellter Tabelle). Anlass: 0.14.0 scheiterte auf der
  Synology an `@@unique([inventoryId, bambuCloudId])`, weil die Tests mit `--accept-data-loss` liefen und das verdeckten.
  Neue Eindeutigkeit daher im Code sicherstellen, nicht per `@@unique` auf bestehenden Tabellen.
- **R4** ✅ Ab 0.42.0: Beim Start legt `services/schemaBootstrap.ts` (`ensureDatabaseSchema`) das Schema per `prisma db push` an, aber NUR wenn das Schema
  `public` der Datenbank KEINE Tabelle hat (frische Installation). Eine Datenbank mit irgendeiner Tabelle wird nie angefasst - Aenderungen an bestehenden
  Installationen laufen weiter ausschliesslich ueber `scripts/update-synology.sh` (bricht bei datenverlust-traechtigen Aenderungen bewusst ab) bzw. die
  Wiederherstellung. Der Aufruf geht ohne Shell mit festem Argument-Array (Prisma-CLI ueber `process.execPath`) und nie mit `--accept-data-loss` oder
  `--force-reset`; ein fehlgeschlagener Abgleich wird weitergeworfen (der Start versucht es per `runWithStartupRetry` erneut und loggt jeden Fehler).
  Threat-Model: keine Route, keine Eingabe von aussen; Missbrauch braeuchte Zugriff auf Umgebung/Container (und damit mehr als dieser Weg hergibt).
  Test: `tests/unit/schemaBootstrap.test.ts` (Logik mit Fake-Abhaengigkeiten, verbotene Flags, Shell-Zeichen),
  `tests/integration/schemaBootstrap.test.ts` (echte leere Datenbank wird mit allen Tabellen angelegt, zweiter Start ohne Wirkung, fremde Tabellen werden nicht angefasst).
