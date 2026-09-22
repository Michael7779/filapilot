#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

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
echo "Update abgeschlossen."
