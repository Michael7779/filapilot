# Design: Mehrere Lager (Multi-Filamentverwaltung)

Stand: Entwurf zur Abstimmung. Ziel-Version: 0.13.0. Der Import aus der Bambu-Cloud (0.14.0) ist ein eigenes Design
und baut auf diesem auf.

## 1. Ziel

Ein Team kann mehrere getrennte Filament-Bestände führen, z. B. "Werkstatt", "Büro", "Makerspace". Jedes **Lager** hat
eigene Spulen, eigene Drucker, ein eigenes Dashboard und eine eigene Statistik sowie eigene Mitglieder mit Rechten.
Der Katalog (Hersteller, Materialien), die Benutzerkonten, E-Mail-Einstellungen und Sicherungen bleiben gemeinsam.

Entscheidungen des Nutzers (2026-09-26):
- Lager sind **geteilt mit Mitgliedern**, nicht privat pro Benutzer.
- Jeder **Drucker gehört fest zu genau einem Lager**.
- Lager lassen sich **frei benennen** (Name frei wählbar, mehrere pro Installation).
- Es bleibt bei **einem Server / einem Team** - keine Mandantentrennung mit eigenen Benutzern und Einstellungen
  (CLAUDE.md: "kein Multi-Tenant").
- Der spätere Import aus der Bambu-Cloud erfolgt **pro Lager**.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| Lager (Code: `Inventory`) | Ein benannter Filament-Bestand mit Mitgliedern |
| Mitglied | Benutzer mit einer Rolle in einem Lager |
| Besitzer (`OWNER`) | verwaltet das Lager (umbenennen, Mitglieder, löschen) und darf alles bearbeiten |
| Bearbeiter (`EDITOR`) | Spulen anlegen, ändern, löschen, verschieben |
| Betrachter (`VIEWER`) | nur ansehen |
| Admin (Rolle der Installation) | sieht und verwaltet **alle** Lager (wie Besitzer überall), ohne Mitglied sein zu müssen |

## 3. Datenmodell

Neue Tabellen (beide hängen an bestehenden Modellen, wie CLAUDE.md verlangt):

```prisma
model Inventory {
  id        String            @id @default(uuid())
  name      String                                   // eindeutig ohne Beachtung der Groß-/Kleinschreibung (Code-Prüfung)
  color     String            @default("#2F6FED")   // Farbpunkt im Umschalter, nur aus fester Palette
  createdAt DateTime          @default(now())
  members   InventoryMember[]
  spools    Spool[]
  printers  Printer[]
  @@map("inventories")
}

model InventoryMember {
  id          String        @id @default(uuid())
  inventoryId String
  inventory   Inventory     @relation(fields: [inventoryId], references: [id], onDelete: Cascade)
  userId      String
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        InventoryRole                            // OWNER | EDITOR | VIEWER
  createdAt   DateTime      @default(now())
  @@unique([inventoryId, userId])
  @@index([userId])
  @@map("inventory_members")
}
```

Änderungen an bestehenden Tabellen:
- `Spool.inventoryId` und `Printer.inventoryId` (Fremdschlüssel auf `Inventory`, `onDelete: Restrict` - ein Lager mit
  Spulen oder Druckern lässt sich nicht löschen).
- `AuditLog.inventoryId` (optional, ohne Fremdschlüssel wie `userId`, damit Einträge nach dem Löschen lesbar bleiben)
  plus `inventoryName` als Momentaufnahme; Index auf `inventoryId`.
- `PrintJob` und `AmsSlotAssignment` bekommen **keine** eigene Spalte: Das Lager ergibt sich aus Drucker bzw. Spule.
  Beim späteren Zuordnen eines AMS-Fachs wird geprüft, dass Spule und Drucker im selben Lager liegen.
- `Manufacturer`, `Material`, `Settings`, `Session`: unverändert.

**Migration bestehender Daten** (die Datenbank wird per `prisma db push` abgeglichen, das keine Daten umschreiben kann,
und eine neue Pflichtspalte auf gefüllten Tabellen würde es ablehnen, siehe früherer Fehler bei `manufacturerId`):
- `inventoryId` ist in der Datenbank zunächst **optional** (`String?`). Beim Start legt `ensureDefaultInventory()`
  (wie der bestehende `ensureCatalog()`) ein Lager **"Hauptlager"** an, falls es noch keines gibt, ordnet alle Spulen und
  Drucker ohne Lager diesem zu und macht **alle bestehenden Benutzer zu Mitgliedern**: Admins als Besitzer, alle anderen
  als Bearbeiter. Dadurch ändert sich für bestehende Installationen zunächst nichts.
- Der Code schreibt nie mehr eine Spule oder einen Drucker ohne Lager (Zod + Service); die Spalte kann in einer späteren
  Version auf Pflicht gestellt werden.
- Das Backup enthält die neuen Tabellen. Eine ältere Sicherung (vor 0.13.0) lässt sich weiter wiederherstellen: Nach dem
  Einspielen füllt `ensureDefaultInventory()` die fehlenden Lager.
