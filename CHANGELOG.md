# Changelog

Alle nennenswerten Aenderungen an FilaPilot werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach SemVer.

Schreibregel: Die Punkte unter "Hinzugefuegt", "Geändert", "Behoben" und "Sicherheit" erscheinen in der App
(Änderungsverlauf) und sind in einfacher Sprache aus Sicht der Benutzer geschrieben - ohne Fachbegriffe.
Technisches für Admins (Datenbank, Skripte, Einstellungen des Servers) steht unter "Hinweis zum Update" und
erscheint nicht in der App.

## [0.14.4] - 2026-09-26

### Hinzugefuegt
- Bambu-Verbindung pro Lager: Beim Anmelden im Import-Dialog kann ein Besitzer "Verbindung für dieses Lager merken" wählen. FilaPilot speichert
  dann nur den Zugang (verschlüsselt, nie dein Passwort). Jedes Lager hat seine eigene Verbindung, du kannst also in einem Lager ein anderes
  Bambu-Konto nutzen als im anderen. Ohne Passwort und ohne Code, bis der Zugang abläuft (etwa 90 Tage), danach meldest du dich einmal neu an.
- Neuer Knopf "Aus Cloud aktualisieren" auf der Spulen-Seite (bei verbundenem Lager), ohne Auswahl: Bestehende Spulen bekommen das aktuelle
  Restgewicht aus der Cloud, neue Spulen werden angelegt, und Spulen, die in der Cloud entfernt wurden, werden als erledigt archiviert.
  Taucht eine Spule wieder auf, wird sie wiederhergestellt. Von Hand archivierte Spulen bleiben unberührt.
- Schutz vor Fehlern: Ist die Liste aus der Cloud leer, unvollständig oder fehlen ungewöhnlich viele Spulen, wird nichts archiviert, und FilaPilot
  weist darauf hin. Bei Spulen aus der Cloud gewinnt die Cloud: Ein von Hand geändertes Restgewicht wird beim nächsten Abgleich überschrieben.
- Der Import mit Auswahl funktioniert bei verbundenem Lager ebenfalls ohne erneutes Anmelden ("Spulen auswählen …").

### Hinweis zum Update
- Neue Datenbank-Tabelle; das Update-Skript gleicht sie automatisch ab. Das gemerkte Zugangs-Token wird mit einem Schlüssel aus `SESSION_SECRET`
  verschlüsselt. Nach einem Umzug mit anderem `SESSION_SECRET` gilt das Lager als nicht verbunden, und du meldest dich einmal neu an.

## [0.14.3] - 2026-09-26

### Hinzugefuegt
- Spulen archivieren: Statt eine leere Spule zu löschen, kannst du sie archivieren. Sie verschwindet aus dem Bestand (und aus "Fast leer"),
  ihr Verbrauch bleibt aber in der Statistik. Mit "Archiv anzeigen" siehst du archivierte Spulen, mit "Wiederherstellen" holst du sie zurück.
- FilaPilot hält jetzt jede Änderung des Restgewichts mit Datum fest. Das ist die Grundlage für die geplante Statistik nach Tag, Woche, Monat
  und Jahr. Es zählt ab diesem Update, frühere Verbräuche haben kein Datum.

### Geändert
- Beim Löschen einer Spule weist FilaPilot darauf hin, dass ihr Verbrauch dann aus der Statistik verschwindet, und empfiehlt das Archivieren.

### Hinweis zum Update
- Neue Datenbank-Spalten und -Tabelle; das Update-Skript gleicht sie automatisch ab. Deine Spulen bleiben unverändert.

## [0.14.2] - 2026-09-26

### Behoben
- Import aus der Bambu-Cloud: Nach der Anmeldung mit Passwort erschien die Eingabe des Bestätigungscodes nicht, sondern eine Fehlermeldung,
  obwohl Bambu den Code per E-Mail geschickt hatte. Der Code-Schritt funktioniert jetzt, und es werden keine überflüssigen
  E-Mails mehr ausgelöst: Ein neuer Code wird nur noch auf Wunsch angefordert ("Code senden", höchstens einmal pro Minute).
