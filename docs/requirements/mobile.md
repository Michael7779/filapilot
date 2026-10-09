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
- **R4**: Ab 0.27.1: In der als Homescreen-App installierten Web-App (iOS: `navigator.standalone === true` oder
  `display-mode: standalone`, siehe `src/lib/installedApp.ts`) liegt einmal im Wurzel-Layout (`App.tsx`, ausserhalb
  der Seiten, damit auch Login/Einrichtung ihn haben) ein unsichtbarer, fester, 11 px hoher Streifen am oberen Rand
  (`InstalledAppTopStrip.tsx`): `aria-hidden`, `pointer-events-none`, Hintergrund `--color-bg` (dieselbe Variable wie
  `<body>`), dazu `background-clip: text` bei transparenter Schrift und ohne Text - es wird nichts gezeichnet. Zweck:
  iOS 26/27 legt sonst einen Unschaerfe-Verlauf ueber den oberen Rand, wenn WebKit dort kein festes, deckendes Element
  findet (nicht von Apple dokumentiert; Ansatz nach FreshRSS PR 9382). Im normalen Browser-Tab wird nichts gerendert.
  FilaPilot hat nur ein helles Farbschema; kommt ein dunkles, muss `--color-bg` dort umdefiniert werden (der Streifen
  folgt automatisch, ein Test erinnert daran). Frontend-Tests: `packages/frontend/tests/unit/installedAppTopStrip.test.tsx`
  (`pnpm --filter frontend test`). Befund/Grenze: Die Wirksamkeit ist NICHT im Browser oder Simulator belegbar und
  steht aus, bis sie auf einem echten iPhone mit iOS 27 geprueft wurde. Offen/Alternativen, falls es nicht hilft:
  (a) `apple-mobile-web-app-status-bar-style` setzen (aktuell gar nicht gesetzt; greift erst nach Loeschen und neuem
  Hinzufuegen der App), (b) die Kopfzeile um einen Zusatzabstand aus `safe-area-inset-top` plus Reserve nach unten
  schieben. Beobachtung dazu: `TopBar` hat feste Hoehe `h-14` plus `pt-[env(safe-area-inset-top)]` - auf dem iPhone
  bleibt dadurch kaum Platz fuer den Inhalt der Kopfzeile (Kandidat fuer (b)).
