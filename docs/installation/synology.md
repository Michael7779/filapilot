---
title: Installationsanleitung für Synology DiskStation
description: FilaPilot Schritt für Schritt auf einer Synology-NAS installieren, aktuell halten und von unterwegs erreichbar machen.
---

# Installationsanleitung für Synology DiskStation

FilaPilot ist eine selbst gehostete Filament-Verwaltung für 3D-Drucker. Jede Installation ist eine eigene,
unabhängige Instanz auf deiner eigenen NAS — deine Daten verlassen dein Zuhause nicht. Diese Anleitung führt dich
Schritt für Schritt von der leeren DiskStation bis zur fertigen App. Du brauchst dafür keine Programmierkenntnisse:
Alles passiert über die Oberfläche von DSM (Paketzentrum, Aufgabenplaner, Container Manager).

## So läuft deine Installation ab

Vier Stationen bringen dich zur fertigen App:

1. **Grundinstallation** (Teil A–E) — Pakete installieren, App-Dateien von GitHub laden, Konfiguration erzeugen,
   Container bauen lassen und den ersten Administrator anlegen. Danach ist FilaPilot in deinem WLAN nutzbar.
2. **Updates einrichten** — Eine Aufgabe im Aufgabenplaner holt neue Versionen automatisch. Deine Daten bleiben dabei
   unberührt.
3. **Externer Zugriff** (Teil F, *optional*) — Nur nötig, wenn du auch unterwegs auf FilaPilot zugreifen willst:
   eigene Adresse (DDNS), Zertifikat, Reverse-Proxy und Portfreigabe im Router.
4. **Feinschliff** — E-Mail-Versand einrichten und Sicherungen verstehen.

## Das brauchst du

- Eine Synology-DiskStation mit **DSM 7** (mit Container-Unterstützung) und ein Administrator-Konto
- Einen Computer im selben Netzwerk wie die NAS, mit Internetzugang

> **Hinweis zur Bezeichnung „docker“-Ordner**
>
> Sobald du den Container Manager installierst, legt Synology automatisch einen gemeinsamen Ordner namens `docker` an.
> In dieser Anleitung liegt FilaPilot in `/volume1/docker/filapilot`. Heißt dein Volume nicht `volume1`, ersetze das
> in allen Skripten unten durch deinen Volume-Namen.

---

## Teil A: Benötigte Pakete installieren

### Paketzentrum öffnen

Im Browser die Adresse deiner DiskStation öffnen und mit dem Administrator-Konto anmelden. Auf dem Desktop oder über
das Menü oben links das **Paketzentrum** öffnen.

### „Container Manager“, „Git Server“ und „Text-Editor“ installieren

In die Suchleiste nacheinander **Container Manager**, **Git Server** und **Text-Editor** eingeben (alle von
Synology Inc.), jeweils auf **Installieren** klicken. Steht dort schon **Öffnen**, ist das Paket vorhanden.

- Der **Container Manager** führt FilaPilot aus.
- **Git Server** bringt das Programm `git` mit — damit lädt die NAS die App-Dateien und spätere Updates von GitHub.
- Der **Text-Editor** braucht die Grundinstallation nicht zwingend, ist aber für spätere Fehlersuche praktisch.

---

## Teil B: App-Dateien von GitHub laden

Die App-Dateien liegen öffentlich auf GitHub, du brauchst dafür kein Konto und keinen Zugangsschlüssel.

### Aufgabe im Aufgabenplaner anlegen

1. **Systemsteuerung → Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript**
2. Reiter **Allgemein:** Name z. B. `FilaPilot laden`, Benutzer **root**.
3. Reiter **Zeitplan:** **Am folgenden Datum ausführen** wählen und bei **Wiederholen** die Option **Nicht
   wiederholen** einstellen. Die Aufgabe startest du gleich von Hand. Sonst würde sie täglich erneut laufen und jedes
   Mal harmlos abbrechen, weil der Ordner dann schon existiert.
