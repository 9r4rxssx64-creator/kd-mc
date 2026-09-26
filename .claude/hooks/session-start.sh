#!/bin/bash
# APEX/CMCteams — SessionStart hook (mode ASYNC)
# Optimise le démarrage de session Claude Code : installe les dépendances
# des projets actifs du monorepo + Playwright/Chromium pour que tests
# (unit + E2E) / lint / build / typecheck soient prêts — quelle que soit
# la branche.
#
# Mode ASYNC (Kevin 2026-05-22) : la session démarre IMMÉDIATEMENT, le hook
# tourne en arrière-plan. La 1re ligne stdout DOIT être le JSON {"async":true}.
# Idempotent : si node_modules / navigateur existent déjà → skip (rapide).
# Non-bloquant par projet : l'échec d'un projet n'abat pas le hook.
echo '{"async": true, "asyncTimeout": 420000}'

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-/home/user/CMCteams}"

# Installe les deps d'un projet npm si absentes (idempotent).
install_project() {
  local dir="$1" label="$2"
  [ -f "$dir/package.json" ] || return 0
  if [ -d "$dir/node_modules" ]; then
    echo "[hook] ${label} : deps déjà présentes ✓"
    return 0
  fi
  echo "[hook] ${label} : installation des dépendances…"
  ( cd "$dir" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund 2>&1 | tail -2 ) \
    || echo "[hook] ${label} : install échouée — la session continue (dégradé)"
}

# Projets actifs du monorepo (build/lint/test réels) :
install_project "$ROOT"               "CMCteams (racine)"
install_project "$ROOT/apex-ai/v13"   "Apex v13"
install_project "$ROOT/messaging-app" "Apex Chat (messaging-app)"

# Playwright + Chromium pour les tests E2E réels (Kevin 2026-05-22 :
# "donne playwright et chromium aux autres branches et apex aussi").
# Avant : le hook SKIPPAIT le téléchargement → branches sans navigateur.
# Maintenant : `playwright install chromium` est lancé explicitement.
# - Idempotent : no-op rapide si le bon navigateur est déjà là.
# - Lancé depuis Apex v13 (qui porte @playwright/test) → le navigateur est
#   installé dans PLAYWRIGHT_BROWSERS_PATH, PARTAGÉ par les 3 projets
#   (CMCteams runtime-audit, Apex v13 E2E, Apex Chat E2E).
# - Non-bloquant : si le réseau bloque cdn.playwright.dev (sandbox), le hook
#   continue et les E2E restent lançables en CI.
setup_playwright() {
  local pwdir=""
  for d in "$ROOT/apex-ai/v13" "$ROOT/messaging-app" "$ROOT"; do
    if [ -d "$d/node_modules/@playwright/test" ] || [ -d "$d/node_modules/playwright-core" ]; then
      pwdir="$d"; break
    fi
  done
  if [ -z "$pwdir" ]; then
    echo "[hook] Playwright absent des node_modules — navigateur non installé"
    return 0
  fi
  echo "[hook] Playwright/Chromium : install/vérif depuis ${pwdir#"$ROOT"/} …"
  if ( cd "$pwdir" && npx --yes playwright install chromium 2>&1 | tail -3 ); then
    echo "[hook] Playwright + Chromium prêts pour les tests E2E ✓ (partagé Apex v13 / Apex Chat / CMCteams)"
  else
    echo "[hook] Chromium non téléchargeable (réseau restreint) — E2E disponibles en CI uniquement"
  fi
}
setup_playwright

# --- SEO : auto-config clé Google si présente dans l'env (no-op sinon) ---
# Pont coffre→session : si GOOGLE_API_KEY (ou repli GEMINI/FIREBASE/PAGESPEED)
# est défini dans l'environnement, on écrit la config locale pour que les scripts
# SEO (PageSpeed/CrUX) soient prêts immédiatement. Aucune clé commitée.
setup_seo_google() {
  local key="${GOOGLE_API_KEY:-${PAGESPEED_API_KEY:-${GEMINI_API_KEY:-${FIREBASE_WEB_API_KEY:-}}}}"
  if [ -z "$key" ]; then
    echo "[hook] SEO : aucune clé Google en env (PageSpeed/CrUX inactifs — voir GOOGLE_SETUP.md)"
    return 0
  fi
  local cfg_dir="$HOME/.config/claude-seo"
  mkdir -p "$cfg_dir"
  printf '{\n  "api_key": "%s"\n}\n' "$key" > "$cfg_dir/google-api.json"
  chmod 600 "$cfg_dir/google-api.json" 2>/dev/null || true
  echo "[hook] SEO : clé Google configurée depuis l'env ✓ (PageSpeed + CrUX prêts)"
}
setup_seo_google

echo "[hook] environnement prêt — tests (unit + E2E) / lint / build / typecheck disponibles"
