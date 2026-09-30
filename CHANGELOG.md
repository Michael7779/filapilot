# Changelog

Alle nennenswerten Aenderungen an FilaPilot werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach SemVer.

Schreibregel: Die Punkte unter "Hinzugefuegt", "Geändert", "Behoben" und "Sicherheit" erscheinen in der App
(Änderungsverlauf) und sind in einfacher Sprache aus Sicht der Benutzer geschrieben - ohne Fachbegriffe.
Technisches für Admins (Datenbank, Skripte, Einstellungen des Servers) steht unter "Hinweis zum Update" und
erscheint nicht in der App.

## [0.22.7] - 2026-09-30

### Hinzugefuegt
- Dashboard: neuer Bereich "Braucht Aufmerksamkeit" zeigt fehlgeschlagene Drucke, nicht verbundene Drucker und fast leere Spulen auf einen Blick, jeweils anklickbar zur passenden Seite.
- Dashboard: Verbrauchs-Diagramm (wie auf der Statistik-Seite) und neue Übersicht "Restbestand nach Material-Typ".

### Geändert
- Spulen-Suche und -Filter vertauscht: Die Filter sind jetzt dauerhaft sichtbar, die manuelle Suche lässt sich stattdessen auf- und zuklappen.

## [0.22.6] - 2026-09-29

### Behoben
- Die Titelzeile oben zeigte auf der Wunschlisten-Seite fälschlich "Dashboard" statt "Wunschliste".
- Die Listenansicht der Spulen konnte bei schmaleren Fenstern (z. B. 1024 px) die ganze Seite statt nur die Tabelle selbst zum seitlichen Scrollen bringen.

## [0.22.5] - 2026-09-29

### Sicherheit
- Beim Erstellen einer Sicherung wurden Befehle an das Betriebssystem seit jeher über eine Shell zusammengebaut; ein bösartiger oder gekaperter Admin-Zugang hätte darüber eigene Befehle auf dem Server einschleusen können. Läuft jetzt ohne Shell, kann also nicht mehr missbraucht werden.

### Hinweis zum Update
- Kleinere Abhängigkeiten aktualisiert (prettier, socket.io, socket.io-client, supertest, typescript-eslint) - rein technisch, kein sichtbarer Effekt.
- Eine falsch geschriebene Abschnitts-Überschrift ("Hinzugefügt" mit Umlaut statt "Hinzugefuegt") in der 0.22.3-Zeile dieser Datei behoben - dadurch wäre 0.22.3 im Änderungsverlauf der App unsichtbar geblieben.

## [0.22.4] - 2026-09-29

### Geändert
- Der Restgewicht-Prozentwert wird jetzt in allen vier Ansichten (Standard, Kompakt, Liste, Farbkacheln) angezeigt, nicht nur in zweien.
- Der Filter "Restgewicht in %" nutzt jetzt gleichmäßige 10-%-Schritte (10 bis 90) statt unregelmäßiger Stufen.
- Bessere Lesbarkeit von grauem Hinweistext (z. B. Hersteller, Hex-Codes) durch dunkleren Kontrast.
- Die Hersteller-/Material-Liste in den Einstellungen richtet "Bearbeiten/Löschen" jetzt rechtsbündig aus, statt direkt am Namen zu kleben.
- Kurze Zahlenfelder in den System-Einstellungen sind nicht mehr unnötig breit gestreckt.
- Das Drei-Punkte-Menü einer Spule hat jetzt eine etwas größere Klickfläche.
- Dialoge auf dem Smartphone verdunkeln den Hintergrund (inkl. der unteren Navigationsleiste) jetzt deutlicher.

### Behoben
- Auf dem Smartphone wurden die Menüpunkte "Wunschliste" und "Einstellungen" unten abgeschnitten ("Wunschli…") statt vollständig angezeigt.
- Die Überschrift "Filament-Bestand" quetschte sich auf dem Smartphone neben die Buttons und brach mitten im Wort um.

## [0.22.3] - 2026-09-29

### Hinzugefuegt
- Neuer Filter "Restgewicht in %": zeigt nur Spulen mit höchstens der ausgewählten Prozentzahl vom Ursprungsgewicht (10/15/20/25/30/50/75 %).

### Geändert
- Die Standardansicht zeigt jetzt wie die Listenansicht den Restgewicht-Prozentwert direkt neben der Gramm-Angabe.

## [0.22.2] - 2026-09-29