- Neue Benutzer werden **nicht** automatisch Mitglied. Ein Besitzer oder Admin fügt sie hinzu. Einzige Ausnahme: Wer ein
  Lager anlegt, wird dessen Besitzer.

## 4. Rechte (serverseitig)

Zentrale Hilfsfunktion `resolveInventoryAccess(user, inventoryId)` liefert die Rolle (Admin = `OWNER`) oder **nichts**.
Ohne Zugriff antwortet der Server mit **404**, nicht mit 403, damit niemand erkennt, dass ein fremdes Lager existiert.

| Aktion | Mindest-Rolle |
|---|---|
| Lager ansehen, Spulen/Drucker/Statistik lesen | `VIEWER` |
| Spule anlegen, ändern, löschen, Foto ändern | `EDITOR` |
| Spule in anderes Lager verschieben | `EDITOR` im Quell- **und** Ziel-Lager |
| Lager umbenennen, Farbe, Mitglieder verwalten, leeres Lager löschen | `OWNER` |
| Neues Lager anlegen | jeder angemeldete Benutzer (wird Besitzer) |
| Drucker anlegen/ändern/löschen | **Admin** (unverändert, wegen des Zugangscodes) |
| Drucker-Live-Status lesen | `VIEWER` des zugehörigen Lagers |

Schutzregeln: Das letzte `OWNER`-Mitglied eines Lagers kann sich nicht selbst entfernen oder herabstufen (außer ein Admin
übernimmt); ein Benutzer wird beim Löschen seines Kontos aus allen Lagern entfernt; ein Lager mit Spulen oder Druckern
lässt sich nicht löschen (409, mit Hinweis "erst Spulen verschieben oder löschen").

## 5. Schnittstellen (API)

Bestehende Pfade bleiben, bekommen aber einen Lager-Bezug (die eigene Oberfläche ist der einzige Client):

| Route | Änderung |
|---|---|
| `GET /api/spools?inventoryId=<id>` | Pflicht-Parameter; `inventoryId=all` liefert die Spulen **aller Lager, in denen man Mitglied ist**, mit `inventoryId` und `inventoryName` (Nur-Lesen-Übersicht) |
| `POST /api/spools` | `inventoryId` im Body, Rolle `EDITOR` |
| `GET/PATCH/DELETE /api/spools/:id`, `/api/spools/:id/photo` | Lager der Spule wird geladen und geprüft; `PATCH` darf `inventoryId` ändern (Verschieben) |
| `GET /api/printers?inventoryId=<id>` | analog; Anlegen/Ändern: Admin, mit `inventoryId` |
| `GET /api/inventories` | eigene Lager mit Rolle und Kennzahlen (Anzahl Spulen); Admin: alle |
| `POST /api/inventories` | anlegen (Name, Farbe) |
| `PATCH/DELETE /api/inventories/:id` | umbenennen/Farbe (`OWNER`); löschen nur wenn leer |
| `GET/POST/PATCH/DELETE /api/inventories/:id/members[/:userId]` | Mitglieder (`OWNER`) |
| `GET /api/audit-log?inventoryId=` | zusätzlicher Filter (Admin) |

Die Statistik rechnet weiterhin in der Oberfläche aus der Spulenliste des gewählten Lagers (bzw. aller).

**Live-Status (Socket.IO):** Beim Verbinden tritt jeder Client den Räumen `inventory:<id>` seiner Lager bei;
Druckerstatus wird nur in den Raum des Druckers gesendet (statt an alle). Die vorhandene Minuten-Prüfung der Verbindungen
gleicht Räume nach Mitgliedschaftsänderungen ab.

## 6. Oberfläche

- **Umschalter** oben in der Seitenleiste (Farbpunkt, Name, Liste der Lager, Eintrag "Alle Lager"). Auf dem Handy in
  der Kopfzeile. Das zuletzt gewählte Lager wird im Browser gemerkt (`localStorage`); bei ungültiger Auswahl gilt das
  erste Lager.
- Wer nur in **einem** Lager ist, sieht dessen Namen ohne Auswahlliste (nur der Weg "Neues Lager" bleibt in den
  Einstellungen).
- **"Alle Lager"**: Dashboard mit Zahlen je Lager und Summen (nur lesen, Bearbeiten erst nach Wechsel in ein Lager).
- **Einstellungen → Lager** (Besitzer/Admin): Liste, anlegen, umbenennen, Farbe aus fester Palette, Mitglieder mit Rolle
  (Auswahlliste alphabetisch sortiert), Lager löschen (nur leer).
- Spulenkarte: Aktion "In anderes Lager verschieben" (Auswahlliste der Lager mit Bearbeiter-Recht).
- Die Anzeige passt sich an: Betrachter sehen keine Bearbeiten-Knöpfe (die Prüfung passiert zusätzlich serverseitig).
- Texte über i18n (DE/EN), Mobile aus denselben Komponenten.

## 7. Threat-Model (Backend-Route, Persistenz, Schema-Änderung)

