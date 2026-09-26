#!/bin/bash
# APEX v13.4.101 — Script de vérification pre-push (Kevin 2026-05-15)
#
# Bloque tout push si :
#   - apex-ai-v13/index.html contient APEX_BOOT_NONCE (cf Erreur #57)
#   - data-app-ver source != data-app-ver deployed
#   - Nonce CSP n'est pas un hash hex 32 chars
#
# Usage : ./scripts/deploy-check.sh
# Pre-commit hook : appelle automatiquement avant chaque commit Apex.
#
# Exit code 0 = OK, 1 = blocker, 2 = warning

set +e  # grep peut retourner 1 si 0 matchs — on gère manuellement

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOYED_HTML="apex-ai-v13/index.html"
SOURCE_HTML="apex-ai/v13/index.html"
DIST_HTML="apex-ai/v13/dist/index.html"

if [ ! -f "$DEPLOYED_HTML" ]; then
  echo "⚠️  $DEPLOYED_HTML absent (rien à vérifier)"
  exit 0
fi

ERRORS=0

# 1. Aucune occurrence littérale APEX_BOOT_NONCE dans le déployé
NONCE_LITERAL_COUNT=$(grep -c "APEX_BOOT_NONCE" "$DEPLOYED_HTML" 2>/dev/null)
if [ -z "$NONCE_LITERAL_COUNT" ]; then NONCE_LITERAL_COUNT=0; fi
if [ "$NONCE_LITERAL_COUNT" -gt 0 ]; then
  echo "❌ BLOCKER : $DEPLOYED_HTML contient $NONCE_LITERAL_COUNT occurrences"
  echo "   littérales 'APEX_BOOT_NONCE' (devrait être 0 — remplacé par vrai nonce build)."
  echo ""
  echo "   Cause : tu as fait 'cp apex-ai/v13/index.html apex-ai-v13/index.html'"
  echo "           (SOURCE) au lieu de 'cp apex-ai/v13/dist/index.html apex-ai-v13/index.html'"
  echo "           (BUILD avec nonce remplacé par vite-csp-nonce-plugin)."
  echo ""
  echo "   Fix : npm run build && cp apex-ai/v13/dist/index.html apex-ai-v13/index.html"
  echo ""
  echo "   Cf Erreur #57 dans CLAUDE.md"
  ERRORS=$((ERRORS + 1))
fi

# 2. Nonce CSP doit être hash hex 32 chars
HEXNONCE=$(grep -oE 'nonce="[a-f0-9]{32}"' "$DEPLOYED_HTML" | head -1)
if [ -z "$HEXNONCE" ]; then
  echo "❌ BLOCKER : $DEPLOYED_HTML ne contient pas de nonce hex 32 chars"
  echo "   (regex /nonce=\"[a-f0-9]{32}\"/)."
  echo "   Le build vite-csp-nonce-plugin n'a probablement pas été exécuté."
  ERRORS=$((ERRORS + 1))
fi

# 3. data-app-ver cohérent source vs deployed
if [ -f "$SOURCE_HTML" ]; then
  SRC_VER=$(grep -oE 'data-app-ver="v[0-9.]+"' "$SOURCE_HTML" | head -1)
  DEP_VER=$(grep -oE 'data-app-ver="v[0-9.]+"' "$DEPLOYED_HTML" | head -1)
  if [ -n "$SRC_VER" ] && [ -n "$DEP_VER" ] && [ "$SRC_VER" != "$DEP_VER" ]; then
    echo "⚠️  WARNING : data-app-ver source ($SRC_VER) != déployé ($DEP_VER)"
    echo "   Si tu viens de bumper APP_VER, refais 'npm run build' puis sync dist/"
  fi
fi

# 4. CACHE_VERSION sw.js cohérent avec APP_VER
if [ -f "apex-ai-v13/sw.js" ] && [ -n "$DEP_VER" ]; then
  CACHE_VER=$(grep -oE "CACHE_VERSION\s*=\s*['\"]apex-v[0-9.]+['\"]" apex-ai-v13/sw.js | grep -oE "v[0-9.]+" | head -1)
  HTML_VER=$(echo "$DEP_VER" | grep -oE "v[0-9.]+")
  if [ -n "$CACHE_VER" ] && [ "$CACHE_VER" != "$HTML_VER" ]; then
    echo "⚠️  WARNING : sw.js CACHE_VERSION ($CACHE_VER) != index.html ($HTML_VER)"
    echo "   Bump CACHE_VERSION pour invalider cache PWA chez Kevin."
  fi
fi

# 5. Chaque asset local référencé (src/href ./…) DOIT exister dans le déployé.
#    Attrape la classe de bug rescue.js 404 (v13.4.358) : un fichier PUBLIC non bundlé
#    (publicDir='assets' → dist/js/…, pas dist/assets/js/…) référencé au mauvais chemin.
DEP_DIR="$(dirname "$DEPLOYED_HTML")"
MISSING_ASSETS=0
REFS=$(grep -oE '(src|href)="[^"]+"' "$DEPLOYED_HTML" \
  | sed -E 's/^(src|href)="//; s/"$//' \
  | grep -vE '^(https?:|data:|blob:|mailto:|#|//)' \
  | sed -E 's/[?#].*$//' \
  | sort -u)
for ref in $REFS; do
  rel="${ref#./}"
  [ -z "$rel" ] && continue
  if [ ! -e "$DEP_DIR/$rel" ]; then
    echo "❌ BLOCKER : asset référencé introuvable → $DEP_DIR/$rel (ref « $ref »)"
    echo "   Cause probable : fichier public (publicDir='assets') copié à ./js|css|icons/… mais"
    echo "   référencé sous ./assets/… — corrige le chemin dans index.html (cf 404 rescue.js v13.4.358)."
    MISSING_ASSETS=$((MISSING_ASSETS + 1))
  fi
done
if [ "$MISSING_ASSETS" -gt 0 ]; then
  ERRORS=$((ERRORS + MISSING_ASSETS))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "$ERRORS blocker(s) détecté(s). Push refusé."
  exit 1
fi

echo "✅ Deploy check OK : nonce remplacé, hex 32 chars, versions cohérentes, assets locaux résolus."
exit 0
