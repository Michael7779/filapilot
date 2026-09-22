# Anforderung (FilaPilot)

Wir erstellen/pflegen den Anforderungskatalog für FilaPilot in `docs/requirements/`.

**CODE-FIRST, NIE ZIRKULÄR**: Lies Schema, Routen und Handler und schreib nieder, was der Code
TATSÄCHLICH TUT (Ist-Stand). Das Soll (was es tun SOLL) kommt ausschließlich vom User — nie raten,
nie den Code als seine eigene Rechtfertigung nehmen.

## Ablauf

1. **Inventar zuerst**: Alle Subsysteme + Workflows mit IDs und Status auflisten:
   - ⬜ nicht begonnen · 🔶 in Arbeit · ✅ fertig + getestet
   - Subsysteme grob entlang der Kern-Datenmodelle: Auth/User, Spool, Material, Printer/Bambu-Sync,
     PrintJob/Statistik, Settings/Backup, Theming
2. **Genau EIN Subsystem pro Runde** bearbeiten, nie mehrere gleichzeitig.
3. Aufbau je Subsystem in `docs/requirements/<subsystem>.md`:
   - **N.0 Ist-Stand** — was der Code aktuell tut, mit Quellenangabe (Datei:Zeile oder Route)
   - **N.1 Offene Punkte** (OP-X1, OP-X2, …) — Unklarheiten, die der User klären muss
   - **N.2 Anforderungen** (R1, R2, … testbar formuliert) — jede mit Test-Referenz am Ende
     (`Test: packages/backend/tests/security/foo.test.ts`)
4. **Abweichung Code ↔ Soll = „Befund"** — explizit markieren, nie still im Code anpassen und nie
   still die Doku ans Code-Verhalten anpassen.
5. **Querverweise statt Duplikate** — ein Datenmodell/eine Regel wird an einer Stelle beschrieben,
   andere Subsysteme verlinken darauf.
6. **Max. 3-5 gezielte Fragen pro Runde.** Nicht raten — fragen.

## Release-Gate

Vor jedem Release: jede neue/geänderte Route oder Funktion muss eine Anforderungs-ID tragen UND mit
mindestens einem Test verknüpft sein. Fehlt eins von beiden → Release blockieren, nicht stillschweigend
durchwinken.
