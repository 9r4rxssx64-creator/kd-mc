#!/bin/bash
# Publier LE SITE (pas le dépôt) sur Cloudflare Pages — projet kdmc-site.
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# RÉÉCRIT LE 15.09.2026 — Kevin : « passe tout en privé, que personne ne puisse
# voir mon code ». En le préparant, j'ai mesuré ce que ce script envoyait :
#
#   AVANT : `tar cf … .` = LE DÉPÔT ENTIER moins une douzaine d'exclusions.
#           Partaient donc en ligne, sur une adresse publique :
#             services/       2 049 fichiers  (le code de TOUS les workers)
#             apex-ai/       37 498 fichiers  (tout le source TypeScript d'Apex)
#             .github/          193 fichiers  (les automatisations)
#             tests/            188 fichiers
#
#   Autrement dit : mettre le dépôt GitHub en privé n'aurait RIEN caché, parce
#   que le même code était publié ici. Deux portes, on n'en fermait qu'une.
#
#   APRÈS : on envoie le MÊME paquet trié que la publication GitHub — les
#           applications, et rien d'autre. Un seul fabricant de paquet pour les
#           deux chemins : deux recettes séparées finissent toujours par
#           diverger, et c'est la divergence qui fait fuiter.
#
# Ce script reste le chemin de SECOURS (si GitHub est indisponible). Le chemin
# normal est .github/workflows/publier-site-prive.yml.
# ═════════════════════════════════════════════════════════════════════════════

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RACINE"

node services/kdmc-router/prepare-secours.mjs --pages
PAQUET="services/kdmc-router/pages-upload"
test -d "$PAQUET" || { echo "ERREUR : paquet absent"; exit 1; }

# ── Garde AVANT envoi : publier est irréversible ─────────────────────────────
# Ce qui est parti a été servi. On contrôle donc ici, pas après.
fuite=0
md=$(find "$PAQUET" -name '*.md' | wc -l)
[ "$md" -eq 0 ] || { echo "ERREUR : $md document(s) Markdown dans le paquet"; fuite=1; }
for interdit in services tests .github .git pipeline audit apex-ai; do
  [ ! -e "$PAQUET/$interdit" ] || { echo "ERREUR : $interdit ne doit jamais être publié"; fuite=1; }
done
maps=$(find "$PAQUET" -name '*.map' | wc -l)
[ "$maps" -eq 0 ] || { echo "ERREUR : $maps carte(s) de code source (.map)"; fuite=1; }
[ "$fuite" -eq 0 ] || { echo "PUBLICATION ANNULÉE — le paquet contient ce qui doit rester privé."; exit 1; }

echo "fichiers a publier : $(find "$PAQUET" -type f | wc -l)"

# ── LE PIÈGE, mesuré le 24.09.2026 ──────────────────────────────────────────
# « --production-branch=main » n'agit QU'À LA CRÉATION du projet. Le nôtre
# existait déjà. Si sa branche de production n'est pas « main », alors
# « --branch=main » publie un APERÇU : l'adresse éphémère est parfaite, mais
# l'adresse STABLE — la seule que le routeur lit — ne bouge pas et continue de
# servir un vieux paquet. Symptôme vécu : la-detente, chez-lolo et rotaplan en
# 404 sur le domaine alors que tout le reste marchait.
# On DEMANDE donc au projet sa vraie branche de production et son vrai
# sous-domaine, on ne les suppose pas.
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/kdmc-site"
INFOS=$(curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$API" || true)
lire() {
  printf '%s' "$INFOS" | node -e "
    let t='';process.stdin.on('data',d=>t+=d).on('end',()=>{
      try{const j=JSON.parse(t);if(j.success&&j.result)return console.log(j.result['$1']||'');}catch(e){}
      console.log('');});" 2>/dev/null || true
}
PROD_BRANCHE=$(lire production_branch)
SOUS_DOMAINE=$(lire subdomain)
# L'API rend « kdmc-site-bj5.pages.dev » complet : on retire le suffixe (sinon « .pages.dev.pages.dev », 26.09.2026).
SOUS_DOMAINE="${SOUS_DOMAINE%.pages.dev}"
echo "projet kdmc-site — branche de production : '${PROD_BRANCHE:-inconnue}' · sous-domaine : '${SOUS_DOMAINE:-inconnu}'"

# Repli sur l'ancien comportement si Cloudflare n'a pas répondu : jamais pire.
BRANCHE="${PROD_BRANCHE:-main}"
STABLE="https://${SOUS_DOMAINE:-kdmc-site}.pages.dev"

npx --yes wrangler@3 pages project create kdmc-site --production-branch=main 2>/dev/null \
  || echo "(projet kdmc-site deja present)"
npx --yes wrangler@3 pages deploy "$PAQUET" --project-name=kdmc-site --branch="$BRANCHE" --commit-dirty=true
echo "OK site publie sur la branche '$BRANCHE' -> $STABLE"

# ── LA GARDE QUI MANQUAIT ───────────────────────────────────────────────────
# On peut publier parfaitement… à une adresse que le routeur ne lit pas. C'est
# exactement ce qui a mis 3 boutiques en 404 pendant que tout paraissait vert.
ATTENDU=$(grep -oE '^UPSTREAM_BASE *= *"[^"]+"' services/kdmc-router/wrangler.toml \
          | sed -E 's/.*"(.*)"/\1/' | sed -E 's#/+$##' || true)
if [ -n "$ATTENDU" ] && [ "$ATTENDU" != "$STABLE" ]; then
  echo "ERREUR : le site est publie sur $STABLE mais le routeur lit $ATTENDU."
  echo "         Le domaine sert donc un AUTRE paquet (souvent un vieux)."
  echo "         Corrige UPSTREAM_BASE dans services/kdmc-router/wrangler.toml,"
  echo "         puis redeploie le routeur (job deployer-worker)."
  exit 1
fi
echo "le routeur lit bien cette adresse ($ATTENDU) OK"

# Vérification réelle : les 26 adresses répondent-elles depuis le site publié ?
# Un « deploy OK » qui sert des pages vides n'est pas une réussite (leçon #95).
sleep 10
node tools/audit/sonde-site-publie.mjs "$STABLE" --racine
