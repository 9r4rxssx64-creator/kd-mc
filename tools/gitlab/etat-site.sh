#!/bin/sh
# Sonde TOUTES les surfaces du domaine sur le site déployé (kdmc-site.pages.dev).
set -eu
apk add --no-cache curl > /dev/null
B="https://kdmc-site.pages.dev"
sonde(){
  code=$(curl -s -o /tmp/b -w "%{http_code}" --max-time 15 "$B$1" || echo ERR)
  taille=$(wc -c < /tmp/b 2>/dev/null || echo 0)
  case "$code" in
    200) v="EN LIGNE";;
    301|302) v="redirige ($code)";;
    404) v="ABSENT (404)";;
    *) v="? ($code)";;
  esac
  printf "%-34s %-14s %8s o\n" "$1" "$v" "$taille"
}
echo "===== SURFACES DU DOMAINE (site déployé) ====="
sonde "/"                          # CMCteams (planning complet)
sonde "/tools/departs/"            # Départs (page light)
sonde "/lingua/"                   # Lingua
sonde "/arbre/"                    # Arbre généalogique
sonde "/apex-ai-v13/"              # Apex v13
sonde "/apex-ai/"                  # Apex (ancien)
sonde "/messaging-app/"            # Apex Chat
sonde "/kdmc-home/"                # Portail d'accueil
sonde "/shops/"                    # Boutiques
sonde "/shops/dashboard/"          # Dashboard boutiques
sonde "/la-detente/"               # La Détente
sonde "/worldmonitor/"             # World Monitor
sonde "/osint/"                    # OSINT
echo "===== FIN ====="
