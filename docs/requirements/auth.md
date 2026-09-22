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
- OP-A4: Kein Test fuer R4 (eigene Akzentfarbe aendern) vorhanden.

Ausserdem: Login-Seite (`packages/frontend/src/pages/LoginPage.tsx`), Passwort-Aendern-Seite
(`ChangePasswordPage.tsx`) und Bootstrap-Skript fuer den allerersten Admin-Account
(`packages/backend/src/scripts/seedAdmin.ts`, `pnpm run seed:admin`) sind fertig und end-to-end
verifiziert (Login -> 403 vor Passwortwechsel -> Passwortwechsel -> Zugriff frei -> Logout -> 401).

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
  (`requirePasswordAlreadyChanged`). Test: `packages/backend/tests/security/auth.test.ts`
- **R5**: `pnpm run seed:admin` legt genau dann einen ersten Admin-Account mit zufaelligem
  Start-Passwort an, wenn die Nutzer-Tabelle leer ist; bei bereits vorhandenen Nutzern passiert
  nichts. Test: noch zu schreiben.
