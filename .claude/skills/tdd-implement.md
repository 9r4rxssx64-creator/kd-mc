---
name: tdd-implement
description: TDD strict (red - green - refactor) avec coverage 100% statements/branches/functions/lines. Tests d'abord, code minimum, refactor sans casser.
when_to_use: Toute nouvelle feature, fix de bug avec regression test, refactor d'une fonction non couverte, ajout d'un helper reutilisable. NE PAS skipper en disant "j'ajoute les tests apres".
model: sonnet
allowed_tools: [Read, Edit, Write, Bash, Grep, Glob]
---

# Skill: TDD Implement (Test-Driven Development strict)

## Mission

Implementer une feature en TDD strict (Red - Green - Refactor) avec coverage 100% sur les 4 metriques (statements, branches, functions, lines), suivant la regle Kevin "100/100 reel" (CLAUDE.md).

Workflow obligatoire : test ECHOUE D'ABORD, puis code minimum pour passer, puis refactor sans casser. Pas de "je code et j'ajoute les tests apres".

Reference : Kevin v13 = 95% statements + 90% branches minimum, 100% pour code critique (auth, vault, paiement).

## Pre-requis

- [ ] Avoir vitest/jest configure (`apex-ai/v13/` ou suite tests CMCteams)
- [ ] Specifier la feature precisement (entree/sortie/edge cases) AVANT d'ecrire un test
- [ ] Connaitre les patterns existants (lire 1-2 specs voisines pour le style)
- [ ] Acces Bash pour lancer les tests en watch mode

## Etapes (workflow TDD strict)

### Phase 0 - Specification (5 min)

1. Definir 1 phrase : "Cette fonction prend X et retourne Y dans contexte Z"
2. Lister les cas :
   - Cas nominal (1-2)
   - Cas limites (vide, null, undefined, 0, max)
   - Cas erreur (input invalide, dependance KO)
   - Cas securite (XSS, injection, overflow)
3. Note le coverage cible : 100% (auth/vault/crypto) ou 95% (UI/utils)

### Phase 1 - RED : ecrire le test qui echoue (10 min)

```typescript
// fichier: src/utils/__tests__/myHelper.test.ts
import { describe, it, expect } from 'vitest';
import { myHelper } from '../myHelper';

describe('myHelper', () => {
  it('returns expected value for nominal case', () => {
    expect(myHelper('input')).toBe('expected');
  });

  it('throws on invalid input', () => {
    expect(() => myHelper(null as any)).toThrow('invalid input');
  });

  it('handles edge case empty string', () => {
    expect(myHelper('')).toBe('');
  });
});
```

