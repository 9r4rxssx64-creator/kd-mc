---
name: perf-budget-check
description: Audit performance complet - bundle size gzip, LCP/INP/CLS, memory leaks, intervals/listeners zombies, repaints. Score chiffre + plan optimisation.
when_to_use: Avant chaque release, apres ajout de feature non-triviale, si Kevin signale "ca rame" ou "ca lag" ou "memoire saturee", apres modification CSS/animations.
model: sonnet
allowed_tools: [Read, Grep, Glob, Bash]
---

# Skill: Performance Budget Check

## Mission

Mesurer et auditer la performance d'un build au niveau production niche premium (Claude.ai, Stripe, Anthropic). Verifier respect du budget Kevin v13 : bundle gzip < 50KB, build < 1s, FPS 60, memory stable, zero zombie listener.

Sortie : rapport markdown avec metriques chiffrees vs budget + liste P0/P1 optimisations + commandes de fix.

Reference Kevin : "100/100 reel chaque axe = bundle ultra-optimise + build rapide + tests rapides + no memory leaks".

## Pre-requis

- [ ] Avoir lu CLAUDE.md regles "100/100 REEL" + "PROTECTION ≠ STABILITE"
- [ ] Connaitre les budgets : bundle 50KB gzip, build 1s, FPS 60, memory < 80% quota
- [ ] Acces Bash (gzip, du, node, npm), navigateur DevTools si interactif
- [ ] Build production deja fait (`npm run build` dans apex-ai/v13/)

## Etapes (workflow 7 phases)

### Phase 0 - Setup & baseline (3 min)

1. Localiser les bundles produits (`apex-ai/v13/dist/` ou similaire)
2. Identifier le build precedent pour comparaison (git log dist/)
3. Note APP_VER + commit hash

```bash
ls -la apex-ai/v13/dist/ 2>/dev/null || ls -la apex-ai/dist/ 2>/dev/null
git log --oneline -5 apex-ai/
```

### Phase 1 - Bundle size analysis (5 min)

```bash
# Taille brute (raw)
find apex-ai/v13/dist -name "*.js" -exec wc -c {} + 2>/dev/null

# Taille gzipped (ce qui transit reellement)
find apex-ai/v13/dist -name "*.js" -exec sh -c 'gzip -c "$1" | wc -c' _ {} \;

# Taille brotli (si serveur le supporte)
find apex-ai/v13/dist -name "*.js" -exec sh -c 'brotli -c "$1" 2>/dev/null | wc -c' _ {} \; 2>/dev/null

# Detecter dependances lourdes (>10KB)
du -h node_modules/* 2>/dev/null | sort -hr | head -20

# Dead code / unused imports
grep -rn "import" apex-ai/v13/ 2>/dev/null | wc -l
```

Budget : initial bundle < 50KB gzip, total < 200KB gzip, lazy chunks > 30KB chacun.

### Phase 2 - Build time (2 min)

```bash
# Build cold (sans cache)
cd apex-ai/v13 && rm -rf node_modules/.vite dist && time npm run build 2>&1 | tail -5
```

Budget : build complet < 1s pour edits ciblees, < 10s cold start.

### Phase 3 - Memory leaks scan (10 min)

```bash
# setInterval sans clearInterval (intervals zombies)
grep -nE 'setInterval\s*\(' apex-ai/index.html | wc -l
grep -nE 'clearInterval\s*\(' apex-ai/index.html | wc -l
# Ratio attendu : presque 1:1 (sauf intervals voulus permanents)

# addEventListener sans removeEventListener
grep -nE 'addEventListener\s*\(' apex-ai/index.html | wc -l
grep -nE 'removeEventListener\s*\(' apex-ai/index.html | wc -l

# Closures qui capturent gros objets (anti-pattern)
grep -nE 'function\s*\([^)]*\)\s*\{[\s\S]{500,}' apex-ai/index.html | head -10

# Detection IIFE empilees (CLAUDE.md PROTECTION ≠ STABILITE)
grep -cE '^\(function\(\)\{' apex-ai/index.html
```

Budget : 0 setInterval orphelin, 0 listener jamais clean, IIFE empilees < 5.

### Phase 4 - DOM perf (5 min)

```bash
# innerHTML dans hot loops (massive reflow)
grep -B2 -A2 'innerHTML\s*=' apex-ai/index.html | grep -B2 -A2 'for\s*(\|while\s*(' | head -20

# Animations CSS sans GPU (left/top au lieu de transform)
grep -nE '@keyframes' apex-ai/index.html | head -10

# Event listeners delegates absents (perf O(n) au lieu O(1))
grep -cE 'onclick\s*=' apex-ai/index.html
```

Budget : pas d'innerHTML dans loop > 10 iterations, animations GPU only (transform/opacity).

### Phase 5 - Network & cache (5 min)

