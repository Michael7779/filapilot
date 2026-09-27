# Wunschliste

## 1. Uebersicht
Instanzweite Liste (bewusst nicht pro Lager) fuer eine Sammelbestellung: jeder eingeloggte Nutzer sieht alle Eintraege,
wer sie hinzugefuegt hat und wann, und kann selbst welche hinzufuegen. Modell `WishlistItem` (Titel, Notiz, Menge,
Status offen/bestellt/erledigt, `addedByUserId`/`addedByName` als Momentaufnahme, `updatedByUserId`/`updatedByName`).
Oberflaeche: `pages/WishlistPage.tsx`, eigener Nav-Punkt "Wunschliste".

## 1.1 Offene Punkte
- OP-W1: Kein automatisches Entfernen erledigter Eintraege - die Liste waechst, bis jemand von Hand aufraeumt.
- OP-W2: Kein Verweis von einem Wunsch auf eine konkrete Spule/einen Katalog-Eintrag (reiner Freitext-Titel).

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer kann die Liste lesen und Eintraege anlegen (anonym 401); der Ersteller wird als
  `addedByName` gespeichert und gezeigt.
- **R2**: Titel/Notiz/Menge aendern oder loeschen darf nur der Ersteller oder ein Admin (403 sonst).
- **R3**: Den Status (offen/bestellt/erledigt) darf jeder aktive Nutzer setzen, auch bei fremden Eintraegen -
  bewusst so, damit alle an der Sammelbestellung mitwirken koennen; `updatedByName` haelt fest, wer zuletzt geaendert hat.
- **R4**: Eingaben werden validiert (leerer Titel 400, unbekannter Status 400).

Tests: `packages/backend/tests/security/wishlist.test.ts`. Oberflaeche manuell im Browser geprueft.
