# Changelog

Alle nennenswerten Aenderungen an FilaPilot werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach SemVer.

## [0.11.0] - 2026-09-25

### Hinzugefuegt
- Spulen-Fotos: Foto hinzufügen, ersetzen und entfernen im Spulen-Dialog (Handyfotos werden vor dem Upload
  verkleinert); das Foto erscheint auf der Spulenkarte. Nur JPEG/PNG/WebP, max. 5 MB, nur mit Login sichtbar,
  Teil der Sicherung. Funktioniert nur, wenn "Foto-Upload für Spulen erlauben" aktiv ist.
- Spulenkarten zeigen "Fast leer" ab 15 % Restbestand.
- Statistik: zusätzliche Auswertung nach Material-Typ (z. B. alle PLA-Varianten zusammen).
- Sicherungen: "Sicherung hochladen" (Einstellungen → System) für den Umzug - eine per "Herunterladen"
  gespeicherte .tar-Datei wird geprüft und abgelegt, danach kann sie wiederhergestellt werden.
- Änderungsprotokoll: An- und Abmeldungen sowie Vorgänge des Systems (automatische Sicherung, Aufräumen,
  Einspielen der Material-Vorlagen) werden vermerkt.

### Sicherheit
- Der Live-Status der Drucker (Socket.IO) ist jetzt nur noch mit gültiger Anmeldung erreichbar; Abmelden
  beendet auch die laufende Verbindung.

### Geändert
- Das Foto einer Spule lässt sich nicht mehr als freie Web-Adresse setzen, sondern nur über den Upload.

## [0.10.0] - 2026-09-24

### Hinzugefuegt
- Änderungsprotokoll: Aufbewahrung in Monaten einstellbar (Einstellungen → System → Allgemein, Standard
  12 Monate, 0 = unbegrenzt). Ältere Einträge werden täglich automatisch gelöscht; das Aufräumen selbst
  wird im Protokoll vermerkt.

### Hinweis zum Update
- Neue Datenbank-Spalte (Aufbewahrung Protokoll); das Update-Skript gleicht sie automatisch ab.
  Bestehende Installationen bekommen den Standard von 12 Monaten - ältere Einträge werden also nach dem
  nächsten nächtlichen Lauf entfernt, wenn du den Wert nicht erhöhst oder auf 0 setzt.

## [0.9.0] - 2026-09-24

### Hinzugefuegt
- Änderungsprotokoll (Einstellungen → Protokoll, nur Admins): wer hat wann was angelegt, geändert oder gelöscht -
  mit Vorher-/Nachher-Werten, Suche und Filtern nach Zeitraum, Bereich, Aktion und Benutzer, Seiteneinteilung.
  Passwörter, Zugangscodes und das SMTP-Passwort werden nie protokolliert.
- Benutzerliste: neue Spalte "Zuletzt aktiv".

### Hinweis zum Update
- Neue Datenbank-Tabelle und -Spalte (Protokoll, zuletzt aktiv); das Update-Skript gleicht sie automatisch ab.
  Das Protokoll beginnt beim Update, frühere Änderungen sind nicht nachträglich erfasst.

## [0.8.0] - 2026-09-24

### Hinzugefuegt
- Sicherungen: Aufbewahrung (Einstellung "Anzahl aufzubewahrender Sicherungen", Standard 14) - ältere werden
  nach jeder regulären Sicherung automatisch gelöscht.
- Sicherungen: "Herunterladen" speichert eine Sicherung als tar-Datei.
- Benutzerliste: Spalten "Erstellt am" und "Letzter Login".

### Hinweis zum Update
- Zwei neue Datenbank-Spalten (letzter Login, Anzahl Sicherungen); das Update-Skript gleicht sie automatisch ab.

## [0.7.0] - 2026-09-24

### Hinzugefuegt
- Sicherungen: Übersicht aller vorhandenen Sicherungen (Datum, Inhalt, Größe) unter Einstellungen → System.
- Backup wiederherstellen (nur Admin, mit Bestätigungswort): sichert vorher automatisch den aktuellen Stand,
  spielt in einer Transaktion ein (bei Fehler bleibt alles unverändert), zeigt den Fortschritt an und setzt
  auch hochgeladene Dateien zurück. Damit ist der Umzug auf eine neue Synology möglich (siehe README).

### Behoben
- Ein SMTP-Passwort, das mit einem anderen `SESSION_SECRET` verschlüsselt wurde (z. B. nach einem Umzug),
  führt nicht mehr zu Fehlern beim Anlegen von Benutzern.

## [0.6.0] - 2026-09-24

### Hinzugefuegt
- Mobile Ansicht für das Smartphone (auch als installierte PWA): Navigation als Leiste unten mit
  Symbolen, Karten und Kennzahlen passen sich der Breite an, Dialoge und Tabellen sind auf kleinen
  Bildschirmen bedienbar, Abmelden unter Einstellungen → Mein Konto.

