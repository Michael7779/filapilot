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
git clone https://github.com/<dein-github-name>/filapilot.git
cd filapilot
cp .env.example .env
# .env ausfüllen: POSTGRES_PASSWORD, SESSION_SECRET (siehe Kommentare in der Datei)
docker compose up -d
```

Die App ist danach unter `http://<synology-ip>:8080` erreichbar.

## Updates

Auf der Synology per Aufgabenplanung regelmäßig ausführen lassen (siehe
[scripts/update-synology.sh](scripts/update-synology.sh)):

```bash
./scripts/update-synology.sh
```

Prüft, ob es einen neueren Stand auf `main` gibt, und baut/startet die Container bei Bedarf neu.

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
