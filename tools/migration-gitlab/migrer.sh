#!/usr/bin/env bash
# =============================================================================
# MIGRATION VERS GITLAB — pousse tout le dépôt, historique compris.
# -----------------------------------------------------------------------------
# Le compte GitHub de Kevin a été suspendu le 15/08/2026 et le support a refusé
# de lever la restriction. Ce script transfère le dépôt vers GitLab, qui EST
# joignable depuis l'environnement de l'agent (vérifié : git ls-remote OK).
#
# Usage :
#   GITLAB_TOKEN=xxx GITLAB_USER=kevin ./tools/migration-gitlab/migrer.sh
#   GITLAB_TOKEN=xxx GITLAB_USER=kevin ./tools/migration-gitlab/migrer.sh --test
#
# Le jeton n'est JAMAIS écrit sur le disque ni dans la configuration git : il
# n'existe que le temps de la commande, et il est masqué dans toutes les sorties.
# =============================================================================
set -euo pipefail

PROJET="${GITLAB_PROJET:-CMCteams}"
HOTE="${GITLAB_HOTE:-gitlab.com}"
TEST=0
[[ "${1:-}" == "--test" ]] && TEST=1

masque() { sed -E "s#(https://[^:]+:)[^@]+@#\1***@#g; s#${GITLAB_TOKEN:-__rien__}#***#g"; }
titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# NB : pas d'apostrophe dans ces messages — bash casse sur ${var:?…} si le
#      texte en contient une (erreur « unexpected EOF », piège vécu).
if [[ -z "${GITLAB_TOKEN:-}" ]]; then
  echo "Il manque GITLAB_TOKEN : le jeton GitLab, avec la portée write_repository." >&2
  exit 2
fi
if [[ -z "${GITLAB_USER:-}" ]]; then
  echo "Il manque GITLAB_USER : ton identifiant GitLab." >&2
  exit 2
fi

REMOTE="https://oauth2:${GITLAB_TOKEN}@${HOTE}/${GITLAB_USER}/${PROJET}.git"

titre "1. Le jeton est-il valide, et le dépôt joignable ?"
if git ls-remote "$REMOTE" >/dev/null 2>&1; then
  echo "   ✅ dépôt joignable : ${HOTE}/${GITLAB_USER}/${PROJET}"
else
  echo "   ❌ impossible d'atteindre ${HOTE}/${GITLAB_USER}/${PROJET}"
  echo "      Vérifie : le projet existe-t-il ? le jeton a-t-il la portée write_repository ?"
  echo "      (un projet VIDE convient — ne coche pas « ajouter un README »)"
  exit 1
fi

titre "2. Ce qui va être transféré"
echo "   commits  : $(git rev-list --all --count)"
echo "   branches : $(git branch | wc -l | tr -d ' ')"
echo "   poids    : $(du -sh .git | cut -f1)"

if [[ $TEST == 1 ]]; then
  titre "Mode --test : rien n'a été poussé."
  echo "   Relance sans --test pour transférer réellement."
  exit 0
fi

titre "3. Transfert (quelques minutes — 396 Mo d'historique)"
git push --prune "$REMOTE" 'refs/heads/*:refs/heads/*' 2>&1 | masque
titre "4. Étiquettes"
git push --tags "$REMOTE" 2>&1 | masque || echo "   (aucune étiquette)"

titre "5. Vérification — ce qui est RÉELLEMENT arrivé là-bas"
DISTANT=$(git ls-remote --heads "$REMOTE" | wc -l | tr -d ' ')
LOCAL=$(git branch | wc -l | tr -d ' ')
echo "   branches sur GitLab : $DISTANT   (en local : $LOCAL)"
TETE_L=$(git rev-parse HEAD)
BR=$(git rev-parse --abbrev-ref HEAD)
TETE_D=$(git ls-remote "$REMOTE" "refs/heads/$BR" | cut -f1)
if [[ "$TETE_L" == "$TETE_D" ]]; then
  echo "   ✅ le dernier commit correspond exactement (${TETE_L:0:8})"
else
  echo "   ❌ ÉCART : local ${TETE_L:0:8} ≠ GitLab ${TETE_D:0:8} — le transfert est incomplet"
  exit 1
fi

titre "✅ Migration terminée"
cat <<EOF
   Ton code est sur : https://${HOTE}/${GITLAB_USER}/${PROJET}

   👉 SUPPRIME MAINTENANT LE JETON : il ne sert plus à rien.
      https://${HOTE}/-/user_settings/personal_access_tokens

   Étape suivante (remettre les sites en ligne) :
      voir MIGRATION_GITLAB.md, section « Cloudflare Pages »
EOF
