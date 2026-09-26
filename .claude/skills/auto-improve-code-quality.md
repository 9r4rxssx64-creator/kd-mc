# Skill : Auto-amélioration Code Quality

## Objectif
Apex maintient un code TypeScript strict, zéro duplication, 100% testé, patterns cohérents.

## Déclencheurs
- tsc --noEmit retourne des erreurs
- Fichier > 500 lignes sans découpage
- Duplication code détectée (≥20 lignes identiques)
- Test coverage < 80%
- Fonction > 50 lignes

## Procédure autonome

### 1. TypeScript Strict
```json
// tsconfig.json — configuration requise
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2. Pattern View Standard (OBLIGATOIRE v13)
```ts
// features/<slug>/index.ts — SEUL pattern autorisé
export function render(rootEl: HTMLElement): void {
  rootEl.innerHTML = `<div class="ax-page">...</div>`;
  attachHandlers(rootEl);
}
function attachHandlers(rootEl: HTMLElement): void {
  rootEl.querySelector('#btn')?.addEventListener('click', () => {});
}
```

### 3. Pattern Service Standard
```ts
// services/<name>.ts
class ServiceName {
  private static instance: ServiceName;
  static getInstance(): ServiceName {
    if (!ServiceName.instance) ServiceName.instance = new ServiceName();
    return ServiceName.instance;
  }
  // méthodes publiques
}
export const serviceName = ServiceName.getInstance();
```

### 4. Refactoring Auto
- Fonction > 50L → découper en sous-fonctions nommées
- Fichier > 500L → extraire en sous-modules
- Duplication → extract shared utility dans core/utils.ts
- any type → remplacer par type précis ou unknown + guard

### 5. Tests Vitest Obligatoires
```ts
// tests/unit/<name>.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
describe('ServiceName', () => {
  it('should do X when Y', () => {
    expect(result).toBe(expected);
  });
});
```

### 6. Règles interdites
- ❌ `src/modules/` (architecture inexistante v13)
- ❌ `.tsx` / JSX / React
- ❌ `@testing-library/react` / Jest
- ❌ `console.log` sans logger.ts wrapper
- ❌ `as any` sans commentaire explicatif
- ❌ `!` non-null assertion sans guard préalable

## Métriques succès
- tsc 0 erreurs : ✅
- eslint 0 erreurs : ✅
- Coverage ≥ 80% : ✅
- 0 fichier > 600L sans découpage : ✅
- 0 duplication ≥ 20L : ✅