Lancer : `npm test -- myHelper` → DOIT echouer (fonction n'existe pas encore).

### Phase 2 - GREEN : code minimum pour passer (10 min)

```typescript
// fichier: src/utils/myHelper.ts
export function myHelper(input: string): string {
  if (input === null || input === undefined) {
    throw new Error('invalid input');
  }
  if (input === '') return '';
  return 'expected';
}
```

Re-lancer : `npm test -- myHelper` → DOIT passer (3/3 tests verts).

**Regle d'or** : implementer le MINIMUM pour passer les tests. Pas d'optimisation premature. Pas de feature non testee.

### Phase 3 - REFACTOR (10 min)

Avec tous les tests verts :
1. Eliminer duplications (DRY)
2. Renommer variables clairement
3. Extraire helpers si > 20 lignes
4. Verifier types TS strict (noImplicitAny, strictNullChecks)
5. Re-lancer tests apres CHAQUE modif → si rouge, revert

```bash
npm test -- --watch  # Watch mode pendant refactor
npm run typecheck    # TS strict
npm run lint         # ESLint 0 warnings
```

### Phase 4 - Coverage check (5 min)

```bash
npm test -- --coverage
```

Cible :
- Statements: 100%
- Branches: 100% (toutes les conditions if/else, try/catch testees)
- Functions: 100%
- Lines: 100%

Si < 100% : ajouter le test du chemin manquant. Coverage tool affiche les lignes rouges = a tester.

### Phase 5 - Mutations testing (advanced, 10 min)

```bash
# Si stryker installe
npx stryker run

# Ou manuel : changer un === en !== dans le code, relancer tests
# Si tous passent encore = test trop faible, le renforcer
```

Mutation score cible : > 80% (les mutations doivent etre detectees par les tests).

### Phase 6 - Documentation tests

Chaque test = 1 phrase descriptive lisible :
- ❌ `it('test 1', ...)` - vague
- ✅ `it('returns empty string when input is empty', ...)` - explicite

Convention BDD : `describe(noun) > it(verb_phrase)`.

## Anti-patterns interdits

1. **"Je code et j'ajoute les tests apres"** : viole le principe TDD. Tests = specification, code suit la spec, pas l'inverse.
2. **Tests qui testent l'implementation** : `expect(myFn).toHaveBeenCalledWith(internalDetail)` casse au moindre refactor. Tester le COMPORTEMENT (entree → sortie).
3. **Coverage 100% sans assertions reelles** : `expect(true).toBe(true)` apres avoir appele la fonction = coverage gonfle. Toujours assertion sur le RESULTAT.
4. **Skipper les edge cases** : null, undefined, 0, '', NaN, [], {} doivent etre testees explicitement.
5. **Tests asynchrones sans await** : `expect(fetch(...)).resolves.toBe(x)` sans `await` = test passe meme si fetch rejette.
6. **Tests dependants entre eux** : test 2 depend de l'etat cree par test 1. Toujours `beforeEach` propre.
7. **Mocks excessifs** : tout mocker = on teste les mocks pas le code. Mocker uniquement les dependances externes (network, fs, time).
8. **Coverage en dessous de 95%** sur code critique (auth, vault, crypto, paiement). Kevin regle "100/100 reel".

## Validation post-action

```bash
# 1. Tous les tests passent
npm test -- --run

# 2. Coverage 100% (ou 95%+ pour UI)
npm test -- --coverage --reporter=text-summary | grep "All files"

# 3. TypeScript strict
npm run typecheck  # 0 errors attendu

# 4. Lint 0 warning
npm run lint -- --max-warnings 0

# 5. Build passe
npm run build

# 6. Bundle size pas explose (si nouveau code)
gzip -c dist/assets/index-*.js | wc -c
```

Si un check echoue : revert au dernier commit vert et reprendre Phase 1-3.

## Exemples concrets

### Exemple 1 : Implementer `axRedactSecret(text)` en TDD

**Spec** : Remplace toute occurrence de pattern `sk-ant-api*`, `sk-*`, `ghp_*`, `AIza*`, `re_*` par `[REDACTED]`. Garde le reste intact.

**Phase 1 - Tests (RED)** :
```typescript
import { axRedactSecret } from '../axRedactSecret';

describe('axRedactSecret', () => {
  it('redacts anthropic key', () => {
    expect(axRedactSecret('My key is sk-ant-api03-abc123def456')).toBe('My key is [REDACTED]');
  });
  it('redacts multiple keys in same string', () => {
    expect(axRedactSecret('A: ghp_abc B: sk-xyz')).toBe('A: [REDACTED] B: [REDACTED]');
  });
  it('preserves non-secret text', () => {
    expect(axRedactSecret('Hello world')).toBe('Hello world');
  });
  it('handles empty string', () => {
    expect(axRedactSecret('')).toBe('');
  });
  it('handles null/undefined gracefully', () => {
    expect(axRedactSecret(null as any)).toBe('');
    expect(axRedactSecret(undefined as any)).toBe('');
  });
});
```

**Phase 2 - Code (GREEN)** :
```typescript
const PATTERNS = [
  /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/g,
  /sk-[A-Za-z0-9]{40,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /AIza[A-Za-z0-9_-]{33}/g,
  /re_[A-Za-z0-9_]+/g
];

export function axRedactSecret(text: string | null | undefined): string {
  if (!text) return '';
  let result = text;
  PATTERNS.forEach(p => { result = result.replace(p, '[REDACTED]'); });
  return result;
}
```

**Phase 4 - Coverage** : 100% statements + branches (les 5 cas testes couvrent les 3 branches de `if (!text)`).

### Exemple 2 : Bug regression - PIN per-user (CLAUDE.md erreur #37)

**Contexte** : Bug existait que `axSetPin` ecrit dans `ax_pin` global meme pour user normal.

**Phase 1 - Test regression (RED)** :
```typescript
it('writes to ax_pin only for ADMIN_ID', () => {
  axSetPin('kdmc_admin', 'hash123');
  expect(localStorage.getItem('ax_pin')).toBe('hash123');
  expect(localStorage.getItem('ax_pin_kdmc_admin')).toBe(null);
});

it('writes to ax_pin_<userId> for non-admin user', () => {
  axSetPin('laurence', 'hash456');
  expect(localStorage.getItem('ax_pin')).toBe(null);  // Pas ecrase !
  expect(localStorage.getItem('ax_pin_laurence')).toBe('hash456');
});
```

**Phase 2 - Fix code** :
```typescript
export function axSetPin(userId: string, pinHash: string): void {
  const key = (userId === ADMIN_ID) ? 'ax_pin' : `ax_pin_${userId}`;
  localStorage.setItem(key, pinHash);
}
```

**Resultat** : tests regression verts → bug ne reviendra jamais (CLAUDE.md erreur connue protegee).

## Integration avec autres skills

- **Avant** : `apex-v13-feature-port` (avoir le scaffolding TS strict)
- **Pendant** : utiliser `commit-quality-gate` apres chaque green pour valider
- **Apres** : `security-audit-owasp` si la feature touche auth/vault/crypto
- **Cross** : `refactor-code-dup` apres avoir ecrit 3+ helpers similaires

## References

- CLAUDE.md "100/100 REEL CHAQUE AXE" - Tests Coverage /20 = 100%
- Erreurs #37, #38, #44 (bugs auth qui auraient ete attrapes par TDD)
- Vitest docs : https://vitest.dev/
- Stryker mutation testing : https://stryker-mutator.io/
- Martin Fowler TDD : https://martinfowler.com/bliki/TestDrivenDevelopment.html
