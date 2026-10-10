# Design: Import aus der Bambu-Cloud (pro Lager)

Stand: 2026-09-26. Ziel-Version: 0.14.0. Baut auf den Lagern (0.13.0) auf, siehe `docs/design/lager.md`.

## 1. Ziel

Die in Bambu Studio / Bambu Handy geführte Filament-Liste (Spulen mit Marke, Material, Farbe, Restgewicht) soll **einmalig**
und **pro Lager** in FilaPilot übernommen werden können. Kein Dauerabgleich, kein Schreiben in die Bambu-Cloud.

Entscheidungen des Nutzers: Import **pro Lager**; einmaliges Token, das **nicht gespeichert** wird (Empfehlung angenommen).

## 2. Was über die Schnittstelle bekannt ist (Recherche, nicht selbst gegen ein Konto geprüft)

Quellen: Community-Dokumentation `coelacant1/Bambu-Lab-Cloud-API`, `Timmes123/ha-bambu-filaments` (Read-Zugriff nachgewiesen
in `ha-bambulab` PR #2028). **Inoffiziell**, kann jederzeit brechen.

| Zweck | Aufruf |
|---|---|
| Anmelden | `POST https://api.bambulab.com/v1/user-service/user/login` mit `{ account, password }` → `accessToken` oder `loginType: "verifyCode"` / `"tfa"` |
| E-Mail-Code anfordern | `POST /v1/user-service/user/sendemail/code` mit `{ email, type: "codeLogin" }` |
| Mit Code anmelden | `POST /v1/user-service/user/login` mit `{ account, code }` → `accessToken` |
| Spulen lesen | `GET /v1/design-user-service/my/filament/v2?offset=&limit=` mit `Authorization: Bearer <accessToken>` → `{ total, hits: [...] }` |
| China | Basis `https://api.bambulab.cn` |

Spule (Auszug): `id`, `filamentVendor`, `filamentType`, `filamentName`, `color` (`#RRGGBBAA`), `netWeight` (Rest in g),
`totalNetWeight`, `status`, `RFID`, `inPrinter`, `deviceName`, `note`. Der Restanteil ist `netWeight / totalNetWeight`.

**Risiken, offen benannt:** Cloudflare-Bot-Schutz kann einfache Aufrufe blockieren; Anmeldung per Authenticator-App (TFA) läuft
über einen anderen Pfad mit CSRF-Cookie und ist nicht verifiziert; das Token gilt ca. 90 Tage und lässt sich nicht erneuern. Der
Entwurf sieht deshalb einen **Datei-Weg** als Ausweichmöglichkeit vor.

## 3. Ablauf (Oberfläche)

Spulen-Seite eines Lagers (Rolle Bearbeiter oder Besitzer) → **Aus Bambu-Cloud importieren**:
1. **Anmelden:** E-Mail, Passwort, Region (Global/China). Hinweis: inoffiziell, Passwort wird nicht gespeichert.
   Alternativ: **JSON-Datei** mit der Filamentliste verwenden (Ausweichweg).
2. **Code:** Verlangt Bambu einen E-Mail-Code, gibt man ihn ein. TFA per Authenticator-App wird mit klarer Meldung als nicht
   unterstützt abgelehnt.
3. **Vorschau:** Tabelle aller Spulen (Marke, Material, Farbe, Rest/Gesamt, Drucker). Bereits importierte sind markiert und
   abgewählt; Neue mit Status 0 sind vorgewählt. Option "Restgewicht bereits importierter Spulen aktualisieren".
4. **Ergebnis:** "12 neu, 3 aktualisiert, 2 übersprungen", Hinweis auf neu angelegte Hersteller/Materialien.

## 4. Datenmodell

- `Spool.bambuCloudId String?` und `@@unique([inventoryId, bambuCloudId])`: verhindert Doppelimport im selben Lager und
  ermöglicht das Aktualisieren des Restgewichts. Kein anderes neues Feld (Spulen-Notiz und Bambu-Farbcode werden nicht übernommen).
- Sitzungen des Imports liegen **nur im Arbeitsspeicher** des Servers (`Map`), nie in der Datenbank.

## 5. Zuordnung Bambu → FilaPilot

- **Hersteller:** `filamentVendor` ohne Beachtung der Groß-/Kleinschreibung; fehlt er im Katalog, wird er angelegt.
- **Material:** `filamentName` (sonst `filamentType`) beim Hersteller, sonst als allgemeines Material; fehlt es, wird es beim
  Hersteller angelegt, die Temperaturen kommen vom allgemeinen Material gleichen Typs (z. B. "PLA"), sonst Standardwerte
  (190–230 °C, Bett 60 °C). Angelegte Einträge lassen sich unter Einstellungen → Filamente ändern.
- **Farbe:** aus `color` der Hex-Wert (ohne Alpha); der Farbname ist der nächstliegende deutsche Name aus einer festen Liste
  (Schwarz, Weiß, Grau, Rot, …), nachträglich änderbar.
- **Gewicht:** `totalNetWeight` (sonst 1000 g) als Ursprungsgewicht, `netWeight` als Restgewicht, begrenzt auf 0…Ursprungsgewicht.
- **Lagerort:** `deviceName`, wenn die Spule gerade im Drucker steckt.
- **Status:** nur `status` 0 ist vorgewählt (Bedeutung der anderen Werte ist nicht dokumentiert); alle bleiben wählbar.

## 6. Schnittstellen (Backend)

Alle unter `/api/inventories/:id/bambu-import`, Rolle `EDITOR` im Lager, sonst wie bei den Lagern (fremd → 404, Betrachter → 403):

| Route | Zweck |
|---|---|
| `POST /login` | Anmelden (`account`, `password`, `region`) → `{ status: "ok" \| "code_required" \| "tfa_unsupported", sessionId }` |
| `POST /verify` | E-Mail-Code einlösen (`sessionId`, `code`) |
| `POST /resend` | Code auf Wunsch (erneut) anfordern, höchstens einmal pro Minute je Sitzung |
| `POST /file` | Ausweichweg: Filamentliste als JSON (`{ hits: [...] }`), erzeugt eine Sitzung ohne Anmeldung |
| `GET /:sessionId/preview` | Zeilen der Vorschau (lädt die Liste bei Bedarf aus der Cloud und hält sie in der Sitzung) |
| `POST /:sessionId/import` | Auswahl importieren (`cloudIds`, `updateExisting`), beendet die Sitzung |
| `DELETE /:sessionId` | Abbrechen, verwirft Token und Daten |

Neuer Fehlercode `UPSTREAM_ERROR` (HTTP 502) für "Bambu nicht erreichbar / blockiert / unerwartete Antwort".

## 7. Threat-Model (Backend-Route, Zugangsdaten, fremder Dienst, Persistenz)

1. **Wer könnte das missbrauchen?** Ein Angemeldeter ohne Bearbeiten-Recht im Lager (Import in fremdes Lager); ein anderer
   Benutzer, der eine fremde Import-Sitzung (Token der Bambu-Cloud) benutzen will; jemand, der den Server zu Anfragen an
   beliebige Adressen veranlasst (SSRF) oder Zugangsdaten mitlesen will (Logs, Protokoll, Fehlermeldungen); Brute-Force gegen
   Bambu-Konten über FilaPilot; ein manipuliertes JSON (riesig, falsche Typen) über den Datei-Weg.
2. **Was muss serverseitig erzwungen werden?** Rolle `EDITOR` im Lager bei jeder Route; die Sitzung gehört genau einem Benutzer
   und einem Lager (sonst 404); die Region ist ein Auswahlwert, die Ziel-Adresse **fest** `api.bambulab.com`/`.cn` (nie
   vom Client); Passwort und Token werden **nie** gespeichert, geloggt, protokolliert oder in Fehlermeldungen zurückgegeben;
   Token nur im Speicher, Sitzung läuft nach 15 Minuten ab und endet nach dem Import, höchstens 3 Sitzungen je Benutzer;
   strenge Begrenzung der Anmeldeversuche (bestehende Rate-Limits der Anmelde-Routen); Antworten der Cloud und hochgeladenes
   JSON werden mit Zod geprüft und begrenzt (max. 1000 Spulen, 15 s Zeitlimit); Import nur der gewählten IDs (max. 500).
3. **Welche Negativ-Tests prüfen das?** Kein Cookie → 401; Fremder → 404, Betrachter → 403; Sitzung eines anderen Benutzers →
   404; abgelaufene Sitzung → 404; ungültige Region → 400; manipuliertes JSON → 400; Passwort/Token tauchen weder im
   Protokoll noch in Antworten auf (Test durchsucht die Datenbank und die Antworten); Doppelimport erzeugt keine Dopplungen.

## 8. Testbarkeit und Grenzen

Ohne Bambu-Konto lässt sich die echte Schnittstelle **nicht** prüfen. Der Cloud-Zugriff ist deshalb hinter einer austauschbaren
Schnittstelle (`BambuCloudClient`); die Tests laufen mit einem Mock, der die dokumentierten Antworten liefert. Ob der echte Weg
funktioniert (Cloudflare, TFA, Feldnamen), zeigt erst ein Test mit dem Konto des Nutzers.
