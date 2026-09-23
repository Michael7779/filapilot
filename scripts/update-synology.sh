#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Auf Synology laeuft die Aufgabenplanung meist als root, waehrend das Repo per SSH als
# gewoehnlicher Nutzer geklont wurde (z.B. "micky"). Neuere Git-Versionen verweigern bei
# abweichendem Datei-Owner mit "detected dubious ownership" (Exit 128) jeden Zugriff - dieser
# Eintrag ist idempotent und behebt das dauerhaft, unabhaengig vom Klon-Pfad.
if ! git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$REPO_ROOT"; then
  git config --global --add safe.directory "$REPO_ROOT"
fi

git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Kein Update verfuegbar (bereits auf dem neuesten Stand: $LOCAL)."
  exit 0
fi

echo "Update gefunden: $LOCAL -> $REMOTE. Baue und starte neu..."
git pull origin main
docker compose build
docker compose up -d

# Gleicht das Schema automatisch ab, falls sich prisma/schema.prisma geaendert hat. Rein additive
# Aenderungen (neue Tabelle/Spalte) laufen ohne Rueckfrage durch. Eine potenziell
# datenverlust-traechtige Aenderung (z.B. eine neue Pflichtspalte auf einer Tabelle mit
# bestehenden Zeilen) lehnt "prisma db push" ohne "--accept-data-loss" bewusst ab und bricht den
# Lauf mit einem klaren Fehler im Log ab, statt sie automatisch/unbeaufsichtigt durchzufuehren -
# das braucht dann einen manuellen Blick (siehe README, Abschnitt Schema-Aenderungen).
docker compose exec -T backend node_modules/.bin/prisma db push --schema=prisma/schema.prisma

echo "Update abgeschlossen."
