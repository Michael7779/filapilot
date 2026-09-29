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

echo "Update gefunden: $LOCAL -> $REMOTE. Baue neu..."

# WICHTIG: Ab hier NUR noch innerhalb dieser Funktion arbeiten, nie wieder auf Top-Level-Ebene des
# Skripts. Grund: "git pull" unten schreibt eine neue Version dieser Datei auf die Platte, waehrend
# bash sie noch ausfuehrt - ein klassisches Problem bei selbst-aktualisierenden Skripten. Liesse man
# den Code direkt (ohne Funktion) auf Top-Level nach "git pull" weiterlaufen, koennte die noch
# laufende bash-Instanz je nach Lesepuffer Befehle der ALTEN Datei-Version ausfuehren, obwohl auf der
# Platte laengst die neue steht (so beobachtet: "up -d" lief vor "db push", obwohl die neue Version
# es andersrum vorsah). Eine Funktion umgeht das zuverlaessig: bash muss ihren kompletten Rumpf beim
# Definieren auf einen Schlag vollstaendig einlesen, bevor er aufgerufen werden kann - "git pull"
# aendert die Datei erst DANACH, wenn der Rumpf schon vollstaendig im Speicher steht.
apply_update() {
  git pull origin main
  docker compose build

  # Schema-Abgleich VOR dem Neustart des Backends (nicht danach) - sonst liefe der neue Programmcode
  # fuer den kurzen Moment zwischen "up -d" und "db push" schon gegen die alte Datenbank-Struktur und
  # koennte abstuerzen (so geschehen bei 0.22.0/0.22.1: ein Neustart-Zeitfenster reichte, um den
  # Server in eine Absturzschleife zu schicken). "docker compose run" nutzt das frisch gebaute Image,
  # ohne den noch laufenden alten Backend-Container anzutasten; Postgres laeuft ohnehin durchgehend.
  # Rein additive Schema-Aenderungen (neue Tabelle/Spalte) laufen ohne Rueckfrage durch. Eine potenziell
  # datenverlust-traechtige Aenderung (z.B. eine neue Pflichtspalte auf einer Tabelle mit bestehenden
  # Zeilen) lehnt "prisma db push" ohne "--accept-data-loss" bewusst ab und bricht den Lauf mit einem
  # klaren Fehler im Log ab, statt sie automatisch/unbeaufsichtigt durchzufuehren - das braucht dann
  # einen manuellen Blick (siehe README, Abschnitt Schema-Aenderungen). In diesem Fall wird NICHT
  # neu gestartet, damit die bisherige (noch funktionierende) Version weiterlaeuft.
  docker compose run --rm backend node_modules/.bin/prisma db push --schema=prisma/schema.prisma

  docker compose up -d

  echo "Update abgeschlossen."
}

apply_update