4. Reiter **Aufgabeneinstellungen:** Das Skript unten einfügen.
5. **OK** klicken, Hinweise mit **OK** bestätigen, ggf. dein Passwort eingeben und **Senden** klicken.
6. Rechtsklick auf die neue Aufgabe → **Ausführen**, Hinweis mit **OK** bestätigen.

Skript zum Einfügen:

```bash
cd /volume1/docker
git clone https://github.com/Michael7779/filapilot.git filapilot
```

Danach gibt es den Ordner `docker/filapilot` mit allen App-Dateien. Ob es geklappt hat, siehst du in der File
Station: Der Ordner `docker` enthält jetzt einen Ordner `filapilot`.

> **Tipp: Ausgabe der Aufgabe ansehen**
>
> Im Aufgabenplaner die Aufgabe markieren und im Menü **Aktion** (je nach DSM-Version auch per Rechtsklick)
> **Ergebnis anzeigen** wählen. Steht dort ein Fehler, hilft dir der Abschnitt „Häufige Fragen“ am Ende.

---

## Teil C: Die Konfiguration (.env) erzeugen

FilaPilot braucht eine kleine Konfigurationsdatei mit einem zufälligen Datenbank-Passwort und einem geheimen
Sitzungs-Schlüssel. Ein Skript erzeugt sie für dich — du musst nichts eintippen und dir nichts ausdenken. Es sucht
außerdem selbst einen **freien Port** (ab 8090), damit es keinen Konflikt mit deinen anderen Anwendungen gibt.

### Skript per Aufgabenplaner ausführen

Gleicher Weg wie in Teil B: **Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript**, Name z. B.
`FilaPilot konfigurieren`, Benutzer **root**, Zeitplan **Nicht wiederholen**. Das Skript einfügen, speichern und die
Aufgabe einmal von Hand **ausführen**:

```bash
cd /volume1/docker/filapilot
bash scripts/init-env.sh
```

Danach zeigt das Ergebnis der Aufgabe (siehe Tipp oben) zum Beispiel:

```
Fertig: .env wurde angelegt.
FilaPilot ist danach erreichbar unter: http://192.168.1.50:8090
Port: 8090
```

**Merke dir die Adresse und den Port.** Die Passwörter zeigt das Skript bewusst nicht an — sie stehen nur in der Datei
`.env`, die vor anderen Konten geschützt ist.

> **Eigenen Port oder eine feste Adresse verwenden**
>
> Das Skript nimmt optional zwei Angaben: `bash scripts/init-env.sh 8095` verwendet den Port 8095, und
> `bash scripts/init-env.sh 8095 https://filapilot.meinefamilie.synology.me` setzt gleich die Adresse für den
> Zugriff von außen (siehe Teil F). Beides lässt sich später mit `scripts/set-env.sh` ändern.

> **Wichtig: Nicht überschreiben**
>
> Gibt es schon eine `.env` (z. B. von einem früheren Versuch), bricht das Skript ab, ohne etwas zu ändern. Das ist
> Absicht: Mit einer neuen `.env` wäre das Datenbank-Passwort weg und die Datenbank nicht mehr erreichbar. Bei einer
> frischen Installation die alte `.env` einfach über die File Station löschen oder umbenennen und das Skript erneut
> ausführen.

---

## Teil D: Projekt im Container Manager erstellen

### Neues Projekt anlegen

**Container Manager** öffnen → links **Projekt** → **Erstellen**.

- **Projektname:** `filapilot` (nur Kleinbuchstaben, Ziffern, Bindestrich und Unterstrich; nicht mit einem Strich
  beginnen — Leerzeichen und Großbuchstaben werden abgelehnt).
- **Pfad:** den Ordner `docker/filapilot` auswählen (den Teil B angelegt hat).
- Da dort schon eine `docker-compose.yml` liegt, fragt DSM, ob diese Datei verwendet werden soll — die bereits
  ausgewählte Option **Vorhandene docker-compose.yml verwenden** mit **OK** bestätigen, dann **Weiter**.
