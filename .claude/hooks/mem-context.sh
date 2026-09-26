#!/bin/bash
# SessionStart — injecte AUTO la mémoire compacte de Claude Code dans le contexte.
# Kevin 2026-07-10 « tout auto, que tu t'en serves auto » : à chaque session, les faits
# durables (tools/memory/store.jsonl) sont chargés sans que je (Claude) aie à les chercher.
# Coût : ~1-2 Ko, local, 0 clé, 0 réseau. Synchrone + rapide (fail-open si node absent).
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-/home/user/CMCteams}"
FACTS=""
if command -v node >/dev/null 2>&1 && [ -f "$ROOT/tools/memory/mem.cjs" ]; then
  FACTS=$(cd "$ROOT" && node tools/memory/mem.cjs brief 12 2>/dev/null || true)
fi
if [ -z "$FACTS" ]; then exit 0; fi
CTX="Mémoire compacte (faits durables — 'node tools/memory/mem.cjs search \"<sujet>\" --k 5' pour plus ; 'add \"<fait>\" --tags x --imp N' pour mémoriser une nouvelle décision durable) :
$FACTS"
# Échappe pour JSON via jq si dispo, sinon fallback brut.
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  printf '%s\n' "$CTX"
fi
