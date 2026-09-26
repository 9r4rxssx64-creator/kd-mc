#!/bin/bash
# SessionStart — ÉTAT DU MOMENT, servi depuis `main` (PAS depuis la copie locale).
#
# Kevin 2026-09-26 : « que tout soit au courant de ce que font les autres branches… en temps
# réel… même les vieilles branches qui se réveillent ». Mesuré ce jour-là : 236 branches sur
# 244 portaient un ETAT-INFRA.md différent de main, 35 des 60 plus récentes parlaient encore
# de « GitHub suspendu / GitLab bloqué ». Une session lit SA copie des documents : si sa
# branche est vieille, sa vérité est vieille. Ce hook va donc chercher la page
# ETAT-DU-MOMENT.md TELLE QU'ELLE EST SUR origin/main, et y ajoute ce que git sait à
# l'instant : le retard de la branche, et qui travaille sur quoi (8 branches actives).
#
# Fail-open : sans réseau → version locale + avertissement ; sans page → rien. Jamais bloquant.
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-/home/user/cmcteams}"
cd "$ROOT" 2>/dev/null || exit 0
NOTE=""
if ! timeout 25 git fetch -q origin main 2>/dev/null; then
  NOTE="⚠️ réseau absent au démarrage : version LOCALE de la page (peut être périmée) — relance « git fetch origin main » dès que possible"
fi
PAGE=$(git show origin/main:ETAT-DU-MOMENT.md 2>/dev/null || cat ETAT-DU-MOMENT.md 2>/dev/null || true)
[ -z "$PAGE" ] && exit 0
BR=$(git branch --show-current 2>/dev/null || echo '?')
RET=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')
AV=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')
QUI=$(git for-each-ref --sort=-committerdate --format='%(committerdate:short) %(refname:short) — %(subject)' refs/remotes/origin 2>/dev/null \
      | awk '$2 != "origin" && $2 != "origin/main"' | head -8 | cut -c1-120 | sed 's/^/  /')
CTX="$PAGE

── Ta branche : ${BR} · ${RET} commit(s) DERRIÈRE main, ${AV} devant. ${NOTE}
── Qui fait quoi — les 8 branches les plus actives (git, à l'instant) :
${QUI}
── Si ta branche est en retard sur un fichier partagé : node tools/pipeline/retard-branches.mjs"
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  printf '%s\n' "$CTX"
fi
