# Design: Archiv, Cloud-Abgleich und Zeit-Statistik (0.14.3 bis 0.14.5)

Stand: 2026-09-26. Baut auf Lagern (`lager.md`) und dem Bambu-Import (`bambu-import.md`) auf.

## 1. Ziele und Reihenfolge

1. **0.14.3 - Archiv und Gewichtsverlauf:** Spulen lassen sich archivieren statt nur zu löschen, damit ihr Verbrauch in der Statistik bleibt.
   Jede Änderung des Restgewichts wird mit Datum festgehalten (Grundlage für die Zeit-Statistik).
2. **0.14.4 - Verbindung pro Lager und "Aus Cloud aktualisieren":** Das Bambu-Token wird auf Wunsch je Lager verschlüsselt gemerkt; ein Knopf
   gleicht ohne Auswahl ab: bestehende Spulen bekommen das Restgewicht der Cloud, neue werden angelegt, in der Cloud entfernte werden archiviert.
3. **0.14.5 - Statistik nach Tag, Woche, Monat, Jahr:** Verbrauch über die Zeit aus dem Gewichtsverlauf, nach Material-Typ, Hersteller und Kosten.

Entscheidungen des Nutzers (2026-09-26): Reihenfolge wie oben, Veröffentlichung als 0.14.3, 0.14.4, 0.14.5; Verbindung **pro Lager**; "Verbindung
merken" ist Opt-in; Cloud gewinnt bei Spulen aus der Cloud; entfernte Spulen werden als erledigt archiviert.

## 2. Datenmodell

**0.14.3**
- `Spool.archivedAt DateTime?` und `Spool.archiveReason SpoolArchiveReason?` (`MANUAL` | `CLOUD_REMOVED`). Keine Pflichtspalte, keine neue
  Eindeutigkeitsregel (Update-Gate, siehe `install.md` R3).
- Neue Tabelle `SpoolWeightLog` (gehört zu `Spool`, `onDelete: Cascade`): `spoolId`, `inventoryId` (Momentaufnahme, ohne Fremdschlüssel), `at`,
  `deltaG` (positiv = verbraucht, negativ = Gewicht erhöht), `remainingG` (Ergebnis), `source` (`MANUAL` | `CLOUD_IMPORT` | `CLOUD_SYNC`).
  Wird die Spule gelöscht, verschwindet ihr Verlauf mit (bewusst: Löschen entfernt den Verbrauch, Archivieren behält ihn).

**0.14.4**
- Neue Tabelle `BambuConnection` (gehört zu `Inventory`, `onDelete: Cascade`, höchstens eine je Lager): `region`, `tokenEncrypted` (AES-256-GCM
  mit Schlüssel aus `SESSION_SECRET`, wie das SMTP-Passwort), `tokenExpiresAt` (aus dem Token gelesen, nur Anzeige), `connectedByName`,
  `connectedAt`, `lastSyncAt`, `lastSyncSummary` (Text). Das Token verlässt den Server nie.

**0.14.5** - keine Schema-Änderung (rechnet aus `SpoolWeightLog`).

## 3. Verhalten

**Archiv:** `POST /api/spools/:id/archive` und `/unarchive` (Rolle Bearbeiter). Die Spulenliste blendet Archivierte standardmäßig aus
(`?archived=exclude|include|only`). Restbestand, "Fast leer" und Dashboard zählen nur aktive Spulen; der **Verbrauch** zählt alle (auch archivierte).

**Gewichtsverlauf:** Beim Ändern von `remainingWeightG` (manuell, Import mit Aktualisieren, Cloud-Abgleich) wird ein Eintrag geschrieben, nie beim Anlegen
(Startwert, kein Verbrauch) und nie ohne Änderung. Früherer Verbrauch hat kein Datum und bleibt nur in "bisher gesamt" sichtbar. Der Tag eines Eintrags
ist der Tag der Änderung bzw. des Abgleichs, nicht der Tag des Drucks.

**Abgleich (0.14.4):** Quelle ist die vollständige Spulenliste der Cloud; unvollständig oder leer -> es wird nichts archiviert.
- Spule in der Cloud und in FilaPilot: Restgewicht der Cloud (begrenzt auf das Ursprungsgewicht), Eintrag im Verlauf (`CLOUD_SYNC`). Manuell archivierte
  Spulen bleiben unangetastet; wegen "Cloud entfernt" archivierte tauchen wieder auf -> werden wiederhergestellt.
- Neue Spule der Cloud (Status 0 oder ohne Status): wird angelegt (Hersteller/Material wie beim Import).
- In FilaPilot mit Cloud-ID, in der Cloud nicht mehr: archiviert mit Grund `CLOUD_REMOVED`.
- Bei Spulen aus der Cloud gewinnt die Cloud: ein von Hand geändertes Restgewicht wird beim nächsten Abgleich überschrieben.

**Statistik (0.14.5):** `GET /api/stats/consumption?inventoryId=&period=day|week|month|year` (Zeitraum begrenzt, Standard je Periode: 30 Tage, 12 Wochen,
12 Monate, 5 Jahre). Summe der positiven `deltaG` je Zeitraum (Zeitzone des Browsers, Woche beginnt Montag), aufgeteilt nach Material-Typ und Hersteller,
Kosten aus `Kaufpreis / Ursprungsgewicht`. Zeigt "erfasst seit <Datum>".

## 4. Threat-Model

**Archiv/Verlauf (0.14.3)** - 1. Ein Betrachter oder Fremder könnte Spulen archivieren/wiederherstellen oder den Verlauf verfälschen. 2. Rolle im Lager wird
serverseitig aus der Datenbank berechnet: Archivieren braucht Bearbeiter, Fremde 404; der Verlauf wird nur serverseitig geschrieben (keine Route, kein
Client-Wert). 3. Tests: Betrachter -> 403, Fremder -> 404, Verlauf nur bei echter Änderung, Löschen räumt den Verlauf auf.

**Verbindung/Abgleich (0.14.4)** - 1. Jemand ohne Recht könnte das gemerkte Token nutzen, auslesen oder ein fremdes Konto verbinden; ein Bearbeiter könnte die
Verbindung trennen; ein Datenbank-Dump könnte das Token verraten. 2. Verbinden/Trennen nur Besitzer, Abgleich Bearbeiter+Besitzer, Betrachter darf nur den Status
sehen; das Token wird verschlüsselt gespeichert, nie zurückgegeben, geloggt oder protokolliert; bei Ablauf (401 der Cloud) wird es gelöscht; anderes
`SESSION_SECRET` -> Entschlüsselung schlägt fehl -> gilt als nicht verbunden; Lager löschen löscht die Verbindung mit; Abgleich nur gegen die festen Bambu-Adressen;
Schutz vor Massen-Archivierung (unvollständige/leere Liste). 3. Tests: Rollen (403/404), Token nie in Antworten/Protokoll/Datenbank im Klartext, Verbindung je Lager
getrennt, Ablauf löscht, Abgleich archiviert nur bei vollständiger Liste.

**Statistik (0.14.5)** - 1. Ein Fremder könnte fremde Verbrauchsdaten lesen; riesige Zeiträume könnten den Server belasten. 2. Lese-Rolle im Lager, `all` nur über eigene
Lager, Zeitraum und Anzahl der Zeitabschnitte begrenzt, Eingaben per Zod. 3. Tests: Fremder 404, `all` nur eigene, ungültige Perioden/Zeiträume 400.
