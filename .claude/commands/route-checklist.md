# Route-Checklist (FilaPilot)

Vollständige Sicherheits-Checkliste für JEDE neue oder geänderte Route/Handler im Backend. Vor dem Commit komplett abarbeiten — kein Punkt wird übersprungen, keiner wird „später nachgeholt".

## 1. Threat-Model (3 Sätze, direkt über dem Handler oder im PR)
1. Wer könnte das missbrauchen? (anonym / eingeloggt ohne Berechtigung / eingeloggter Nutzer ohne Admin-Rolle)
2. Was muss SERVERSEITIG erzwungen werden? (niemals nur Frontend-Logik wie „Button ausblenden")
3. Welche Negativ-Tests prüfen genau das?

Fehlt das Threat-Model → Implementierung stoppen, erst nachreichen.

## 2. SCOPE-Kommentar
Direkt über jedem Handler, exakt einer der drei Werte:
```ts
// SCOPE: global   -> nur Admin-Rolle
// SCOPE: user      -> jeder eingeloggte Nutzer, aber nicht nutzerspezifische Daten
// SCOPE: self       -> nur die eigenen Daten/das eigene Konto des angefragenden Nutzers
```
Macht das Auth-Modell für jeden Reviewer sofort sichtbar, ohne den Handler-Body lesen zu müssen.

## 3. Auth & Ownership
- Auth-Middleware auf JEDER geschützten Route (nichts vergessen, auch nicht „nur interne" Routen)
- Rollen-Check bei `SCOPE: global` (z.B. Settings ändern, Nutzer anlegen/löschen, SMTP-Konfiguration)
- Bei `SCOPE: self`: zusätzlich zur Auth-Prüfung die Ownership serverseitig erzwingen —
  `WHERE id = ? AND userId = ?`, NIE nur `WHERE id = ?`. Beispiele: eigene `themeAccentColor` ändern,
  eigenes Passwort ändern, eigenes Konto einsehen.
- Ein `mustChangePassword`-Nutzer darf NUR die Passwort-Ändern-Route erreichen, sonst nichts — das serverseitig
  in der Auth-Middleware prüfen, nicht nur im Frontend-Routing.

## 4. Eingabe-Validierung
- Alle Eingaben (Body, Query, Params) mit Zod validiert — kein `as`-Cast auf ungeprüfte Daten
- Bei dynamischen Objekt-Keys (z.B. Settings-Patch): Whitelist der erlaubten Keys, kein „alles durchreichen"
- E-Mail-Adressen, Dateiuploads (MIME-Type + Größe bei Foto-Upload), Farbwerte (Hex-Format bei `themeAccentColor`)
  explizit validieren

## 5. Antwortform & Datenschutz
- Einheitliches Format: `{ data: T, error: null }` bzw. `{ data: null, error: { code, message } }`
- DB-Felder explizit gemappt, NIE ein rohes Prisma-Objekt an den Client — insbesondere nie `passwordHash`,
  `resetToken`, SMTP-Passwort oder den (zukünftigen) `licenseKey`
- Fehler werden geloggt (Winston), Stack-Traces nie an den Client

## 6. Negativ-Test (PFLICHT, ohne ihn kein Merge)
Mindestens ein Test in `tests/security/`, der das Gegenteil beweist:
- „Nutzer ohne Admin-Rolle versucht Settings zu ändern → 403"
- „Nutzer A versucht Nutzer B's `themeAccentColor` zu ändern → 403/404"
- „Nutzer mit `mustChangePassword=true` versucht eine andere Route aufzurufen → 403"
- „Anonymer Request an eine geschützte Route → 401"

## 7. Sonstiges
- Kein User-Content ungefiltert in `innerHTML`
- Tailwind-Klassen lintbar (keine ungenutzten/widersprüchlichen Klassen)
- SonarJS: cognitive-complexity und duplicate-code behoben, keine unbegründet unterdrückten Warnungen
- Neue Route ohne verknüpfte Anforderungs-ID in `docs/requirements/` → Release-Gate blockiert (siehe `anforderung`-Skill)

## 8. Vor „fertig"
- Tests laufen lassen, Output zeigen (nicht behaupten „sollte gehen")
- Lint + Typecheck grün
