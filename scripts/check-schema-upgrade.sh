#!/bin/bash
# Release-Gate: Simuliert ein Update so, wie das Update-Skript es auf der Synology macht - altes Schema mit Beispieldaten, dann
# das neue Schema per "prisma db push" OHNE --accept-data-loss. Bricht ab, wenn Prisma eine Freigabe verlangt (z.B. wegen einer neuen
# Eindeutigkeitsregel oder einer Pflichtspalte auf einer gefuellten Tabelle) - genau das wuerde auf der Synology das Update scheitern lassen.
#
# Voraussetzung: Docker, ein laufender Postgres-Container im Docker-Netz "filapilot-test-net" (Name "filapilot-test-db", Benutzer und
# Passwort "filapilot"), git. Aufruf (im Projektordner):
#   bash scripts/check-schema-upgrade.sh <alter-git-stand>      z.B.  bash scripts/check-schema-upgrade.sh v0.13.0  oder  HEAD~1
set -euo pipefail
cd "$(dirname "$0")/.."
OLD_REF="${1:?Bitte den alten Git-Stand angeben, z.B. HEAD~1}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git show "$OLD_REF:packages/backend/prisma/schema.prisma" > "$WORK/old.prisma"
cp packages/backend/prisma/schema.prisma "$WORK/new.prisma"

cat > "$WORK/run.sh" <<'INNER'
#!/bin/bash
set -uo pipefail
export PGPASSWORD=filapilot
apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq postgresql-client openssl >/dev/null 2>&1
mkdir -p /tmp/p && cd /tmp/p && npm init -y >/dev/null 2>&1 && npm i prisma@6 >/dev/null 2>&1
psql -h filapilot-test-db -U filapilot -d postgres -q -c "DROP DATABASE IF EXISTS fp_upgrade_check" -c "CREATE DATABASE fp_upgrade_check"
export DATABASE_URL=postgresql://filapilot:filapilot@filapilot-test-db:5432/fp_upgrade_check
npx prisma db push --schema=/w/old.prisma --skip-generate >/dev/null 2>&1 || { echo "FEHLER: altes Schema liess sich nicht einspielen"; exit 2; }
# Beispieldaten in den Tabellen, die es im alten Stand sicher gibt (Benutzer, Hersteller, Material, Spule, Drucker)
psql -h filapilot-test-db -U filapilot -d fp_upgrade_check -q <<SQL
INSERT INTO users (id, username, email, "passwordHash", role, "mustChangePassword", "updatedAt") VALUES (gen_random_uuid(), 'gate', 'gate@x.test', 'h', 'ADMIN', false, now());
INSERT INTO manufacturers (id, name) VALUES (gen_random_uuid(), 'GateHersteller');
INSERT INTO materials (id, name, "printTempMinC", "printTempMaxC") VALUES (gen_random_uuid(), 'GatePLA', 190, 220);
INSERT INTO spools (id, "materialId", "manufacturerId", "colorName", "initialWeightG", "remainingWeightG", "updatedAt")
  SELECT gen_random_uuid(), m.id, f.id, 'Rot', 1000, 500, now() FROM materials m, manufacturers f;
INSERT INTO printers (id, name, "ipAddress", "serialNumber", "accessCode") VALUES (gen_random_uuid(), 'Gate', '192.0.2.1', 'GATE-1', 'x');
SQL
OUT="$(npx prisma db push --schema=/w/new.prisma --skip-generate 2>&1)"
psql -h filapilot-test-db -U filapilot -d postgres -q -c "DROP DATABASE IF EXISTS fp_upgrade_check"
if echo "$OUT" | grep -q "in sync"; then
  echo "OK: Das neue Schema laesst sich ohne --accept-data-loss auf eine gefuellte Datenbank einspielen."
else
  echo "FEHLER: Das Update-Skript wuerde scheitern:"; echo "$OUT" | grep -iE "warning|unique|data loss|error|cannot|--accept" | head -8; exit 1
fi
INNER

MSYS_NO_PATHCONV=1 docker run --rm --network filapilot-test-net -v "$(cd "$WORK" && pwd -W 2>/dev/null || pwd):/w:ro" node:22-slim bash /w/run.sh
