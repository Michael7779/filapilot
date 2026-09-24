# Aenderungsprotokoll

## 1.0 Ist-Stand
- Tabelle `AuditLog` (`schema.prisma`): Zeitpunkt, Benutzer (`userId` ohne Relation + `username` als
  Momentaufnahme), Aktion (`CREATE`/`UPDATE`/`DELETE`/`EVENT`), Bereich (`SPOOL`, `MATERIAL`,
  `MANUFACTURER`, `PRINTER`, `USER`, `SETTINGS`, `BACKUP`), Bezeichnung, `before`/`after` als JSON.
  Eintraege bleiben lesbar, auch wenn der Benutzer geloescht oder umbenannt wird.
- Aufgezeichnet wird in den Routen (`services/auditService.ts`, Momentaufnahmen in
  `lib/auditSnapshots.ts`): Anlegen/Aendern/Loeschen von Spulen, Materialien, Herstellern, Druckern,
  Benutzern und Einstellungen; Ereignisse: Passwort geaendert/zurueckgesetzt, Sicherung erstellt/
  heruntergeladen/wiederhergestellt, Einrichtung (erster Admin), eigene Akzentfarbe.
- Eine Aenderung ohne Wirkung ("Speichern ohne Aenderung") erzeugt keinen Eintrag (`recordUpdate`).
- Ein fehlgeschlagener Protokoll-Eintrag laesst die eigentliche Aktion nicht scheitern (wird geloggt).
- **Nie im Protokoll**: Passwort-Hashes, Start-/Reset-Passwoerter, Drucker-Zugangscode, SMTP-Passwort - bei
  Aenderung steht nur `accessCodeChanged`/`smtpPasswordChanged`.
- Anzeige: Einstellungen -> Protokoll (`components/AuditLogView.tsx`), nur Admins: Suche, Zeitraum, Bereich,
  Aktion, Benutzer, Seitengroesse (10/25/50/100), Seiten, Detailansicht mit Vorher/Nachher (bei Aenderungen nur
  geaenderte Felder). `GET /api/audit-log`.
- Das Protokoll ist nur lesbar - es gibt keine Route zum Aendern oder Loeschen von Eintraegen.
- Die Wiederherstellung eines Backups ersetzt die ganze Datenbank, also auch das Protokoll auf den Stand der
  Sicherung; der Eintrag "Sicherung wiederhergestellt" wird deshalb erst nach dem Einspielen geschrieben.

- Aufbewahrung: `Settings.auditRetentionMonths` (Standard 12, 0 = unbegrenzt, max. 120), einstellbar unter
  Einstellungen -> System -> Allgemein. Der taegliche Job (03:00 UTC, `backupScheduler.ts`, auch wenn Sicherungen
  ausgeschaltet sind) loescht aeltere Eintraege (`services/auditRetentionService.ts`) und schreibt einen
  Eintrag von "System" mit der Anzahl. Eine Verkuerzung wirkt erst beim naechsten Lauf, nicht beim Speichern.

- Erfolgreiche Anmeldungen und Abmeldungen (Bereich Benutzer) sowie Vorgaenge ohne Benutzer erscheinen im Protokoll;
  Letztere unter dem Namen "System": automatische Sicherung, Aufraeumen des Protokolls, Einspielen der mitgelieferten
  Material-Vorlagen. Foto hochgeladen/entfernt und Sicherung hochgeladen sind Ereignisse des jeweiligen Benutzers.

## 1.1 Offene Punkte
- OP-AU2: Fehlgeschlagene Anmeldungen werden bewusst nicht protokolliert (im Benutzernamen-Feld koennten versehentlich
  Passwoerter stehen); Schutz davor ist die Begrenzung der Anmeldeversuche.
- OP-AU4: Das Protokoll ist aus Datenbank-Sicht nicht manipulationssicher (ein Admin mit Datenbank-Zugriff
  koennte Zeilen aendern); die Anwendung selbst bietet dafuer keinen Weg.

## 1.2 Anforderungen
- **R1**: Nur Admins duerfen das Protokoll lesen (401 ohne Login, 403 als Benutzer); ungueltige Filter
  (Seitengroesse, Bereich, Aktion, Datum, Seite) ergeben 400; es gibt keine Schreib-/Loesch-Routen.
  Test: `packages/backend/tests/security/audit.test.ts`
- **R2**: Anlegen, Aendern (mit Vorher/Nachher) und Loeschen einer Spule werden mit Benutzer und Bezeichnung
  protokolliert; eine Aenderung ohne Wirkung nicht. Test: `tests/security/audit.test.ts`
- **R3**: Geheimnisse (Zugangscode, SMTP-Passwort, Passwort-Hash, Start-Passwort) landen nie im Protokoll.
  Test: `tests/security/audit.test.ts`
- **R4**: Suche, Zeitraum, Bereich, Aktion, Benutzer und Seiteneinteilung filtern/teilen korrekt.
  Test: `tests/security/audit.test.ts`
- **R5**: Die Aufbewahrung (0-120 Monate) kann nur ein Admin aendern (USER -> 403, ungueltig -> 400); das
  Aufraeumen loescht nur Eintraege aelter als die Grenze, bei 0 nichts, und hinterlaesst einen Eintrag.
  Tests: `tests/security/settings.test.ts`, `tests/integration/auditRetention.test.ts`
- **R6**: Erfolgreiche An- und Abmeldung werden protokolliert, eine fehlgeschlagene Anmeldung nicht.
  Test: `tests/security/auditLogins.test.ts`
