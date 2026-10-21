# SizzleBrothers-Wunschliste, Freigaben und Super-Admin

## 1. Uebersicht
Neben der Filamentverwaltung gibt es eine zweite, getrennte Funktion: eine Sammelbestellung fuer Produkte des Shops
https://sizzlebrothers.de/collections/all. Aufbau wie die Filament-Wunschliste (Wunschliste → Bestellliste → Abrechnung),
aber mit den Produkten des Shops (Bild, Titel, Variante, Preis) statt freiem Text. Wer sie sehen darf, steuern
**Freigaben** je Benutzer; dafuer gibt es **Super-Admins**.

Modelle: `User` (+ `isSuperAdmin`, `canUseFilament`, `canUseSizzle`), `SizzleProduct` (Katalog-Zwischenspeicher, gehoert
ueber `SizzleWish` zum Benutzer), `SizzleWish` (Wunsch einer Person; `inOrder` = Bestellliste).
Backend: `routes/sizzleProducts.ts`, `routes/sizzleWishes.ts`, `services/sizzleCatalogService.ts`,
`services/sizzleCatalogScheduler.ts`, `services/superAdminService.ts`, `middleware/access.ts`.
Oberflaeche: `pages/SizzlePage.tsx` ("SizzleBrothers" in der Navigation), Freigaben im Benutzer-Dialog der Einstellungen.

## 2. Threat-Model
1. **Wer koennte das missbrauchen?** Ein eingeloggter Nutzer ohne Freigabe (ruft die API direkt auf, obwohl der
   Menuepunkt fehlt); ein normaler Admin (stuft sich selbst hoch, uebernimmt ein Super-Admin-Konto per Passwort-Reset oder
   loescht alle Super-Admins); ein Nutzer mit Sizzle-Freigabe, der fremde Wuensche aendert oder Preise manipuliert; von
   aussen vergiftete Shop-Daten (Bild-URL, Handle, Preis).
2. **Serverseitig erzwungen:** Freigaben pruefen eine Middleware je Route (nicht nur ausgeblendete Menues) und der
   Socket-Raumabgleich; Freigaben und `isSuperAdmin` aendert nur ein Super-Admin; Super-Admin-Konten aendern, loeschen oder
   zuruecksetzen nur Super-Admins; der letzte Super-Admin kann weder geloescht noch herabgestuft werden (Serializable-
   Transaktion), ein Super-Admin ist immer Admin; Inhalt eines Wunsches (Produkt/Menge/Notiz) aendern oder loeschen nur
   Ersteller oder Admin, Status/Auswahl/Preis jeder Freigegebene (Sammelbestellung, wie bei der Filament-Wunschliste);
   der Shop-Abruf nutzt eine feste URL (kein Nutzereingabe-Anteil, kein SSRF), Antworten werden per Zod geprueft,
   Bild-URLs muessen `https` sein, der Handle darf nur `[a-z0-9-]` enthalten, ein leerer Abruf deaktiviert keinen Katalog.
3. **Negativ-Tests:** `tests/security/userAccess.test.ts` (Freigabe fehlt → 403, Admin setzt Freigabe → 403, Admin aendert/
   loescht/setzt Super-Admin zurueck → 403, letzter Super-Admin → 409), `tests/security/sizzle.test.ts` (anonym 401, ohne
   Freigabe 403, fremden Wunsch aendern/loeschen 403, Inhaltsfelder in Sammel-Route 400, ungueltige Preise 400),
   `tests/unit/sizzleCatalog.test.ts` (Zod-Pruefung der Shop-Daten).

## 3. Anforderungen

### Freigaben und Super-Admin
- **Z1**: `User.isSuperAdmin`. Ein Super-Admin hat immer Zugriff auf Filamentverwaltung **und** Sizzle-Wunschliste
  (`userAccess()` im shared-Paket). Alle anderen sehen nur, was `canUseFilament`/`canUseSizzle` erlauben.
  Neue Konten: Filamentverwaltung ja, Sizzle nein; bestehende Konten behalten die Filamentverwaltung.
  Test: `tests/security/userAccess.test.ts`
- **Z2**: Freigaben und `isSuperAdmin` setzen (`PATCH /api/users/:id`, beim Anlegen `POST /api/users`) darf nur ein
  Super-Admin; ein normaler Admin bekommt 403, auch fuer das eigene Konto. Test: `tests/security/userAccess.test.ts`
- **Z3**: Ein Super-Admin-Konto aendern, loeschen oder dessen Passwort zuruecksetzen darf nur ein Super-Admin (403 sonst) -
  sonst waere es per Passwort-Reset zu uebernehmen. Test: `tests/security/userAccess.test.ts`
- **Z4**: Es gibt immer mindestens einen Super-Admin: Loeschen oder Herabstufen des letzten ergibt 409 (Pruefung und
  Aenderung in einer Serializable-Transaktion). Test: `tests/security/userAccess.test.ts`
- **Z5**: Ein Super-Admin muss die Rolle Admin haben (`isSuperAdmin: true` bei Rolle USER bzw. Rolle USER bei Super-Admin
  ergibt 400). Test: `tests/security/userAccess.test.ts`
- **Z6**: Alle Routen der Filamentverwaltung (`/api/materials`, `/manufacturers`, `/inventories`, `/stats`, `/spools`,
  `/printers`, `/print-jobs`, `/custom-field-definitions`, `/wishlist`) verlangen die Filament-Freigabe, alle Routen
  `/api/sizzle/*` die Sizzle-Freigabe (403 sonst, anonym 401). Eigenes Konto, Einstellungen und Benutzerverwaltung bleiben
  unabhaengig davon. Test: `tests/security/userAccess.test.ts`
