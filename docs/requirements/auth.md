# Auth / User-Verwaltung

## 1.0 Ist-Stand
- Login per Benutzername + Passwort, Sitzungs-Token (SHA-256-gehasht) in `sessions`-Tabelle,
  als httpOnly-Cookie gesetzt. Quelle: `packages/backend/src/routes/auth.ts`,
  `packages/backend/src/services/authService.ts`
- Zwei Rollen: `ADMIN`, `USER` (`packages/backend/prisma/schema.prisma`)
- Admin legt Nutzer an: automatisch generiertes Start-Passwort, `mustChangePassword` per Default
  `true`, Zugangsdaten per E-Mail (`packages/backend/src/routes/users.ts`,
  `packages/backend/src/services/mailService.ts`)
- Passwort-vergessen: zeitlich begrenzter Reset-Token (1 Std.) per E-Mail-Link
  (`packages/backend/src/services/passwordResetService.ts`)
- Pro Konto anpassbare Akzentfarbe (`themeAccentColor`, `PATCH /api/users/me/theme`)

## 1.1 Offene Punkte
- OP-A2: Sitzungs-Ablauf (30 Tage) ist hart codiert - soll das konfigurierbar sein?
- OP-A3: Automatisierter Test fuer `requirePasswordAlreadyChanged` fehlt noch (R4b unten).

## 1.2 Anforderungen
- **R1**: Ein Login mit korrekten Zugangsdaten setzt ein Sitzungs-Cookie und liefert die
  Nutzerdaten (ohne `passwordHash`). Test: `packages/backend/tests/security/auth.test.ts`
- **R2**: Ein Login mit falschem Passwort oder unbekanntem Benutzernamen liefert 401 mit
  identischer Fehlermeldung (kein User-Enumeration-Leak).
  Test: `packages/backend/tests/security/auth.test.ts`
- **R3**: Nur Nutzer mit Rolle `ADMIN` duerfen neue Nutzer anlegen.
  Test: `packages/backend/tests/security/auth.test.ts`
- **R4**: Ein Nutzer kann ausschliesslich seine eigene Akzentfarbe aendern, nie die eines anderen
  Kontos. Test: noch zu schreiben.
- **R4b**: Ein Nutzer mit `mustChangePassword=true` erreicht ausschliesslich `POST /api/auth/change-password`
  und `POST /api/auth/logout` - jede andere geschuetzte Route liefert 403
  (`requirePasswordAlreadyChanged`). Test: noch zu schreiben (OP-A3).
