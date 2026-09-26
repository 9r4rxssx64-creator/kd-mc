#!/bin/sh
# État du domaine, MESURÉ depuis la machine (elle voit tout, contrairement à l'agent).
# Sonde : le nouveau site Pages, les anciens workers (compte verrouillé mais vivant ?),
# et kd-mc.com. Aucun secret requis. Ne bloque jamais la publication (allow_failure).
set -eu
apk add --no-cache curl > /dev/null
sonde() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$1" || echo ERR)
  case "$code" in
    200|301|302|304|401|403|405) etat="VIVANT ($code)";;
    404) etat="repond mais 404";;
    ERR|000|52*|53*) etat="MORT ($code)";;
    *) etat="? ($code)";;
  esac
  printf "%-58s %s\n" "$1" "$etat"
}
echo "== Nouveau monde (GitLab -> Cloudflare, compte Desarzens-Kevin) =="
sonde https://kdmc-site.pages.dev/
sonde https://kdmc-site.pages.dev/lingua/
sonde https://kdmc-site.pages.dev/arbre/
sonde https://kdmc-site.pages.dev/tools/departs/
sonde https://kdmc-site.pages.dev/apex-ai-v13/
sonde https://kdmc-site.pages.dev/messaging-app/
echo "== Anciens workers (compte verrouille - tournent-ils encore ?) =="
for w in apex-secrets-proxy apex-chat-api apex-push-worker apex-auth-worker \
         kdmc-live kdmc-rag kdmc-balances kdmc-apis kdmc-crea-ai kdmc-access; do
  sonde "https://${w}.9r4rxssx64.workers.dev/"
done
echo "== Le domaine (prisonnier de l'ancien compte) =="
sonde https://kd-mc.com/
sonde https://cmcteams.kd-mc.com/