- **Z7**: Live-Druckerstatus (Socket.IO) geht nur an Verbindungen mit Filament-Freigabe. Test: `tests/realtime/filamentAccessRooms.test.ts`
- **Z8**: Beim Start wird ein fehlender Super-Admin ergaenzt (aeltester Admin, `ensureSuperAdmin`); die Einrichtung (erster
  Benutzer) legt ihn direkt an. Test: `tests/integration/superAdmin.test.ts`
- **Z9**: Oberflaeche: Menuepunkte und Startseite richten sich nach den Freigaben (`userAccess`); der Benutzer-Dialog
  zeigt die Freigaben nur Super-Admins; ohne jede Freigabe bleiben die Einstellungen. Test: `packages/frontend/tests/unit/navAccess.test.ts` (Menue/Startseite);
  Oberflaeche manuell im Browser geprueft (Desktop und Handy-Breite).

### Katalog (Produkte des Shops)
- **S1**: `parseShopifyProducts` liest die Shop-Daten (`products.json`) in eine Zeile je Variante: Titel, Variantenname
  (nicht bei "Default Title"), Produktart, Preis in Cent (exakt aus dem Text, nie ueber Gleitkomma), verfuegbar, kleines
  Bild (Variantenbild, sonst erstes Produktbild; nur `https`). Ungueltige Produkte werden uebersprungen, nicht der Abruf.
  Test: `tests/unit/sizzleCatalog.test.ts`
- **S2**: `syncCatalog` gleicht Zeile fuer Zeile ab (neu, geaendert) und setzt nicht mehr gelieferte Varianten auf
  `active=false` (nie loeschen). Liefert der Shop gar nichts, bleibt der Katalog unveraendert (Fehler). Gleichzeitige
  Aufrufe teilen sich einen Lauf. Test: `tests/integration/sizzleCatalogSync.test.ts`
- **S3**: Regelmaessige Aktualisierung: beim Start und danach alle 6 Stunden (`startSizzleCatalogScheduler`), jeweils nur wenn
  der letzte Abgleich aelter als die Mindestpause ist; Fehler werden geloggt, der alte Katalog bleibt. Test:
  `tests/unit/sizzleCatalogScheduler.test.ts`
- **S4**: `GET /api/sizzle/products` liefert den aktiven Katalog mit Zeitpunkt des letzten Abgleichs (SCOPE user, Freigabe
  noetig); ist der Katalog leer, wird einmal abgerufen. `POST /api/sizzle/products/refresh` stoesst einen Abgleich an,
  hoechstens einmal pro Minute (sonst bleibt der Katalog wie er ist); schlaegt der Shop-Abruf fehl: 502. Test:
  `tests/security/sizzle.test.ts`

### Wunsch-, Bestell- und Abrechnungsliste
- **S5**: `GET/POST /api/sizzle/wishes`: jeder Freigegebene sieht alle Wuensche (wer, wann) und legt eigene an; ein zweiter
  Wunsch derselben Person fuer dasselbe Produkt (offen, nicht in der Bestellliste) erhoeht die Menge. Unbekanntes oder
  nicht mehr aktives Produkt 400. Test: `tests/security/sizzle.test.ts`
- **S6**: Produkt/Menge/Notiz aendern oder loeschen nur Ersteller oder Admin (403 sonst); Status, `inOrder` und Preis darf jeder
  Freigegebene setzen, auch bei fremden Wuenschen, aber nie zusammen mit Inhalt (403). `DELETE /api/sizzle/wishes/done`
  entfernt alle erledigten. Test: `tests/security/sizzle.test.ts`
- **S7**: `PATCH /api/sizzle/wishes/bulk` (`{ ids, status?, inOrder?, unitPriceCents? }`, strict, max. 500, kein Inhalt):
  Beim Aufnehmen in die Bestellliste wird der Preis mit dem aktuellen Shop-Preis eingefroren (`unitPriceCents`), ab dann ist
  er auf der Bestellliste aenderbar (Rabatt) und fuer die Abrechnung massgeblich, auch wenn der Shop-Preis sich spaeter
  aendert; beim Entfernen aus der Bestellliste faellt er wieder auf den Shop-Preis zurueck. Ungueltige Preise 400.
  Test: `tests/security/sizzle.test.ts`
- **S8**: `computeSizzleSettlement` (shared) rechnet die Abrechnung aus allen Wuenschen der Bestellliste: je Person Menge mal Preis,
  Summe gesamt; Person = Name beim Hinzufuegen; CSV (Semikolon, Dezimalkomma, Formel-Einschleusung entschaerft) und Text.
  Test: `tests/unit/sizzleOrder.test.ts`
- **S9**: Oberflaeche `SizzlePage`: Produktauswahl mit Suche, Produktart-Filter, kleinem Bild, Varianten und Preis (aus dem
  Shop); Wunschliste zeigt Bild und Produkt; Bestellliste fasst gleiche Produkte zusammen mit aenderbarem Preis;
  Abrechnung je Person. Test: `tests/unit/sizzleCatalogGroups.test.ts` (Gruppieren, Suche, Produktart-Filter); Oberflaeche manuell
  im Browser geprueft (Desktop und Handy-Breite, echter Shop).

## 4. Bewusste Grenzen
- Versand und Rabatte des Shops als Gesamtbetrag gibt es (noch) nicht, nur der Preis je Position ist aenderbar.
- Die Listen laden bis zu 500 Eintraege auf einmal (Filter im Browser), wie die Filament-Wunschliste.
- Bilder werden direkt vom Shop (Shopify-CDN) geladen, nicht lokal zwischengespeichert.
