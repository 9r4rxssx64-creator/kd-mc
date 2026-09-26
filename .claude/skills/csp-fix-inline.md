---
name: csp-fix-inline
description: Migrer les onclick/onchange/style inline vers data-attributes + event delegation pour CSP strict (zero unsafe-inline).
when_to_use: Avant CSP strict deployment. Si CSP violations dans console. Sur audit qui detecte onclick=*. Apres ajout de feature avec template strings HTML.
model: sonnet
allowed_tools: [Read, Edit, Bash, Grep, Glob]
---

# Skill: CSP Fix Inline (migrer onclick/style inline)

## Mission

Eliminer 100% des handlers inline (`onclick=`, `onchange=`, `onsubmit=`, `style=`) du HTML genere par v12/v13 pour permettre une CSP strict (`script-src 'self' 'nonce-{random}'` sans `unsafe-inline` ni `unsafe-eval`).

Migration vers : event delegation au niveau document/root + data-attributes pour passer les params + classes CSS au lieu de style inline.

Reference Kevin : "CSP strict = +2 points axe Securite. Aucune balise script inline. Aucun handler inline. Nonces dynamiques."

## Pre-requis

- [ ] Avoir lu CLAUDE.md regles "Securite avant autonomie totale"
- [ ] Comprendre Content-Security-Policy nonce-based
- [ ] Acces au build (Vite plugin csp-guard si v13, sinon manuel)
- [ ] Connaitre le scope (apex-ai/index.html ou index.html racine CMCteams)

## Etapes (workflow 5 phases)

### Phase 0 - Inventaire des handlers inline (5 min)

```bash
# Compter les onclick=
grep -c 'onclick=' apex-ai/index.html
grep -c 'onclick=' index.html

# Lister les types de handlers
grep -oE 'on[a-z]+=' apex-ai/index.html | sort -u

# Lister les style= inline
grep -c 'style="' apex-ai/index.html

# Identifier les patterns repetitifs (candidats prioritaires)
grep -oE 'onclick="[a-zA-Z_]+\(' apex-ai/index.html | sort | uniq -c | sort -rn | head -20
```

Note les counts comme baseline. Objectif : tous a 0 a la fin (sauf style temporaires anim).

### Phase 1 - Choisir la strategie de delegation (5 min)

3 patterns possibles :

**Pattern A : data-action (recommande)**
```html
<!-- Avant -->
<button onclick="doLogin()">Login</button>
<button onclick="deleteEmp(123)">Delete</button>

<!-- Apres -->
<button data-action="doLogin">Login</button>
<button data-action="deleteEmp" data-emp-id="123">Delete</button>
```

```javascript
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const handlers = {
    doLogin: () => doLogin(),
    deleteEmp: (b) => deleteEmp(parseInt(b.dataset.empId, 10))
  };
  if (handlers[action]) handlers[action](btn);
});
```

**Pattern B : Map handlers (typed)**
```typescript
const handlers = new Map<string, (el: HTMLElement, e: Event) => void>();
handlers.set('login', (el, e) => doLogin());
handlers.set('delete-emp', (el, e) => deleteEmp(parseInt(el.dataset.id!, 10)));
```

**Pattern C : Custom Events (decoupling)**
```javascript
btn.dispatchEvent(new CustomEvent('app:login', { bubbles: true }));
document.addEventListener('app:login', () => doLogin());
```

### Phase 2 - Migration automatisee (15 min)

Script de migration sed (CMCteams `index.html`) :

```bash
# Sauvegarde
cp index.html /tmp/index.html.bak

# Pattern simple : onclick="fnName()" → data-action="fnName"
# Attention : sed ne gere pas les multi-args complexes, faire en plusieurs passes

# Pass 1 : onclick="simpleFn()"
sed -i 's/onclick="\([a-zA-Z_]\+\)()"/data-action="\1"/g' index.html

# Pass 2 : onclick="fn(123)" → data-action="fn" data-arg="123"
# (manuel pour chaque cas, plus complexe)

# Pass 3 : style="display:none" recurrent → class="hidden"
sed -i 's/style="display:none[;]*"/class="hidden"/g' index.html
sed -i 's/style="display:none[;]*\([^"]*\)"/class="hidden" style="\1"/g' index.html

# Verifier qu'on n'a pas casse le HTML
node -e "const h = require('fs').readFileSync('index.html','utf8'); console.log('OK length', h.length)"
```

Pour cas complexes (multi-args, escape quotes), faire en code editing manuel via Edit.

### Phase 3 - Implementer le delegateur global (10 min)

```javascript
// A ajouter au boot, AVANT toute interaction
(function setupActionDelegator() {
  // Whitelist des actions autorisees (anti-injection)
  const ACTIONS = {
    'doLogin': () => doLogin(),
    'doLogout': () => doLogout(),
    'deleteEmp': (el) => {
      const id = parseInt(el.dataset.empId || '0', 10);
      if (isNaN(id) || id <= 0) return;
      deleteEmp(id);
    },
    'sv': (el) => sv(el.dataset.view),
    // ... une entry par action
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const handler = ACTIONS[action];
    if (!handler) {
      console.warn('[CSP] Unknown action:', action);
      return;
    }
    e.preventDefault();
    handler(btn, e);
  }, true);

  // Delegators pour change/submit/input similaires
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.change];
    if (fn) fn(el, e);
  });
})();
```

