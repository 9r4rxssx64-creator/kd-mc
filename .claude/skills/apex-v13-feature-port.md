---
name: apex-v13-feature-port
description: Porter une fonctionnalite v12 monolithique (apex-ai/index.html ~20K lignes) vers v13 modulaire TS strict avec tests, lazy-load et CSP nonce.
when_to_use: Quand Kevin demande de migrer une feature v12 vers v13. Apres ajout d'une feature dans v12 qui doit aussi exister en v13. Audit parite v12/v13 detecte un gap.
model: opus
allowed_tools: [Read, Edit, Write, Bash, Grep, Glob]
---

# Skill: Apex v13 Feature Port

## Mission

Porter une fonctionnalite Apex v12 (monolithe HTML+JS 20K+ lignes) vers v13 (architecture modulaire TS strict + Vite + tests + CSP nonce + lazy chunks). Garantir parite fonctionnelle COMPLETE sans regression et qualite niveau Claude.ai.

Reference Kevin : "Architecture /20 = services wirés, anti Declaration ≠ Deployment, 0 code mort". Les helpers v12 declared but not wired sont la principale dette technique a eliminer en v13.

## Pre-requis

- [ ] v13 existe (`apex-ai/v13/` avec Vite + TS strict + Vitest)
- [ ] Avoir lu CLAUDE.md "DECLARATION ≠ DEPLOYMENT" + "PROTECTION ≠ STABILITE"
- [ ] Connaitre la feature v12 ciblee (path + nom de fonction)
- [ ] Lire `audit-parity-v12-v13` pour matrice gaps
- [ ] Avoir TS strict + ESLint configures

## Etapes (workflow 8 phases)

### Phase 0 - Identifier la feature source v12 (5 min)

```bash
# Localiser dans v12
grep -nE "function (vXxxx|axXxxx|cmcXxxx)\b" apex-ai/index.html | head

# Lire la fonction complete + dependances directes
# (Utiliser Read avec offset/limit sur apex-ai/index.html)

# Identifier les call sites
grep -nE "\bvXxxx\b|\baxXxxx\b" apex-ai/index.html | head -20

# Identifier les state globaux utilises (K.user, K.view, etc.)
grep -nE "K\.\w+" extracted-function.js | sort -u
```

### Phase 1 - Decomposer en modules v13 (10 min)

Architecture cible :
```
apex-ai/v13/
├── views/<feature>/
│   ├── <feature>View.tsx          # UI component
│   ├── <feature>View.test.tsx     # Tests UI
│   ├── <feature>Service.ts        # Business logic
│   ├── <feature>Service.test.ts   # Tests service
│   └── <feature>Types.ts          # Types/interfaces
├── services/                       # Services partages
└── utils/                          # Utils purs
```

Regle : 1 fichier = 1 responsabilite. Max 200 lignes par fichier.

### Phase 2 - Creer les types TS strict (10 min)

```typescript
// src/views/myFeature/myFeatureTypes.ts
export interface MyFeatureState {
  readonly id: string;
  readonly status: 'pending' | 'active' | 'archived';
  readonly createdAt: number;
}

export interface MyFeatureProps {
  readonly userId: string;
  readonly onUpdate: (state: MyFeatureState) => void;
}

// Branded types pour eviter les confusions
export type UserId = string & { readonly __brand: 'UserId' };
export type Timestamp = number & { readonly __brand: 'Timestamp' };
```

TS strict obligatoire : `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

### Phase 3 - Tests d'abord (TDD - 20 min)

Voir skill `tdd-implement` pour le detail. Specifier les tests AVANT le code.

```typescript
// myFeatureService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyFeatureService } from './myFeatureService';

describe('MyFeatureService', () => {
  let service: MyFeatureService;
  beforeEach(() => { service = new MyFeatureService(); });

  it('initializes with empty state', () => {
    expect(service.getAll()).toEqual([]);
  });

  it('adds item with valid input', () => {
    const item = service.add({ name: 'test' });
    expect(item.id).toBeDefined();
    expect(service.getAll()).toHaveLength(1);
  });

  // ... tous les cas (cf skill tdd-implement)
});
```

### Phase 4 - Implementer service pur (10 min)

```typescript
// myFeatureService.ts
import type { MyFeatureState } from './myFeatureTypes';

export class MyFeatureService {
  private state: MyFeatureState[] = [];

  getAll(): readonly MyFeatureState[] {
    return [...this.state];  // Immutable copy
  }

  add(input: { name: string }): MyFeatureState {
    if (!input.name) throw new Error('name required');
    const item: MyFeatureState = {
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: Date.now()
    };
    this.state = [...this.state, item];
    return item;
  }
}
```

Regle : services purs (pas de DOM, pas de fetch direct). Injectable pour testabilite.

### Phase 5 - View component (10 min)

```typescript
// myFeatureView.tsx (si Preact/React) ou export function (vanilla)
import { useState, useEffect } from 'preact/hooks';
import type { MyFeatureProps } from './myFeatureTypes';
import { MyFeatureService } from './myFeatureService';

export function MyFeatureView({ userId, onUpdate }: MyFeatureProps) {
  const [items, setItems] = useState<MyFeatureState[]>([]);
  const service = new MyFeatureService();

  // ... rendering propre, accessible (ARIA), responsive mobile-first
}
```

Anti-pattern : pas de string concat HTML (XSS). Toujours JSX ou `textContent`/`createElement`.

### Phase 6 - Lazy-load + CSP nonce (5 min)

Dans `App.tsx` :
```typescript
import { lazy, Suspense } from 'preact/compat';

const MyFeatureView = lazy(() => import('./views/myFeature/myFeatureView'));