- **Web-Portal:** Nichts aktivieren, FilaPilot braucht Web Station nicht. **Weiter**.
- Auf der Seite **Fertigstellen** die Angaben prüfen, den Haken bei **Das Projekt starten, nachdem es erstellt
  wurde** gesetzt lassen und **Fertig** klicken.

### Bauen lassen und warten

Jetzt startet der Bauvorgang und zeigt ein Fenster mit dem Bauprotokoll. Das dauert beim allerersten Mal **5–15
Minuten** (je nach NAS-Modell).

> **Jetzt warten, nicht schließen!**
>
> Das Protokoll läuft die ganze Zeit weiter — auch wenn sich minutenlang nichts zu tun scheint. Erst wenn ganz **unten**
> `Exit Code: 0` steht, ist alles fertig und fehlerfrei durchgelaufen. Schließe das Fenster vorher auf keinen Fall,
> sonst bricht der Bauvorgang ab.

Erst **nach** `Exit Code: 0` das Fenster mit **Schließen** beenden und links auf **Container** klicken. Ein **grüner
Punkt** bei allen drei Bausteinen (Datenbank `postgres`, `backend` und `frontend`) zeigt, dass alles läuft.

Schlägt das Bauen mit „address already in use“ fehl, ist der Port schon vergeben — siehe „Häufige Fragen“.

### Das Datenbank-Schema anlegen

Beim allerersten Start muss einmal die Datenbank-Struktur angelegt werden. Lege dafür wie in Teil B eine Aufgabe
`FilaPilot Datenbank anlegen` an (Benutzer **root**, **Nicht wiederholen**), füge dieses Skript ein und führe sie
einmal aus:

```bash
cd /volume1/docker/filapilot
docker compose exec -T backend node_modules/.bin/prisma db push --schema=prisma/schema.prisma
```

Im Ergebnis sollte am Ende `Your database is now in sync with your Prisma schema` stehen. Diese Aufgabe brauchst du
danach nie wieder — spätere Updates erledigen das automatisch (siehe „Updates einrichten“). Du kannst sie löschen.

---

## Teil E: FilaPilot öffnen und einrichten

### Adresse im Browser öffnen

Im WLAN reicht eine normale `http://`-Adresse, ein Zertifikat brauchst du dafür nicht. Auf jedem Gerät im selben WLAN die Adresse aus Teil C öffnen, zum Beispiel `http://192.168.1.50:8090` (mit deiner
NAS-IP und deinem Port). Die IP-Adresse der NAS findest du im DSM unter **Systemsteuerung → Netzwerk →
Netzwerkschnittstelle**.

### Ersten Administrator anlegen

Beim allerersten Aufruf erscheint der **Einrichtungsbildschirm**: Dort legst du den ersten Administrator mit Benutzername,
E-Mail-Adresse und einem **eigenen Passwort** an. Danach ist der Bildschirm dauerhaft gesperrt.

> **Öffne die Seite direkt nach dem Start selbst**
>
> Auf einer frisch installierten Instanz gewinnt, wer den Einrichtungsbildschirm zuerst abschickt. Rufe die Seite also
> sofort nach Teil D selbst auf, bevor du sie jemandem gibst.

Weitere Benutzer legst du als Administrator unter **Einstellungen → Benutzer** an. Sie bekommen ein Startpasswort
(per E-Mail, wenn du den E-Mail-Versand eingerichtet hast, sonst wird es dir angezeigt).

### Als App auf dem Handy installieren (optional)

FilaPilot lässt sich wie eine App installieren: Im Browser des Handys **Zum Startbildschirm hinzufügen** wählen.
Dann startet es ohne Adressleiste und hat ein eigenes Symbol.

---

## Updates einrichten

Neue Versionen erscheinen auf GitHub. Eine Aufgabe im Aufgabenplaner prüft, ob es etwas Neues gibt, lädt es und baut
FilaPilot neu. Dein Datenbestand (Spulen, Fotos, Benutzer) bleibt dabei erhalten.

Lege eine **dritte Aufgabe** an (gleicher Weg wie in Teil B), Name z. B. `FilaPilot aktualisieren`, Benutzer **root**.
Das Skript:

