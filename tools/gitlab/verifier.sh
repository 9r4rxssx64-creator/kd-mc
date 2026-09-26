#!/bin/sh
# Vérifier la clé Cloudflare + découvrir le compte — preuve, pas supposition.
# Appelé par .gitlab-ci.yml (image alpine). La clé arrive par variable masquée.
set -eu
apk add --no-cache curl jq > /dev/null
echo "-- La cle est-elle vivante ?"
curl -sf -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  https://api.cloudflare.com/client/v4/user/tokens/verify > /tmp/v.json
jq -e '.success == true' /tmp/v.json > /dev/null
echo "OK cle VALIDE - etat $(jq -r '.result.status' /tmp/v.json)"
echo "-- A quelle maison appartient-elle ?"
curl -sf -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts?per_page=10" > /tmp/a.json
jq -r '.result[] | "  compte -> \(.name)  (id \(.id))"' /tmp/a.json
ACCOUNT_ID=$(jq -r '.result[0].id' /tmp/a.json)
[ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]
echo "CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID" > compte.env
