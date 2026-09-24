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

- Sicherungs-Uebersicht + Wiederherstellung (Einstellungen -> System, `components/BackupManager.tsx`,
  `routes/backups.ts`, `services/backupCatalog.ts`, `services/restoreService.ts`):
  - Ein Sicherungssatz = Dateien mit gleichem Zeitstempel (`filapilot-db-<ts>.sql`, optional
    `-settings-`/`-uploads-`); gelistet werden nur Saetze mit Datenbank-Dump.
  - Ablauf: (1) automatische Sicherung des aktuellen Stands, (2) `psql --single-transaction`:
    Schema `public` leeren + Dump einspielen - bei einem Fehler wird alles zurueckgerollt, die Datenbank
    bleibt unveraendert, (3) Uploads-Ordner leeren und Archiv entpacken (nur wenn die Sicherung eines
    enthaelt), (4) `prisma db push` fuer Sicherungen aus aelteren Versionen, (5) Drucker-Verbindungen neu
    aufbauen. Laeuft im Hintergrund; der Fortschritt kommt ueber `GET /api/settings/backups/restore-status`.
  - Sperre: Sicherung und Wiederherstellung laufen nie gleichzeitig (409).
  - Nie automatisch beim Start, nur durch einen Admin mit Bestaetigungswort.
  - **Umzug auf eine neue Synology**: neue Instanz einrichten (Einrichtungsbildschirm), Sicherungsdateien
    in den Backup-Ordner kopieren (`docker cp`), unter Einstellungen -> System wiederherstellen, danach mit
    den Zugangsdaten aus der Sicherung anmelden. Das SMTP-Passwort ist mit einem Schluessel aus
    `SESSION_SECRET` verschluesselt: bei anderem Secret einmal neu eingeben (kein Absturz, siehe R8).

## 1.1 Offene Punkte
- OP-S1: Kein Herunterladen einzelner Sicherungen ueber die Oberflaeche und keine automatische Aufbewahrung
  (alte Sicherungen werden nie geloescht - bei taeglichem Backup waechst der Ordner).
- OP-S4: Wiederherstellung wurde nur mit einer Sicherung aus derselben Version praktisch geprueft;
  Sicherungen aus einer *neueren* Version in eine aeltere Installation einzuspielen ist nicht unterstuetzt.

## 1.2 Anforderungen
- **R1**: Nur Nutzer mit Rolle `ADMIN` duerfen Einstellungen lesen oder aendern.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R2**: Nur `ADMIN` darf einen manuellen Backup ausloesen.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R3**: SMTP-Passwort wird nie im Klartext gespeichert oder an den Client zurueckgegeben.
  Test: `packages/backend/tests/security/settings.test.ts`
- **R4**: Sicherungs-Uebersicht und Wiederherstellung nur fuer Admins (401 ohne Login, 403 als Benutzer).
  Test: `tests/security/backups.test.ts`
- **R5**: Ungueltiger Zeitstempel (Path-Traversal) und falsches/fehlendes Bestaetigungswort ergeben 400,
  eine unbekannte Sicherung 404. Test: `tests/security/backups.test.ts`
- **R6**: Die Uebersicht listet nur Saetze mit Datenbank-Dump, neueste zuerst, mit Groesse und Inhalt.
  Test: `tests/unit/backupCatalog.test.ts`, `tests/security/backups.test.ts`
- **R7**: Die Wiederherstellung sichert zuerst den aktuellen Stand, spielt in einer Transaktion ein, bricht
  bei einer fehlgeschlagenen Sicherung ab (Datenbank unangetastet), verrat keine Zugangsdaten in Fehlern und
  laesst keine zwei gleichzeitigen Laeufe zu. Test: `tests/integration/restoreService.test.ts`; zusaetzlich
  manuell mit echter Datenbank geprueft (Stand veraendert, wiederhergestellt: alte Daten und Anmeldung zurueck,
  neue Daten und Upload-Datei weg).
- **R8**: Ein nicht entschluesselbares SMTP-Passwort (anderes SESSION_SECRET) fuehrt nicht zum Absturz.
  Test: `tests/security/settings.test.ts`