### Hinweis zum Update
- `scripts/update-synology.sh` gegen einen seltenen Sonderfall abgesichert: Das Skript aktualisiert sich selbst per `git pull`, während es noch läuft. Der eigentliche Ablauf (bauen, Datenbank abgleichen, neu starten) steckt jetzt in einer Funktion, die vor dem `git pull` vollständig eingelesen wird - dadurch läuft immer konsistent eine Version durch, nie eine Mischung aus alt und neu. Kein Eingriff nötig, betrifft nur das Update-Skript selbst.

## [0.22.1] - 2026-09-29

### Behoben
- Der Server startete seit 0.22.0 nicht mehr (Absturz direkt beim Start), weil eine für den Sicherungs-Versions-Hinweis benötigte Datei im fertig gebauten Programm fehlte. Betroffene Installationen kamen dadurch komplett nicht mehr hoch (auch Anmeldung und E-Mail-Versand liefen nicht).

### Hinweis zum Update
- Fehler im Produktions-Docker-Image von 0.22.0 (`packages/backend/Dockerfile` kopierte die Root-`package.json` nicht in den finalen Image-Stand, obwohl `lib/appVersion.ts` sie zur Laufzeit liest - `ENOENT: /app/package.json`, Absturzschleife). Betrifft nur Installationen, die 0.22.0 bereits gebaut haben; Neubauen mit diesem Stand behebt es. Vor dem Update-Skript geprüft: `docker compose exec -T backend node_modules/.bin/prisma db push` ist weiterhin sicher und idempotent auszuführen.

## [0.22.0] - 2026-09-28

### Hinzugefuegt
- Neu angelegte Spulen gelten jetzt standardmäßig als "ungeöffnet", bis sie tatsächlich benutzt werden (erste Restgewicht-Änderung, Wiegen, Druck oder AMS-Zuordnung) – oder man markiert eine Spule von Hand als geöffnet. Beim Anlegen lässt sich das mit "Diese Spule ist schon angebrochen" übersteuern.
- Der Filament-Bestand zeigt "Ungeöffnet" und "Angefangen" jetzt als zwei getrennte Abschnitte mit Anzahl und Gesamtgewicht, dazu einen neuen Filter "Nur ungeöffnete" und eine Kachel auf Dashboard und Statistik.
- Beim Import aus der Bambu-Cloud erkennt die Vorschau jetzt, wenn eine "neue" Spule vermutlich schon als ungeöffnete Spule im eigenen Bestand liegt, und schlägt vor, sie zu verknüpfen statt doppelt anzulegen. Beim automatischen Bambu-Abgleich und beim Spoolman-Import passiert das bei einem eindeutigen Treffer automatisch, damit der Bestand nicht doppelt gezählt wird.
- Statistik: Der Verbrauch lässt sich jetzt zusätzlich nach Drucker aufschlüsseln, mit dem gleich langen Zeitraum davor vergleichen und als CSV-Datei exportieren.
- Sicherungen merken sich jetzt, mit welcher FilaPilot-Version sie erstellt wurden. Beim Wiederherstellen einer Sicherung aus einer anderen Version erscheint dafür ein Hinweis (nicht blockierend).

### Hinweis zum Update
- Neue Datenbank-Spalten (`Spool.openedAt`, `Settings.openedAtBackfilled`); das Update-Skript gleicht sie automatisch ab. Beim ersten Start nach dem Update markiert ein einmaliger, automatischer Nachtrag alle bestehenden Spulen anhand ihres Anlage-Datums als "geöffnet" (sonst würden sie in der neuen Ansicht fälschlich als frischer, ungeöffneter Bestand erscheinen).

## [0.21.3] - 2026-09-28

### Hinzugefuegt
- Zusatzfelder können jetzt als Pflichtfeld markiert werden – eine Spule lässt sich dann ohne einen Wert dafür nicht mehr anlegen oder ändern.
- Wunschliste: Die Auswahl aus den Hersteller-/Material-Dropdowns wird jetzt als echter Verweis gespeichert (nicht nur als Text) und in der Liste angezeigt.
- Lager-Besitzer können jetzt einen "Verlauf"-Knopf für ihr eigenes Lager öffnen und sehen darin alles, was in ihrem Lager passiert ist – bisher war das nur Admins vorbehalten.

### Behoben
- Ein Server-Neustart mitten in einem laufenden Druck ließ den automatischen Verbrauch für genau diesen Auftrag verloren gehen. Der Zwischenstand wird jetzt zusätzlich gespeichert und übersteht einen Neustart.

## [0.21.2] - 2026-09-27

