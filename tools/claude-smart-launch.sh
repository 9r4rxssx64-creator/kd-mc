#!/usr/bin/env bash
# Claude Code SMART LAUNCH — Bascule auto Max ↔ API key
# Kevin DESARZENS - 2026-04-26
#
# Usage : ./claude-smart-launch.sh [arguments claude classiques]
#
# Comportement :
# 1. Tente d'abord Claude Code en mode Max 20x (OAuth)
# 2. Si erreur "rate limit" / "quota exceeded" / "5h" détectée → bascule auto sur API key
# 3. Au prochain lancement, retente Max d'abord (revient auto si quota reset)
#
# Configuration :
# - Crée fichier ~/.claude-api-key avec UNIQUEMENT ta clé sk-ant-api03-...
# - Permissions : chmod 600 ~/.claude-api-key (lecture toi seul)
# - OU : exporter env CLAUDE_API_KEY_BACKUP="sk-ant-api03-..."
#
# Mise à jour clé : édite ~/.claude-api-key puis relance le script.
#
# Setup permanent (recommandé) :
#   echo 'alias claude="bash ~/CMCteams/tools/claude-smart-launch.sh"' >> ~/.zshrc
#   source ~/.zshrc
#
# Désormais à chaque "claude" → bascule auto si quota Max épuisé.

set -uo pipefail

# 1. Localise la clé API backup
KEY_FILE="${HOME}/.claude-api-key"
KEY_BACKUP="${CLAUDE_API_KEY_BACKUP:-}"
if [ -z "$KEY_BACKUP" ] && [ -f "$KEY_FILE" ]; then
  KEY_BACKUP=$(head -1 "$KEY_FILE" | tr -d '[:space:]')
fi

# 2. Statut actuel : Max ou API ? (détecté par fichier marker)
STATE_FILE="${HOME}/.claude-smart-state"
NOW=$(date +%s)
LAST_FAIL=0
[ -f "$STATE_FILE" ] && LAST_FAIL=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
LAST_FAIL=${LAST_FAIL:-0}

# 3. Si le dernier fail Max est < 5h, on continue API direct
SECONDS_SINCE_FAIL=$((NOW - LAST_FAIL))
USE_API=false
if [ "$SECONDS_SINCE_FAIL" -lt 18000 ] && [ -n "$KEY_BACKUP" ]; then
  USE_API=true
  echo "🔑 Mode API direct (Max bloqué il y a $((SECONDS_SINCE_FAIL/60)) min, reset estimé dans $((300 - SECONDS_SINCE_FAIL/60)) min)"
fi

# 4. Si reset Max passé, retente Max d'abord
if [ "$USE_API" = false ] && [ -n "$KEY_BACKUP" ]; then
  echo "📡 Tentative Max d'abord (quota réinitialisé)"
  rm -f "$STATE_FILE"
fi

# 5. Lance claude avec ou sans clé API
if [ "$USE_API" = true ]; then
  ANTHROPIC_API_KEY="$KEY_BACKUP" claude "$@"
  EXIT_CODE=$?
else
  # Capture stderr pour détecter erreur quota
  TMP_ERR=$(mktemp)
  claude "$@" 2> >(tee "$TMP_ERR" >&2)
  EXIT_CODE=${PIPESTATUS[0]}

  # Si erreur quota détectée, marque + propose API
  if grep -qiE "rate.?limit|quota.exceeded|usage.limit|reset.in|5h|five.hour|max.usage" "$TMP_ERR" 2>/dev/null; then
    echo ""
    echo "⚠ Quota Max épuisé détecté."
    echo "$NOW" > "$STATE_FILE"

    if [ -n "$KEY_BACKUP" ]; then
      echo "🔄 Bascule automatique sur API key direct..."
      echo ""
      ANTHROPIC_API_KEY="$KEY_BACKUP" claude "$@"
      EXIT_CODE=$?
    else
      echo ""
      echo "❌ Aucune clé API backup configurée."
      echo "   Crée ~/.claude-api-key avec ta clé sk-ant-api03-..."
      echo "   Ou export CLAUDE_API_KEY_BACKUP=\"sk-ant-api03-...\""
      echo ""
      echo "   Lien : https://console.anthropic.com/settings/keys"
    fi
  fi
  rm -f "$TMP_ERR"
fi

exit $EXIT_CODE
