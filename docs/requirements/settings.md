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
  - Aufbewahrung: `Settings.backupRetentionCount` (Standard 14). Nach jeder *regulaeren* Sicherung
    (Zeitplan oder Knopf) loescht `pruneBackups` die aeltesten Saetze samt aller Dateien. Die Sicherungen, die
    vor einer Wiederherstellung entstehen, werden erst bei der naechsten regulaeren Sicherung mit aufgeraeumt,
    damit nie der Satz verschwindet, der gerade wiederhergestellt wird.
  - Download: `GET /api/settings/backups/:timestamp/download` liefert die Dateien des Satzes als `.tar`
    (Stream, nur Admin).
  - Sperre: Sicherung und Wiederherstellung laufen nie gleichzeitig (409).
  - Nie automatisch beim Start, nur durch einen Admin mit Bestaetigungswort.
  - **Umzug auf eine neue Synology**: neue Instanz einrichten (Einrichtungsbildschirm), Sicherungsdateien
    in den Backup-Ordner kopieren (`docker cp`), unter Einstellungen -> System wiederherstellen, danach mit
    den Zugangsdaten aus der Sicherung anmelden. Das SMTP-Passwort ist mit einem Schluessel aus
    `SESSION_SECRET` verschluesselt: bei anderem Secret einmal neu eingeben (kein Absturz, siehe R8).

- **Sicherung hochladen** (`POST /api/settings/backups/upload`, `services/backupImportService.ts`): nimmt eine per
  "Herunterladen" gespeicherte `.tar` entgegen (Streaming, max. 2 GB, nginx-Limit nur fuer diese Adresse), prueft
  sie vor dem Entpacken (nur die erwarteten Dateinamen eines Satzes, nur normale Dateien, Datenbank-Dump Pflicht),
  ueberschreibt nie eine vorhandene Sicherung (409) und spielt nichts ein - Wiederherstellen bleibt ein eigener Schritt.

## 1.1 Offene Punkte
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
- **R9**: Der Download einer Sicherung ist nur fuer Admins moeglich (401/403), ein ungueltiger Zeitstempel
  ergibt 400, eine unbekannte Sicherung 404; die Antwort ist ein tar-Archiv mit den Dateien des Satzes.
  Test: `tests/security/backups.test.ts`
- **R10**: Nach einer regulaeren Sicherung bleiben nur die neuesten `backupRetentionCount` Saetze uebrig, fremde
  Dateien bleiben unangetastet; der Wert ist mit 1-365 validiert.
  Test: `tests/unit/backupCatalog.test.ts`, `tests/security/settings.test.ts`
- **R9**: Der Sicherungs-Upload ist nur fuer Admins (401/403), lehnt Nicht-tar-Dateien, fremde Dateien, Pfade
  (`../`), Verknuepfungen und Archive ohne Datenbank-Dump ab (400, es wird nichts entpackt), nimmt eine gueltige
  Sicherung an (201) und lehnt dieselbe ein zweites Mal ab (409). Test: `tests/security/backupUpload.test.ts`
