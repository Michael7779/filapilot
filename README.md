# FilaPilot

Selbst-gehostete Filament-Verwaltung für 3D-Drucker: manuelle Spulen-Pflege plus automatisches
Auslesen von Bambu-Lab-Druckern (AMS-Füllstand, Druckstatus) über die lokale MQTT-Schnittstelle
des Druckers — kein Cloud-Umweg. Für kleine Teams (2-5 Nutzer), gedacht zum Betrieb auf einer
eigenen Synology (oder jedem anderen Docker-Host).

Jede Installation ist eine unabhängige Instanz — es gibt keinen zentralen Server. Wer FilaPilot
nutzen will, installiert es auf seiner eigenen Hardware.

## Funktionsumfang

- Filament-Spulen verwalten: Hersteller, Material, Farbe, Restgewicht, Lagerort, Foto (optional)
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

Voraussetzung: Docker + Docker Compose auf dem Zielsystem, `git` verfügbar (z.B. Synology-Paket
"Git Server").

```bash
git clone https://github.com/Michael7779/filapilot.git
cd filapilot
cp .env.example .env
openssl rand -hex 32   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> SESSION_SECRET
```

Beide Werte in `.env` eintragen, außerdem `FRONTEND_ORIGIN` und `FRONTEND_PORT`.
**Wichtig:** `openssl rand -hex ...` verwenden, nicht `-base64` — Base64 kann `/` oder `+`
erzeugen, was die Postgres-Verbindungs-URL kaputt macht (die Passwörter landen direkt darin).
`FRONTEND_ORIGIN` muss die tatsächlich erreichbare Adresse sein, nicht `localhost`, z.B.
`http://<synology-ip>:8090`.

```bash
docker compose up -d --build
```

Einmalig Datenbank-Schema anlegen und ersten Admin-Account erstellen:

```bash
docker compose exec backend node_modules/.bin/prisma db push --schema=prisma/schema.prisma
docker compose exec backend node dist/scripts/seedAdmin.js
```

Die zweite Zeile gibt einmalig Benutzername + Start-Passwort aus — notieren, wird nirgends
gespeichert. Die App ist danach unter `http://<synology-ip>:<FRONTEND_PORT>` erreichbar; beim
ersten Login wird ein neues Passwort erzwungen.

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
