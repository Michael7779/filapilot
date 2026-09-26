# Statistik / Druckauftraege

## 1.0 Ist-Stand
- `packages/frontend/src/pages/StatsPage.tsx` berechnet alle Kennzahlen clientseitig aus den
  bereits vorhandenen `/spools`-Daten (`SpoolWithRelations[]`) - kein neuer Backend-Endpunkt,
  keine neue Berechtigungsflaeche (nutzt nur den bestehenden `SCOPE: user`-Read auf Spulen).
- Kennzahlen: Spulen gesamt, verbrauchtes Filament gesamt (`initialWeightG - remainingWeightG`
  je Spule, aufsummiert), Restbestand gesamt, Anzahl Spulen mit niedrigem Bestand (nutzt das
  bereits vorhandene, bis dato unverdrahtete `LOW_STOCK_THRESHOLD_RATIO` aus `@filapilot/shared`),
  sowie Verbrauch aufgeschluesselt nach Material und nach Hersteller (Balkendiagramm aus reinem
  Tailwind/CSS, keine neue Chart-Bibliothek noetig).
- **Bewusst KEIN `PrintJob`-basiertes Tracking**: Das in `CLAUDE.md` vorgesehene
  `PrintJob`-Datenmodell (verknuepft Spule+Drucker+Verbrauch pro Druckauftrag) ist nicht gebaut -
  dafuer muesste zuerst automatische Verbrauchserfassung ueber die Bambu-MQTT-Anbindung stehen
  (haengt an OP-P1/OP-P2 in `printers.md`). Diese Runde nutzt stattdessen die bereits vorhandenen,
  manuell gepflegten Restgewicht-Werte der Spulen - liefert weniger Detail (kein Verlauf pro
  Druckauftrag), aber ist sofort nutzbar ohne die AMS-Fach-Zuordnung erst zu bauen.

## 1.1 Offene Punkte
- OP-ST1: Kein zeitlicher Verlauf (z.B. Verbrauch pro Monat) - dafuer muesste entweder `PrintJob`
  gebaut werden oder Spulen-Aenderungen historisiert werden (aktuell wird nur der aktuelle
  Restgewicht-Wert gespeichert, keine Historie).
- OP-ST2: Sobald `PrintJob` existiert, sollte die Statistik-Seite um Kennzahlen pro Drucker
  (Auslastung, Druckzeit) erweitert werden.

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer sieht eine Uebersicht aus Spulen-Gesamtzahl, verbrauchtem
  Filament, Restbestand und Anzahl Spulen mit niedrigem Bestand.
  Test: manuell per Browser-Klickpfad verifiziert (keine neue Route, reine Client-Aggregation
  bestehender, bereits getesteter `/spools`-Daten - siehe `spools.md` R1/R3/R4).
- **R2**: Verbrauch wird nach Material und nach Hersteller aufgeschluesselt dargestellt, sortiert
  nach Menge absteigend. Test: manuell verifiziert (1 Spule mit 500g Verbrauch → korrekte 0.50 kg
  in beiden Aufschluesselungen).

## 2.0 Verbrauch ueber die Zeit (ab 0.14.5)
- `GET /api/stats/consumption?inventoryId=<uuid|all>&period=day|week|month|year[&from&to&timeZone]` (`routes/stats.ts`, `services/statsService.ts`) rechnet aus
  `SpoolWeightLog` (siehe `spools.md` R12): Summe der positiven Aenderungen je Zeitabschnitt (Tag, Woche = Montag, Monat, Jahr) in der Zeitzone des Browsers,
  aufgeteilt nach Material-Typ (`materialTypeOf`) und Hersteller, Kosten = Gewicht x Kaufpreis / Ursprungsgewicht. Archivierte Spulen zaehlen mit, geloeschte nicht.
  Standard-Zeitraum: 30 Tage, 12 Wochen, 12 Monate, 5 Jahre; hoechstens 400 Abschnitte; `trackingSince` nennt den Beginn der Erfassung.
- Die Zeitlogik (`packages/shared/src/statsPeriod.ts`) ist rein und getestet (Zeitzonen, Wochen-Montag, Jahreswechsel, Zeitumstellung).
- Oberflaeche: `components/ConsumptionChart.tsx` auf der Statistik-Seite (Umschalter, Balken, Summen, Aufteilung, Hinweis "erfasst seit").

## 2.1 Offene Punkte
- OP-ST3: Frueherer Verbrauch (vor 0.14.3) hat kein Datum und erscheint nur in den Gesamtwerten, nicht im Zeitverlauf.
- OP-ST4: Der Tag eines Verbrauchs ist der Tag der Aenderung/des Abgleichs, nicht des Drucks (bei seltenem Abgleich ungenau).
- OP-ST5: Kein Export (CSV) und kein Vergleich mit dem Vorzeitraum.

## 2.2 Anforderungen
- **R3**: Die Verbrauchs-Statistik ist nur mit Lese-Recht im Lager abrufbar (anonym 401, Fremde 404), "all" nur ueber eigene Lager, Eingaben (Periode, Zeitraum,
  Zeitzone, Lager) werden validiert (400), die Rechnung zaehlt nur positive Aenderungen, archivierte Spulen mit, Kosten aus dem Kaufpreis, und beachtet die Zeitzone.
  Tests: `tests/security/stats.test.ts`, `tests/unit/statsPeriod.test.ts`

