# Changelog

Alle nennenswerten Aenderungen an FilaPilot werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach SemVer.

## [Unreleased]

### Hinzugefuegt
- QR-Label-Druck pro Spule: druckbares Label mit QR-Code (Spulen-ID) + Material/Farbe/Hersteller,
  ueber die "QR-Label"-Aktion auf der Spulen-Seite.

## [0.1.0] - 2026-09-22

### Hinzugefuegt
- Passwort-Reset per E-Mail-Link (zeitlich begrenzter Token, kein User-Enumeration-Leak).
  Ohne konfiguriertes SMTP wird der Reset-Link stattdessen ins Server-Log geschrieben.
- Theming pro Konto: Akzentfarbe ueber Voreinstellungs-Swatches + Farbwaehler in den
  Konto-Einstellungen, `null`/Reset setzt den Standardwert `#2F6FED` zurueck.
- Einstellungen-Seite fuer Admins: Allgemein (Foto-Upload, Standard-Sync-Intervall,
  Backup an/aus + Ordner), SMTP-Konfiguration (Passwort AES-256-GCM verschluesselt, nie an den
  Client zurueckgegeben), manueller "Jetzt sichern"-Button, Nutzerverwaltung (Liste + Anlegen).
- Taeglicher automatischer Backup-Job (DB-Dump via `pg_dump`, Settings-Export als JSON,
  Uploads-Ordner als `.tar.gz`).
- Drucker-Verwaltung mit Bambu-Lab-MQTT-Anbindung: CRUD (nur Admin), Live-/periodischer
  Verbindungsstatus per Socket.IO, ausklappbare Einrichtungsanleitung, `accessCode` verlaesst nie
  den Server.

### Behoben
- `pg_dump` fehlte im Backend-Produktiv-Image, wodurch jeder Backup-Versuch mit 500 fehlschlug -
  `postgresql-client-17` wird jetzt ueber das PGDG-Repo passend zur Postgres-Server-Version
  installiert.
- Passwort-Reset-Link wurde im Server-Log nur angekuendigt, aber nie tatsaechlich mit ausgegeben,
  wenn kein SMTP konfiguriert ist - dadurch war ein Reset ohne SMTP praktisch nicht abschliessbar.
- Bambu-MQTT-Verbindungsversuche hatten kein `connectTimeout`, wodurch unerreichbare Drucker den
  Verbindungsaufbau am OS-TCP-Timeout haengen liessen statt nach wenigen Sekunden fehlzuschlagen.
- Spulen-Seite blieb bei einem fehlgeschlagenen Laden dauerhaft bei "Lädt..." haengen statt einen
  Fehler mit Retry-Button anzuzeigen.

## [0.0.2] - 2026-09-21

### Hinzugefuegt
- Manufacturer-Stammdaten (vorbefuellt mit bekannten Herstellern, in den Einstellungen pflegbar)
  statt freiem Textfeld bei Spulen.
- Sichtbare Versionsnummer oben rechts in der App.
- Echtes Favicon + PWA-Icons (zweifarbiges Spulen-Symbol).

### Behoben
- Produktions-Docker-Build (fehlendes `.dockerignore`, ungebautes `shared`-Package).
- Empfehlung `openssl rand -hex` statt `-base64` fuer generierte Secrets (Base64 kann `/`
  erzeugen, das die Datenbank-Verbindungs-URL ungueltig macht).

## [0.0.1] - 2026-09-20

### Hinzugefuegt
- Projekt-Grundgeruest (pnpm-Monorepo, Docker Compose, Prisma-Schema).
- Login-Flow mit erzwungenem Passwortwechsel und Admin-Bootstrap.
- Spulen-CRUD (Material + Spule).
