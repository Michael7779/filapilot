# FilaPilot

Selbst-gehostete Filament-Verwaltung für 3D-Drucker (Bambu Lab AMS-Integration + manuelle Pflege), für 2-5 Nutzer pro Instanz, auf eigener Synology installiert, offen auf GitHub für unabhängige Selbst-Installationen.

## Kern-Datenmodelle
- **User** — Benutzername, E-Mail, Passwort-Hash, Rolle (Admin/User), `mustChangePassword`, Passwort-Reset-Token, `themeAccentColor` (nullable — pro Konto anpassbare Akzentfarbe, `null` = Standard)
- **Spool** (Filament-Spule) — Hersteller, Material-Referenz, Farbe, Ursprungsgewicht, Restgewicht, Foto (optional, global abschaltbar), Kaufpreis/-datum, Lagerort
- **Material** — Typ (PLA, PETG, ABS, TPU, ...), Druck-Temperaturprofile
- **Printer** — Bambu-Lab-Drucker (Name, IP, Access-Code, Seriennummer), Verbindungsstatus, Sync-Modus (live/periodisch)
- **PrintJob** — verknüpft Spool(s) + Printer + Verbrauch, Basis für Statistik-Dashboard
- **Settings** — globale Admin-Konfiguration: Foto-Upload an/aus, Drucker-Sync-Modus + Intervall, SMTP-Konfiguration, Backup-Ordner-Pfad, `licenseKey` (nullable, aktuell ungenutzt — vorbereitet für spätere Instanz-Freischaltung, siehe „Lizenzschlüssel" unten)

Jede neue Datenbank-Tabelle muss zu einem dieser Modelle in Beziehung stehen oder es muss begründet werden, warum sie alleinstehend ist.

## Lizenzschlüssel (vorgemerkt, NICHT jetzt bauen)
`Settings.licenseKey` existiert als Platzhalter, damit eine spätere Freischaltung per Lizenzschlüssel ohne Architektur-Umbau andockt. Kein Gating-Code, keine Lizenzprüfung, keine UI dafür bauen, bevor der User das explizit beauftragt.

## Git
- Direkt auf `main` committen für eigene Änderungen; externe Beiträge (Fremd-Instanzen-Betreiber) über Pull Request
- Schema-Änderungen: Dev `pnpm --filter backend exec prisma db push` · Prod `pnpm --filter backend exec prisma migrate deploy`
- Commit-Format: Imperativ, kurz ("Add spool low-stock badge"), max 72 Zeichen, kein Punkt
- Versionierung: SemVer in `package.json` (Root), Start `0.0.1`. Jede sichtbare Änderung fürs Release bekommt einen Versions-Bump + Eintrag in `CHANGELOG.md`. Aktuelle Version wird zur Build-Zeit ins Frontend injiziert und unter Einstellungen → Über angezeigt.

## Tech Stack
- **Profil**: B — Robust & selbst-gehostet (LES2-Vorbild, angepasst: kein Multi-Tenant, dafür Mehrbenutzer mit Rollen)
- **Architektur**: pnpm-Monorepo — `packages/shared` · `packages/backend` · `packages/frontend`
- **Frontend**: React + Vite + Zustand, responsive (Desktop + Mobile aus einer Codebasis), PWA (installierbar via "Zum Homescreen hinzufügen")
- **Backend/API**: Express REST + Socket.IO (Live-Druckerstatus, wenn Sync-Modus = live)
- **Drucker-Anbindung**: eigener Bambu-Lab-MQTT-Connector, verbindet sich lokal direkt mit dem Drucker (Port 8883, User `bblp` + Access-Code) — kein Cloud-Umweg. Sync-Modus (live via MQTT-Subscription oder periodisches Polling) ist pro Drucker in den Einstellungen umschaltbar.
- **UI**: Tailwind CSS v4 (`@theme`-Tokens, kein Custom-CSS), Design-Richtung „Minimal Light" (siehe Design unten)
- **Theming pro Konto**: `User.themeAccentColor` überschreibt die CSS-Variable `--accent` zur Laufzeit (Farbwähler in den eigenen Konto-Einstellungen); `null`/Reset-Button → Standardwert `#2F6FED`. Kein globaler Theme-Editor, nur die eine Akzentfarbe.
- **Validierung**: Zod (v4)
- **Datenbank**: PostgreSQL, läuft im selben `docker-compose` auf der Synology
- **ORM**: Prisma
- **Auth**: Sitzungs-Tokens in der DB, zentral widerrufbar, Rollen Admin/User. Passwort-Reset per E-Mail-Link (zeitlich begrenzter Token). Admin-Neuanlage: automatisch generiertes Startpasswort, Zugangsdaten + Login-Link per E-Mail, optional Pflicht-Passwortwechsel bei erster Anmeldung (`mustChangePassword`).
- **E-Mail-Versand**: Nodemailer über einen vom Admin in den Einstellungen hinterlegten SMTP-Server (kein Versand-Dienst fest verdrahtet)
- **Files**: lokaler Storage im Docker-Volume (eigener Server, unproblematisch) — NIE Supabase
- **Backup**: täglicher Cron-Job (DB-Dump via `pg_dump` + Datei-Ordner + Settings-Export als JSON) in den konfigurierten Backup-Ordner auf der Synology; zusätzlich manueller "Jetzt sichern"-Button für Admins. Restore ist ein bewusster, separat bestätigter Admin-Vorgang (z.B. nach Synology-Wechsel) — nie automatisch beim Start.
- **Hosting**: eigener Server (Synology) via `docker-compose`, Deployment durch `git clone` + `docker compose build` (kein Registry-Pull nötig)
- **Update-Mechanismus**: `scripts/update-synology.sh`, ausgelöst über die Synology-Aufgabenplanung (geplant oder manuell): `git fetch` → `LOCAL`/`REMOTE`-Vergleich → bei Unterschied `git pull` + `docker compose build` + `docker compose up -d`. Voraussetzung: `git`-Binary auf der Synology verfügbar (z.B. Paket "Git Server").
- **Linting**: ESLint + `eslint-plugin-sonarjs` + `eslint-plugin-tailwindcss`
- **Formatting**: Prettier + `prettier-plugin-tailwindcss`
- **Logger**: Winston (eigener Server hat ein Dateisystem)
- **Testing**: `node:test` — Negativ-Tests (`tests/security`) Pflicht; Mutation-Score (Stryker) statt Coverage-Jagd
- **Mehrsprachigkeit**: react-i18next (DE/EN)
- **Workflow**: Superpowers-Plugin (TDD, Planung, Code Review)

## Ordnerstruktur
```
packages/
  shared/                 # geteilte Typen + Zod-Schemas (User, Spool, Material, Printer, PrintJob, Settings)
  backend/
    src/
      routes/             # Express-Routen
      services/           # bambuConnector, backupService, mailService, ...
      middleware/         # auth, rateLimit, errorHandler
      prisma/             # schema.prisma, migrations
    tests/
      unit/ integration/ security/ realtime/
  frontend/
    src/
      components/
      pages/
      stores/             # Zustand, use-Prefix
      hooks/
      i18n/               # de.json, en.json
docker-compose.yml
scripts/
  update-synology.sh
docs/
  requirements/
```

## Naming-Konventionen
- Komponenten: `.tsx`-Dateien, PascalCase (z.B. `SpoolCard.tsx`)
- Hooks: `use`-Prefix (z.B. `useBambuStatus.ts`)
- Zustand-Stores: `use`-Prefix (z.B. `useSpoolStore.ts`)
- Backend-Services: camelCase-Dateiname, ein Service = eine Datei (z.B. `bambuConnector.ts`)

## TypeScript-Regeln
- Kein `any` — bei unvermeidlich: `unknown` + Type-Guard
- Kein `as SomeType` ohne Validierung (Zod oder Type-Guard)
- Return-Types bei öffentlichen Funktionen explizit
- `interface` für erweiterbare Objekte, `type` für Unions
- `satisfies` statt `as` wenn möglich
- Keine `!` (non-null assertion) ohne Kommentar

## Error-Handling
**API-Antwortformat**
Erfolg: `{ data: T, error: null }` · Fehler: `{ data: null, error: { code: string, message: string } }`

**Fehlercodes**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`

**Regeln**
- Fehler nie still schlucken — loggen oder weiterwerfen
- `try/catch` in Services, Route-Handler leiten weiter
- Stack-Traces nie an Client senden

## Performance
- Kein N+1: Joins statt Schleifen mit Einzel-Queries
- Pagination bei allen Listen (limit=50, cursor-basiert)
- Nur benötigte Spalten selektieren
- Keine synchronen Operationen im Request-Handler

## Dependency-Philosophie
- So wenig Pakete wie möglich
- Erst prüfen: Node.js built-in? Framework-Bordmittel? Browser-API?
- Neue Dependency nur wenn: aktiv gewartet, >100k Downloads/Woche, nicht in 50 Zeilen selbst machbar

## Vor jeder Implementierung — PFLICHT
- **Threat-Model** (3 Sätze) bei Backend-Route / Auth / User-Input mit Persistenz / Schema-Änderung:
  1. Wer könnte das missbrauchen? (anonym / eingeloggt / fremder Nutzer ohne Admin-Rolle)
  2. Was muss SERVERSEITIG erzwungen werden? (nicht „Button ausblenden")
  3. Welche Negativ-Tests prüfen das? („Nutzer X versucht Y → 403/404")
  Fehlt das → nicht implementieren, erst Threat-Model nachreichen.
- Neue Funktion VOR Commit als Anforderungs-ID in `docs/requirements/` eintragen + test-verknüpfen
- Neue Route/Handler: `route-checklist`-Skill abarbeiten

## Pflicht-Checkliste (jede neue Route — Details im `route-checklist`-Skill)
- `// SCOPE: global | user | self` — Kommentarzeile über jedem Handler (`global` = nur Admin, `user` = jeder eingeloggte Nutzer, `self` = nur eigene Daten/eigenes Konto)
- Auth-Middleware auf geschützten Routen — bei `self`-Scope zusätzlich Ownership prüfen (z.B. eigene User-ID, nicht nur eingeloggt)
- Kein blindes Update per `id`: `WHERE id = ? AND userId = ?` bei `self`-Scope (nie nur `WHERE id = ?`)
- Alle Eingaben mit Zod validiert (kein `as`-Cast); Whitelist für dynamische Objekt-Keys
- DB-Felder explizit gemappt, kein ganzes DB-Objekt an Client (insbesondere nie `passwordHash`)
- Einheitliches `{ data, error }`-Format · Fehler werden geloggt
- Mindestens EIN Negativ-Test in `tests/security/` („Nutzer X versucht Y → 403/404")
- Kein User-Content in `innerHTML`
- Keine ungenutzten/widersprüchlichen Tailwind-Klassen (Lint muss durchlaufen)
- SonarJS-Warnungen bei cognitive-complexity und duplicate-code behoben

## Tests
- Kategorien: `tests/unit` (keine DB) · `tests/integration` (echte DB, keine Mocks) · `tests/security` (Negativ-Tests) · `tests/realtime` (Socket.IO/MQTT-Events)
- Negativ-Test pro geschützter Route ist PFLICHT — ohne ihn kein Merge
- Test-Qualität über Mutation-Score (Stryker) messen, nicht über Line-Coverage-Prozente
- Jeder Test asserted echtes Verhalten — keine hohlen Tests fürs Zahlenjagen
- Bambu-MQTT-Connector und Backup-Service über injizierbare Abhängigkeiten testen (Mock-Broker, temp. Verzeichnis) — nie gegen einen echten Drucker oder echte Synology-Pfade
- Vor „fertig": Tests laufen lassen und Output zeigen — nie „sieht richtig aus" ohne Lauf

## Anforderungskatalog
- `docs/requirements/<subsystem>.md`: Inventar mit IDs + Status, jede Anforderung testbar + test-verknüpft
- Code weicht vom Soll ab → als „Befund" markieren, nicht still ändern
- Release-Gate: neue Route/Handler als ID eingetragen und test-verknüpft? Sonst Release blockieren
- Detaillierter Ablauf: `anforderung`-Skill

## Design
- Design-Richtung: **Minimal Light** — klares Weiß/Off-White, viel Weißraum, dezente 1px-Border-Karten
- Primärfarbe (Standard, pro Konto überschreibbar): `#2F6FED`
- SVG-Icons, keine Emojis
- Modals statt Slide-Ins, ESC schließt alles
- Form-Labels: normale Schreibweise
- Responsive Pflicht: Desktop- und Mobile-Ansicht aus demselben Komponenten-Set, nicht zwei getrennte UIs

## Mehrsprachigkeit
- Library: react-i18next
- Übersetzungsdateien in: `packages/frontend/src/i18n/{de,en}.json`
- Kein hardcodierter Text in Komponenten — alles über Translation-Keys

## Entwicklungs-Workflow: Superpowers
Dieses Projekt nutzt das Superpowers-Plugin als Entwicklungsmethodik.
Installation: `/plugin install superpowers@claude-plugins-official`

Superpowers steuert den Ablauf:
- Brainstorming → Design-Dokument mit dem User abstimmen
- Plan schreiben → Aufgaben in kleine Häppchen
- Test-Strategie: **strikte TDD** — erst Test, dann Code (RED-GREEN-REFACTOR), durchgängig
- Subagent-Entwicklung → größere/unabhängige Aufgaben von frischen Subagenten
- Code Review → zwischen den Aufgaben, blockiert bei kritischen Problemen
- Branch abschließen → Tests verifizieren, Merge/PR entscheiden

### Projekt-spezifische Regeln (gelten ZUSÄTZLICH zu Superpowers)
**Beim Coden**
- Neue Datei anlegen, wenn eine bestehende über 300 Zeilen wächst
- Tests für Auth, DB-Schreiboperationen und den Bambu-MQTT-Connector sind Pflicht
- SonarJS-Warnungen vor Commit beheben (besonders cognitive-complexity)
- Tailwind-Klassen müssen durch Lint laufen — keine ungenutzten oder widersprüchlichen Klassen
- Keine SMTP-/Drucker-Zugangsdaten hardcoden — immer über `Settings`/Env, nie im Code

**Nach dem Coden**
- Build + Lint + SonarJS laufen lassen, bevor „fertig" gesagt wird
- Kurzer Selbst-Review: Passt das zur CLAUDE.md?

## Was die KI nie tun darf
- Nie fragen, ob Probleme behoben werden sollen — sofort fixen
- Nie behaupten, etwas funktioniert, ohne es geprüft zu haben
- Nie Backend-/Auth-/Input-Code schreiben ohne vorheriges 3-Satz-Threat-Model
- Nie eine geschützte Route mergen ohne Negativ-Test (`tests/security`)
- Nie eine neue Funktion committen ohne Anforderungs-ID + verknüpften Test
- Nie Pakete installieren, ohne kurz zu sagen, warum kein Bordmittel reicht
- Nie Fehler verschlucken
- Nie Tailwind-Klassen raten — im Zweifel in der Tailwind-Doku nachschlagen
- Nie SonarJS-Warnungen mit Kommentaren unterdrücken ohne Begründung
- Nie das Lizenzschlüssel-Feature (Gating, Prüfung, UI) bauen, ohne dass der User das explizit beauftragt

## Niemals
- Kein `console.log` → immer den Logger benutzen (Winston)
- Kein `any` ohne Kommentar
- Keine `.env` oder Secrets committen
- Keine `sleep()`-Loops
- Keine synchronen File-Operationen im Request-Handler
- Kein Copy-Paste ohne Verstehen
- Keine Stack-Traces an den Client