1. **Wer könnte das missbrauchen?** Ein angemeldeter Benutzer ohne Mitgliedschaft, der Spulen, Drucker, Fotos oder
   Live-Status eines fremden Lagers lesen oder ändern will (IDs raten, `inventoryId=all` oder `inventoryId` fälschen);
   ein Betrachter, der schreiben will; ein Bearbeiter, der Mitglieder verwalten oder ein Lager löschen will; ein Anonymer.
2. **Was muss serverseitig erzwungen werden?** Bei **jeder** Route wird die Rolle aus der Datenbank über die
   Mitgliedschaft berechnet (`resolveInventoryAccess`), nie aus dem Client; ohne Zugriff 404; bei Einzelobjekten (`/:id`,
   Foto) wird das Lager des Objekts geladen und geprüft, nicht das vom Client gemeldete; Verschieben braucht `EDITOR` in
   beiden Lagern; `inventoryId=all` filtert per Mitgliedschaft; Live-Status nur in Lager-Räume; Zod für alle Eingaben
   (UUID, Name-Länge, Farbe aus Palette); Lager-Name eindeutig; kein Löschen nicht leerer Lager; letzter Besitzer geschützt.
3. **Welche Negativ-Tests prüfen das?** Siehe Abschnitt 9 (u. a. "Benutzer X ohne Mitgliedschaft liest/ändert/löscht
   Spule in Lager Y → 404", "Betrachter legt Spule an → 403", "Bearbeiter fügt Mitglied hinzu → 403", "`inventoryId=all`
   enthält kein fremdes Lager", "Socket-Client erhält keinen Status eines fremden Lagers").

## 8. Umsetzung in Schritten (jeweils Test zuerst, dann Code, dann lokal committen)

1. **Schema + Zugriffslogik:** neue Tabellen, `ensureDefaultInventory()`, `resolveInventoryAccess`, Tests der Migration.
2. **Lager-Routen** (`/api/inventories`, Mitglieder) mit Negativ-Tests.
3. **Spulen und Fotos** auf Lager umstellen (bestehende Tests anpassen, neue Negativ-Tests).
4. **Drucker und Live-Status** (Räume) umstellen.
5. **Protokoll** (`inventoryId` in Einträgen, Filter).
6. **Oberfläche:** Store, Umschalter, "Alle Lager", Spulen/Drucker/Statistik/Dashboard je Lager.
7. **Einstellungen → Lager** und Verschieben-Aktion.
8. **Dokumentation:** Anforderungen, Änderungsverlauf, Installationsanleitung (Abschnitt "Lager"), Version 0.13.0.

Vor dem Freigeben: Typecheck, Lint, alle Tests, echter Durchlauf im Browser (zwei Benutzer, zwei Lager, Rechte prüfen).

## 9. Testplan (Auswahl der Negativ-Tests, `tests/security/inventories.test.ts` u. a.)

- Ohne Login → 401 auf allen Lager-Routen; `mustChangePassword` → 403.
- Kein Mitglied → 404 bei Lager, Spulenliste, Spule (lesen/ändern/löschen), Foto, Mitgliederliste.
- Betrachter → 403 bei Spule anlegen/ändern/löschen/Foto; Bearbeiter → 403 bei Mitglieder verwalten, umbenennen, löschen.
- Verschieben: nur mit `EDITOR` in beiden Lagern (sonst 404/403), Ziel-Lager unbekannt → 404.
- `inventoryId=all` zeigt nur eigene Lager; Admin sieht alle.
- Lager löschen mit Spulen/Druckern → 409; letzter Besitzer entfernen → 409; doppelter Name (Groß-/Kleinschreibung) → 409.
- Benutzer löschen entfernt Mitgliedschaften; Lager-Name/Farbe/Rolle-Eingaben werden validiert (400).
- Migration: bestehende Spulen/Drucker landen im "Hauptlager", bestehende Benutzer als Mitglieder; zweiter Start ändert nichts.
- Socket: Client ohne Mitgliedschaft erhält keinen Status; nach Entzug der Mitgliedschaft nach spätestens einer Minute nicht mehr.

## 10. Bewusst nicht enthalten / später

- Import aus der Bambu-Cloud (0.14.0, pro Lager, einmaliger Import mit Vorschau).
- Eigene Kataloge pro Lager (Hersteller/Materialien bleiben gemeinsam).
- Lager-spezifische Benachrichtigungen, Einladungen per E-Mail-Link, Archivieren statt Löschen.
- Ein Drucker für mehrere Lager (Entscheidung: fest ein Lager).

## 11. Annahmen, die du korrigieren kannst

1. **Jeder angemeldete Benutzer darf ein Lager anlegen** (und wird dessen Besitzer). Alternative: nur Admins.
2. **Ein Lager lässt sich nur löschen, wenn es leer ist.** Alternative: Löschen mit Bestätigungswort samt Inhalt.
3. **Drei Rollen** (Besitzer, Bearbeiter, Betrachter). Alternative: nur "Mitglied" (alle dürfen bearbeiten).
4. **Bestehende Benutzer werden Mitglieder des "Hauptlagers"** (Admins Besitzer, andere Bearbeiter).
5. **Drucker anlegen bleibt Admin-Sache**, auch wenn ein Besitzer sein Lager verwaltet (Schutz des Zugangscodes).
