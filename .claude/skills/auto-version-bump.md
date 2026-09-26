# Skill : Auto Version Bump

## Objectif
Apex bumpe la version automatiquement après chaque livraison significative (patch/minor/major).

## Règles de versioning SemVer
- **Patch** (x.x.N) : bug fix, perf, style, refactor
- **Minor** (x.N.0) : nouvelle feature, nouveau service, nouveau skill
- **Major** (N.0.0) : breaking change, refonte architecture

## Fichiers à bumper SIMULTANÉMENT (anti erreur #54)
1. `apex-ai/v13/core/bootstrap.ts` — constante APP_VER
2. `apex-ai/v13/index.html` — data-app-ver
3. `apex-ai/v13/sw.js` — CACHE_VERSION
4. `apex-ai/v13/package.json` — version field

## Procédure
```ts
// 1. Lire version courante depuis bootstrap.ts
const current = readFile('apex-ai/v13/core/bootstrap.ts').match(/APP_VER\s*=\s*'([\d.]+)'/)[1];

// 2. Calculer nouvelle version
const [maj, min, pat] = current.split('.').map(Number);
const next = bumpType === 'patch' ? `${maj}.${min}.${pat+1}` : ...;

// 3. Remplacer dans les 4 fichiers via create_or_update_file SEQUENTIEL
// (jamais parallèle → SHA race condition)

// 4. Commit message format :
// "Apex vX.Y.Z — <résumé 1 ligne>\n\n<détails>"
```

## Validation post-bump
```bash
grep -r "v13\." apex-ai/v13/core/bootstrap.ts apex-ai/v13/sw.js
# Doit retourner la même version dans les 4 fichiers
```

## Anti-patterns
- ❌ Jamais bumper 1 fichier sur 4 (erreur #54)
- ❌ Jamais push parallèle (SHA conflict)
- ❌ Jamais sauter une version sans commit intermédiaire