```bash
cd /volume1/docker/filapilot
bash scripts/update-synology.sh
```

Was das Skript tut: Es prüft, ob auf GitHub etwas Neues liegt. Wenn nicht, passiert nichts. Wenn ja, lädt es die
Änderungen, baut die Container neu, startet sie und gleicht die Datenbank-Struktur automatisch ab.

**Zeitplan:** Am besten gleich einen Zeitplan einstellen, z. B. **wöchentlich nachts** (Reiter **Zeitplan** →
**Täglich/Wöchentlich**, Uhrzeit z. B. 03:30). Du kannst die Aufgabe jederzeit auch von Hand starten
(Rechtsklick → **Ausführen**).

**Ob ein Update da ist:** Nach einem Update zeigt die App oben rechts die neue Versionsnummer, und das „i“-Symbol
daneben blinkt rot. Ein Klick darauf zeigt dir, was neu ist.

> **Tipp: Ergebnis per E-Mail**
>
> In den Aufgabeneinstellungen kannst du das Ergebnis der Aufgabe per E-Mail an dich schicken lassen, wenn du in DSM
> einen E-Mail-Versand eingerichtet hast. Dann bekommst du Fehler sofort mit.

> **Wenn ein Update mit einem Datenbank-Fehler abbricht**
>
> Selten braucht eine neue Version eine Änderung an der Datenbank, die das Update-Skript nicht ohne Rückfrage
> durchführt (z. B. eine neue Pflichtspalte bei bestehenden Zeilen). Das Skript bricht dann mit einer klaren Meldung
> ab, statt Daten zu riskieren. In den Hinweisen der jeweiligen Version im Änderungsverlauf bzw. im
> [CHANGELOG](https://github.com/Michael7779/filapilot/blob/main/CHANGELOG.md) steht dann, was zu tun ist.

### Grundinstallation abgeschlossen

FilaPilot ist jetzt in deinem WLAN nutzbar. Für den Zugriff von unterwegs geht es mit Teil F weiter.

---

## Teil F: Optional — Zugriff von unterwegs einrichten

Nur nötig, wenn FilaPilot auch **außerhalb** deines WLANs erreichbar sein soll (z. B. beim Filament-Kauf im Laden
schnell nachsehen, was noch da ist). Dafür braucht deine NAS eine feste Adresse im Internet, ein Sicherheitszertifikat
und eine Weiterleitung im Router. Wer das nicht braucht, ist hier fertig.

> **Warum diese Schritte?**
>
> Ohne feste Adresse (Schritt 1) findet dich niemand von außen. Ohne Zertifikat (Schritt 2) warnt jeder Browser vor der
> Verbindung. Ohne Reverse-Proxy-Regel (Schritt 3–4) weiß die NAS nicht, dass Anfragen an diese Adresse zu FilaPilot
> gehören. Ohne Portfreigabe (Schritt 5) kommt keine Anfrage am Router vorbei. Und ohne Schritt 6 zeigen Links in
> E-Mails (z. B. Passwort zurücksetzen) auf die falsche Adresse.

> **Du hast schon eine Adresse von außen?**
>
> Nutzt du bereits eine eigene DDNS-Adresse für andere Anwendungen (z. B. `meinefamilie.synology.me`)? Dann lege in
> Schritt 1 **keine neue** Adresse an, sondern setze nur einen Namen davor, z. B.
> `filapilot.meinefamilie.synology.me`. Synologys DDNS-Dienst löst das automatisch mit auf. In Schritt 2 legst du
> trotzdem ein **eigenes** Zertifikat für genau diese Adresse an — ein vorhandenes Zertifikat deckt eine neue Subdomain
> nicht automatisch ab.

### Schritt 1: Kostenlose Adresse (DDNS) einrichten

**Systemsteuerung → Externer Zugriff → DDNS → Hinzufügen.** Anbieter **Synology** wählen und einen frei wählbaren
Namen vergeben (z. B. `meinefamilie.synology.me`). Diese Adresse zeigt ab sofort immer auf deine NAS — auch wenn sich
die Internetadresse deines Anschlusses ändert.

**Empfehlung:** Nimm für FilaPilot nicht diese Basis-Adresse, sondern setze einen Namen davor, z. B.
`filapilot.meinefamilie.synology.me`. Ab hier ist mit „(Sub-)Adresse“ immer diese FilaPilot-Adresse gemeint.

### Schritt 2: Kostenloses Zertifikat anlegen

**Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → Neues Zertifikat hinzufügen → Weiter → Zertifikat von
Let's Encrypt abrufen → Weiter.** Als Domainname die (Sub-)Adresse aus Schritt 1 eintragen, eine E-Mail-Adresse für
Verlängerungs-Erinnerungen angeben und das Feld **Betreff Alternativer Name** leer lassen. **Fertig**. Ohne dieses
Zertifikat zeigt jeder Browser eine Warnung vor einer „unsicheren Verbindung“.

### Schritt 3: Reverse-Proxy-Regel anlegen

**Systemsteuerung → Anmeldeportal → Erweitert → Reverse-Proxy → Erstellen.**

| Feld | Wert |
|---|---|
| Beschreibung | `FilaPilot` |
| **Quelle** — Protokoll | HTTPS |
| **Quelle** — Hostname | die (Sub-)Adresse aus Schritt 1, z. B. `filapilot.meinefamilie.synology.me` |
| **Quelle** — Port | **443** (Standard). Ist der schon durch eine andere Anwendung belegt, nimm **9443**. |
| **Ziel** — Protokoll | HTTP |
| **Ziel** — Hostname | `localhost` |
| **Ziel** — Port | dein FilaPilot-Port aus Teil C, z. B. `8090` |

> **Mehrere Anwendungen auf demselben Port**
>
> Der Reverse-Proxy von Synology kann mehrere Anwendungen auf demselben Port betreiben, solange der **Hostname**
> unterschiedlich ist. Für FilaPilot und z. B. eine andere Anwendung reicht also **eine** Portfreigabe im Router.

**WebSocket einrichten (wichtig):** Die Regel danach markieren → **Bearbeiten → Benutzerdefinierte Kopfzeile → Erstellen →
WebSocket**. Das übernimmt zwei Kopfzeilen automatisch. FilaPilot zeigt den Live-Status deiner Drucker über
WebSocket — ohne diesen Schritt bleibt die Anzeige „tot“, bis du die Seite neu lädst.

### Schritt 4: Zertifikat der Regel zuweisen

Die Reverse-Proxy-Regel hat selbst kein Feld für das Zertifikat — die Zuordnung passiert an anderer Stelle:
**Systemsteuerung → Sicherheit → Zertifikat → Einstellungen** (Button oben rechts). Auf dem Reiter **Konfigurieren**
gibt es eine Tabelle mit einer Zeile pro Dienst. In der Zeile mit deiner (Sub-)Adresse (sie erscheint dort
automatisch, sobald die Regel aus Schritt 3 angelegt ist) in der Spalte **Zertifikat** das Zertifikat aus Schritt 2
auswählen → **OK**.

### Schritt 5: Portfreigabe im Router einrichten

Der Router muss Anfragen von außen an die interne IP-Adresse der NAS weiterreichen. Port von außen **und** innen ist
derselbe wie bei „Quelle → Port“ in Schritt 3 (443 oder 9443). Beispiel für eine **FritzBox**:

1. `fritz.box` im Browser öffnen und mit dem FritzBox-Kennwort anmelden.
2. **Internet → Freigaben → Portfreigaben** öffnen.
3. **Gerät für Freigaben hinzufügen** → die Synology-NAS aus der Liste wählen.
4. **Neue Freigabe:** Bezeichnung `FilaPilot`, Protokoll **TCP**, Port von außen und Port zum Gerät jeweils **443**
   (oder 9443).
5. Mit **OK** speichern.

> **Anderer Router?**
>
> Bei Speedport, Vodafone, o2 und vielen weiteren heißt die Funktion meist **Portfreigabe** oder **Port Forwarding**
> und liegt unter **Heimnetz** bzw. **Netzwerk**. Das Prinzip ist überall gleich: den Port (TCP) von außen an die
> interne IP-Adresse der NAS weiterleiten. Im Zweifel hilft eine Suche nach „Portfreigabe“ und dem Modell deines
> Routers.

### Schritt 6: FilaPilot die neue Adresse mitteilen

FilaPilot muss wissen, unter welcher Adresse es von außen erreichbar ist. Diese Adresse steckt in Links in E-Mails
(z. B. Passwort zurücksetzen) und entscheidet, ob die Anmeldung als „nur über HTTPS“ gesichert wird. Trage sie daher
unbedingt ein, sobald du Teil F eingerichtet hast.

Lege wie in Teil B eine Aufgabe `FilaPilot Adresse setzen` an (Benutzer **root**, **Nicht wiederholen**) mit diesem
Skript — ersetze die Adresse durch deine (bei Port 9443 mit `:9443` am Ende, bei 443 ohne Portangabe):

```bash
cd /volume1/docker/filapilot
bash scripts/set-env.sh FRONTEND_ORIGIN https://filapilot.meinefamilie.synology.me
docker compose up -d
```

Aufgabe einmal ausführen. Danach ist FilaPilot unter der neuen Adresse erreichbar, und Links in E-Mails führen dorthin.

> **Hinweis: Anmeldung nach dem Umstellen auf https**
>
> Sobald du eine `https://`-Adresse eingetragen hast, wird die Anmeldung als „nur über HTTPS“ gesichert. Nutze dann
> auch zu Hause die `https://`-Adresse. Über die alte `http://<NAS-IP>:<Port>`-Adresse klappt die Anmeldung dann
> nicht mehr, weil der Browser das gesicherte Cookie dort nicht akzeptiert. Deine Daten sind davon nicht betroffen.

---

## Feinschliff

### E-Mail-Versand einrichten (empfohlen)

Damit FilaPilot Startpasswörter und „Passwort vergessen“-Links per E-Mail verschicken kann, braucht es einen
E-Mail-Server. Trage ihn unter **Einstellungen → System → E-Mail (SMTP)** ein. Beispiele:

| Anbieter | Server | Port | Verschlüsselung |
|---|---|---|---|
| GMX | `mail.gmx.net` | 587 | STARTTLS |
| Apple iCloud | `smtp.mail.me.com` | 587 | STARTTLS |
| Gmail | `smtp.gmail.com` | 587 | STARTTLS (mit App-Passwort) |

Bei iCloud und Gmail brauchst du ein **anwendungsspezifisches Passwort** (in den Konto-Einstellungen des Anbieters
erzeugen), nicht dein normales Passwort. Mit **Test-E-Mail an mich senden** prüfst du, ob alles stimmt — bei einem
Fehler zeigt FilaPilot die genaue Meldung des Mailservers.

Ohne E-Mail-Versand funktioniert FilaPilot trotzdem: Beim Anlegen eines Benutzers siehst du das Startpasswort direkt
auf dem Bildschirm.

### Mehrere Lager (getrennte Bestände)

Ein **Lager** ist ein eigener Filament-Bestand mit eigenen Spulen, Druckern, Dashboard und Statistik, zum Beispiel "Werkstatt" und
"Büro". Nach dem Update auf 0.13.0 gibt es automatisch ein Lager "Hauptlager" mit allen bisherigen Spulen und Druckern.

- **Neues Lager anlegen:** Einstellungen → Lager → **Neues Lager**. Der Name ist frei wählbar.
- **Wechseln:** Oben links (am Handy in der Kopfzeile) steht das aktuelle Lager. Ein Klick darauf zeigt alle deine Lager und
  **Alle Lager** (eine Übersicht mit den Zahlen im Vergleich).
- **Mitglieder:** Unter Einstellungen → Lager → **Mitglieder** legt ein Besitzer fest, wer das Lager sieht und was er darf:
  *Besitzer* verwaltet Lager, Mitglieder und Drucker, *Bearbeiter* pflegt die Spulen, *Betrachter* darf nur ansehen.
- **Neue Benutzer** sehen zuerst kein Lager. Füge sie als Mitglied hinzu oder lass sie selbst ein Lager anlegen.
- **Spule verschieben:** Im Dialog "Spule bearbeiten" das Lager ändern.
- **Lager löschen:** Löscht auch alle Spulen und Drucker darin. Zur Bestätigung tippst du den Namen ein. Erstelle vorher eine
  Sicherung, wenn du dir nicht sicher bist.

### Filamentliste aus Bambu Studio übernehmen

Auf der Spulen-Seite eines Lagers (als Bearbeiter oder Besitzer) startet **Aus Bambu-Cloud importieren** einen kleinen Assistenten:
Mit deinem Bambu-Konto anmelden (bei Bedarf den Code aus der E-Mail eingeben), die Vorschau ansehen, Spulen auswählen und importieren.
Der Import ist einmalig, das Passwort wird nie gespeichert. Ein Besitzer kann beim Anmelden "Verbindung für dieses Lager merken" wählen: Dann wird nur der
Zugang verschlüsselt gemerkt (jedes Lager hat seine eigene Verbindung), und auf der Spulen-Seite gibt es den Knopf "Aus Cloud aktualisieren", der das Lager
ohne Auswahl mit der Cloud abgleicht. Der Zugang gilt etwa 90 Tage, danach meldest du dich einmal neu an. Er nutzt die inoffizielle Schnittstelle von Bambu und kann
jederzeit aufhören zu funktionieren. Klappt die Anmeldung nicht, gibt es unten im Dialog den Weg über eine JSON-Datei.

### Sicherungen

FilaPilot legt jede Nacht automatisch eine Sicherung an (Datenbank und Fotos) und behält die letzten 14 (einstellbar
unter **Einstellungen → System**). Diese Sicherungen liegen **auf der NAS im FilaPilot-Container**. Sie schützen dich
vor Bedienfehlern, aber nicht, wenn die NAS selbst ausfällt.

> **Lade Sicherungen regelmäßig herunter**
>
> Klicke unter **Einstellungen → System** bei einer Sicherung auf **Herunterladen** und bewahre die Datei außerhalb der
> NAS auf (PC, Cloud-Speicher, USB-Stick). Sie enthält alle Daten inklusive Passwort-Hashes — sicher aufbewahren.

**Sicherung wiederherstellen** (z. B. nach einem Umzug oder Fehler): **Einstellungen → System → Vorhandene Sicherungen
→ Wiederherstellen**. Vorher legt FilaPilot automatisch eine Sicherung des aktuellen Stands an, und bei einem Fehler
bleibt alles unverändert.

### Umzug auf eine neue Synology

1. Auf der alten Installation eine Sicherung **herunterladen** (`.tar`-Datei).
2. Auf der neuen NAS FilaPilot nach dieser Anleitung installieren und den Einrichtungsbildschirm durchlaufen (dieser
   vorläufige Zugang wird gleich ersetzt).
3. Unter **Einstellungen → System → Sicherung hochladen** die `.tar`-Datei hochladen, dann bei der Sicherung auf
   **Wiederherstellen** klicken und mit den Zugangsdaten der **alten** Installation anmelden.
4. Das E-Mail-Passwort einmal neu eintragen (es ist mit einem Schlüssel der alten Installation verschlüsselt).

---

## Häufige Fragen

### Die Seite lässt sich nicht öffnen.

NAS eingeschaltet und im selben Netzwerk? IP-Adresse und Port richtig abgetippt (Adresse siehe Ergebnis der Aufgabe
aus Teil C)? Läuft im Container Manager unter **Container** überall ein grüner Punkt? Ggf. unter **Systemsteuerung →
Sicherheit → Firewall** den Port freigeben.

### Ein Baustein im Container Manager wird nicht grün.

Im Container Manager unter **Container** den betroffenen Baustein anklicken → **Protokoll**. Häufig steht dort, was
fehlt. Beim Backend meist: Datenbank noch nicht angelegt (siehe „Das Datenbank-Schema anlegen“ in Teil D).

### Der Bauvorgang meldet „address already in use“.

Der Port ist auf deiner NAS schon vergeben. Lösung über den Aufgabenplaner (Benutzer **root**, **Nicht wiederholen**,
einmal ausführen) mit einem freien Port, z. B. 8095:

```bash
cd /volume1/docker/filapilot
bash scripts/set-env.sh FRONTEND_PORT 8095
docker compose up -d
```

Danach die Adresse anpassen, falls sie den alten Port enthält (`bash scripts/set-env.sh FRONTEND_ORIGIN
http://<NAS-IP>:8095`), und im Reverse-Proxy (falls eingerichtet) den Ziel-Port ändern.

### Das Skript aus Teil C meldet, dass es schon eine .env gibt.

Das ist Absicht (siehe Hinweis in Teil C): Die vorhandene `.env` wird nie überschrieben. Bei einer frischen
Installation die alte Datei per File Station im Ordner `docker/filapilot` löschen oder umbenennen und erneut
ausführen.

### Die Aufgabe aus Teil B meldet einen Fehler (Exit 128 / „already exists“).

Der Ordner `docker/filapilot` gibt es schon (z. B. von einem früheren Versuch). `git clone` bricht dann ab, ohne
etwas zu löschen. Alten Ordner in der File Station umbenennen oder löschen und die Aufgabe erneut ausführen.

### Das Update meldet „detected dubious ownership“ (Exit 128).

Das Update-Skript behebt das selbst, indem es den Ordner als sicher einträgt. Läuft es trotzdem mit Fehler, prüfe,
dass die Aufgabe als Benutzer **root** eingerichtet ist.

### Das Update läuft, aber die Version bleibt alt.

Im Aufgabenplaner das Ergebnis der Aufgabe ansehen. Steht dort „Kein Update verfügbar“, ist die NAS schon auf dem
neuesten Stand. Im Browser danach einmal **Strg+F5** drücken oder im Update-Hinweis der App auf **Aktualisieren**
klicken — der Browser hebt sich alte Seiten auf.

### Die „Passwort vergessen“- oder Willkommens-E-Mail kommt nicht an.

Prüfe unter **Einstellungen → System → E-Mail (SMTP)** die Angaben mit **Test-E-Mail an mich senden**. Kommt die
E-Mail an, aber der Link führt zu einer falschen Adresse, stimmt `FRONTEND_ORIGIN` nicht — siehe Teil F, Schritt 6.
Ohne E-Mail-Server steht der Passwort-Reset-Link im **Protokoll des Backend-Containers** (Container Manager →
Container → `backend` → Protokoll).

### Ein neuer Benutzer sieht keine Spulen und keine Drucker.

Neue Benutzer sind zuerst in keinem Lager. Ein Besitzer des Lagers (oder ein Admin) fügt sie unter **Einstellungen → Lager →
Mitglieder** hinzu, oder der Benutzer legt selbst ein Lager an.

### Ich habe mein Administrator-Passwort vergessen.

Solange der E-Mail-Versand eingerichtet ist, geht es über **Passwort vergessen** auf der Anmeldeseite. Sonst kann ein
anderer Administrator dein Passwort unter **Einstellungen → Benutzer** zurücksetzen.

### Foto- oder Sicherungs-Upload klappt im WLAN, aber nicht von unterwegs.

Der Reverse-Proxy oder dein Router kann große Uploads begrenzen. Große Sicherungen (mehrere hundert MB) lädst du am
besten im WLAN hoch.

### Wie sehe ich, welche Version installiert ist?

Oben rechts neben dem „i“-Symbol steht die Versionsnummer (z. B. `v0.12.0`).

---

## Fragen, Probleme oder Fehler?

Lege auf [GitHub](https://github.com/Michael7779/filapilot/issues) einen **Issue** an. Beschreibe möglichst genau, an
welcher Stelle der Anleitung es hakt (z. B. „Teil D, Bauvorgang“), und hänge wenn möglich einen Screenshot an.
