# Mobile Ansicht / PWA

## 1.0 Ist-Stand
- Ein Layout fuer Desktop und Smartphone (Breakpoint `md` = 768 px), kein zweites UI.
- Smartphone: Navigation als Leiste unten (`components/BottomNav.tsx`, Symbole aus `NavIcons.tsx`,
  Eintraege in `lib/navItems.ts`), Seitenleiste ausgeblendet; Abmelden unter Einstellungen -> Mein Konto.
  Desktop: Seitenleiste wie bisher.
- Raster: Karten 1 Spalte (Handy) / 2 (ab `sm`) / 3 (ab `xl`); Kennzahlen 2 Spalten (Handy) / 4 (ab `lg`).
- Dialoge: volle Breite bis zum Maximum, hoechstens 90 % der Bildschirmhoehe (`dvh`), scrollbar.
- Tabellen in den Einstellungen scrollen horizontal statt die Seite zu verbreitern.
- Eingabefelder haben auf dem Handy 16 px, damit iOS nicht hineinzoomt.
- PWA: `viewport-fit=cover`, Sicherheitsabstaende (`env(safe-area-inset-*)`) fuer Statusleiste und
  Gestenleiste, `dvh` statt `vh`, kein Gummiband-Scrollen der Seite.

## 1.1 Offene Punkte
- OP-MO1: Keine automatisierten UI-Tests; Pruefung per Browser mit 375x812 (kein horizontaler Ueberlauf
  auf allen Seiten, Navigation sichtbar). Echte Geraete (iOS Safari, Android Chrome) noch nicht getestet.
- OP-MO2: Kein Offline-Betrieb - die App braucht die Verbindung zum Server (der Service Worker cached
  nur die Programmdateien).
- OP-MO3 ✅ (0.22.5, Funktions-Audit): Bei ~1024 px Breite (schmaleres Desktop-Fenster) verursachte die
  Listenansicht der Spulen (breite Tabelle, `min-w-[1000px]`) einen horizontalen Ueberlauf der GESAMTEN Seite
  statt nur innerhalb der eigenen Tabellenkarte zu scrollen - der klassische Flexbox-"min-width: auto"-Fall:
  `<main>` in `App.tsx` war `flex-1 overflow-auto`, aber ohne `min-w-0`, wodurch sein Inhalt (die breite Tabelle)
  die Box ueber die verfuegbare Breite hinaus wachsen liess. Behoben mit `min-w-0` auf `<main>`.

## 1.2 Anforderungen
- **R1**: Auf 375 px Breite entsteht auf keiner Seite ein horizontaler Seiten-Ueberlauf; die untere
  Navigation ist sichtbar, die Seitenleiste nicht. Test: manuell per Browser (Viewport 375x812).
- **R2**: Ab 768 px Breite gilt die Desktop-Ansicht (Seitenleiste, keine untere Leiste).
  Test: manuell per Browser.
- **R3**: Die Titelzeile oben zeigt auf jeder Route der Haupt-Navigation den passenden Namen (`App.tsx`,
  `TITLE_BY_PATH`) - nicht nur auf einer Teilmenge. Befund (0.22.5, Funktions-Audit): `/wunschliste` fehlte in
  der Zuordnung, die Titelzeile zeigte dort faelschlich "Dashboard". Behoben. Test: manuell per Browser
  (jede Route in der Navigation aufgerufen, Titel mit dem Menüpunkt verglichen).
