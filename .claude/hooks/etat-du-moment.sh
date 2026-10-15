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
# RATION DES MINUTES ACTIONS DU JOUR (Kevin 15.10 : « Économise le forfait action… ne jamais plus être bloqué ») : chaque session, sur n'importe
# quelle branche, voit dès l'ouverture ce qui est DÉJÀ consommé aujourd'hui. L'outil est lu sur origin/main (comme la page), pas sur la copie
# locale. Fail-ouvert : sans gh, sans réseau, sans outil → simplement pas de ligne (jamais bloquant, jamais plus de ~20 s).
RATION=""
if command -v gh >/dev/null 2>&1 && git show origin/main:tools/ci/ration-actions.mjs > "${TMPDIR:-/tmp}/ration-actions-hook.mjs" 2>/dev/null; then
  if timeout 12 gh api "repos/9r4rxssx64-creator/CMCteams/actions/runs?created=%3E%3D$(date -u +%F)&per_page=100" > "${TMPDIR:-/tmp}/ration-hook.json" 2>/dev/null; then
    RATION=$(timeout 8 node "${TMPDIR:-/tmp}/ration-actions-hook.mjs" --runs "${TMPDIR:-/tmp}/ration-hook.json" 2>/dev/null | sed -n '2,3p')
  fi
fi
[ -n "$RATION" ] && RATION="
── Minutes GitHub Actions du coffre, AUJOURD'HUI (avant tout robot : bash tools/ci/porte-ration.sh <minutes>) :
${RATION}"
CTX="$PAGE
${RATION}

── Ta branche : ${BR} · ${RET} commit(s) DERRIÈRE main, ${AV} devant. ${NOTE}
── Qui fait quoi — les 8 branches les plus actives (git, à l'instant) :
${QUI}
── Si ta branche est en retard sur un fichier partagé : node tools/pipeline/retard-branches.mjs"
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  printf '%s\n' "$CTX"
fi