### Hinzugefuegt
- Leergewicht und Wiegen: Bei jeder Spule lässt sich das Leergewicht der leeren Spule hinterlegen. Die neue Aktion "Wiegen" fragt danach nur noch das auf der Waage abgelesene Gesamtgewicht ab und errechnet das Restgewicht selbst.
- Import aus Spoolman: Neue Aktion "Aus Spoolman importieren" auf der Spulen-Seite – lädt den Export der eigenen Spoolman-Instanz als Datei, legt fehlende Hersteller/Materialien an und erkennt bereits importierte Spulen wieder.
- Der mitgelieferte Hersteller-/Material-Katalog wurde deutlich erweitert (10 neue Hersteller, rund 20 weitere Materialien).
- Material kann jetzt statt einer einzelnen Betttemperatur auch einen Bereich hinterlegen (z.B. "60–80 °C").
- Wunschliste: Neuer Knopf "Erledigte entfernen" räumt alle erledigten Einträge auf einmal auf.
- Einstellungen → Allgemein: Die Dauer, für die eine Anmeldung gültig bleibt, ist jetzt einstellbar (7–90 Tage, Standard weiterhin 30).

### Behoben
- Welche Version des Änderungsverlaufs man schon gesehen hat, wird jetzt im eigenen Konto gemerkt statt nur im Browser – der Hinweis-Knopf blinkt also nicht mehr auf jedem neuen Gerät erneut.
- Löscht ein Admin ein Zusatzfeld, werden vorhandene Werte dieses Feldes jetzt aus allen Spulen entfernt, statt unsichtbar gespeichert zu bleiben.
- Löschen einer Spule, die noch einem Drucker-AMS-Fach zugeordnet ist, schlug fehl. Das Fach wird jetzt automatisch leer, statt das Löschen zu verhindern.

## [0.21.1] - 2026-09-27

### Behoben
- Auf dem Handy überlappten sich in der Wunschliste die Beschriftungen "Hersteller" und "Material" beim Formular unlesbar. Das Formular ordnet die Felder auf schmalen Bildschirmen jetzt in zwei Spalten an.
- Die Spulen-Liste zeigte je Spule eine unübersichtliche Reihe einzelner Text-Links (Bearbeiten, Archivieren, QR-Label, Verlauf, Trocknen protokollieren, Zur Wunschliste, Löschen), die auf dem Handy und in der Listenansicht über mehrere Zeilen umbrach. Alle Ansichten zeigen die Aktionen jetzt einheitlich über ein Drei-Punkte-Menü.

### Geändert
- Die Filter der Spulen-Seite (Hersteller, Material, Farbe, Lagerort, Restgewicht, Kaufpreis, Sortierung) sind jetzt hinter einem "Filter"-Knopf eingeklappt, statt permanent fast die halbe Seite einzunehmen. Die Suche bleibt immer sichtbar.

## [0.21.0] - 2026-09-27

### Hinzugefuegt
- Trocknungs-Protokoll: Bei jeder Spule gibt es jetzt die Aktion "Trocknen protokollieren" (Temperatur, Dauer, optionale Notiz, z.B. für PETG, Nylon oder TPU). Der Eintrag erscheint zusammen mit den anderen Ereignissen im Verlauf der Spule.

## [0.20.1] - 2026-09-27

### Behoben
- Der Verlauf einer Spule zeigte bisher nichts an, wenn sie aus der Bambu-Cloud importiert oder durch den Cloud-Abgleich geändert wurde (nur ein Sammel-Eintrag am Lager wurde geschrieben). Jetzt bekommt jede Spule dafür einen eigenen Eintrag: Anlegen, Restgewicht-Änderung sowie Archivieren/Wiederherstellen durch den Abgleich. Ein Abgleich ohne echte Änderung erzeugt weiterhin keinen Eintrag.
- Die Einträge im Verlauf einer Spule zeigten nur Beschreibung, Datum und Person - nicht, was sich geändert hat. Jetzt steht dabei, ob angelegt/geändert/ein Ereignis war, und bei Änderungen direkt "vorher → nachher" (z.B. Restgewicht).

### Geändert
- Beim Bambu-Cloud-Import ist "Verbindung für dieses Lager merken" jetzt standardmäßig angehakt (Besitzer können den Haken weiterhin entfernen).

## [0.20.0] - 2026-09-27