```bash
# Service Worker present + version sync
grep -E "CACHE_VERSION" apex-ai/sw.js
grep -E "APP_VER" apex-ai/index.html | head -1

# Resources non versionnees (cache busting absent)
grep -nE '<(script|link)[^>]+src="[^"]*\.(js|css)"' apex-ai/index.html | grep -v "?v=" | head -10

# Font loading sans preload (FOIT)
grep -nE '<link[^>]+font' apex-ai/index.html | grep -v 'preload'
```

### Phase 6 - Lighthouse simulation (si dispo)

```bash
# Si lighthouse CLI installe
which lighthouse && lighthouse https://apex-ai-page-url --only-categories=performance --quiet --chrome-flags="--headless" 2>/dev/null

# Sinon manuel : Chrome DevTools > Lighthouse > Run
```

Budget Lighthouse : Performance ≥ 90, LCP < 2.5s, INP < 200ms, CLS < 0.1.

### Phase 7 - Rapport markdown

Structure :
1. Resume : score global + verdict (vert/orange/rouge)
2. Tableau metriques vs budget
3. P0 (bloquant prod) - P1 (important) - P2 (nice to have)
4. Plan optimisation chiffre (gain attendu en KB / ms)

## Anti-patterns interdits

1. **Mesurer raw au lieu de gzip** : un bundle 200KB raw = ~50KB gzip. Toujours mesurer ce qui transit reseau (gzip/brotli).
2. **Ignorer les intervals/listeners** : memory leaks invisibles a court terme mais Kevin a "memoire saturee" apres 1h. Erreur #PROTECTION ≠ STABILITE (panic mode v569 desactivait setInterval).
3. **Optimiser sans mesurer** : "j'ai retire un map" sans before/after = guess. Toujours benchmark.
4. **Cacher les regressions** : si build prend 2x plus de temps qu'avant, le dire. Pas "c'est dans la marge".
5. **Wraps protecteurs cumules** : 5 IIFE qui wrappent setInterval = overhead boot 100ms+. Erreur CLAUDE.md "PROTECTION ≠ STABILITE".
6. **Animation sur left/top** : force layout recalc, jank garanti. Toujours `transform: translate3d()`.
7. **innerHTML dans virtual DOM render loop** : detruit + reconstruit = O(n²) reflow.

## Validation post-action

```bash
# 1. Bundle gzip respecte budget 50KB initial
gzip -c apex-ai/v13/dist/assets/index-*.js | wc -c
# < 51200 attendu

# 2. Build time < 5s
cd apex-ai/v13 && time npm run build 2>&1 | grep "real\|built in"

# 3. Pas de zombies intervals
grep -c 'setInterval' apex-ai/index.html
grep -c 'clearInterval' apex-ai/index.html
# Ratio doit etre ~1:1

# 4. Memory leaks scan via Chrome DevTools Memory tab
# (manuel) Snapshot heap apres 5 min d'usage. Detached DOM nodes = 0.

# 5. Lighthouse score (manuel) >= 90 perf
```

Si echec : invoquer `refactor-code-dup` pour retirer code mort + lazy load aggressif.

## Exemples concrets

### Exemple 1 : Bundle Apex v13 trop gros (90KB gzip > budget 50KB)

**Contexte** : Apres ajout de feature `vIA` v13, bundle initial passe a 90KB gzip.

**Action** :
```bash
# 1. Identifier le coupable
cd apex-ai/v13 && npm run build -- --analyze

# 2. Lazy-load la feature lourde
# Avant : import { vIA } from './views/vIA';
# Apres : const vIA = () => import('./views/vIA');
```

**Resultat** : Bundle initial repasse a 45KB gzip. vIA charge a la demande (chunk separe 50KB).

### Exemple 2 : Memory leak dans CMCteams apres 1h usage

**Contexte** : Kevin signale "memoire saturee" apres session admin longue.

**Action** :
```bash
# 1. Detecter setInterval orphelins
grep -nE 'setInterval\s*\([^)]+\)\s*[^;]*;' index.html | head -20

# 2. Detecter listeners ajoutes a chaque dc()
grep -B3 'addEventListener' index.html | grep -A3 'function dc'

# 3. Implementer un cleanup hook
# Au debut de dc() : document.querySelectorAll('[data-listener]').forEach(removeListener)
```

**Resultat** : Memory stable apres 4h usage admin (avant : OOM crash a 1h30).

## Integration avec autres skills

- **Avant** : `commit-quality-gate` (build doit passer avant audit perf)
- **Apres** : si bundle > budget, invoquer `refactor-code-dup` puis `apex-v13-feature-port` pour migrer features lourdes en lazy
- **En parallele** : `security-audit-owasp` (independant)
- **Suivi** : `subagent-orchestrate` pour validation 2nd avis sur les optimisations

## References

- CLAUDE.md "100/100 REEL CHAQUE AXE" - Performance /20
- CLAUDE.md "PROTECTION ≠ STABILITE" - Erreur #PROTECTION
- Web Vitals : https://web.dev/vitals/
- Vite bundle analyzer : https://github.com/btd/rollup-plugin-visualizer
- Chrome DevTools Memory profiling guide