- Fehlermeldungen beim Import nennen jetzt den Schritt und den HTTP-Status (zum Beispiel "Schritt: Spulenliste, HTTP 400"), damit sich
  Probleme besser eingrenzen lassen.

## [0.14.1] - 2026-09-26

### Behoben
- Nach dem Update auf 0.14.0 konnte die Spulen-Seite mit "Es ist ein unerwarteter Fehler aufgetreten" stehen bleiben, weil der
  Datenbank-Abgleich beim Update nicht durchlief. Mit dieser Version läuft das Update wieder ohne Handarbeit durch.

### Hinweis zum Update
- Wenn du 0.14.0 schon installiert hast: Führe das Update einfach noch einmal aus (Aufgabenplaner → "FilaPilot aktualisieren").
  Der Datenbank-Abgleich holt dabei die fehlende Spalte nach, deine Daten bleiben unverändert.

## [0.14.0] - 2026-09-26

### Hinzugefuegt
- Import aus der Bambu-Cloud: Auf der Spulen-Seite eines Lagers gibt es den Knopf "Aus Bambu-Cloud importieren". Du meldest dich mit
  deinem Bambu-Konto an (bei Bedarf mit dem Code, den Bambu dir per E-Mail schickt), siehst eine Vorschau deiner Spulen aus Bambu
  Studio und wählst, welche du in dieses Lager übernehmen möchtest. Marke, Material, Farbe und Restgewicht werden übernommen.
  Fehlende Hersteller und Materialien legt FilaPilot dabei selbst an.
- Bereits importierte Spulen werden erkannt und nicht doppelt angelegt. Bei einem erneuten Import kannst du das Restgewicht der schon
  importierten Spulen aktualisieren.
- Wenn die automatische Anmeldung nicht klappt, kannst du stattdessen eine gespeicherte Filamentliste (JSON-Datei) verwenden.

### Hinweis zum Update
- Neue Datenbank-Spalte (Bambu-Nummer der Spule); das Update-Skript gleicht sie automatisch ab. Der Import nutzt die inoffizielle
  Schnittstelle von Bambu und ist nicht mit einem echten Konto getestet worden. Passwort und Zugang werden nicht gespeichert und nach
  dem Import verworfen. Die Anmeldung per Authenticator-App wird noch nicht unterstützt.

## [0.13.0] - 2026-09-26

### Hinzugefuegt
- Mehrere Lager: Du kannst mehrere getrennte Filament-Bestände führen, zum Beispiel "Werkstatt" oder "Büro". Jedes Lager
  hat eigene Spulen, eigene Drucker, ein eigenes Dashboard und eine eigene Statistik. Zwischen den Lagern wechselst du oben in
  der Seitenleiste (am Handy in der Kopfzeile). "Alle Lager" zeigt eine Übersicht mit den Zahlen aller Lager im Vergleich.
- Jedes Lager hat Mitglieder mit Rollen: Besitzer verwalten das Lager, die Mitglieder und die Drucker, Bearbeiter pflegen die
  Spulen, Betrachter dürfen nur ansehen. Wer nicht Mitglied ist, sieht das Lager gar nicht.
- Jeder kann unter Einstellungen → Lager ein neues Lager anlegen und frei benennen, es umbenennen und eine Farbe wählen.
- Eine Spule lässt sich in ein anderes Lager verschieben (im Dialog "Spule bearbeiten").
- Ein Lager kann samt Spulen und Druckern gelöscht werden. Zur Bestätigung musst du den Namen des Lagers eintippen.
- Das Änderungsprotokoll zeigt zu jedem Eintrag das Lager und lässt sich danach filtern.

### Geändert
- Drucker gehören jetzt fest zu einem Lager. Sie können von den Besitzern des Lagers angelegt und geändert werden, nicht mehr
  nur von Admins. Der Live-Status eines Druckers geht nur noch an die Mitglieder seines Lagers.
- Neu angelegte Benutzer sehen zunächst kein Lager: Ein Besitzer oder Admin muss sie als Mitglied hinzufügen oder sie legen
  selbst ein Lager an.

