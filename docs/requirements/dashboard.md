# Dashboard

## 1.0 Ist-Stand
- `pages/DashboardPage.tsx` - Startseite nach der Anmeldung, rein clientseitig aus bereits vorhandenen Routen
  zusammengesetzt (`/spools`, `/materials`, `/printers/:id/status`, `/stats/consumption`) - keine eigene Route,
  keine neuen Backend-Endpunkte.
- Kennzahlen-Kacheln: Spulen gesamt, Gesamtgewicht, aktive Drucke, Material-Arten, ungeoeffnet (unveraendert seit
  Einfuehrung).
- **"Braucht Aufmerksamkeit"** (ab 0.22.7): buendelt Signale, die einzeln schon anderswo in der App stecken -
  fehlgeschlagene Drucke (`PrinterLiveStatus.printState === "failed"`), nicht verbundene Drucker
  (`PrinterLiveStatus.connected === false`), fast leere Spulen (`remainingWeightG / initialWeightG <=
  LOW_STOCK_THRESHOLD_RATIO`, nur geoeffnete, nicht archivierte). Jeder Eintrag verlinkt auf die passende Seite;
  "Fast leer" gibt der Spulen-Seite ueber `location.state.presetFilter` direkt `lowStockOnly: true` mit (siehe
  `spools.md` R25). Ohne Befund: neutrale "Alles im gruenen Bereich"-Meldung statt einer leeren Karte. Bewusst
  keine Signale ohne vorhandenes Datenfeld (z.B. "Trocknung faellig" - es gibt kein Faelligkeitsdatum im Modell).
- **Diagramm "Verbrauch ueber die Zeit"**: die bestehende `components/ConsumptionChart.tsx` von der
  Statistik-Seite wird unveraendert wiederverwendet (gleiche Komponente, gleicher Endpunkt) - kein zweites,
  eigenes Diagramm-System.
- **"Restbestand nach Material-Typ"**: neue, dashboard-eigene Kachel (anders als die Statistik-Seite, die nur
  *Verbrauch* zeigt) - Restgewicht aller nicht archivierten Spulen gruppiert nach `materialTypeOf(materialName)`,
  gleiche Balken-Optik wie die Aufschluesselungen der Statistik-Seite.
- "Lager im Vergleich" (nur in der "Alle Lager"-Ansicht) unveraendert.

## 1.1 Offene Punkte
- OP-D1: Kein Offline-/Fehler-Signal aus dem Backup-Prozess oder der Bambu-Cloud-Verbindung auf dem Dashboard -
  nur Drucker-Live-Status und Restgewicht. Bei Bedarf spaeter ergaenzbar (Daten existieren teilweise schon, z.B.
  `BambuConnectionInfo.connected`).

## 1.2 Anforderungen
- **R1**: Jeder eingeloggte Nutzer sieht auf dem Dashboard die fuenf Kennzahlen-Kacheln seines gewaehlten Lagers
  (bzw. aller Lager in der Uebersicht). Rein clientseitig, keine eigene Route - Rechte kommen von den
  zugrundeliegenden Endpunkten (`/spools`, `/materials`, `/printers`). Test: manuell im Browser.
- **R2**: Ab 0.22.7: "Braucht Aufmerksamkeit" zeigt fehlgeschlagene Drucke, nicht verbundene Drucker und fast
  leere Spulen als anklickbare Zeilen (Ziel-Seite passend zum Signal); ohne Befund erscheint eine neutrale
  Erfolgsmeldung statt einer leeren Liste. Test: manuell im Browser (Drucker offline/fehlgeschlagen und
  fast-leere Spule simuliert, Klick auf "Fast leer" oeffnet die Spulen-Seite mit angehaktem "Nur fast leere").
- **R3**: Ab 0.22.7: "Restbestand nach Material-Typ" zeigt nur nicht archivierte Spulen, gruppiert nach
  Material-Typ, absteigend sortiert; ohne Bestand erscheint ein Leertext statt einer leeren Karte.
  Test: manuell im Browser.
