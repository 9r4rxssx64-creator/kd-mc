#!/bin/bash
# PORTE DE RATION des gros robots du coffre (Kevin 15.10.2026 : « Économise le forfait action. Au maximum, trouve des solutions pour ne
# jamais plus être bloqué »). Premier pas d'un gros robot : lire ce qui est DÉJÀ consommé aujourd'hui (jour UTC) et refuser de démarrer si
# la ration restante ne couvre pas le coût du robot (un robot de 27 min ne démarre pas quand il n'en reste que 10 : il aurait fait
# basculer le dépôt dans le « quota épuisé » qui bloque TOUS les autres, comme le 12.10).
#   usage : bash tools/ci/porte-ration.sh <minutes que ce robot coûte>
# Fail-OUVERT : si la ration ne peut pas être lue (API muette), on laisse partir — la porte ne doit jamais bloquer à tort.
# Contournement explicite : l'entrée « forcer_ration » du robot (à n'utiliser qu'avec l'accord de Kevin).
set -uo pipefail
besoin="${1:-10}"
jour=$(date -u +%F)
dest="${RATION_JSON:-/tmp/ration-runs.json}"
if ! gh api "repos/${GITHUB_REPOSITORY}/actions/runs?created=%3E%3D${jour}&per_page=100" > "$dest" 2>/tmp/ration-err.txt; then
  echo "::warning title=Porte de ration::la ration du jour n'a pas pu être lue ($(head -c 120 /tmp/ration-err.txt)) — on laisse partir (fail-ouvert)."
  exit 0
fi
node tools/ci/ration-actions.mjs --runs "$dest" --besoin "$besoin"
code=$?
if [ "$code" -ne 0 ]; then
  echo "::error title=Ration du jour insuffisante::ce robot coûte ~${besoin} min et la ration du jour ne les couvre pas. Il ne démarre pas. Relance-le demain (jour UTC), lance-le en LOCAL, ou coche « forcer_ration » avec l'accord de Kevin."
fi
exit "$code"
