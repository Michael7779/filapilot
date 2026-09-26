#!/bin/bash
# Erzeugt die .env fuer FilaPilot - ohne dass etwas von Hand eingetippt werden muss:
#   - POSTGRES_PASSWORD und SESSION_SECRET werden zufaellig erzeugt (nie selbst ausdenken),
#   - ein freier Port wird gesucht (ab 8090), damit es keinen Konflikt mit anderen Anwendungen gibt,
#   - die Adresse fuer FRONTEND_ORIGIN wird aus der IP-Adresse der NAS gebildet.
#
# Aufruf (im Projektordner):
#   bash scripts/init-env.sh                       # freier Port ab 8090, Adresse http://<NAS-IP>:<Port>
#   bash scripts/init-env.sh 8095                  # festen Port verwenden
#   bash scripts/init-env.sh 8090 https://filapilot.example.synology.me   # Adresse von aussen
#
# Eine vorhandene .env wird NIE ueberschrieben (sonst waeren Passwort und Sitzungs-Schluessel weg und die
# Datenbank nicht mehr erreichbar). Die Datei bekommt die Rechte 600; Werte ausgeben wir bewusst nicht.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo "FEHLER: Im Ordner $(pwd) gibt es schon eine .env - sie wird nicht ueberschrieben." >&2
  echo "Wenn du sie wirklich neu erzeugen willst, benenne die alte Datei zuerst um." >&2
  exit 1
fi

PORT="${1:-}"
PUBLIC_URL="${2:-}"

# Ein Port ist belegt, wenn sich auf dem eigenen Rechner jemand damit verbinden laesst.
port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

if [ -z "$PORT" ]; then
  PORT=8090
  while port_in_use "$PORT" && [ "$PORT" -lt 8190 ]; do
    PORT=$((PORT + 1))
  done
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  echo "FEHLER: Der Port muss eine Zahl zwischen 1024 und 65535 sein (bekommen: $PORT)." >&2
  exit 1
fi

if [ -n "$PUBLIC_URL" ]; then
  if ! [[ "$PUBLIC_URL" =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
    echo "FEHLER: Die Adresse muss mit http:// oder https:// beginnen und darf keinen Pfad und keinen / am Ende haben." >&2
    exit 1
  fi
  ORIGIN="$PUBLIC_URL"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$IP" ]; then
    IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}' || true)"
  fi
  ORIGIN="http://${IP:-NAS-IP}:${PORT}"
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

umask 077
{
  echo "# Von scripts/init-env.sh erzeugt. Nie weitergeben oder auf GitHub hochladen."
  echo "POSTGRES_PASSWORD=$(random_hex)"
  echo "SESSION_SECRET=$(random_hex)"
  echo "FRONTEND_ORIGIN=${ORIGIN}"
  echo "FRONTEND_PORT=${PORT}"
} > .env

echo "Fertig: .env wurde angelegt."
echo "FilaPilot ist danach erreichbar unter: ${ORIGIN}"
echo "Port: ${PORT}"
