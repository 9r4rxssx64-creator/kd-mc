#!/bin/sh
# TABLEAU DE BORD DES BRANCHES — "que se passe-t-il partout ?"
# Inventorie toutes les branches GitLab : tête, commits d'avance sur main, âge,
# fichiers touchés ; signale les CHEVAUCHEMENTS (2+ branches sur le même fichier).
# Lecture seule. Déclenché par variable BRANCHES. Utilise le jeton API du coffre.
set -eu
apk add --no-cache curl jq git > /dev/null
API="https://gitlab.com/api/v4/projects/$CI_PROJECT_ID"
H="PRIVATE-TOKEN: ${GITLAB_API_TOKEN:-$CI_JOB_TOKEN}"
echo "===== BRANCHES SUR GITLAB ====="
curl -sf -H "$H" "$API/repository/branches?per_page=100" \
  | jq -r 'sort_by(.commit.committed_date) | reverse | .[] |
      "  \(.name)\t\(.commit.short_id)\t\(.commit.committed_date[:16])\t\(.commit.title[:48])"' \
  | while IFS="$(printf '\t')" read -r nom sha date titre; do
      printf "• %-40s %s  %s\n    %s\n" "$nom" "$sha" "$date" "$titre"
    done
echo
echo "===== AVANCE SUR main + CHEVAUCHEMENTS ====="
git clone -q "https://oauth2:${GITLAB_API_TOKEN}@gitlab.com/${CI_PROJECT_PATH}.git" /tmp/r 2>/dev/null
cd /tmp/r
: > /tmp/allfiles
for b in $(git branch -r | grep -v 'HEAD\|/main$' | sed 's| *origin/||'); do
  n=$(git rev-list --count "origin/main..origin/$b" 2>/dev/null || echo 0)
  [ "$n" = 0 ] && continue
  echo "• $b : $n commit(s) d'avance sur main"
  git diff --name-only "origin/main...origin/$b" 2>/dev/null | while read -r f; do echo "$b|$f" >> /tmp/allfiles; done
done
echo
echo "-- fichiers touchés par 2+ branches (conflit potentiel) --"
cut -d'|' -f2 /tmp/allfiles 2>/dev/null | sort | uniq -d | while read -r f; do
  qui=$(grep "|$f$" /tmp/allfiles | cut -d'|' -f1 | tr '\n' ',' | sed 's/,$//')
  echo "  ⚠ $f  ← $qui"
done
[ -s /tmp/allfiles ] && cut -d'|' -f2 /tmp/allfiles | sort | uniq -d | grep -q . || echo "  (aucun — pas de chevauchement)"
echo "===== FIN ====="
