# FilaPilot

Selbst-gehostete Filament-Verwaltung für 3D-Drucker: manuelle Spulen-Pflege plus automatisches
Auslesen von Bambu-Lab-Druckern (AMS-Füllstand, Druckstatus) über die lokale MQTT-Schnittstelle
des Druckers — kein Cloud-Umweg. Für kleine Teams (2-5 Nutzer), gedacht zum Betrieb auf einer
eigenen Synology (oder jedem anderen Docker-Host).

Jede Installation ist eine unabhängige Instanz — es gibt keinen zentralen Server. Wer FilaPilot
nutzen will, installiert es auf seiner eigenen Hardware.

## Funktionsumfang

- Filament-Spulen verwalten: Hersteller, Material, Farbe, Restgewicht, Lagerort, Foto (optional, Kennzeichen "Fast leer")
- Automatischer Abgleich mit Bambu-Lab-AMS (live oder periodisch, einstellbar)
- Mehrbenutzer mit Rollen (Admin/User), Passwort-Reset per E-Mail, erzwungener Passwortwechsel
  bei Erstanmeldung
- Statistik-Dashboard (Verbrauch, Kosten, Material-Verteilung)
- QR-Label-Druck pro Spule
- Pro Konto anpassbare Akzentfarbe
- Mehrsprachig (Deutsch/Englisch)
- Als PWA installierbar (Desktop + Smartphone-Homescreen)
- Tägliches automatisches Backup + manuelles Backup/Restore für den Umzug auf eine neue Instanz

## Installation (Synology / Docker)

**Eine ausführliche Schritt-für-Schritt-Anleitung für Einsteiger** (Paketzentrum, Aufgabenplaner, Container
Manager, Updates, Reverse-Proxy) steht in [docs/installation/synology.md](docs/installation/synology.md). Die
Kurzfassung für Leute mit Docker-Erfahrung:

Voraussetzung: Docker + Docker Compose auf dem Zielsystem, `git` verfügbar (z.B. Synology-Paket
"Git Server").

```bash
git clone https://github.com/Michael7779/filapilot.git
cd filapilot
bash scripts/init-env.sh   # erzeugt .env mit Zufalls-Schlüsseln, freiem Port und Adresse (siehe Skript-Kopf)
```

`scripts/init-env.sh` legt die `.env` an (Passwort und Sitzungs-Schlüssel zufällig, freier Port ab 8090, Adresse
`http://<NAS-IP>:<Port>`) und überschreibt nie eine vorhandene Datei. Später ändern lassen sich Adresse und Port
mit `bash scripts/set-env.sh FRONTEND_ORIGIN <adresse>`. Wer die Datei von Hand aus `.env.example` erstellt:
`openssl rand -hex 32` verwenden, nicht `-base64` — Base64 kann `/` oder `+` erzeugen, was die
Postgres-Verbindungs-URL kaputt macht. `FRONTEND_ORIGIN` muss die tatsächlich erreichbare Adresse sein, nicht
`localhost`.

```bash
docker compose up -d --build
```

Einmalig das Datenbank-Schema anlegen:

```bash
docker compose exec backend node_modules/.bin/prisma db push --schema=prisma/schema.prisma
```

Danach die App im Browser öffnen (`http://<synology-ip>:<FRONTEND_PORT>`): Beim ersten Aufruf erscheint
der **Einrichtungsbildschirm**, dort legst du den ersten Administrator mit eigenem Passwort an. Der
Bildschirm ist danach dauerhaft gesperrt. Auf einer frisch installierten Instanz gewinnt, wer zuerst
einrichtet — öffne die Seite also direkt nach dem Start selbst.

Alternativ ohne Browser (gibt einmalig Benutzername + Start-Passwort in der Konsole aus, das beim ersten
Login geändert werden muss):

```bash
docker compose exec backend node dist/scripts/seedAdmin.js
```

## Änderungsprotokoll

