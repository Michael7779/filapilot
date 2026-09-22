# Einstellungen / Backup

## 1.0 Ist-Stand
- Globale Einstellungen in einer einzeiligen `settings`-Tabelle (`id = 1`):
  Foto-Upload an/aus, Standard-Sync-Intervall, SMTP-Konfiguration (Passwort AES-256-GCM
  verschluesselt), Backup-Ordner-Pfad, Backup an/aus, reserviertes `licenseKey`-Feld (ungenutzt).
  Quelle: `packages/backend/src/services/settingsService.ts`,
  `packages/backend/prisma/schema.prisma`
- Nur `ADMIN` darf lesen/aendern (`packages/backend/src/routes/settings.ts`)
- Taeglicher Backup-Job (03:00 UTC) via `startDailyBackupScheduler`, plus manueller
  `POST /api/settings/backup` (`packages/backend/src/services/backupService.ts`) - Dump per
  `pg_dump`, Settings-Export als JSON, Uploads-Ordner als `.tar.gz`, alle drei mit gleichem
  Zeitstempel in `backupFolderPath`.
  Wichtig: `packages/backend/Dockerfile` installiert `postgresql-client-17` (PGDG-Repo, passend
  zur `postgres:17-alpine`-Version aus `docker-compose.yml`) - ohne das schlaegt der Backup mit
  "pg_dump: not found" fehl. Bei einem Versions-Bump des Postgres-Images in `docker-compose.yml`
  muss die Client-Version im Dockerfile mitgezogen werden.
- Frontend: `packages/frontend/src/pages/SettingsPage.tsx` - eigene Sektionen fuer Allgemein,
  SMTP (Passwort muss bei jeder Aenderung neu eingegeben werden, da `GET /api/settings` es nie
  zurueckgibt), Backup-Trigger und Nutzerverwaltung (Liste + Anlegen ueber Modal).
- MQTT-Einrichtungsanleitung fuer Bambu-Drucker ist als ausklappbarer Guide auf der Drucker-Seite
  umgesetzt (`packages/frontend/src/pages/PrintersPage.tsx`, siehe `printers.md`), nicht in den
  Einstellungen.

## 1.1 Offene Punkte
- OP-S1: Restore-Weg (Wiederherstellung auf frischer Instanz) ist im CLAUDE.md beschrieben, aber
  noch nicht implementiert - eigenes Subsystem/eigene Runde.

## 1.2 Anforderungen
- **R1**: Nur Nutzer mit Rolle `ADMIN` duerfen Einstellungen lesen oder aendern.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R2**: Nur `ADMIN` darf einen manuellen Backup ausloesen.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R3**: SMTP-Passwort wird nie im Klartext gespeichert oder an den Client zurueckgegeben.
  Test: `packages/backend/tests/security/settings.test.ts`
