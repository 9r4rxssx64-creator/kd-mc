#!/bin/bash
# UserPromptSubmit — À CHAQUE MESSAGE de Kevin, le projet rappelle à Claude ce qu'il sait déjà sur les mêmes mots
# (décisions métier NOTES_USER.md, règles CLAUDE.md, leçons LESSONS.md, mémoire compacte), AVANT la réponse.
# Kevin 7.10.2026 : « Tu as un gros problème de mémoire ! Pourquoi et comment c'est possible ? » — la mémoire n'était
# injectée qu'au démarrage de la session. Local, 0 réseau, ~0,2 s ; fail-open (jamais bloquant). Garde : test:rappel-message.
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-/home/user/CMCteams}"
command -v node >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
PROMPT=$(jq -r '.prompt // ""' 2>/dev/null | head -c 4000)
[ -n "$PROMPT" ] || exit 0
CTX=$(cd "$ROOT" && printf '%s' "$PROMPT" | timeout 5 node tools/memory/rappel.mjs 2>/dev/null || true)
[ -n "$CTX" ] || exit 0
jq -cn --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$c}}'
