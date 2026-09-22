# Theming pro Konto

## 1.0 Ist-Stand
- `User.themeAccentColor` (nullable, `null` = Standard `#2F6FED`) ueberschreibt die CSS-Variable
  `--accent` zur Laufzeit (`packages/frontend/src/stores/useThemeStore.ts`).
- `PATCH /api/users/me/theme` - jeder Nutzer aendert ausschliesslich seine eigene Farbe (`SCOPE: self`,
  Update immer auf `req.user.id`, nie auf eine Body-`userId`).
  Quelle: `packages/backend/src/routes/users.ts`
- Frontend-UI: "Mein Konto"-Sektion in `packages/frontend/src/pages/SettingsPage.tsx` - sechs
  Voreinstellungen + nativer Farbwaehler + "Zuruecksetzen"-Button (setzt `themeAccentColor` auf
  `null`).

## 1.1 Offene Punkte
Keine offenen - R1/R2 unten sind getestet.

## 1.2 Anforderungen
- **R1**: Ein Nutzer kann seine eigene Akzentfarbe setzen und wieder auf Standard zuruecksetzen.
  Test: `packages/backend/tests/security/theming.test.ts`
- **R2**: Ein Nutzer kann nie die Akzentfarbe eines anderen Kontos aendern, auch nicht durch
  Mitschicken einer fremden `userId` im Body. Test: `packages/backend/tests/security/theming.test.ts`
- **R3**: Ohne Session-Cookie liefert die Route 401. Test: `packages/backend/tests/security/theming.test.ts`
