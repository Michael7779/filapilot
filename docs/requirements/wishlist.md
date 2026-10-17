# Wunschliste

## 1. Uebersicht
Instanzweite Liste (bewusst nicht pro Lager) fuer eine Sammelbestellung: jeder eingeloggte Nutzer sieht alle Eintraege,
wer sie hinzugefuegt hat und wann, und kann selbst welche hinzufuegen. Modell `WishlistItem` (Titel, Notiz, Menge,
Status offen/bestellt/erledigt, `addedByUserId`/`addedByName` als Momentaufnahme, `updatedByUserId`/`updatedByName`).
Oberflaeche: `pages/WishlistPage.tsx`, eigener Nav-Punkt "Wunschliste".

## 1.1 Offene Punkte
- OP-W1 ✅ (0.21.2): Kein automatisches Entfernen, aber `DELETE /api/wishlist/done` (siehe R5) entfernt alle
  erledigten Eintraege auf einmal - bewusst manuell ausgeloest statt automatisch/zeitgesteuert, damit nichts
  verschwindet, das jemand noch als Beleg braucht.
- OP-W2 ✅ (0.21.3): Ein Wunsch kann jetzt optional auf einen Hersteller/ein Material verweisen, siehe R6. Ein
  Verweis auf eine konkrete Spule (statt Katalog-Eintrag) gibt es weiterhin nicht - eine Spule ist etwas Konkretes
  im eigenen Bestand, ein Wunsch dagegen etwas, das man noch NICHT hat.

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer kann die Liste lesen und Eintraege anlegen (anonym 401); der Ersteller wird als
  `addedByName` gespeichert und gezeigt.
- **R2**: Titel/Notiz/Menge aendern oder loeschen darf nur der Ersteller oder ein Admin (403 sonst).
- **R3**: Den Status (offen/bestellt/erledigt) darf jeder aktive Nutzer setzen, auch bei fremden Eintraegen -
  bewusst so, damit alle an der Sammelbestellung mitwirken koennen; `updatedByName` haelt fest, wer zuletzt geaendert hat.
- **R4**: Eingaben werden validiert (leerer Titel 400, unbekannter Status 400).
- **R5**: Ab 0.21.2: `DELETE /api/wishlist/done` entfernt alle Eintraege mit Status "erledigt" auf einmal; darf
  jeder aktive Nutzer (wie das Setzen des Status), nicht nur die/der Ersteller:in der einzelnen Eintraege.
- **R6**: Ab 0.21.3: `manufacturerId`/`materialId` sind optionale Verweise auf die Stammdaten (Name als Momentaufnahme
  in der Antwort, `manufacturerName`/`materialName`); ein unbekannter Verweis wird abgelehnt (400). Der Verweis ist
  Inhalt wie Titel/Notiz/Menge - aendern darf nur Ersteller:in oder Admin. Loeschen des verwiesenen Herstellers/
  Materials setzt den Verweis nur zurueck (SetNull), loescht den Wunsch nicht.
  Test: `tests/security/wishlist.test.ts`

- **R7**: Ab 0.29.0: `colorName`/`colorHex` sind eine optionale Wunschfarbe (Name max. 60 Zeichen, Hex `#RRGGBB`; ungueltig
  400). Reiner Text statt Katalog-Verweis, weil es keine Farb-Tabelle gibt - die Vorschlaege kommen im Formular als
  Dropdown (alphabetisch, abhaengig von Hersteller+Material, wie "Neue Spule") aus `getColorPresets`. Die Farbe ist
  Inhalt wie Titel/Notiz/Menge - aendern darf nur Ersteller:in oder Admin (403 sonst). "Zur Wunschliste" an einer Spule
  uebernimmt deren Farbe. Test: `tests/security/wishlist.test.ts`

- **R8**: Ab 0.30.0: Die Menge wird in der Wunsch- und der Bestellliste immer angezeigt, auch bei 1 ("1x"). Reine
  Oberflaeche, manuell im Browser geprueft (Desktop und Handy-Breite).
