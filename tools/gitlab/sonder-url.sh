#!/bin/sh
# Mes YEUX sur le web : lire n'importe quelle page depuis la machine (egress ouvert).
# Declenche par variable SONDER_URL. Lecture seule, 60 premieres lignes.
set -eu
apk add --no-cache curl > /dev/null
echo "===== $SONDER_URL ====="
echo "-- En-tetes:"; curl -sSIL --max-time 20 "$SONDER_URL" | head -12
echo "-- Contenu (debut):"; curl -sL --max-time 20 "$SONDER_URL" | head -c 4000; echo
echo "===== FIN ====="
