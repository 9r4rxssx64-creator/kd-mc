---
name: refactor-code-dup
description: Detecter + extraire duplications de code (DRY). Identifie patterns repetes >= 3 fois, extrait helpers communs, garantit zero regression.
when_to_use: Code review revele copy-paste. Refactor d'un module monolithique. Apres ajout de feature similaire a une existante. Pour reduire la dette technique avant audit.
model: sonnet
allowed_tools: [Read, Edit, Write, Bash, Grep, Glob]
---

# Skill: Refactor Code Duplication (DRY enforcement)

## Mission

Identifier les duplications de code (literally copy-paste) et patterns repetes (semantically duplicates) dans la codebase Apex/CMCteams. Extraire des helpers communs sans casser le comportement (tests TDD obligatoires).

Cible : reduction de 20-40% de la taille des modules concernes, code mort elimine, helpers reutilisables documents.

Reference Kevin : "0 code mort" (CLAUDE.md axe Architecture /20). "Bundle ultra-optimise" (axe Performance /20).

## Pre-requis

- [ ] Avoir lu CLAUDE.md "DECLARATION ≠ DEPLOYMENT"
- [ ] Tests existants pour les modules cibles (sinon ecrire d'abord via skill `tdd-implement`)
- [ ] Acces Bash + outils analyse (jscpd, sonar, ESLint)
- [ ] Comprendre que refactor sans tests = bombe a retardement

## Etapes (workflow 7 phases)

### Phase 0 - Identifier les zones (5 min)

```bash
# 1. Outil de detection automatique - jscpd (JS Copy-Paste Detector)
npx jscpd apex-ai/v13 --min-lines 5 --min-tokens 50 --output reports/

# 2. Patterns manuels frequents (basique)
# Fonctions qui commencent pareil
grep -A5 'function ax' apex-ai/index.html | head -100

# 3. Regex repetes (validation, parsing)
grep -oE 'new RegExp\([^)]+\)' apex-ai/index.html | sort | uniq -c | sort -rn | head -10

# 4. Magic strings/numbers
grep -oE '"ax_[a-z_]+"' apex-ai/index.html | sort | uniq -c | sort -rn | head -20
```

### Phase 1 - Categoriser les duplications (10 min)

| Type | Description | Strategie |
|------|-------------|-----------|
| **Literal copy-paste** | 100% identique | Extraire fonction immediatement |
| **Semantic duplicate** | Meme logique, noms differents | Extraire fonction generique, parametriser |
| **Pattern repeat** | Sequences d'appels identiques | Extraire workflow / orchestrator |
| **Magic constants** | "ax_user", 5000ms, etc. | Centraliser dans `constants.ts` |
| **Validation rules** | Email regex, PIN format | Module `validators.ts` |

### Phase 2 - Coverage tests AVANT refactor (10 min)

OBLIGATOIRE : ne JAMAIS refactor sans tests qui couvrent le comportement actuel.

```bash
# Si aucun test existe pour la zone : ecrire ceux qui couvrent le comportement actuel
# Voir skill tdd-implement
npm test -- --coverage path/to/module
```

Coverage cible avant refactor : >= 90% sur la zone touchee.

### Phase 3 - Extraire helpers (15 min)

Exemple concret : 3 fonctions qui validates email differemment :

**Avant** :
```typescript
// userService.ts
function createUser(data) {
  if (!data.email || !/^[^@]+@[^.]+\..+$/.test(data.email)) throw new Error('bad email');
  // ...
}

// adminService.ts  
function inviteUser(email) {
  if (!email || !email.includes('@')) throw new Error('email required');
  // ...
}

// authService.ts
function resetPassword(email) {
  const re = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!re.test(email)) return false;
  // ...
}
```

**Apres** :
```typescript
// utils/validators.ts
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && EMAIL_RE.test(s);
}

export function assertValidEmail(s: unknown): asserts s is string {
  if (!isValidEmail(s)) throw new ValidationError('Invalid email format');
}

// userService.ts
import { assertValidEmail } from '../utils/validators';
function createUser(data) {
  assertValidEmail(data.email);
  // ...
}

// adminService.ts
function inviteUser(email) {
  assertValidEmail(email);
  // ...
}

// authService.ts
function resetPassword(email) {
  if (!isValidEmail(email)) return false;
  // ...
}
```

Gain : 1 source de verite, validation coherent, types narrowed (TS).

### Phase 4 - Extraction patterns Apex/CMCteams typiques (10 min)

Patterns recurrents a extraire :

```typescript
// utils/safeParse.ts
export function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// utils/clampString.ts
export function clamp(s: unknown, max: number): string {
  return String(s ?? '').slice(0, max);
}

// utils/lsHelpers.ts (CMCteams uses repetitive ls/lg)
export function lg<T>(key: string, fallback: T): T {
  return safeParse(localStorage.getItem(key) ?? '', fallback);
}

export function ls(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
  if (FB_FIX.includes(key)) fbWrite(key, value);
}

// utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): T {
  let id: number;
  return ((...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), wait) as unknown as number;
  }) as T;
}

// utils/asyncRetry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; backoff?: number } = {}
): Promise<T> {
  const { retries = 3, backoff = 1000 } = options;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } 
    catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
```

### Phase 5 - Code mort elimination (10 min)

```bash
# 1. Detecter fonctions definies mais jamais appelees
# Outil : eslint-plugin-unused-imports + ts-prune

cd apex-ai/v13 && npx ts-prune

# 2. Manuel grep
grep -oE 'function ax[A-Z][a-zA-Z]+' apex-ai/index.html | sort -u | while read fn; do
  count=$(grep -c "\\b$fn\\b" apex-ai/index.html)
  if [ "$count" -eq 1 ]; then
    echo "ORPHELIN: $fn (1 occurrence = definition seule)"
  fi
done

# 3. Vues V* declarees mais non routees
grep -oE 'function v[A-Z][a-zA-Z]+' apex-ai/index.html | sort -u > /tmp/views_defined.txt
grep -oE 'case\s*"[a-z]+":\s*return\s*v[A-Z][a-zA-Z]+\(' apex-ai/index.html | grep -oE 'v[A-Z][a-zA-Z]+' | sort -u > /tmp/views_routed.txt
diff /tmp/views_defined.txt /tmp/views_routed.txt
```

Erreur #46 (CLAUDE.md) : 14 vues `vStudio*` referencees dans `vMain` mais NON DEFINIES → crash. L'inverse : vues definies mais non routees = code mort.

### Phase 6 - Tree-shaking + lazy load (5 min)

Apres extraction, configurer Vite pour bien tree-shake :

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      treeshake: 'recommended',
      output: {
        manualChunks: {
          vendor: ['preact', 'firebase'],
          utils: ['./src/utils/index.ts'],
          // Lazy chunks par feature
        }
      }
    }
  }
});
```

Lazy import :
```typescript
const HeavyFeature = lazy(() => import('./views/HeavyFeature'));
```

### Phase 7 - Validation regression (10 min)

```bash
# 1. Tests passent toujours
npm test -- --run

