# Einstellungen / Backup

## 1.0 Ist-Stand
- Globale Einstellungen in einer einzeiligen `settings`-Tabelle (`id = 1`):
  Foto-Upload an/aus, Standard-Sync-Intervall, SMTP-Konfiguration (Passwort AES-256-GCM
  verschluesselt), Backup-Ordner-Pfad, Backup an/aus, reserviertes `licenseKey`-Feld (ungenutzt).
  Quelle: `packages/backend/src/services/settingsService.ts`,
  `packages/backend/prisma/schema.prisma`
- Nur `ADMIN` darf lesen/aendern (`packages/backend/src/routes/settings.ts`)
- Taeglicher Backup-Job (03:00 UTC) via `startDailyBackupScheduler`, plus manueller
  `POST /api/settings/backup` (`packages/backend/src/services/backupService.ts`)

## 1.1 Offene Punkte
- OP-S1: Restore-Weg (Wiederherstellung auf frischer Instanz) ist im CLAUDE.md beschrieben, aber
  noch nicht implementiert - eigenes Subsystem/eigene Runde.
- OP-S2: MQTT-Einrichtungsanleitung (Bambu-Drucker auf lokalen Zugriff umstellen) ist als
  UI-Textblock in den Drucker-Einstellungen geplant, noch nicht geschrieben.

## 1.2 Anforderungen
- **R1**: Nur Nutzer mit Rolle `ADMIN` duerfen Einstellungen lesen oder aendern.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R2**: Nur `ADMIN` darf einen manuellen Backup ausloesen.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R3**: SMTP-Passwort wird nie im Klartext gespeichert oder an den Client zurueckgegeben.
  Test: noch zu schreiben (OP-S3).