### Hinweis zum Update
- Neue Datenbank-Tabellen und -Spalten; das Update-Skript gleicht sie automatisch ab. Beim ersten Start entsteht ein Lager
  "Hauptlager" mit allen bisherigen Spulen und Druckern. Alle bisherigen Benutzer werden dort Mitglied (Admins als Besitzer, alle
  anderen als Bearbeiter), sodass sich zunächst nichts ändert. Ältere Sicherungen lassen sich weiter wiederherstellen.

## [0.12.1] - 2026-09-26

### Behoben
- Die Anmeldung funktionierte nicht, wenn FilaPilot im Heimnetz über eine normale `http://`-Adresse aufgerufen
  wurde (z. B. `http://192.168.1.50:8090`), weil der Browser das Anmelde-Cookie dort nicht speicherte. Über
  `https://` (z. B. mit Reverse-Proxy) hat es schon vorher funktioniert und bleibt unverändert.

### Hinweis zum Update
- Neue Skripte `scripts/init-env.sh` (erzeugt die `.env` mit Zufalls-Schlüsseln und freiem Port) und
  `scripts/set-env.sh` (ändert Adresse oder Port). Neu ist außerdem die Installationsanleitung
  `docs/installation/synology.md`. Für bestehende Installationen ändert sich nichts.

## [0.12.0] - 2026-09-26

### Hinzugefuegt
- Oben rechts gibt es jetzt ein "i"-Symbol. Dort siehst du, was sich in welcher Version geändert hat. Gibt es
  etwas Neues, blinkt das Symbol rot, bis du es einmal angeklickt hast.

## [0.11.0] - 2026-09-25

### Hinzugefuegt
- Zu jeder Spule kannst du jetzt ein Foto speichern, zum Beispiel direkt mit dem Handy aufgenommen. Es wird auf
  der Spulenkarte angezeigt. Das geht nur, wenn ein Admin "Foto-Upload für Spulen erlauben" eingeschaltet hat.
- Spulen, die fast leer sind (weniger als 15 % Rest), sind jetzt mit "Fast leer" gekennzeichnet.
- In der Statistik siehst du den Verbrauch zusätzlich nach Material-Art, zum Beispiel alle PLA-Sorten zusammen.
- Admins können eine heruntergeladene Sicherung wieder hochladen, zum Beispiel beim Umzug auf ein neues Gerät.
- Im Änderungsprotokoll stehen jetzt auch An- und Abmeldungen sowie automatische Vorgänge wie die nächtliche
  Sicherung.

### Sicherheit
- Der Live-Status der Drucker ist jetzt nur noch für angemeldete Benutzer sichtbar.

### Hinweis zum Update
- Die Konfiguration des Frontend-Servers (`nginx.conf`) wurde angepasst, damit Fotos und Sicherungen
  hochgeladen werden können. Steht ein eigener Reverse-Proxy davor, muss dort ebenfalls eine größere
  Upload-Grenze erlaubt sein (Fotos bis 6 MB, Sicherungen bis 2 GB).

## [0.10.0] - 2026-09-24

### Hinzugefuegt
- Admins können einstellen, wie lange das Änderungsprotokoll aufbewahrt wird (Einstellungen → System → Allgemein,
  Standard 12 Monate, 0 = für immer). Ältere Einträge werden nachts automatisch gelöscht.

### Hinweis zum Update
- Neue Datenbank-Spalte; das Update-Skript gleicht sie automatisch ab. Bestehende Installationen bekommen den
  Standard von 12 Monaten - ältere Einträge werden nach dem nächsten nächtlichen Lauf entfernt, wenn du den Wert
  nicht erhöhst oder auf 0 setzt.

## [0.9.0] - 2026-09-24

### Hinzugefuegt
- Neues Änderungsprotokoll (Einstellungen → Protokoll, nur für Admins): Wer hat wann was angelegt, geändert
  oder gelöscht? Mit Suche und Filtern nach Zeitraum, Bereich, Aktion und Benutzer. Passwörter und
  Zugangscodes werden nie protokolliert.
- Die Benutzerliste zeigt jetzt auch, wann jemand zuletzt aktiv war.

