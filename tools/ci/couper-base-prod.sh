#!/usr/bin/env bash
# v9.923 (27.09.2026) — Les tests du coffre ne touchent JAMAIS la vraie base CMCteams.
# Mesuré : 116 tests sur 143 ouvrent index.html sans bloquer Firebase. En CI (réseau ouvert),
# ils LISAIENT le planning de production (test:departs-algo rouge sur main quand la base a
# changé) et un navigateur neuf y ÉCRIVAIT (jeton anonyme). En local, le proxy la bloquait.
# Ici : les 3 adresses pointent vers « nulle part », puis on PROUVE qu'elles sont injoignables.
# Les tests qui simulent la base (page.route) ne passent pas par le DNS : ils marchent toujours.
# Garde : npm run test:visiteur-ne-vide-pas (vérifie que les 2 robots appellent ce script).
set -euo pipefail
HOTES="cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app identitytoolkit.googleapis.com securetoken.googleapis.com"
for h in $HOTES; do
  printf '0.0.0.0 %s\n:: %s\n' "$h" "$h" | sudo tee -a /etc/hosts >/dev/null
done
for h in $HOTES; do
  ip=$(getent ahosts "$h" | awk '{print $1}' | sort -u | tr '\n' ' ')
  case "$ip" in
    "0.0.0.0 :: "|"0.0.0.0 "|":: "|":: 0.0.0.0 ") ;;
    *) echo "::error::$h résout encore vers : $ip"; exit 1 ;;
  esac
done
if curl -sS --max-time 8 -o /dev/null "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/.json" 2>/dev/null; then
  echo "::error::la base de production répond encore : les tests la toucheraient"; exit 1
fi
echo "Base de production injoignable pour les tests (3 adresses) ✓"