# 2. Coverage maintenu (>= avant)
npm test -- --coverage

# 3. Bundle size REDUIT (objectif)
gzip -c dist/assets/index-*.js | wc -c
# Comparer avec baseline avant refactor

# 4. Type check
npm run typecheck

# 5. Linting
npm run lint
```

Si tests passent + bundle <= avant + types OK → refactor reussi.

## Anti-patterns interdits

1. **Refactor sans tests** : casse silencieuse. Toujours tests AVANT.
2. **DRY a outrance** : extraire pour 2 occurrences est premature. Regle : >= 3 occurrences pour justifier helper.
3. **Helper avec 10 parametres** : signal qu'on a sur-extrait. Si la signature est complexe, peut-etre que les 3 cas etaient legitimement differents.
4. **Renommage massif** : 1 PR = 1 type de refactor. Pas "extract helper + rename + change schema" en meme temps.
5. **Code mort marque "TODO supprimer plus tard"** : suppression immediate ou rien. Sinon il reste eternellement.
6. **Premature optimization** : refactor "au cas ou ce serait reutilise" = YAGNI. Refactor si REELLEMENT 3+ usages.
7. **Magic strings non centralisees** : "ax_user" hardcode 30 fois. Toujours `const KEYS = { USER: 'ax_user' }` central.
8. **Helpers dans le meme fichier que les usages** : si reutilisable, extraire vers `utils/`. Sinon il reste local et non decouvrable.

## Validation post-action

```bash
# 1. Tests passent toujours
npm test -- --run

