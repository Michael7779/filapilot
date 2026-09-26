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
- OP-I2: Das Datenbank-Schema muss bei der Erstinstallation einmal per Aufgabe angelegt werden (`prisma db push`);
  das Backend koennte das beim Start selbst tun.
- OP-I3: Die Anleitung ist noch nicht auf einer oeffentlichen Website veroeffentlicht.

## 1.2 Anforderungen
- **R1**: `init-env.sh` erzeugt eine gueltige `.env` mit Zufallswerten, ueberschreibt nie eine vorhandene, weist
  ungueltige Ports/Adressen ab; `set-env.sh` aendert nur erlaubte Werte. Test: `tests/unit/installScripts.test.ts`
- **R2**: Das `secure`-Flag des Sitzungs-Cookies folgt https (Adresse oder Request). Test: `tests/unit/sessionCookie.test.ts`
