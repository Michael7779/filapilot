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

Ausserdem: Login-Seite (`packages/frontend/src/pages/LoginPage.tsx`), Passwort-Aendern-Seite
(`ChangePasswordPage.tsx`) und Bootstrap-Skript fuer den allerersten Admin-Account
(`packages/backend/src/scripts/seedAdmin.ts`, `pnpm run seed:admin`) sind fertig und end-to-end
verifiziert (Login -> 403 vor Passwortwechsel -> Passwortwechsel -> Zugriff frei -> Logout -> 401).

Passwort-vergessen-Flow jetzt komplett inkl. Frontend: `ForgotPasswordPage.tsx`
(`/passwort-vergessen`) und `ResetPasswordPage.tsx` (`/passwort-zuruecksetzen?token=...`, Pfad
muss zum in `mailService.ts` gebauten Link passen). Nutzerverwaltung (Liste + Anlegen) und eigene
Akzentfarbe jetzt ueber `SettingsPage.tsx` erreichbar, nicht mehr nur per API.

**Neu**: `POST /api/users` gibt das Start-Passwort in der Antwort zurueck (`temporaryPassword`),
aber NUR wenn kein SMTP konfiguriert ist (sonst bleibt es leer, geht ausschliesslich per Mail
raus) - sonst haette ein frisch angelegter Nutzer ohne SMTP-Konfiguration keine Moeglichkeit,
an sein Passwort zu kommen. Siehe `mailService.ts` (`sendNewAccountEmail` gibt jetzt zurueck, ob
wirklich verschickt wurde).

## 1.2 Anforderungen
- **R1**: Ein Login mit korrekten Zugangsdaten setzt ein Sitzungs-Cookie und liefert die
  Nutzerdaten (ohne `passwordHash`). Test: `packages/backend/tests/security/auth.test.ts`
- **R2**: Ein Login mit falschem Passwort oder unbekanntem Benutzernamen liefert 401 mit
  identischer Fehlermeldung (kein User-Enumeration-Leak).
  Test: `packages/backend/tests/security/auth.test.ts`
- **R3**: Nur Nutzer mit Rolle `ADMIN` duerfen neue Nutzer anlegen.
  Test: `packages/backend/tests/security/auth.test.ts`
- **R4**: Ein Nutzer kann ausschliesslich seine eigene Akzentfarbe aendern, nie die eines anderen
  Kontos. Test: `packages/backend/tests/security/theming.test.ts` (Details siehe `theming.md`).
- **R4b**: Ein Nutzer mit `mustChangePassword=true` erreicht ausschliesslich `POST /api/auth/change-password`
  und `POST /api/auth/logout` - jede andere geschuetzte Route liefert 403
  (`requirePasswordAlreadyChanged`). Test: `packages/backend/tests/security/auth.test.ts`
- **R5**: `pnpm run seed:admin` legt genau dann einen ersten Admin-Account mit zufaelligem
  Start-Passwort an, wenn die Nutzer-Tabelle leer ist; bei bereits vorhandenen Nutzern passiert
  nichts. Test: noch zu schreiben.
- **R6**: `POST /api/users` gibt `temporaryPassword` nur zurueck, wenn kein SMTP konfiguriert ist.
  Test: `packages/backend/tests/security/auth.test.ts`
- **R7**: Benutzer bearbeiten (Name, E-Mail, Rolle), loeschen und Passwort zuruecksetzen darf nur
  ein Admin (401 ohne Login, 403 als Benutzer); Benutzername/E-Mail bleiben ohne Gross-/Kleinschreibung
  eindeutig (409). Test: `packages/backend/tests/security/auth.test.ts` (Block "Benutzerverwaltung")
- **R8**: Der letzte Admin kann weder geloescht noch herabgestuft werden, das eigene Konto kann nicht
  geloescht werden und das eigene Passwort nicht ueber "zuruecksetzen" (409).
  Test: `packages/backend/tests/security/auth.test.ts`
- **R9**: "Passwort zuruecksetzen" setzt ein Start-Passwort mit Zwangswechsel und beendet alle Sitzungen
  des Benutzers; das Passwort steht nur dann in der Antwort, wenn die Mail nicht versendet wurde.
  Test: `packages/backend/tests/security/auth.test.ts`
- **R10**: `POST /api/settings/smtp-test` (nur Admin, nur an die eigene Adresse) liefert den Fehlertext des
  Mailservers zurueck. Test: `packages/backend/tests/security/settings.test.ts`
