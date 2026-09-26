---
name: commit-quality-gate
description: Pre-commit checklist - tsc strict + lint 0 warnings + tests 100% + bundle size + node check + grep XSS/conflits + diff regression. Bloque si echec.
when_to_use: AVANT chaque git commit. Apres chaque batch de modifs. Avant chaque push. Si CI a deja foiré, lancer ce skill localement pour reproduire.
model: sonnet
allowed_tools: [Bash, Read, Grep]
---

# Skill: Commit Quality Gate

## Mission

Bloquer un commit qui ne respecte pas les standards qualite (TS strict, lint 0 warnings, tests 100%, bundle budget, secu basics, no conflict markers). Reproduire localement les checks CI pour eviter pre-commit hook fail (CLAUDE.md erreur "Validation syntaxe + tests AVANT push, JAMAIS apres").

Reference Kevin : "Validation `node --check` obligatoire avant commit" + "Pas de microversions en cascade" (CLAUDE.md regle Tests + LECONS SESSION 18 VERSIONS).

## Pre-requis

- [ ] Avoir fait les modifs (le skill valide, ne code pas)
- [ ] Etre dans le repo CMCteams
- [ ] Acces Bash + outils (node, npm, gzip, grep)
- [ ] Tests + linter + typecheck configures dans package.json

## Etapes (workflow 8 phases)

### Phase 0 - Etat git (1 min)

```bash
# Voir ce qu'on s'apprete a committer
git status
git diff --stat HEAD
git diff --cached --stat 2>/dev/null  # Si deja staged
```

Verifier : pas de fichiers non voulus (.DS_Store, *.log, secrets), pas de lock files non desires.

### Phase 1 - Marqueurs de conflit (30s)

```bash
# CRITIQUE : aucun marqueur de conflit ne doit subsister
CONFLICTS=$(grep -lE "^<<<<<<<|^=======$|^>>>>>>>" $(git diff --cached --name-only 2>/dev/null || git diff --name-only) 2>/dev/null | head -5)
if [ -n "$CONFLICTS" ]; then
  echo "❌ MARQUEURS CONFLIT DANS : $CONFLICTS"
  exit 1
fi
echo "✅ Aucun conflit non-resolu"
```

CLAUDE.md erreur #21 : un rebase peut perdre code silencieusement. Toujours grep apres rebase.

### Phase 2 - Syntax check JS / TS (2 min)

```bash
# Pour CMCteams (HTML monolithe) :
# Extraire et valider le bloc <script> SANS separateur (regle Kevin v12.365 erreur #2)
python3 -c "
import re, sys
html=open('index.html','r',encoding='utf-8').read()
blocks=re.findall(r'<script>(.*?)</script>',html,re.DOTALL)
open('/tmp/cmc_combined.js','w',encoding='utf-8').write(''.join(blocks))
" && node --check /tmp/cmc_combined.js && echo "✅ CMCteams JS OK" || { echo "❌ Syntax error CMCteams"; exit 1; }

# Pour Apex monolithe pareil
python3 -c "
import re
html=open('apex-ai/index.html','r',encoding='utf-8').read()
blocks=re.findall(r'<script>(.*?)</script>',html,re.DOTALL)
open('/tmp/apex_combined.js','w',encoding='utf-8').write(''.join(blocks))
" && node --check /tmp/apex_combined.js && echo "✅ Apex JS OK" || { echo "❌ Syntax error Apex"; exit 1; }

# Pour Apex v13 (TS strict)
if [ -d apex-ai/v13 ]; then
  cd apex-ai/v13 && npx tsc --noEmit 2>&1 | tee /tmp/tsc.log
  TSC_ERR=$(grep -c "error TS" /tmp/tsc.log)
  if [ "$TSC_ERR" -gt 0 ]; then
    echo "❌ $TSC_ERR TS errors"
    exit 1
  fi
  echo "✅ TS strict 0 errors"
  cd ../..
fi
```

### Phase 3 - Lint (2 min)

```bash
if [ -d apex-ai/v13 ]; then
  cd apex-ai/v13 && npm run lint -- --max-warnings 0 || { echo "❌ Lint warnings/errors"; exit 1; }
  echo "✅ Lint 0 warnings"
  cd ../..
fi
```

### Phase 4 - Tests (3 min)