### Hinweis zum Update
- Neue Datenbank-Tabelle und -Spalte; das Update-Skript gleicht sie automatisch ab. Das Protokoll beginnt beim
  Update, frühere Änderungen sind nicht nachträglich erfasst.

## [0.8.0] - 2026-09-24

### Hinzugefuegt
- Alte Sicherungen werden automatisch gelöscht. Wie viele behalten werden (Standard 14), stellen Admins unter
  Einstellungen → System ein.
- Eine Sicherung lässt sich auf den eigenen Rechner herunterladen.
- Die Benutzerliste zeigt, wann ein Konto erstellt wurde und wann sich der Benutzer zuletzt angemeldet hat.

### Hinweis zum Update
- Zwei neue Datenbank-Spalten; das Update-Skript gleicht sie automatisch ab.

## [0.7.0] - 2026-09-24

### Hinzugefuegt
- Übersicht aller vorhandenen Sicherungen mit Datum, Inhalt und Größe (Einstellungen → System).
- Eine Sicherung kann wiederhergestellt werden (nur Admins, mit Bestätigungswort). Vorher wird der aktuelle
  Stand automatisch gesichert, und bei einem Fehler bleibt alles unverändert. Auch Fotos werden zurückgesetzt.
  So ist der Umzug auf ein neues Gerät möglich.

### Behoben
- Nach einem Umzug führte das gespeicherte E-Mail-Passwort zu Fehlern beim Anlegen von Benutzern. Jetzt gibt es
  keinen Fehler mehr, du gibst das E-Mail-Passwort einfach einmal neu ein.

## [0.6.0] - 2026-09-24

### Hinzugefuegt
- Ansicht für das Smartphone, auch als installierte App: Die Navigation ist unten am Bildschirm, Karten und
  Dialoge passen sich der Größe an, und Abmelden findest du unter Einstellungen → Mein Konto.

## [0.5.0] - 2026-09-23

### Hinzugefuegt
- Einrichtungsbildschirm: Beim ersten Start legst du den ersten Administrator direkt im Browser an, mit
  eigenem Passwort.

## [0.4.0] - 2026-09-23

### Hinzugefuegt
- Admins können Benutzer bearbeiten, löschen und ihr Passwort zurücksetzen. Der letzte Admin und das eigene
  Konto sind dabei geschützt.
- Ein Knopf sendet eine Test-E-Mail und zeigt bei Problemen die genaue Fehlermeldung des Mailservers.

## [0.3.2] - 2026-09-23

### Geändert
- Die Einstellungen sind in Reiter aufgeteilt: Mein Konto, Benutzer, Filamente und System. Normale Benutzer
  sehen nur "Mein Konto".
- Überall heißt es jetzt "Benutzer" statt "Nutzer".

### Behoben
- Der Knopf "Aktualisieren" im Update-Hinweis lädt jetzt zuverlässig die neue Version. Der Hinweis erscheint
  unten rechts und verdeckt die Kopfzeile nicht mehr.

## [0.3.1] - 2026-09-23

### Behoben
- Wenn die Datenbank kurz nicht antwortete, fiel die ganze App aus. Jetzt erscheint stattdessen eine
  Fehlermeldung, und die App läuft weiter.

### Hinweis zum Update
- Hinter dem Reverse-Proxy wird die echte Adresse des Besuchers für die Begrenzung der Anmeldeversuche
  verwendet (Einstellung `TRUST_PROXY_HOPS`, Standard 2).

## [0.3.0] - 2026-09-23

### Hinzugefuegt
- Du wählst zuerst den Hersteller und dann das Material. Zur Auswahl stehen nur passende Materialien. Rund
  70 Materialien mit Richttemperaturen sind schon vorbefüllt.
- Die Temperaturen (Düse und Bett) werden im Spulen-Dialog und auf den Spulenkarten angezeigt.
- Admins können Hersteller und Materialien in den Einstellungen anlegen, ändern und löschen. Löschen geht
  nicht, solange Spulen den Eintrag noch nutzen.
- Bei den E-Mail-Einstellungen wählst du die Verschlüsselung jetzt aus einer Liste (STARTTLS Port 587 oder SSL
  Port 465).

