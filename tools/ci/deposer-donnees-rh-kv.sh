#!/usr/bin/env bash
# Dépose les 4 fichiers de planning (données RH nominatives) dans le KV du routeur, à CHAQUE déploiement du routeur.
#
# Pourquoi (Kevin 30.10.2026 « VERIFI reel dans light et teams », mesuré par le robot verif-live-equipes) : depuis le 16.10 le
# routeur sert ses pages depuis sa copie EMBARQUÉE et `publier-site-prive.yml` est en manuel seul. Mais le routeur sert les
# fichiers de planning (donnees-rh.js) depuis le KV D'ABORD : la copie du 12.10 est restée en ligne — la V2 de novembre,
# fusionnée et « publiée », n'était PAS ce que les employés recevaient (empreinte servie c3eef49575f30d9c = boards-gen.js du
# 12.10, vérifié = a0c52274ac20d3ff). Désormais le déploiement du routeur dépose lui-même ces fichiers.
#
# Gratuit : on LIT d'abord (une lecture ne compte pas dans le plafond d'écritures KV) ; copie identique = 0 écriture.
# Plafond KV du jour (code 10048) : on le DIT (annotation), la copie d'avant reste servie — ce n'est pas une panne du déploiement.
# Env : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (wrangler). Lancé depuis la racine du dépôt (fichiers privés déjà arrivés).
set -eo pipefail
trap 'echo "::error title=Données RH → KV::ARRÊT ligne $LINENO : $BASH_COMMAND"' ERR

NS=$(node -e "const t=require('fs').readFileSync('services/kdmc-router/wrangler.toml','utf8');const m=t.match(/binding\s*=\s*\"ACCOUNTS\"\s*\n\s*id\s*=\s*\"([a-f0-9]+)\"/);console.log(m?m[1]:'')")
[ -n "$NS" ] || { echo "::error::espace KV ACCOUNTS introuvable dans wrangler.toml"; exit 1; }
LISTE=$(node -e "import('./services/kdmc-router/donnees-rh.js').then(m=>console.log(m.DONNEES_RH.map(c=>c+' '+m.cheminDepot(c)+' '+m.cleKV(c.toLowerCase())).join('\n')))" 2>/dev/null)
[ -n "$LISTE" ] || { echo "::error::liste des données RH vide (services/kdmc-router/donnees-rh.js)"; exit 1; }
echo "espace KV : ${NS:0:6}… · $(printf '%s\n' "$LISTE" | wc -l) fichiers"

EXACTS=0; ECRITS=0; PLAFOND=0
for LIGNE in $(printf '%s\n' "$LISTE" | tr ' ' '|'); do
  RESTE=${LIGNE#*|}; FICHIER=${RESTE%%|*}; CLE=${RESTE#*|}
  [ -s "$FICHIER" ] || { echo "::error::$FICHIER absent ou vide — les fichiers privés ne sont pas arrivés dans l'espace de travail"; exit 1; }
  ATTENDU=$(wc -c < "$FICHIER")
  # Identique = même contenu (empreinte), pas seulement la même taille : la V2 de novembre garde parfois la taille d'avant.
  LOCAL_H=$(sha256sum "$FICHIER" | cut -c1-64)
  DEJA=0; DEJA_H=""
  if wrangler kv key get --namespace-id="$NS" "$CLE" > /tmp/deja 2>/dev/null; then DEJA=$(wc -c < /tmp/deja); DEJA_H=$(sha256sum /tmp/deja | cut -c1-64); fi
  if [ "$DEJA_H" = "$LOCAL_H" ]; then echo "  ✅ $CLE déjà à jour dans le KV (${LOCAL_H:0:16}, $ATTENDU octets) : 0 écriture"; EXACTS=$((EXACTS + 1)); continue; fi
  if ! SORTIE=$(wrangler kv key put --namespace-id="$NS" "$CLE" --path="$FICHIER" 2>&1); then
    MSG=$(printf '%s' "$SORTIE" | sed 's/\x1b\[[0-9;]*m//g' | grep -v 'out-of-date\|update available\|npm install\|npx wrangler\|^-*$' | tr '\n' ' ' | cut -c1-1800)
    if printf '%s' "$MSG" | grep -q '10048'; then
      echo "::warning title=Données RH → KV::plafond KV du jour atteint (code 10048) — $CLE NON mis à jour (copie d'avant : $DEJA octets, fichier : $ATTENDU) ; relancer le déploiement après 00h UTC."
      PLAFOND=1; continue
    fi
    echo "::error title=Données RH → KV::put $CLE a échoué : $MSG"; exit 1
  fi
  wrangler kv key get --namespace-id="$NS" "$CLE" > /tmp/relu 2>/tmp/relu.err \
    || { echo "::error title=Données RH → KV::get $CLE a échoué : $(sed 's/\x1b\[[0-9;]*m//g' /tmp/relu.err | tr '\n' ' ' | cut -c1-1800)"; exit 1; }
  RELU_H=$(sha256sum /tmp/relu | cut -c1-64)
  [ "$RELU_H" = "$LOCAL_H" ] || { echo "::error::$CLE : relu ${RELU_H:0:16}, attendu ${LOCAL_H:0:16}"; exit 1; }
  echo "  ✅ $CLE ← $FICHIER ($ATTENDU octets, relu identique ${LOCAL_H:0:16})"; ECRITS=$((ECRITS + 1))
done

if [ "$PLAFOND" = "1" ]; then
  echo "::warning title=Données RH::$EXACTS déjà à jour, $ECRITS déposé(s), le reste attend le plafond KV du jour — la copie d'avant reste servie derrière la connexion."
else
  echo "::notice title=Données RH::planning servi = fichier de la fusion : $EXACTS déjà à jour, $ECRITS déposé(s) dans le KV du routeur (relu, empreinte identique)"
fi