# 2. Bundle reduit (>= 5% gain)
BEFORE=$(cat /tmp/bundle-size-before)
AFTER=$(gzip -c dist/assets/index-*.js | wc -c)
echo "Reduction: $(( (BEFORE - AFTER) * 100 / BEFORE ))%"

# 3. Code coverage maintenu
COVERAGE_BEFORE=92
COVERAGE_AFTER=$(npm test -- --coverage --reporter=text-summary 2>&1 | grep "All files" | awk '{print $3}')
test $(echo "$COVERAGE_AFTER >= $COVERAGE_BEFORE" | bc) -eq 1

# 4. Code mort elimine
npx ts-prune | grep -v 'used in module'  # Doit etre vide

# 5. Helpers documentes (JSDoc)
grep -B5 'export function' apex-ai/v13/services/**/*.ts | grep '/\*\*' | wc -l
```

## Exemples concrets

### Exemple 1 : Extraire `ls()` / `lg()` helpers (CMCteams)

**Avant** : 200+ usages de `localStorage.setItem(key, JSON.stringify(value))` + try/catch JSON.parse partout.

**Apres** :
```typescript
// utils/storage.ts
export function lg<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function ls(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (FB_FIX.includes(key) && typeof fbWrite === 'function') {
      fbWrite(key, value);
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      cmcAggressiveCleanup();
    }
  }
}
```

Gain : 200 occurrences → 200 import + 1 source de verite. Quota gere central. Sync FB_FIX automatique.

### Exemple 2 : Pattern axCall API IA (extraire orchestrator)

**Avant** : 8 endroits qui font `fetch(API_URL, { headers: {...auth}, body: JSON.stringify({...}) })` avec retry/timeout custom chaque fois.

**Apres** :
```typescript
// services/aiClient.ts
export async function callAI(opts: {
  provider: 'anthropic' | 'openai' | 'groq';
  messages: Message[];
  signal?: AbortSignal;
}): Promise<AIResponse> {
  const provider = AI_PROVIDERS[opts.provider];
  const url = provider.proxyUrl ?? provider.directUrl;
  
  return withRetry(async () => {
    const r = await fetch(url, {
      method: 'POST',
      headers: provider.buildHeaders(),
      body: JSON.stringify(provider.buildPayload(opts.messages)),
      signal: opts.signal
    });
    if (!r.ok) throw new APIError(r.status, await r.text());
    return provider.parseResponse(await r.json());
  }, { retries: 3, backoff: 2000 });
}
```

Gain : -120 lignes, 1 endroit pour ajouter retry/circuit-breaker/metrics, types stricts.

## Integration avec autres skills

- **Prerequis** : `tdd-implement` (tests AVANT refactor)
- **Apres** : `commit-quality-gate` (validation), `perf-budget-check` (verifier bundle reduit)
- **Cross** : `apex-v13-feature-port` (refactor pendant migration v12→v13)
- **Suivi** : `audit-parity-v12-v13` pour s'assurer que features sont preservees

## References

- CLAUDE.md "Architecture /20" + "0 code mort"
- jscpd : https://github.com/kucherenko/jscpd
- ts-prune : https://github.com/nadeesha/ts-prune
- Refactoring book (Martin Fowler) : https://refactoring.com/
- DRY principle : https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