Unter **Einstellungen → Protokoll** (nur Admins) steht, wer wann was angelegt, geändert oder gelöscht hat — mit
Vorher-/Nachher-Werten, Suche und Filtern nach Zeitraum, Bereich, Aktion und Benutzer. Passwörter, Zugangscodes
und das SMTP-Passwort werden nie protokolliert. Wie lange Einträge aufbewahrt werden (Standard 12 Monate,
0 = unbegrenzt), stellst du unter Einstellungen → System → Allgemein ein; ältere werden täglich gelöscht.

## Backup und Wiederherstellung

Unter **Einstellungen → System** legt FilaPilot täglich automatisch eine Sicherung an (Datenbank + hochgeladene
Dateien) und listet alle vorhandenen Sicherungen. Mit **Wiederherstellen** wird der Stand einer Sicherung
eingespielt: Vorher wird automatisch eine Sicherung des aktuellen Stands angelegt, das Einspielen läuft in einer
Transaktion (bei einem Fehler bleibt alles unverändert), und danach gelten Benutzer und Passwörter aus der
Sicherung.

Die Anzahl aufbewahrter Sicherungen (Standard: 14) stellst du unter Einstellungen → System → Allgemein ein,
ältere werden nach jeder regulären Sicherung automatisch gelöscht. Mit **Herunterladen** speicherst du eine
Sicherung als `.tar`-Datei auf deinem Rechner (enthält die komplette Datenbank inkl. Passwort-Hashes — sicher
aufbewahren).

**Umzug auf eine neue Synology** (Sicherung vorher auf der alten Installation mit **Herunterladen** speichern):

1. FilaPilot dort normal installieren und im Browser den Einrichtungsbildschirm durchlaufen (der Zugang ist nur
   vorläufig, er wird durch die Sicherung ersetzt).
2. Unter Einstellungen → System die heruntergeladene `.tar`-Datei mit **Sicherung hochladen** ablegen (sie wird
   geprüft und nur abgelegt, nicht eingespielt). Alternativ die Dateien (`filapilot-db-<Zeitstempel>.sql`, optional
   `-uploads-` und `-settings-`) per `docker cp <datei> <projekt>-backend-1:/data/backups/` in den Backup-Ordner kopieren.
3. Unter Einstellungen → System die Sicherung wiederherstellen und mit den Zugangsdaten aus der Sicherung anmelden.
4. Das SMTP-Passwort ist mit einem Schlüssel aus `SESSION_SECRET` verschlüsselt: Hast du in der neuen `.env` ein
   anderes Secret, gibst du das SMTP-Passwort einmal neu ein.

## Updates

Auf der Synology per Aufgabenplanung regelmäßig ausführen lassen (siehe
[scripts/update-synology.sh](scripts/update-synology.sh)):

```bash
./scripts/update-synology.sh
```

Prüft, ob es einen neueren Stand auf `main` gibt, und baut/startet die Container bei Bedarf neu.
Gleicht danach automatisch das Datenbank-Schema ab (`prisma db push`), sofern die Änderung rein
additiv ist (neue Tabelle/Spalte). Bricht das Skript dabei mit einem Fehler zu einer
"nicht ausführbaren" Schema-Änderung ab (z.B. eine neue Pflichtspalte auf einer Tabelle mit
bestehenden Zeilen), ist manuelles Eingreifen nötig — betroffene Zeilen bereinigen oder einen
Default-Wert ergänzen, dann `docker compose exec backend node_modules/.bin/prisma db push
--schema=prisma/schema.prisma` erneut manuell ausführen.

## Entwicklung

Details zu Tech-Stack, Architektur-Regeln und Sicherheits-Disziplin stehen in
[CLAUDE.md](CLAUDE.md). Anforderungen mit Test-Verknüpfung: [docs/requirements/](docs/requirements/).

```bash
pnpm install
pnpm --filter @filapilot/backend exec prisma db push   # gegen eine lokale Postgres
pnpm dev:backend
pnpm dev:frontend
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