```bash
if [ -d apex-ai/v13 ]; then
  cd apex-ai/v13 && npm test -- --run --coverage 2>&1 | tee /tmp/test.log
  
  # Tous tests passent ?
  FAIL=$(grep -E "Tests:.*[0-9]+ failed" /tmp/test.log)
  if [ -n "$FAIL" ]; then
    echo "❌ Tests failed: $FAIL"
    exit 1
  fi
  
  # Coverage 95%+ statements
  COV=$(grep "All files" /tmp/test.log | awk '{print $4}' | tr -d '%')
  if [ -z "$COV" ] || [ $(echo "$COV < 95" | bc) -eq 1 ]; then
    echo "❌ Coverage $COV% < 95%"
    exit 1
  fi
  
  echo "✅ Tests OK, coverage $COV%"
  cd ../..
fi
```

### Phase 5 - Build + bundle size (3 min)

```bash
if [ -d apex-ai/v13 ]; then
  cd apex-ai/v13 && npm run build 2>&1 | tee /tmp/build.log
  
  if grep -iE "error|failed" /tmp/build.log; then
    echo "❌ Build failed"
    exit 1
  fi
  
  # Bundle gzip < 50KB initial
  MAIN=$(ls dist/assets/index-*.js 2>/dev/null | head -1)
  if [ -n "$MAIN" ]; then
    SIZE=$(gzip -c "$MAIN" | wc -c)
    if [ "$SIZE" -gt 51200 ]; then
      echo "❌ Bundle initial $SIZE bytes > 50KB budget"
      exit 1
    fi
    echo "✅ Bundle initial $SIZE bytes (budget 50KB)"
  fi
  
  cd ../..
fi
```

### Phase 6 - Securite basics (2 min)

```bash
# 1. innerHTML sans esc()
INNER=$(grep -nE 'innerHTML\s*=' index.html apex-ai/index.html 2>/dev/null | grep -v 'esc(' | grep -v '/\*\|//' | head -10)
if [ -n "$INNER" ]; then
  echo "⚠️  innerHTML sans esc() detectes :"
  echo "$INNER"
  # Warning, pas blocking (peut etre legit dans certains cas)
fi

# 2. Pas de console.log secrets
SECRETS_LOG=$(grep -nE 'console\.log\([^)]*(password|token|api_key|secret|cb_number)' index.html apex-ai/index.html 2>/dev/null | head -5)
if [ -n "$SECRETS_LOG" ]; then
  echo "❌ console.log avec secrets :"
  echo "$SECRETS_LOG"
  exit 1
fi

# 3. Pas de tokens hardcodes
HARDCODED=$(grep -nE '"sk-ant-api[0-9]+-[A-Za-z0-9_-]{40,}"' index.html apex-ai/index.html 2>/dev/null)
if [ -n "$HARDCODED" ]; then
  echo "❌ TOKEN HARDCODE DETECTE : $HARDCODED"
  exit 1
fi

# 4. Pas de eval() en TS strict
if [ -d apex-ai/v13 ]; then
  EVAL=$(grep -rnE '\beval\s*\(|new Function\s*\(' apex-ai/v13/ | grep -v '\.test\.' 2>/dev/null)
  if [ -n "$EVAL" ]; then
    echo "❌ eval() / new Function() detectes (CSP violation)"
    echo "$EVAL"
    exit 1
  fi
fi

echo "✅ Securite basics OK"
```

### Phase 7 - Version sync (CMCteams + Apex sw.js) (1 min)

CLAUDE.md erreur #28 + #39 : APP_VER doit = CACHE_VERSION dans sw.js.

```bash
# Apex
APP_VER=$(grep -oE 'APP_VER\s*=\s*"v[0-9.]+' apex-ai/index.html | head -1 | grep -oE 'v[0-9.]+')
SW_VER=$(grep -oE "apex-v[0-9.]+" apex-ai/sw.js | head -1 | grep -oE 'v[0-9.]+')
if [ "$APP_VER" != "$SW_VER" ]; then
  echo "❌ DRIFT : Apex APP_VER=$APP_VER mais sw.js=$SW_VER"
  echo "   Fix : sed -i 's|apex-v[0-9.]\\+|apex-$APP_VER|g' apex-ai/sw.js"
  exit 1
fi
echo "✅ Apex version sync OK ($APP_VER)"

# CMCteams pareil
APP_VER_CMC=$(grep -oE 'APP_VER\s*=\s*"v[0-9.]+' index.html | head -1 | grep -oE 'v[0-9.]+')
SW_VER_CMC=$(grep -oE "cmc-v[0-9.]+" sw.js 2>/dev/null | head -1 | grep -oE 'v[0-9.]+')
if [ -n "$SW_VER_CMC" ] && [ "$APP_VER_CMC" != "$SW_VER_CMC" ]; then
  echo "❌ DRIFT : CMC APP_VER=$APP_VER_CMC mais sw.js=$SW_VER_CMC"
  exit 1
fi
echo "✅ CMC version sync OK"
```

