#!/bin/bash
# Script de vérification post-merge CMCteams
# Usage : bash .github/scripts/verify-build.sh

FAIL=0
F="index.html"

count(){ grep -c "$1" "$F" 2>/dev/null; return 0; }
echo "--- Verification CMCteams ---"

# 1. Conflits
C=$(count "^<<<<<<"); if [ "$C" -gt 0 ] 2>/dev/null; then echo "FAIL conflit: $C"; FAIL=1; else echo "OK conflits"; fi

# 2. JS
node -e "var f=require('fs'),h=f.readFileSync('$F','utf8'),s=h.lastIndexOf('<script>'),e=h.lastIndexOf('</script>');f.writeFileSync('/tmp/_v.js',h.slice(s+8,e))" && node --check /tmp/_v.js 2>/dev/null
if [ $? -ne 0 ]; then echo "FAIL JS"; FAIL=1; else echo "OK JS"; fi

# 3. font-size:10px
C=$(count 'font-size:10px'); if [ "$C" -gt 0 ] 2>/dev/null; then echo "FAIL 10px: $C"; FAIL=1; else echo "OK 11px+"; fi

# 4. REVOLLON
grep -q '16:"CP"' "$F" 2>/dev/null
if [ $? -ne 0 ]; then echo "FAIL REVOLLON"; FAIL=1; else echo "OK REVOLLON"; fi

# 5. 5 regles
R5=0; for R in repos_insuffisant max_jours_consec donnees_manquantes horaire_dans_absence absence_longue; do
  grep -q "$R" "$F" 2>/dev/null || { echo "FAIL regle $R"; FAIL=1; R5=1; }
done; if [ "$R5" -eq 0 ]; then echo "OK 5 regles"; fi

# 6. type:custom
grep -q 'type:"custom"' "$F" 2>/dev/null && { echo "FAIL type:custom"; FAIL=1; } || echo "OK IA"

# 7. post-import
grep -q '_postConflicts' "$F" 2>/dev/null || { echo "FAIL post-import"; FAIL=1; }
grep -q '_postConflicts' "$F" 2>/dev/null && echo "OK post-import"

# 8. TTS
grep -q 'ttsSpeak' "$F" 2>/dev/null || { echo "FAIL TTS"; FAIL=1; }
grep -q 'ttsSpeak' "$F" 2>/dev/null && echo "OK TTS"

# 9. Variables cross-vue (erreur #20)
# todD n'existe que dans vMonPlanning, pas dans vAccueil
node -e "var f=require('fs'),h=f.readFileSync('$F','utf8');var acc=h.slice(h.indexOf('function vAccueil'),h.indexOf('function vPlan'));if(/[^a-zA-Z_]todD[^a-zA-Z_]/.test(acc)){console.log('CROSS-VUE: todD dans vAccueil');process.exit(1);}if(/[^a-zA-Z_]myPl[^a-zA-Z_]/.test(acc)&&acc.indexOf('var myPl')<0){console.log('CROSS-VUE: myPl dans vAccueil');process.exit(1);}" 2>/dev/null
if [ $? -ne 0 ]; then echo "FAIL variables cross-vue"; FAIL=1; else echo "OK cross-vue"; fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "=== TOUT OK ==="; exit 0
else echo "=== REGRESSIONS ==="; exit 1; fi