<Suspense fallback={<LoadingSpinner />}>
  <MyFeatureView userId={user.id} onUpdate={handleUpdate} />
</Suspense>
```

CSP : aucune balise `<script>` inline, aucun `onclick=`. Vite genere des nonces automatiquement avec plugin `vite-plugin-csp-guard`.

### Phase 7 - Wirage dans router v13 + tests E2E (10 min)

```typescript
// router.ts
const routes = {
  '/myfeature': () => import('./views/myFeature/myFeatureView'),
  // ...
};
```

Test E2E :
```typescript
// e2e/myFeature.spec.ts (Playwright)
import { test, expect } from '@playwright/test';

test('user can navigate to myFeature and add item', async ({ page }) => {
  await page.goto('/myfeature');
  await page.fill('[name=itemName]', 'My item');
  await page.click('button[type=submit]');
  await expect(page.locator('.item-list')).toContainText('My item');
});
```

### Phase 8 - Validation parite v12/v13 + commit

Lancer skill `audit-parity-v12-v13` pour comparer.

```bash
cd apex-ai/v13 && npm run build && npm test -- --coverage --run
```

## Anti-patterns interdits

1. **Copier-coller v12 dans v13** : v12 = monolithe spaghetti. Refactor PROFOND obligatoire (services purs, types stricts, tests).
2. **Garder les K.* globaux** : v12 = `K.user`, `K.view`, etc. global state. v13 = state local + context React/Preact + service injection.
3. **innerHTML** : v12 fait `el.innerHTML = '<div>' + esc(name) + '</div>'`. v13 = JSX ou createElement strict.
4. **onclick inline** : viole CSP nonce. v13 = addEventListener via ref/handler.
5. **Helper declared but not wired** : creer un service v13 sans l'importer dans le router = mort-ne. Erreur "DECLARATION ≠ DEPLOYMENT".
6. **TS any partout** : `any` = TS off. Toujours typer (utiliser `unknown` puis narrow si vraiment inconnu).
7. **Tests apres** : viole TDD. Tests AVANT (cf skill tdd-implement).
8. **> 200 lignes par fichier** : decomposer. 1 fichier = 1 responsabilite.
9. **Bundle initial > 50KB gzip** : si le port augmente le bundle, lazy-load la feature.

## Validation post-action

```bash
cd apex-ai/v13

# 1. Build passe sans warning
npm run build 2>&1 | grep -iE 'error|warning'  # Doit etre vide

# 2. TS strict 0 errors
npx tsc --noEmit

# 3. Tests 100%
npm test -- --coverage --run | grep "All files"

# 4. Lint 0 warnings
npm run lint -- --max-warnings 0

# 5. Bundle taille budget
gzip -c dist/assets/index-*.js | wc -c  # < 51200

# 6. Lazy chunk pour la feature
ls dist/assets/ | grep -i myfeature  # Devrait exister chunk separe

# 7. Parite v12/v13
# (Manuel) Comparer cas d'usage 1:1 avec v12 - voir skill audit-parity-v12-v13

# 8. CSP : pas de inline
grep -E '(onclick=|onload=|<script(?!.*nonce))' dist/index.html  # Doit etre vide
```

Si echec : revert et reprendre depuis la phase qui a casse.

## Exemples concrets

### Exemple 1 : Porter `vChat` v12 vers v13

**Source v12** : `apex-ai/index.html` ligne ~3500, `function vChat()` 800 lignes mixant UI + state + fetch + audio.

**Decomposition v13** :
- `views/chat/ChatView.tsx` (UI rendering, 150 lignes)
- `services/ChatService.ts` (envoi/reception messages, 120 lignes)
- `services/ChatStreamService.ts` (SSE streaming, 80 lignes)
- `services/ChatAudioService.ts` (TTS/STT, 100 lignes)
- `views/chat/chatTypes.ts` (interfaces, 30 lignes)
- `views/chat/__tests__/*.test.ts` (4 fichiers, 100% coverage)

**Resultat** : 800 lignes monolithe → 580 lignes v13 modulaire + 400 lignes tests. Bundle gain : -15KB gzip (lazy + tree shaking).

### Exemple 2 : Porter `axRedactSecret` (v12 helper utilitaire)

**Source v12** : Helper defini ligne ~12340 mais wired sur 0 call site (CLAUDE.md "DECLARATION ≠ DEPLOYMENT").

**v13** :
1. Creer `src/utils/axRedactSecret.ts` (TDD via skill `tdd-implement`)
2. WIRE dans tous les call sites : middleware fetch global, logger, telemetry, audit log.
3. Test E2E : envoyer un message contenant fausse cle API → verifier qu'elle n'apparait jamais dans Firebase audit ni telemetry.

**Resultat** : helper non seulement defini mais REELLEMENT execute partout. Score audit "Securite" passe de 18/20 a 20/20.

## Integration avec autres skills

- **Avant** : `audit-parity-v12-v13` (identifier ce qui manque), `tdd-implement` (tests d'abord)
- **Pendant** : `csp-strict-build` (pas d'inline), `csp-fix-inline` (migrer onclick)
- **Apres** : `commit-quality-gate` (validation), `perf-budget-check` (verifier bundle)
- **Cross** : `security-audit-owasp` si la feature touche auth/vault

## References

- CLAUDE.md "DECLARATION ≠ DEPLOYMENT"
- CLAUDE.md "PROTECTION ≠ STABILITE"
- Erreur #46 (vStudio* references mais non definies = crash)
- Vite docs : https://vitejs.dev/
- TypeScript strict : https://www.typescriptlang.org/tsconfig#strict