### Behoben
- Der CSV-/Excel-Export öffnete sich beim Anklicken als leere Seite statt als Download. Grund: Die App merkt sich Seiten zum Offline-Nutzen (PWA) und hat den Export-Link fälschlich dafür gehalten. Der Download läuft jetzt anders (im Hintergrund geladen, dann gespeichert) und lässt sich davon nicht mehr stören.

### Hinzugefuegt
- Echter Excel-Export (.xlsx) zusätzlich zu CSV und JSON – Zahlen und Daten bleiben in Excel Zahl und Datum, nicht nur Text.
- Beim Hinzufügen zur Wunschliste lassen sich Hersteller und Material jetzt wie beim Anlegen einer Spule aus einer Liste auswählen, statt nur Freitext einzutippen.
- Neue Aktion "Zur Wunschliste" bei jeder Spule: legt mit einem Klick einen Wunsch mit Hersteller, Material und Farbe der Spule an – praktisch zum Nachbestellen.

### Hinweis zum Update
- Neue Abhängigkeit `exceljs` für den Excel-Export (kein Bordmittel kann eine echte .xlsx-Datei ohne Fremdbibliothek erzeugen); wird beim Update automatisch mitinstalliert.

## [0.19.0] - 2026-09-27

### Hinzugefuegt
- Wunschliste (neuer Menüpunkt): eine Liste für die ganze Installation, gedacht für eine Sammelbestellung. Jeder sieht, wer was hinzugefügt hat und wann. Titel, Notiz und Menge ändern oder löschen darf nur, wer den Eintrag angelegt hat, oder ein Admin – den Status (offen/bestellt/erledigt) darf aber jeder setzen, damit alle mitwirken können.
- Zusatzfelder: Unter Einstellungen → Filamente lassen sich frei eigene Felder anlegen (z.B. "Charge", "Bewertung", Text/Zahl/Datum/Ja-Nein). Sie erscheinen dann im Formular jeder Spule.
- Zweifarbiges Filament: Beim Anlegen einer Spule lässt sich eine zweite Farbe angeben, die Farbanzeige zeigt dann beide Farben.
- Filament-Durchmesser: Materialien können auf 2,85mm gestellt werden (Standard weiter 1,75mm); die Restlängen-Anzeige rechnet damit.
- Notiz pro Spule (z.B. Eindruck beim Drucken) und ein "Verlauf"-Knopf, der das Änderungsprotokoll genau dieser Spule zeigt.
- Export des Filament-Bestands als CSV oder JSON-Datei (Links auf der Spulen-Seite), inklusive Restlänge.

### Behoben
- Der CSV-Export öffnete sich in Excel mit deutscher Spracheinstellung als eine einzige Spalte statt in Spalten aufgeteilt. Er trennt jetzt mit Semikolon statt Komma, wie es deutsches Excel per Doppelklick erwartet.

## [0.18.0] - 2026-09-27

### Hinzugefuegt
- Materialien haben jetzt eine Dichte (g/cm³) - für die mitgelieferten Materialien bereits mit typischen Werten befüllt (z.B. PLA 1,24, PETG 1,27, ABS 1,04). Unter Einstellungen → Stammdaten lässt sie sich pro Material eintragen oder anpassen.
- Die Listenansicht der Spulen zeigt jetzt eine ungefähre Restlänge in Metern (aus Restgewicht und Dichte, Standard-Durchmesser 1,75mm) - eine Näherung, keine Messung. Ohne bekannte Dichte des Materials erscheint ein Strich.

### Behoben
- Der Änderungsverlauf in der App ("i"-Knopf) zeigte die Versionen 0.15.0 bis 0.17.0 nicht oder nur unvollständig, weil die Überschrift "Hinzugefügt" (mit Umlaut) in diesem Dokument nicht zur erwarteten Schreibweise passte. Alle drei Versionen sind jetzt vollständig sichtbar; die genannten Funktionen selbst waren davon nicht betroffen.

## [0.17.0] - 2026-09-27

### Hinzugefuegt
- Automatischer Verbrauch pro Druck: In den Drucker-Einstellungen ordnest du jedem AMS-Slot (und der extern eingelegten Spule) eine Spule aus FilaPilot zu. Beginnt und endet ein Druck, bucht FilaPilot automatisch den Verbrauch anhand des AMS-Füllstands, legt einen Druckauftrag mit Gewicht und Kosten an und aktualisiert das Restgewicht. Fehlgeschlagene Drucke werden als solche markiert, der Verbrauch aber trotzdem gebucht.
- Statistik-Seite zeigt "Letzte Druckaufträge" mit Drucker, Spule, Gewicht, Kosten und Datum.
- Bekannte Einschränkung: Die AMS-Feldnamen im Drucker-Status stammen aus öffentlich bekannter Dokumentation, nicht von einem echten Drucker verifiziert; der AMS-Füllstand in Prozent bezieht sich auf das Gewicht, das der Drucker kennt (nicht zwingend das in FilaPilot hinterlegte Ursprungsgewicht) - die Gramm-Angabe ist eine Näherung; ein Serverneustart während eines laufenden Drucks verliert die Erkennung für diesen einen Auftrag.