Whitelist OBLIGATOIRE : empeche `data-action="eval"` injecte par XSS de fonctionner.

### Phase 4 - Update CSP strict (5 min)

```html
<!-- Avant : permissif (vulnerable XSS) -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval'">

<!-- Apres : strict avec nonce -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM_NONCE}' 'strict-dynamic';
  style-src 'self' 'nonce-{RANDOM_NONCE}';
  img-src 'self' data: https:;
  connect-src 'self' https://api.anthropic.com https://*.firebaseio.com;
  font-src 'self' https://fonts.gstatic.com;
  frame-src 'self' https://www.youtube.com https://www.google.com;
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests;
">
```

Pour Vite v13 : utiliser plugin `vite-plugin-csp-guard` qui genere les nonces a build time.

### Phase 5 - Test + verifier console (10 min)

```bash
# 1. Verifier qu'aucun onclick reste
grep -c 'onclick=' apex-ai/index.html  # Doit etre 0

# 2. Verifier qu'aucun style display:none non migre
grep -cE 'style="[^"]*display:\s*none' apex-ai/index.html  # Doit etre minimal

# 3. Lancer le site et ouvrir DevTools console
# Aucun "Refused to execute inline script" ou "Refused to apply inline style"

# 4. Tester chaque feature critique :
# - Login
# - Navigation entre vues
# - Soumettre formulaire
# - Suppression element
# - Toggle theme
```

## Anti-patterns interdits

1. **Whitelist `'unsafe-inline'`** : annule l'interet de la migration. Toujours nonces ou `'self'` strict.
2. **`eval()` ou `new Function()`** : viole `script-src` strict. Refactor en logique ifs/switch.
3. **`document.write()`** : interdit par CSP strict. Utiliser `appendChild` ou template literals.
4. **Setter `el.innerHTML = '<script>'`** : meme avec nonce, `innerHTML` n'execute pas le script (intentionnel browser). Ne pas s'y fier comme contournement.
5. **Action sans whitelist** : `ACTIONS[el.dataset.action]()` direct = XSS via `data-action="alert"`. Toujours map explicite.
6. **`javascript:` URLs** : `<a href="javascript:doFn()">` viole CSP. Migrer en `data-action`.
7. **Inline JSON sans nonce** : `<script type="application/json">` aussi blocke en strict. Utiliser nonce ou data-attribute.

## Validation post-action

```bash
# 1. Aucun onclick/onchange/onsubmit/onload inline
for h in onclick onchange onsubmit onload onerror oninput; do
  echo "$h: $(grep -c "${h}=" apex-ai/index.html)"
done
# Tous doivent etre 0

# 2. Aucun script inline (sauf nonce explicite)
grep -E '<script(?!.*nonce=)' apex-ai/index.html | grep -v 'src=' | head -5

# 3. CSP strict en place
grep "Content-Security-Policy" apex-ai/index.html | grep -v 'unsafe-inline'

# 4. Test visuel : ouvrir l'app, verifier console DevTools 0 erreur CSP
# (manuel)

# 5. Tests E2E passent
cd apex-ai/v13 && npm run e2e
```

Si echec : identifier le handler inline restant via console DevTools "Refused to execute" et migrer.

## Exemples concrets

### Exemple 1 : Migrer vNav() de CMCteams

**Avant** :
```html
<nav id="bnav">
  <button onclick="sv('accueil')">Accueil</button>
  <button onclick="sv('plan')">Equipe</button>
  <button onclick="doLogout()">Deconnexion</button>
</nav>
```

**Apres** :
```html
<nav id="bnav">
  <button data-action="sv" data-view="accueil">Accueil</button>
  <button data-action="sv" data-view="plan">Equipe</button>
  <button data-action="doLogout">Deconnexion</button>
</nav>
```

```javascript
// Ajout au delegator global
ACTIONS.sv = (el) => {
  const view = el.dataset.view;
  if (!view || !/^[a-z0-9_-]+$/i.test(view)) return;  // Validation regex
  sv(view);
};
ACTIONS.doLogout = () => doLogout();
```

### Exemple 2 : Migrer style="display:none" toggle modal

**Avant** :
```javascript
modal.innerHTML = '<div style="display:none" id="m">...</div>';
btn.onclick = () => document.getElementById('m').style.display = 'block';
```

**Apres** :
```css
.modal-hidden { display: none; }
.modal-visible { display: block; }
```
```javascript
modal.innerHTML = '<div class="modal-hidden" id="m">...</div>';

// Dans ACTIONS :
ACTIONS.toggleModal = (el) => {
  const target = document.getElementById(el.dataset.targetId);
  if (target) target.classList.toggle('modal-visible');
};
```

```html
<button data-action="toggleModal" data-target-id="m">Show</button>
```

## Integration avec autres skills

- **Avant** : `audit-parity-v12-v13` (identifier les zones avec inline)
- **Apres** : `csp-strict-build` (configurer CSP strict une fois inline elimine)
- **Cross** : `security-audit-owasp` (verifier que la migration n'a pas casse une feature)
- **Suivi** : `commit-quality-gate` avant push

## References

- CLAUDE.md "Securite avant autonomie totale"
- MDN CSP : https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- vite-plugin-csp-guard : https://www.npmjs.com/package/vite-plugin-csp-guard
- CSP Evaluator : https://csp-evaluator.withgoogle.com/
- OWASP CSP cheat sheet : https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