### Phase 8 - Branche divergence (1 min)

CLAUDE.md erreur #45 : PR jamais mergee = deploiement fantome (recidive #33).

```bash
git fetch origin main 2>/dev/null
DIVERGE=$(git log --oneline main..HEAD 2>/dev/null | wc -l)
if [ "$DIVERGE" -gt 5 ]; then
  echo "⚠️  $DIVERGE commits non merges dans main !"
  echo "   GitHub Pages deploie depuis main → tes changements ne sont PAS visibles."
  echo "   Action : creer/merger PR avant que ca devienne 20+ commits (erreur #45)"
fi
```

## Anti-patterns interdits

1. **Bypass `--no-verify`** : viole pre-commit hook. Sauf demande explicite Kevin, JAMAIS.
2. **`git commit --amend`** sans Kevin demande : modifie historique = erreur #34 (Kevin regle "createNew commits"). Sauf si pre-commit hook a fail JUSTE avant.
3. **Skip tests "ca prend trop de temps"** : Kevin regle "Test mental obligatoire" - pas de "je crois que ca marche".
4. **Bundle size warning ignore** : 51KB au lieu de 50KB "c'est presque OK" → derive lente. Strictly enforced.
5. **TypeScript any** dans nouveau code : viole TS strict. Toujours `unknown` puis narrow.
6. **Lint warnings tolerees** : 0 warnings strict, sinon ca s'accumule.
7. **Test `it.skip`** sans TODO ticket : pourquoi ce test est skip ? Toujours commentaire + ticket.
8. **Coverage drop** : si coverage etait 95% avant, est 92% apres = regression. Toujours egal ou superieur.
9. **`node --check` avec separateur entre scripts** : peut MENTIR. CLAUDE.md erreur #2 (v12.365 incident). Toujours combiner SANS separateur.

## Validation post-action

Le skill EST la validation. Output attendu :

```
✅ Aucun conflit non-resolu
✅ CMCteams JS OK
✅ Apex JS OK
✅ TS strict 0 errors
✅ Lint 0 warnings
✅ Tests OK, coverage 96%
✅ Bundle initial 48234 bytes (budget 50KB)
✅ Securite basics OK
✅ Apex version sync OK (v12.243)
✅ CMC version sync OK
```

Si tous ✅ → commit autorise.
Si un ❌ → fix avant commit (revert / corrigir / re-run).

## Exemples concrets

### Exemple 1 : Workflow normal Kevin

```bash
# Kevin a edite quelques fichiers
git status

# Lance le quality gate
bash .claude/skills/_run-commit-gate.sh
# (script qui execute les phases 0-8)

# Si OK → 
git add -A
git commit -m "feat: nouveau feature X"

# Si fail → fix selon le message d'erreur, retry
```

### Exemple 2 : Pre-commit hook a fail (CLAUDE.md erreur #34)

**Symptome** : `git commit` echoue car hook detecte un syntax error.

**Action incorrecte** :
```bash
git commit --amend  # ❌ NON Kevin regle, modifie commit precedent
```

**Action correcte** :
1. Identifier le syntax error (souvent dans le bloc `<script>` combine)
2. Fixer le code
3. Re-run skill quality gate
4. Si OK : `git add -A && git commit -m "..."` (NOUVEAU commit, pas amend)

CLAUDE.md erreur #34 : "Pre-commit hook fail = commit DID NOT happen, --amend modifierait le PRECEDENT commit, perdant du travail".

## Integration avec autres skills

- **Avant** : tout skill (`tdd-implement`, `apex-v13-feature-port`, etc.) - quality gate verifie le resultat
- **Apres** : `subagent-orchestrate` (audit final 2nd avis)
- **Cross** : peut etre integre comme git pre-commit hook
- **Suivi** : `pwa-deploy-verify` apres push reussi

## References

- CLAUDE.md regle "VERIFIER AVANT D'ENVOYER"
- CLAUDE.md "LECONS SESSION 18 VERSIONS" (erreur #1, #2, #34)
- CLAUDE.md erreurs #21, #28, #34, #39, #45, #46
- Husky pre-commit hooks : https://typicode.github.io/husky/
- Conventional Commits : https://www.conventionalcommits.org/
