#!/bin/sh
# Mes YEUX sur Cloudflare : inventorier tout ce que la cle voit (workers, pages,
# KV, R2, zones, jeton). Lecture seule. Declenche par variable REGARDER.
set -eu
apk add --no-cache curl jq > /dev/null
CF() { curl -sf -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "https://api.cloudflare.com/client/v4$1"; }
A="${CLOUDFLARE_ACCOUNT_ID}"
echo "===== INVENTAIRE CLOUDFLARE (compte $A) ====="
echo "-- Jeton"; CF /user/tokens/verify | jq -r '"  etat: \(.result.status)"'
echo "-- Workers"; CF "/accounts/$A/workers/scripts" | jq -r '.result[]? | "  \(.id)  (modifie \(.modified_on[:10]))"' || echo "  (aucun ou refus)"
echo "-- Pages"; CF "/accounts/$A/pages/projects" | jq -r '.result[]? | "  \(.name)  -> \(.subdomain)  (domaines: \(.domains|join(", ")))"' || echo "  (aucun ou refus)"
echo "-- Espaces KV"; CF "/accounts/$A/storage/kv/namespaces?per_page=50" | jq -r '.result[]? | "  \(.title)  (\(.id))"' || echo "  (aucun ou refus)"
echo "-- Seaux R2"; CF "/accounts/$A/r2/buckets" | jq -r '.result.buckets[]? | "  \(.name)  (cree \(.creation_date[:10]))"' || echo "  (aucun, refus, ou R2 non active)"
echo "-- Zones (domaines geres ici)"; CF "/zones?per_page=20" | jq -r '.result[]? | "  \(.name)  [\(.status)]"' || echo "  (aucune)"
echo "===== FIN INVENTAIRE ====="