### Behoben
- Wenn der E-Mail-Versand fehlschlägt, wird der Benutzer trotzdem angelegt, und das Startpasswort wird
  angezeigt.

### Hinweis zum Update
- Das Datenbank-Schema ändert sich (ein Material bekommt einen optionalen Hersteller); das Update-Skript
  gleicht es automatisch ab.

## [0.2.3] - 2026-09-23

### Hinzugefuegt
- Steht eine neue Version bereit, erscheint ein Hinweis mit dem Knopf "Aktualisieren". Strg+F5 ist nicht mehr
  nötig. Geprüft wird beim Öffnen, beim Zurückkehren zum Tab und alle 15 Minuten.

## [0.2.2] - 2026-09-23

### Geändert
- Alle Auswahllisten sind jetzt alphabetisch sortiert.
- Beim Anmelden und beim Zurücksetzen des Passworts spielt die Groß- und Kleinschreibung von Benutzername und
  E-Mail-Adresse keine Rolle mehr. Doppelte Benutzer in anderer Schreibweise werden abgelehnt.

## [0.2.1] - 2026-09-23

### Behoben
- Knöpfe und Auswahlfelder zeigen jetzt die Hand als Mauszeiger.

### Hinweis zum Update
- Das Update-Skript setzt `git safe.directory` automatisch und gleicht das Datenbank-Schema bei Updates
  automatisch ab (`prisma db push`).

## [0.2.0] - 2026-09-22

### Hinzugefuegt
- Zu jeder Spule gibt es ein druckbares QR-Label mit Material, Farbe und Hersteller (Aktion "QR-Label" auf der
  Spulen-Seite).
- Neue Statistik-Seite: Spulen gesamt, verbrauchtes Filament, Restbestand und Spulen mit niedrigem Bestand,
  dazu der Verbrauch nach Material und nach Hersteller.

## [0.1.0] - 2026-09-22

### Hinzugefuegt
- Passwort vergessen: Per E-Mail kommt ein Link, der nur kurze Zeit gültig ist.
- Jeder Benutzer kann in Mein Konto seine eigene Akzentfarbe wählen und wieder zurücksetzen.
- Einstellungen für Admins: Foto-Upload, Abfrage-Intervall der Drucker, Sicherung, E-Mail-Server und
  Benutzerverwaltung.
- Jede Nacht wird automatisch eine Sicherung angelegt.
- Drucker-Verwaltung für Bambu Lab: Live-Status, Einrichtungsanleitung zum Aufklappen. Der Zugangscode des
  Druckers wird nie angezeigt.

### Behoben
- Sicherungen schlugen mit einer Fehlermeldung fehl. Jetzt funktionieren sie.
- Das Zurücksetzen des Passworts ließ sich ohne E-Mail-Server nicht abschließen. Jetzt steht der Link dann im
  Protokoll des Servers.
- Nicht erreichbare Drucker blockierten den Verbindungsaufbau lange. Jetzt kommt schnell eine Fehlermeldung.
- Die Spulen-Seite blieb bei einem Ladefehler bei "Lädt…" hängen. Jetzt erscheint eine Fehlermeldung mit dem
  Knopf "Wiederholen".

## [0.0.2] - 2026-09-21

### Hinzugefuegt
- Hersteller wählst du jetzt aus einer Liste bekannter Hersteller statt sie einzutippen. Die Liste lässt sich
  in den Einstellungen pflegen.
- Die Versionsnummer steht oben rechts in der App.
- Die App hat jetzt ein eigenes Symbol (Spule) im Browser und auf dem Startbildschirm.

### Hinweis zum Update
- Behoben: Der Produktions-Docker-Build (fehlendes `.dockerignore`, ungebautes `shared`-Paket). Für generierte
  Secrets `openssl rand -hex` statt `-base64` verwenden (Base64 kann `/` enthalten und die Datenbank-Adresse
  ungültig machen).

## [0.0.1] - 2026-09-20

### Hinzugefuegt
- Erste Version: Anmeldung mit erzwungenem Passwortwechsel beim ersten Login sowie Spulen anlegen, ändern und
  löschen.
