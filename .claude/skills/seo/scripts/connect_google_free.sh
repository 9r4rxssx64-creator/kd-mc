#!/usr/bin/env bash
# connect_google_free.sh — Connecte les APIs Google GRATUITES du skill SEO.
#
# PageSpeed Insights v5 + CrUX (Core Web Vitals terrain) = clé API gratuite, SANS OAuth.
# Usage :
#   GOOGLE_API_KEY=AIza... bash connect_google_free.sh
#   bash connect_google_free.sh AIza...        # clé en argument
#
# La clé n'est JAMAIS commitée : écrite dans ~/.config/claude-seo/google-api.json
# (chemin local hors repo) + utilisable aussi via la variable d'env GOOGLE_API_KEY.
set -euo pipefail

KEY="${1:-${GOOGLE_API_KEY:-}}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # racine du skill seo
PY="${HERE}/.venv/bin/python"
[ -x "$PY" ] || PY="python3"
CFG_DIR="${HOME}/.config/claude-seo"
CFG="${CFG_DIR}/google-api.json"

if [ -z "${KEY}" ]; then
  echo "✗ Aucune clé fournie."
  echo "  → Crée une clé GRATUITE (2 min) : https://console.cloud.google.com/apis/credentials"
  echo "    Active 'PageSpeed Insights API' + 'Chrome UX Report API' puis : Créer identifiants → Clé API"
  echo "  → Puis relance : GOOGLE_API_KEY=ta_cle bash connect_google_free.sh"
  exit 1
fi

mkdir -p "${CFG_DIR}"
if [ -f "${CFG}" ]; then
  "$PY" - "$CFG" "$KEY" <<'PYEOF'
import json, sys
cfg_path, key = sys.argv[1], sys.argv[2]
cfg = json.load(open(cfg_path))
cfg["api_key"] = key
json.dump(cfg, open(cfg_path, "w"), indent=2)
print("✓ Clé API ajoutée à la config existante.")
PYEOF
else
  printf '{\n  "api_key": "%s"\n}\n' "${KEY}" > "${CFG}"
  echo "✓ Config créée : ${CFG}"
fi
chmod 600 "${CFG}" 2>/dev/null || true

echo "→ Vérification PageSpeed + CrUX…"
"$PY" "${HERE}/scripts/google_auth.py" --check psi --json 2>&1 | head -20
echo ""
echo "✓ APIs Google gratuites connectées (PageSpeed + CrUX). Core Web Vitals terrain dispo."
echo "  GSC / GA4 / Indexing (OAuth) : voir GOOGLE_SETUP.md si tu veux les positions/trafic."