- **R9**: Ab 0.30.0: `inOrder` (Standard `false`) markiert, ob ein Wunsch zur tatsaechlichen Bestellliste gehoert. Die
  Bestellliste ist keine eigene Tabelle, sondern diese Auswahl aus der Wunschliste (instanzweit). Wie der Status darf
  `inOrder` jeder aktive Nutzer setzen, auch bei fremden Eintraegen (`PATCH /api/wishlist/:id`, anonym 401, kein
  Boolean 400); es ist kein Inhalt - wer mit `inOrder` zugleich Titel/Menge/... eines fremden Wunsches schickt,
  bekommt 403. Test: `tests/security/wishlist.test.ts`
- **R10**: Ab 0.30.0: `PATCH /api/wishlist/bulk` setzt `status`, `inOrder` und (ab 0.31.0) `unitPriceCents` fuer bis zu 500
  Wuensche auf einmal (Body `{ ids, status?, inOrder?, unitPriceCents? }`, Antwort `{ updated }`). `SCOPE: user`: jeder aktive Nutzer, anonym 401. Das Schema
  ist strict - Inhaltsfelder (Titel, Menge, ...), leere/zu lange/ungueltige ID-Liste, fehlendes `status`/`inOrder` oder
  unbekannter Status ergeben 400, sonst liesse sich die Ersteller-Pruefung (R2) umgehen. Unbekannte IDs zaehlen nicht mit.
  Ein Audit-Eintrag je Aufruf (`WISHLIST`, EVENT). Test: `tests/security/wishlist.test.ts`
- **R11**: Ab 0.30.0: Suche und Filter (Status, Hersteller inkl. "ohne Hersteller", Material, hinzugefuegt von) laufen im
  Browser ueber `filterWishlistItems`: Suche ohne Gross-/Kleinschreibung ueber Titel, Notiz, Hersteller, Material, Farbe
  und Ersteller; mehrere Woerter muessen alle vorkommen. Gilt fuer beide Ansichten. Test: `tests/unit/wishlistOrder.test.ts`
- **R12**: Ab 0.30.0: Die Bestellliste zeigt die Wuensche aller Nutzer nach Hersteller gruppiert
  (`groupWishlistByManufacturer`: Gruppen alphabetisch, "ohne Hersteller" zuletzt; in der Gruppe nach Material, Farbe,
  Titel; Summen gesamt/ausgewaehlt). Auswahl per Checkbox, je Hersteller "Alle waehlen"/"Auswahl aufheben" und
  "Auswahl als bestellt/erledigt"; der Status ist derselbe wie in der Wunschliste, eine Aenderung gilt in beiden
  Ansichten. Test: `tests/unit/wishlistOrder.test.ts` (Gruppierung), Oberflaeche manuell im Browser geprueft.

## 1.1.1 Befunde / bewusste Grenzen
- ✅ (0.31.0, war Befund): Gleiche Wuensche mehrerer Nutzer werden in der Bestellliste jetzt zu einer Position zusammengefasst,
  siehe R17. Die Wunschliste selbst bleibt eine Liste einzelner Wuensche.
- Die Liste laedt weiterhin bis zu 500 Eintraege auf einmal (Filter laufen im Browser); eine Seitenweise-Ladung
  (cursor-basiert) gibt es hier noch nicht.

Tests: `packages/backend/tests/security/wishlist.test.ts`, `packages/backend/tests/unit/wishlistOrder.test.ts`.
Oberflaeche manuell im Browser geprueft.

## 1.3 Aenderungen ab 0.20.0
- Das Formular "Hinzufügen" bekommt zusaetzlich Hersteller-/Material-Dropdowns aus dem bestehenden Stammdaten-Katalog
  (wie im "Neue Spule"-Dialog); eine Auswahl befuellt den freien Titel, der weiter frei editierbar bleibt.
- Auf der Spulen-Seite legt die Aktion "Zur Wunschliste" (jede Spule, jede Ansicht) einen Wunsch mit dem Titel
  "{Hersteller} {Material} {Farbe}" an - praktisch zum Nachbestellen einer Spule, die zur Neige geht.

