---
name: csp-strict-build
description: Configurer CSP nonce dynamique + strict-dynamic + zero unsafe-inline / unsafe-eval pour Apex v13. Plugin Vite + middleware nonce.
when_to_use: Setup initial CSP strict v13. Apres migration onclick inline (skill csp-fix-inline). Pour atteindre score Securite 20/20 (CLAUDE.md 100/100 reel).
model: opus
allowed_tools: [Read, Edit, Write, Bash, Grep]
---

# Skill: CSP Strict Build (nonce dynamic + strict-dynamic)

## Mission

Configurer une CSP "strict" niveau bancaire pour Apex v13 : nonces dynamiques par requete (jamais en cache), `strict-dynamic` pour autoriser scripts charges par scripts approuves, zero `unsafe-inline`, zero `unsafe-eval`. Score CSP Evaluator 100/100.

Reference Kevin : "Securite avant autonomie totale" + "100/100 reel chaque axe Securite". CSP strict = +5 points axe Securite.

## Pre-requis

- [ ] CSP-fix-inline deja applique (zero onclick inline) - skill prerequisite obligatoire
- [ ] Build Vite dispo (`apex-ai/v13/`)
- [ ] Comprendre nonce vs hash vs strict-dynamic
- [ ] Acces Bash + npm

## Etapes (workflow 6 phases)

### Phase 0 - Audit CSP actuelle (3 min)

```bash
# Detecter CSP existante
grep 'Content-Security-Policy' apex-ai/v13/index.html apex-ai/index.html 2>/dev/null

# Verifier que tous les onclick inline sont elimines (skill csp-fix-inline applique)
grep -cE '(onclick|onchange|onsubmit|onload)=' apex-ai/v13/dist/index.html
# Doit etre 0

# Detecter eval / new Function (incompatibles strict)
grep -nE '\b(eval|Function)\s*\(' apex-ai/v13/{core,features,services,ui}/**/*.ts | grep -v '\.test\.'
# Doit etre vide
```

### Phase 1 - Choisir le mode CSP (5 min)

3 options :

**Option A : Hash-based** (statique)
- Hash SHA-256 de chaque script inline
- Avantage : pas besoin de runtime pour generer nonce
- Inconvenient : recompute a chaque modif

**Option B : Nonce-based** (dynamique) - RECOMMANDE
- Nonce random unique par requete HTTP
- Avantage : tout script avec nonce execute, simple
- Inconvenient : besoin server-side rendering pour injecter nonce

**Option C : strict-dynamic** (Google recommande)
- Nonce sur entry script + `strict-dynamic` propage la confiance
- Avantage : scripts charges dynamiquement (lazy chunks Vite) auto-autorises
- Inconvenient : besoin browser modern (Chrome 52+, Firefox 49+)

Pour Apex v13 (browsers modernes, lazy chunks Vite) → **Option C strict-dynamic**.

### Phase 2 - Installer plugin Vite CSP (5 min)

```bash
cd apex-ai/v13
npm install -D vite-plugin-csp-guard
# Ou
npm install -D @vitejs/plugin-csp
```

Configuration `vite.config.ts` :

```typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import cspGuard from 'vite-plugin-csp-guard';

export default defineConfig({
  plugins: [
    preact(),
    cspGuard({
      algorithm: 'sha256',
      policy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{NONCE}'"],
        'style-src': ["'self'", "'nonce-{NONCE}'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': [
          "'self'",
          'https://api.anthropic.com',
          'https://*.firebaseio.com',
          'https://*.googleapis.com'
        ],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'frame-src': ["'self'", 'https://www.youtube.com'],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': true
      }
    })
  ]
});
```

### Phase 3 - Server-side nonce injection (10 min)

Pour GitHub Pages (statique) : nonce ne peut pas etre dynamique par requete. Solution : worker Cloudflare devant qui injecte nonce.

```javascript
// cloudflare-worker.js
addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const response = await fetch(request);
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }
  
  // Generer nonce random 128-bit
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  
  // Lire HTML, remplacer placeholder
  let html = await response.text();
  html = html.replace(/{NONCE}/g, nonce);
  
  // Headers CSP
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', 
    `default-src 'self'; ` +
    `script-src 'self' 'strict-dynamic' 'nonce-${nonce}'; ` +
    `style-src 'self' 'nonce-${nonce}'; ` +
    `img-src 'self' data: https:; ` +
    `connect-src 'self' https://api.anthropic.com https://*.firebaseio.com; ` +
    `font-src 'self' https://fonts.gstatic.com; ` +
    `frame-src 'self' https://www.youtube.com; ` +
    `base-uri 'self'; ` +
    `form-action 'self'; ` +
    `object-src 'none'; ` +
    `frame-ancestors 'none'; ` +
    `upgrade-insecure-requests`
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self)');
  
  return new Response(html, { headers, status: response.status });
}
```

Deploy : `wrangler deploy` ou Cloudflare Dashboard.

### Phase 4 - Update index.html template (5 min)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- CSP injectee par Cloudflare Worker, mais fallback meta -->
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'strict-dynamic' 'nonce-{NONCE}';
    style-src 'self' 'nonce-{NONCE}';
    object-src 'none';
    base-uri 'self';
  ">
  <title>Apex AI</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/assets/index.css" nonce="{NONCE}">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/assets/index.js" nonce="{NONCE}"></script>
</body>
</html>
```

### Phase 5 - Tests CSP (10 min)

