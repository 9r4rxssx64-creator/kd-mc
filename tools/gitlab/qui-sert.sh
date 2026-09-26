#!/bin/sh
# =============================================================================
# QUI SERT VRAIMENT kd-mc.com AUJOURD'HUI ?
# -----------------------------------------------------------------------------
# La question a une conséquence directe en argent-minutes : la publication du
# miroir (publier-site) consomme 54 % des 400 minutes GitLab du mois. On veut la
# passer « à la demande » — mais SEULEMENT si le site vivant ne vient pas de là.
#
# Le routeur (services/kdmc-router/worker.js, ligne 23) dit que l'origine par
# défaut est GitHub Pages :
#     const UPSTREAM_DEFAUT = 'https://9r4rxssx64-creator.github.io';
# …sauf si la variable UPSTREAM_BASE a été posée sur le Worker pendant la
# suspension pour basculer sur le miroir. C'est CE point qu'on vérifie ici, en
# regardant la vraie page servie — pas en supposant.
#
# Le conteneur de l'agent ne peut atteindre aucune de ces adresses (pare-feu,
# HTTP 000 mesuré). Le runner GitLab, lui, le peut. D'où ce script.
#
# Lecture seule. Ne modifie rien.
# =============================================================================
set -eu
apk add --no-cache curl jq > /dev/null 2>&1 || true

emprunte() {          # une empreinte courte et stable de la page servie
  curl -sL --max-time 25 "$1" 2>/dev/null | sha256sum 2>/dev/null | cut -c1-16
}
poids() {
  curl -sL --max-time 25 "$1" 2>/dev/null | wc -c
}

VIVANT="https://kd-mc.com/"
GITHUB="https://9r4rxssx64-creator.github.io/CMCteams/"
MIROIR="https://kdmc-site.pages.dev/"

echo "=== Ce que chaque adresse renvoie ==="
for u in "$VIVANT" "$GITHUB" "$MIROIR"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 25 "$u" || echo 000)
  printf '%-46s HTTP %s  %8s octets  empreinte %s\n' "$u" "$code" "$(poids "$u")" "$(emprunte "$u")"
done

EV=$(emprunte "$VIVANT"); EG=$(emprunte "$GITHUB"); EM=$(emprunte "$MIROIR")
echo
echo "=== VERDICT ==="
if [ "$EV" = "$EG" ] && [ "$EV" = "$EM" ]; then
  echo "  Les trois servent la MÊME page — les deux origines sont à jour."
  echo "  → on ne peut pas trancher par l'empreinte seule ; voir les en-têtes ci-dessous."
elif [ "$EV" = "$EG" ]; then
  echo "  kd-mc.com == GitHub Pages  →  le site vivant vient de GITHUB."
  echo "  → le miroir Cloudflare n'est qu'un filet de secours : sa publication"
  echo "    automatique à chaque push peut passer « à la demande » sans rien figer."
elif [ "$EV" = "$EM" ]; then
  echo "  kd-mc.com == miroir Cloudflare  →  le site vivant vient du MIROIR."
  echo "  ⚠️  NE PAS arrêter publier-site : le site se figerait au dernier envoi."
  echo "     Il faut d'abord rebasculer le routeur sur GitHub Pages (UPSTREAM_BASE)."
else
  echo "  kd-mc.com ne correspond à AUCUNE des deux (page d'accueil du routeur,"
  echo "  redirection, ou contenu réécrit). Regarder les en-têtes ci-dessous."
fi

echo
echo "=== En-têtes de kd-mc.com (qui répond ?) ==="
curl -sSIL --max-time 25 "$VIVANT" 2>/dev/null | grep -iE '^(HTTP/|server|cf-|x-|location|age|via)' | head -20 || true

# --- Côté Cloudflare : le miroir a-t-il un domaine sur lui ? ------------------
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # L'identifiant de compte vient normalement du job verifier-cloudflare. S'il
  # manque (ce job tourne sur une autre branche), on le redemande — 1 requête.
  if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    CLOUDFLARE_ACCOUNT_ID=$(curl -sf -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "https://api.cloudflare.com/client/v4/accounts?per_page=1" | jq -r '.result[0].id // empty')
  fi
  echo
  echo "=== Projets Cloudflare Pages et leurs domaines ==="
  curl -sf -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects?per_page=50" \
    | jq -r '.result[] | "  \(.name)  domaines: \(.domains | join(", ") // "(aucun)")  dernier envoi: \(.latest_deployment.created_on // "?")"' \
    || echo "  (lecture des projets Pages impossible avec cette clé)"
else
  echo
  echo "  (pas de clé Cloudflare dans ce job — partie Pages non lue, dit plutôt que supposé)"
fi