## 1.4 Aenderungen ab 0.21.1
- Fehler behoben: Auf schmalen Bildschirmen (Handy) ueberlappten sich die Beschriftungen "Hersteller" und "Material"
  im Formular unlesbar (zu viele `flex-1`-Spalten in einer Zeile, unbrechbare Woerter liefen visuell ineinander).
  Das Formular ordnet die Felder unter `sm:` als 2-Spalten-Grid an, ab `sm:` wie bisher als Zeile.

## 1.5 Preise, Abrechnung und Zusammenfassung (ab 0.31.0)
- **R13**: `unitPriceCents` (`Int?`, 0 bis 1.000.000, ganze Cent) ist der Preis je Spule fuer die Abrechnung. Wie Status und
  `inOrder` darf ihn jeder aktive Nutzer setzen (`PATCH /api/wishlist/:id`, Sammel-Route R10), auch bei fremden Wuenschen -
  ohne Inhalt zu aendern: Titel/Menge/... zusammen mit dem Preis bei fremden Wuenschen ergeben 403. Ungueltige Betraege
  (negativ, Dezimal, Text, zu gross) 400, anonym 401. Test: `tests/security/wishlist.test.ts`
- **R14**: Tabelle `WishlistOrderCost` (gehoert zu `Manufacturer`, eine Zeile je Hersteller, Loeschen des Herstellers loescht sie):
  Nebenkosten `shippingCents`/`discountCents` (je 0 bis 1.000.000). `GET /api/wishlist/costs` und
  `PUT /api/wishlist/costs/:manufacturerId` (SCOPE user: jeder aktive Nutzer; anonym 401; krumme Betraege, fremde Schluessel,
  keine UUID 400; unbekannter Hersteller 404; zweites Setzen ueberschreibt). Jede Aenderung steht im Aenderungsprotokoll.
  `DELETE /api/wishlist/done` loescht die Nebenkosten von Herstellern, fuer die nichts mehr auf der Liste steht, damit sie nicht
  in die naechste Bestellung rutschen. Test: `tests/security/wishlist.test.ts`
- **R15**: `computeSettlement` rechnet die Abrechnung rein im Browser aus allen Eintraegen der Bestellliste (`inOrder`, unabhaengig
  von Suche/Filter): Ware je Person = Menge mal Preis; Versand minus Rabatt eines Herstellers wird nach Warenwert (groesster Rest,
  Summe exakt, Rundungs-Cent geht nie verloren) auf die Personen verteilt, die dort etwas bestellt haben (alle Warenwerte 0 =
  gleichmaessig); Eintraege ohne Hersteller haben keine Nebenkosten; Eintraege ohne Preis zaehlen als 0 und werden gemeldet
  (`missingPriceCount`). Person = Name, der beim Hinzufuegen gespeichert wurde. Test: `tests/unit/wishlistSettlement.test.ts`
- **R16**: Export der Abrechnung ohne Server: CSV (Semikolon, Dezimalkomma, BOM, Zellen mit `= + - @` am Anfang werden gegen
  Formel-Einschleusung mit `'` entschaerft) und Text zum Kopieren (Zwischenablage mit Fallback fuer HTTP ohne sicheren Kontext).
  Test: `tests/unit/wishlistSettlement.test.ts`; Oberflaeche manuell im Browser geprueft.
- **R17**: Die Bestellliste fasst Wuensche mit gleichem Hersteller, Material und gleicher Farbe (ohne Farbe: gleichem Titel,
  ohne Beachtung der Gross-/Kleinschreibung) je Hersteller zu einer Position zusammen (`WishlistOrderLine`): Menge summiert,
  Beitragende je Person aufgelistet, Auswahl (keine/teilweise/alle), Status (gemeinsam oder "gemischt") und Preis (gemeinsam oder
  "unterschiedlich") gelten fuer die ganze Position und werden per Sammel-Route auf alle zugehoerigen Wuensche geschrieben.
  Bearbeiten/Loeschen bleibt je Einzelwunsch beim Ersteller bzw. Admin (R2). Test: `tests/unit/wishlistOrder.test.ts`;
  Oberflaeche manuell im Browser geprueft.
