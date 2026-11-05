#!/bin/bash
# PreToolUse (Bash) — refuse `git commit/push --no-verify` (idée reprise d'ECC, réécrite ici : 5.11.2026, Kevin « go ecc »).
# Pourquoi : --no-verify saute les gardes du dépôt (docs-frais, tests) : un travail qui « passe » en les contournant est un travail perdu pour les autres branches.
# Local, 0 réseau ; fail-open si jq absent. Garde : test:bloque-no-verify. Sortie 2 = refus avec message pour Claude.
set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0
CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null)
[ -n "$CMD" ] || exit 0
CMD=$(printf '%s' "$CMD" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")   # le texte entre guillemets (message de commit) ne compte pas
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push|merge|rebase)([^;&|]*)[[:space:]]--no-verify([[:space:]]|$)|(^|[;&|[:space:]])git[[:space:]]+commit([^;&|]*)[[:space:]]-n([[:space:]]|$)'; then
  echo "Refusé : --no-verify saute les gardes du dépôt (docs-frais, tests). Corrige la cause du blocage, ne le contourne pas." >&2
  exit 2
fi
exit 0
