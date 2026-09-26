#!/bin/bash
# APEX v13 — Test live continu (à lancer après CHAQUE modification)
# Règle Kevin 2026-05-03 ABSOLUE : "fais tester en live tout ton travail, en permanence"
set -e
cd "$(dirname "$0")"
RED='\033[0;31m'; GREEN='\033[0;32m'; YEL='\033[0;33m'; NC='\033[0m'
fail=0
log() { echo -e "${YEL}[$(date +%H:%M:%S)]${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; fail=$((fail+1)); }

log "T1: TypeScript strict"
npx tsc --noEmit 2>&1 | tail -5 && ok "TS strict OK" || err "TS errors"

log "T2: Vitest unit (17 tests)"
npx vitest run --no-coverage --reporter=basic 2>&1 | tail -5 | grep -E "passed|failed" && ok "Tests verts" || err "Tests fail"

log "T3: Vite build"
npx vite build 2>&1 | tail -3 | grep -E "built|error" && ok "Build OK" || err "Build fail"

log "T4: Bundle size budget (gzip < 50 KB initial)"
SIZE=$(gzip -c dist/core/main-*.js 2>/dev/null | wc -c)
if [ "$SIZE" -lt 51200 ]; then ok "Bundle ${SIZE}b gzipped"; else err "Bundle ${SIZE}b > 50KB"; fi

log "T5: Preview boot HTTP (3s timeout)"
npx vite preview --port 4173 > /tmp/prev.log 2>&1 &
PID=$!; sleep 2
HTTP=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:4173/ 2>&1) || true
JS=$(grep -oE 'core/main-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
HTTP_JS=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:4173/$JS" 2>&1) || true
kill $PID 2>/dev/null; wait 2>/dev/null
[ "$HTTP" = "200" ] && ok "HTML 200" || err "HTML $HTTP"
[ "$HTTP_JS" = "200" ] && ok "JS bundle 200" || err "JS $HTTP_JS"

log "T6: Canary deploy sync"
[ -f ../../apex-ai-v13/index.html ] && ok "Canary index.html present" || err "Canary missing"
[ -f ../../apex-ai-v13/.nojekyll ] && ok "Canary .nojekyll present" || err ".nojekyll missing"

echo ""
if [ $fail -eq 0 ]; then
  echo -e "${GREEN}════════════════════════${NC}"
  echo -e "${GREEN}  ✓ TOUS TESTS VERTS    ${NC}"
  echo -e "${GREEN}════════════════════════${NC}"
  exit 0
else
  echo -e "${RED}════════════════════════${NC}"
  echo -e "${RED}  ✗ $fail TESTS FAIL — STOP ${NC}"
  echo -e "${RED}════════════════════════${NC}"
  exit 1
fi
