# Skill : Auto-amélioration Performance

## Objectif
Apex détecte et corrige automatiquement les bottlenecks de performance sans intervention Kevin.

## Déclencheurs
- LCP > 2.5s détecté par perf-metrics.ts
- Bundle size > 500KB
- Time-to-interactive > 3s
- Memory leak détecté (heap > 80MB)

## Procédure autonome

### 1. Audit initial
```ts
import { perfMetrics } from '../services/perf-metrics.js';
const report = await perfMetrics.snapshot();
// Seuils critiques : LCP>2500, INP>200, CLS>0.1, FCP>1800, TTFB>800
```

### 2. Corrections auto prioritaires
- **Code splitting** : lazy-load tous les features non-critiques via dynamic import()
- **Image optimization** : compress via image_compress + WebP conversion
- **Bundle dedup** : détecter doublons dans services/ (≥3 imports communs → extract shared)
- **Cache headers** : sw.js CACHE_VERSION aligné APP_VER (anti erreur #54)
- **Debounce** : addEventListener sans debounce sur input/scroll → wrap 150ms
- **Tree shaking** : imports wildcard (`import * as`) → imports nommés

### 3. Validation post-fix
```bash
npm run build -- --report
# Vérifier chunks < 200KB each
# LCP < 2500ms, INP < 200ms
```

### 4. Si non résolu → escalade
- Créer tâche apex_v13_tasks priority=high
- Notifier Kevin via ax_claude_todo

## Anti-patterns interdits
- ❌ Jamais désactiver sentinelle pour "performance"
- ❌ Jamais supprimer vault encryption pour "vitesse"
- ❌ Jamais inline scripts CSP-unsafe

## Métriques succès
- LCP ≤ 2500ms ✅
- INP ≤ 200ms ✅
- CLS ≤ 0.1 ✅
- Bundle main < 300KB ✅
- 0 memory leak 30min ✅