```bash
# 1. Build et serve
cd apex-ai/v13 && npm run build && npm run preview

# 2. Ouvrir browser, DevTools > Console
# Naviguer dans toutes les vues, verifier 0 erreur CSP

# 3. Validation CSP Evaluator
# Copier le header Content-Security-Policy de Network tab
# Coller dans https://csp-evaluator.withgoogle.com/

# 4. Tests automatises
```

```typescript
// e2e/csp.spec.ts
import { test, expect } from '@playwright/test';

test('no CSP violations during navigation', async ({ page }) => {
  const violations = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
      violations.push(msg.text());
    }
  });
  
  await page.goto('/');
  await page.click('[data-action="sv"][data-view="chat"]');
  await page.click('[data-action="sv"][data-view="settings"]');
  await page.fill('input[name=test]', 'value');
  
  expect(violations).toHaveLength(0);
});

test('CSP header is strict', async ({ page }) => {
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'];
  expect(csp).toBeDefined();
  expect(csp).not.toContain("'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]{16,}'/);
});
```

### Phase 6 - Trusted Types (bonus advanced)

Pour atteindre 20/20 absolu, ajouter Trusted Types qui empeche les sinks DOM XSS :

```javascript
// Setup Trusted Types policy
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy('default', {
    createHTML: (input) => {
      // DOMPurify.sanitize(input)
      return input;
    },
    createScriptURL: (input) => {
      const allowed = ['https://api.anthropic.com', 'https://www.youtube.com'];
      const url = new URL(input);
      if (allowed.includes(url.origin)) return input;
      throw new Error('URL not whitelisted');
    }
  });
}
```

CSP header : ajouter `require-trusted-types-for 'script'`.

## Anti-patterns interdits

1. **`'unsafe-inline'`** : annule l'interet. Tout script inline = potentiel XSS executable.
2. **`'unsafe-eval'`** : permet `eval()` et `new Function()`. Vector XSS classique.
3. **`'unsafe-hashes'`** : permet event handlers inline avec hash. Compromis dangereux.
4. **Wildcard `*` dans script-src** : equivaut a desactiver CSP.
5. **`data:` dans script-src** : permet `<script src="data:..."` = injection facile.
6. **Nonce reutilise** : si meme nonce entre 2 requetes, attaquant peut le scrape et l'injecter. Toujours random unique.
7. **Pas de `frame-ancestors`** : permet clickjacking. Toujours `'none'` ou `'self'`.
8. **`base-uri` non restreinte** : attaquant peut changer base URL et redirect tous les liens relatifs.
9. **CSP en `Content-Security-Policy-Report-Only`** : ne bloque pas, juste log. OK pour transition mais pas en final.
10. **`object-src 'self'`** : Flash/Java applets. Toujours `'none'`.

## Validation post-action

```bash
# 1. Pas d'unsafe-inline / unsafe-eval dans le build
grep -E "(unsafe-inline|unsafe-eval)" apex-ai/v13/dist/index.html
# Doit etre vide

# 2. CSP avec strict-dynamic
grep "strict-dynamic" apex-ai/v13/dist/index.html

# 3. Tests E2E CSP passent
cd apex-ai/v13 && npm run e2e -- csp

# 4. CSP Evaluator score (manuel)
# https://csp-evaluator.withgoogle.com/ → 0 high warnings

# 5. Mozilla Observatory test (manuel)
# https://observatory.mozilla.org/ → A+ grade

# 6. SecurityHeaders.com (manuel)
# https://securityheaders.com/ → A+ grade
```

## Exemples concrets

### Exemple 1 : Detecter regression CSP en CI

```yaml
# .github/workflows/csp-check.yml
name: CSP Check
on: [pull_request]
jobs:
  csp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # Build
          cd apex-ai/v13 && npm ci && npm run build
          # Detecter inline handlers regresses
          INLINE=$(grep -cE '(onclick|onchange|onsubmit)=' dist/index.html)
          if [ "$INLINE" -gt 0 ]; then
            echo "❌ $INLINE handlers inline detectes - viol CSP strict"
            exit 1
          fi
          # Detecter eval
          EVAL=$(grep -cE '\beval\(' dist/assets/*.js || true)
          if [ "$EVAL" -gt 0 ]; then
            echo "❌ eval() detecte"
            exit 1
          fi
          echo "✅ CSP strict compatible"
```

### Exemple 2 : Trusted Types pour DOMPurify

```typescript
import DOMPurify from 'dompurify';

window.trustedTypes?.createPolicy('default', {
  createHTML: (input) => DOMPurify.sanitize(input, { 
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick']
  })
});

// Maintenant elem.innerHTML = userInput passera par DOMPurify automatiquement
```

## Integration avec autres skills

- **Prerequis OBLIGATOIRE** : `csp-fix-inline` (eliminer onclick avant CSP strict)
- **Apres** : `security-audit-owasp` (verifier score CSP)
- **Cross** : `pwa-deploy-verify` (manifest CSP coherent)
- **Suivi** : `commit-quality-gate` + monitor CSP violations en prod (Sentry / report-uri)

## References

- CLAUDE.md "Securite avant autonomie totale" + "100/100 REEL"
- CSP Level 3 spec : https://www.w3.org/TR/CSP3/
- Google CSP Evaluator : https://csp-evaluator.withgoogle.com/
- Mozilla Observatory : https://observatory.mozilla.org/
- Trusted Types : https://web.dev/articles/trusted-types
- vite-plugin-csp-guard : https://github.com/Le0Developer/vite-plugin-csp-guard