## [0.5.0] - 2026-09-23

### Hinzugefuegt
- Einrichtungsbildschirm: Auf einer frischen Installation legst du den ersten Administrator direkt im
  Browser an (eigenes Passwort, danach dauerhaft gesperrt). Das Skript `seedAdmin` bleibt als Alternative.

## [0.4.0] - 2026-09-23

### Hinzugefuegt
- Benutzer bearbeiten (Name, E-Mail, Rolle), löschen und Passwort zurücksetzen (Einstellungen →
  Benutzer). Der letzte Admin und das eigene Konto sind geschützt.
- SMTP: Button "Test-E-Mail an mich senden" zeigt bei Problemen die genaue Fehlermeldung des
  Mailservers.

## [0.3.2] - 2026-09-23

### Geändert
- Einstellungen sind in Reiter aufgeteilt: Mein Konto, Benutzer, Filamente, System (jeweils mit
  eigener Adresse, z. B. `/settings/filamente`). Normale Benutzer sehen nur "Mein Konto".
- Begriff "Nutzer" heißt überall "Benutzer".

### Behoben
- Update-Hinweis: Der Button "Aktualisieren" lädt jetzt zuverlässig die neue Version (verwirft
  Service-Worker und Cache und lädt neu). Der Hinweis erscheint als Karte unten rechts und
  verdeckt die Kopfzeile nicht mehr.

## [0.3.1] - 2026-09-23

### Behoben
- Ein fehlgeschlagener Datenbankzugriff in der Spulen-, Drucker-, Nutzer- und Einstellungs-Liste
  beendete das ganze Backend (Absturzschleife). Fehler werden jetzt abgefangen und als Fehlermeldung
  zurückgegeben.
- Hinter dem Reverse-Proxy wird die echte Client-Adresse für die Login-Begrenzung genutzt
  (Warnung "X-Forwarded-For" im Log behoben, `TRUST_PROXY_HOPS`, Standard 2).

## [0.3.0] - 2026-09-23

### Hinzugefuegt
- Hersteller zuerst, dann Material: Das Material-Feld zeigt nur Produkte des gewählten Herstellers
  plus allgemeine Materialien. Rund 70 Materialien mit Richttemperaturen sind vorbefüllt.
- Temperaturen (Düse, Bett) werden im Spulen-Formular und auf den Spulenkarten angezeigt.
- Einstellungen: Hersteller und Materialien anlegen, ändern und löschen (nur Admin). Löschen ist
  gesperrt, solange Spulen den Eintrag nutzen.
- SMTP: Verschlüsselung als Auswahl (STARTTLS Port 587 / SSL Port 465) statt missverständlichem Haken.

### Behoben
- Schlägt der Mailversand fehl, wird der Nutzer trotzdem angelegt und das Startpasswort angezeigt.

### Hinweis zum Update
- Das Datenbank-Schema ändert sich (Material bekommt einen optionalen Hersteller); das Update-Skript
  gleicht es automatisch ab.

## [0.2.3] - 2026-09-23

### Hinzugefuegt
- Update-Hinweis: Liegt eine neue Version auf dem Server, erscheint oben ein Banner mit Button
  "Aktualisieren" (Strg+F5 ist nicht mehr nötig). Es wird beim Öffnen, beim Zurückkehren zum Tab
  und alle 15 Minuten geprüft.

## [0.2.2] - 2026-09-23

### Geändert
- Alle Auswahllisten sind jetzt alphabetisch sortiert.
- Login und Passwort-Reset ignorieren Groß-/Kleinschreibung bei Benutzername und E-Mail; doppelte
  Nutzer in anderer Schreibweise werden beim Anlegen abgelehnt.

## [0.2.1] - 2026-09-23

### Behoben
- Klickbare Elemente (Buttons, Auswahlfelder, Checkboxen) zeigen jetzt den Hand-Mauszeiger.
- Update-Skript: `git safe.directory` wird automatisch gesetzt, das Datenbank-Schema wird bei
  Updates automatisch abgeglichen (`prisma db push`).

## [0.2.0] - 2026-09-22

### Hinzugefuegt
- QR-Label-Druck pro Spule: druckbares Label mit QR-Code (Spulen-ID) + Material/Farbe/Hersteller,
  ueber die "QR-Label"-Aktion auf der Spulen-Seite.
- Statistik-Seite: Spulen gesamt, verbrauchtes Filament, Restbestand, Anzahl Spulen mit
  niedrigem Bestand sowie Verbrauch aufgeschluesselt nach Material und Hersteller - berechnet
  clientseitig aus den vorhandenen Spulen-Daten (siehe `docs/requirements/stats.md` fuer die
  bewusste Abgrenzung zum noch nicht gebauten `PrintJob`-Tracking).

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
