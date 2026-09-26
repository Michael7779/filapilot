#!/bin/bash
# Aendert einen Wert in der .env, ohne die Datei von Hand bearbeiten zu muessen (die .env gehoert root und ist
# vor anderen Konten geschuetzt - deshalb geht das bequem ueber eine Aufgabe im Aufgabenplaner).
#
# Aufruf (im Projektordner):
#   bash scripts/set-env.sh FRONTEND_ORIGIN https://filapilot.example.synology.me
#   bash scripts/set-env.sh FRONTEND_PORT 8095
# Danach die Container neu starten:  docker compose up -d
#
# Erlaubt sind nur diese beiden Werte. Passwort und Sitzungs-Schluessel duerfen nie nachtraeglich geaendert
# werden (die Datenbank waere sonst nicht mehr erreichbar, alle Anmeldungen ungueltig).
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${1:-}"
VALUE="${2:-}"

if [ ! -f .env ]; then
  echo "FEHLER: Es gibt noch keine .env - zuerst scripts/init-env.sh ausfuehren." >&2
  exit 1
fi

case "$KEY" in
  FRONTEND_ORIGIN)
    if ! [[ "$VALUE" =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
      echo "FEHLER: Die Adresse muss mit http:// oder https:// beginnen und darf keinen Pfad und keinen / am Ende haben." >&2
      exit 1
    fi
    ;;
  FRONTEND_PORT)
    if ! [[ "$VALUE" =~ ^[0-9]+$ ]] || [ "$VALUE" -lt 1024 ] || [ "$VALUE" -gt 65535 ]; then
      echo "FEHLER: Der Port muss eine Zahl zwischen 1024 und 65535 sein." >&2
      exit 1
    fi
    ;;
  *)
    echo "FEHLER: Erlaubt sind nur FRONTEND_ORIGIN und FRONTEND_PORT (bekommen: '$KEY')." >&2
    exit 1
    ;;
esac

TEMPORARY="$(mktemp .env.XXXXXX)"
trap 'rm -f "$TEMPORARY"' EXIT
# Alle Zeilen ausser dem alten Wert uebernehmen, den neuen Wert anhaengen.
grep -v "^${KEY}=" .env > "$TEMPORARY" || true
echo "${KEY}=${VALUE}" >> "$TEMPORARY"
chmod 600 "$TEMPORARY"
mv "$TEMPORARY" .env
trap - EXIT

echo "Gesetzt: ${KEY}=${VALUE}"
echo "Damit es wirksam wird, die Container neu starten (docker compose up -d)."
