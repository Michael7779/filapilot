# Tests

- `unit/` - reine Logik, keine DB, parallelisierbar.
- `security/` - Negativ-Tests gegen eine echte Test-Datenbank (`DATABASE_URL` in `.env.test`).
  **Muss seriell laufen** (`node --test --test-concurrency=1`, siehe `package.json`), weil
  mehrere Dateien dieselbe DB nutzen und in `before()`/`after()` global aufraeumen
  (`prisma.user.deleteMany()`). Parallel liefen sie sich sonst gegenseitig die Test-User weg -
  genau dieser Fehler ist beim ersten Lauf aufgetreten (siehe docs/requirements/auth.md).
- `integration/` - echte DB, keine Mocks (noch keine Dateien).
- `realtime/` - Socket.IO/MQTT-Events (noch keine Dateien).

Vor dem ersten Lauf: `pnpm --filter backend exec prisma db push` gegen die Test-DB aus
`.env.test`.