## [0.16.0] - 2026-09-27

### Hinzugefuegt
- Vier Ansichten der Spulenliste: Standard, Kompakt (kleine Kacheln, Aktionen im Menü), Liste (Tabelle mit allen Angaben: Farbe mit Farbcode, Hersteller, Material, Düsen- und Betttemperatur, Restgewicht, Lagerort, Preis, Kaufdatum, Hinzugefügt-Datum, Status) und Farbkacheln. Die zuletzt gewählte Ansicht wird pro Konto gespeichert und beim nächsten Öffnen (auch auf einem anderen Gerät) wieder angezeigt. Auf schmalen Handys startet neuen Konten die Kompakt-Ansicht.
- Die Zahl der Spulen pro Seite ist einstellbar (12, 24, 48, 96 oder alle) und wird ebenfalls im Konto gemerkt; darunter gibt es Zurück/Weiter.
- Auf der Spulen-Seite steht bei verbundenen Lagern, wann zuletzt aus der Bambu-Cloud aktualisiert wurde (Datum, Uhrzeit, automatisch oder von Hand), ob die automatische Aktualisierung an ist und, falls der letzte Versuch fehlschlug, warum.
- Automatischer Abgleich mit der Bambu-Cloud für alle Lager mit gemerkter Verbindung. Das Intervall stellt der Admin unter Einstellungen → Allgemein ein (aus, oder alle 1, 3, 6, 12 oder 24 Stunden). Ein Fehler wird vermerkt und nicht sofort wiederholt; ein abgelaufenes Token trennt die Verbindung wie beim manuellen Abgleich.

## [0.15.0] - 2026-09-26

### Hinzugefuegt
- Spulen durchsuchen und filtern: Suchfeld (Hersteller, Material, Farbe, Lagerort) sowie Filter nach Hersteller, Material, Farbe, Lagerort, Restgewicht (von/bis), Kaufpreis (von/bis) und "Nur fast leere". Die Liste lässt sich nach Material und Farbe, Hersteller, Restgewicht, Kaufpreis oder zuletzt hinzugefügt sortieren.
- Anzahlen: Über der Liste steht, wie viele Spulen erfasst sind ("5 von 12 Spulen", bei Bedarf mit Anzahl der archivierten) und das gesamte Restgewicht der angezeigten Spulen.
- Einstellungen → Lager → "Spulen verschieben": alle Spulen eines Lagers (auch archivierte) samt Verbrauchsverlauf in ein anderes Lager verschieben. Dafür braucht man Besitzer-Rechte im Quell-Lager und Bearbeiten-Rechte im Ziel-Lager.

### Behoben
- Wird eine einzelne Spule in ein anderes Lager verschoben, zieht ihr Verbrauchsverlauf jetzt mit um, sodass die Statistik beider Lager stimmt.

## [0.14.6] - 2026-09-26

### Behoben
- Bambu-Import: Ist "Restgewicht bereits importierter Spulen aktualisieren" angehakt, werden alle bereits importierten Spulen aktualisiert, auch wenn keine neue Spule ausgewählt ist. Vorher blieb der Button bei "0 importieren" gesperrt.

## [0.14.5] - 2026-09-26

### Hinzugefuegt
- Statistik nach Zeit: Auf der Statistik-Seite zeigt ein Diagramm den Verbrauch pro Tag, Woche, Monat oder Jahr (umschaltbar), dazu den Verbrauch
  im Zeitraum, die Kosten (aus dem Kaufpreis der Spulen) und die Aufteilung nach Material-Typ und Hersteller. Es gilt für das gewählte Lager
  oder für "Alle Lager". Archivierte Spulen zählen mit.
- Der Verbrauch wird seit dem Update auf 0.14.3 mit Datum erfasst. Früherer Verbrauch hat kein Datum und steht weiter nur in den Gesamtwerten.
  Als Tag zählt der Tag, an dem das Gewicht geändert oder mit der Cloud abgeglichen wurde, nicht der Tag des Drucks.

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
