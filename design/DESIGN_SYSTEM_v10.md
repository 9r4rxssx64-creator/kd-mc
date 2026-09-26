# Design System CMCteams v10

> Système de tokens, composants et patterns à injecter dans index.html.
> **Stable cross-moodboard** : seules les valeurs `:root { --token: ... }`
> changent selon A/B/C. La structure des composants reste identique.

---

## 1. Tokens CSS Variables

À insérer dans le `<style>` en tête du fichier (zone tokens centralisée v9.66).

### 1.1 Espacement (4-pt scale)

```css
:root {
  --sp-0:  0;
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-8:  32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;
  --sp-20: 80px;
  --sp-24: 96px;
}
```

**Règle** : tout `padding`, `margin`, `gap` dans le code doit utiliser ces tokens.
Plus aucun `padding: 9px` ni `margin-top: 6px` ad-hoc.

### 1.2 Couleurs (mappées au moodboard choisi)

Exemple Moodboard A — Linear/Vercel :

```css
:root {
  /* Backgrounds */
  --bg-0: #0a0a0c;
  --bg-1: #111114;
  --bg-2: #1a1a1f;
  --bg-3: #25252b;

  /* Borders */
  --border:        #2a2a32;
  --border-strong: #3a3a44;
  --border-focus:  var(--accent);

  /* Text */
  --text-1: #fafafa;
  --text-2: #a1a1aa;
  --text-3: #52525b;

  /* Accent + semantic */
  --accent:  #d4a64a;
  --success: #4ade80;
  --danger:  #f87171;
  --warning: #fbbf24;
  --info:    #60a5fa;

  /* Surfaces colorées (avec alpha) */
  --accent-soft:  rgba(212,166,74,.12);
  --success-soft: rgba(74,222,128,.12);
  --danger-soft:  rgba(248,113,113,.12);
  --warning-soft: rgba(251,191,36,.12);
}
```

### 1.3 Typographie

```css
:root {
  --font-display: 'Inter Display', 'Cormorant Garamond', system-ui, serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'SF Mono', Menlo, monospace;

  /* Scale (rem-based for accessibility) */
  --fs-xs:  0.75rem;  /* 12px */
  --fs-sm:  0.8125rem;/* 13px */
  --fs-md:  0.875rem; /* 14px — corps par défaut */
  --fs-lg:  0.9375rem;/* 15px */
  --fs-xl:  1.0625rem;/* 17px — titres cards */
  --fs-2xl: 1.375rem; /* 22px — titres vue mobile */
  --fs-3xl: 1.75rem;  /* 28px — titres vue desktop */
  --fs-4xl: 2.25rem;  /* 36px — hero */

  /* Line heights */
  --lh-tight:  1.2;
  --lh-normal: 1.4;
  --lh-relax:  1.6;

  /* Font weights */
  --fw-normal:   400;
  --fw-medium:   500;
  --fw-semibold: 600;
  --fw-bold:     700;
  --fw-black:    800;
}
```

### 1.4 Radius / Shadow / Motion / z-index

```css
:root {
  /* Radius */
  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 8px;
  --r-xl: 12px;
  --r-2xl: 16px;
  --r-full: 9999px;

  /* Shadow (utilisé sparingly) */
  --shadow-sm: 0 1px 2px rgba(0,0,0,.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,.3);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.45);

  /* Motion */
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 280ms;

  /* z-index scale */
  --z-base:    1;
  --z-nav:     50;
  --z-topbar:  60;
  --z-overlay: 70;
  --z-modal:   80;
  --z-toast:   90;
  --z-tooltip: 100;
}
```

---

## 2. Composants

### 2.1 Button

```html
<button class="btn btn-primary">Action</button>
<button class="btn btn-secondary">Secondaire</button>
<button class="btn btn-ghost">Discret</button>
<button class="btn btn-danger">Supprimer</button>
<button class="btn btn-icon" aria-label="Fermer">✕</button>
```

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--sp-2);
  height: 36px; min-width: 36px; padding: 0 var(--sp-4);
  font: var(--fw-semibold) var(--fs-md)/1 var(--font-body);
  border-radius: var(--r-md); border: 1px solid transparent;
  cursor: pointer; transition: background var(--dur-fast) var(--ease-out),
                                border-color var(--dur-fast) var(--ease-out);
}
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-primary { background: var(--accent); color: #000; }
.btn-primary:hover { background: color-mix(in srgb, var(--accent) 88%, white); }
.btn-secondary { background: transparent; color: var(--text-1); border-color: var(--border); }
.btn-secondary:hover { background: var(--bg-2); }
.btn-ghost { background: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--bg-2); color: var(--text-1); }
.btn-danger { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }
.btn-danger:hover { background: var(--danger); color: #000; }
.btn-icon { width: 36px; padding: 0; }

/* Tailles : sm, md (par défaut), lg */
.btn-sm { height: 28px; padding: 0 var(--sp-3); font-size: var(--fs-sm); }
.btn-lg { height: 44px; padding: 0 var(--sp-5); font-size: var(--fs-lg); }
```

**Touch-target** : la taille `md` (36px) est utilisée desktop ; mobile utilise `lg` (44px)
par défaut via media query — respecte la règle « Touch targets minimum 44px » de
`.claude/rules/frontend.md` (fichier séparé, PAS une section de CLAUDE.md).

### 2.2 Card

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Titre</h3>
    <span class="card-meta">258 actifs</span>
  </div>
  <div class="card-body">...</div>
  <div class="card-footer">
    <button class="btn btn-ghost btn-sm">Voir tout ›</button>
  </div>
</div>
```

```css
.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.card-elevated { background: var(--bg-2); box-shadow: var(--shadow-md); }
.card-glass {
  background: rgba(20,12,18,.65);
  backdrop-filter: blur(20px);
  border-color: var(--border-strong);
} /* Moodboard B uniquement */
.card-header { display: flex; justify-content: space-between; align-items: baseline; }
.card-title  { font: var(--fw-semibold) var(--fs-xl)/var(--lh-tight) var(--font-display); }
.card-meta   { font: var(--fw-normal) var(--fs-sm) var(--font-mono); color: var(--text-2); }
```

### 2.3 Input / Textarea / Select

```html
<label class="field">
  <span class="field-label">Email</span>
  <input class="input" type="email" placeholder="vous@example.com">
  <span class="field-hint">On ne partagera jamais cet email.</span>
</label>
```

```css
.field { display: flex; flex-direction: column; gap: var(--sp-1); }
.field-label { font: var(--fw-medium) var(--fs-sm) var(--font-body); color: var(--text-2); }
.field-hint  { font: var(--fs-xs) var(--font-body); color: var(--text-3); }
.input, .textarea, .select {
  height: 40px; padding: 0 var(--sp-3);
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r-md); color: var(--text-1);
  font: var(--fs-md) var(--font-body);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.input:focus, .textarea:focus, .select:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.textarea { height: auto; min-height: 80px; padding: var(--sp-2) var(--sp-3); resize: vertical; }
.input[disabled] { opacity: 0.5; cursor: not-allowed; }
```

### 2.4 Modal

```html
<div class="modal-backdrop" data-modal="true" onclick="modalClose(event)">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header class="modal-header">
      <h2 id="m-title" class="modal-title">Titre</h2>
      <button class="btn btn-icon" onclick="modalClose()" aria-label="Fermer">✕</button>
    </header>
    <div class="modal-body">...</div>
    <footer class="modal-footer">
      <button class="btn btn-ghost" onclick="modalClose()">Annuler</button>
      <button class="btn btn-primary">Confirmer</button>
    </footer>
  </div>
</div>
```

```css
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-4); animation: fadeIn var(--dur-base) var(--ease-out);
}
.modal {
  max-width: 480px; width: 100%; max-height: 90vh; overflow: auto;
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r-xl); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  animation: slideUp var(--dur-base) var(--ease-out);
}
.modal-header, .modal-footer { padding: var(--sp-4); display: flex; align-items: center; }
.modal-header { justify-content: space-between; border-bottom: 1px solid var(--border); }
.modal-footer { justify-content: flex-end; gap: var(--sp-2); border-top: 1px solid var(--border); }
.modal-body { padding: var(--sp-4); flex: 1; }
.modal-title { font: var(--fw-semibold) var(--fs-xl) var(--font-display); }

@keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

**Fonction helper** : `modalOpen(html, opts)` et `modalClose()` à ajouter dans le JS,
remplace toutes les créations ad-hoc `document.createElement("div")` + innerHTML.

### 2.5 Toast (stack vertical)

```html
<div class="toast-stack" id="toastStack" aria-live="polite"></div>
```

```css
.toast-stack {
  position: fixed; top: var(--sp-4); right: var(--sp-4);
  z-index: var(--z-toast); display: flex; flex-direction: column;
  gap: var(--sp-2); pointer-events: none;
}
.toast {
  pointer-events: auto;
  background: var(--bg-2); border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4);
  font: var(--fs-md) var(--font-body); color: var(--text-1);
  max-width: 360px; box-shadow: var(--shadow-md);
  animation: slideInRight var(--dur-base) var(--ease-out);
}
.toast-success { border-left-color: var(--success); }
.toast-danger  { border-left-color: var(--danger); }
.toast-warning { border-left-color: var(--warning); }
.toast-info    { border-left-color: var(--info); }

@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }
```

Helper JS `toast(msg, variant)` : empile, max 3 visibles, auto-dismiss 4s.

### 2.6 Badge / Pill

```html
<span class="badge">12</span>
<span class="badge badge-success">Actif</span>
<span class="badge badge-danger badge-pulse">2 ⚠</span>
```

```css
.badge {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  height: 20px; padding: 0 var(--sp-2);
  font: var(--fw-bold) var(--fs-xs)/1 var(--font-mono);
  background: var(--bg-2); color: var(--text-2);
  border-radius: var(--r-full); white-space: nowrap;
}
.badge-success { background: var(--success-soft); color: var(--success); }
.badge-danger  { background: var(--danger-soft);  color: var(--danger); }
.badge-warning { background: var(--warning-soft); color: var(--warning); }
.badge-accent  { background: var(--accent-soft);  color: var(--accent); }
.badge-pulse   { animation: pulseDot 1.5s ease-in-out infinite; }
```

### 2.7 Empty State

```html
<div class="empty">
  <div class="empty-icon">📭</div>
  <h3 class="empty-title">Aucune demande en attente</h3>
  <p class="empty-text">Les nouvelles demandes apparaîtront ici.</p>
  <button class="btn btn-primary">📥 Importer un planning</button>
</div>
```

### 2.8 Tabs (sub-navigation)

```html
<div class="tabs" role="tablist">
  <button class="tab" aria-selected="true">Mon planning</button>
  <button class="tab">Équipe</button>
  <button class="tab">Départs</button>
</div>
```

```css
.tabs { display: flex; gap: var(--sp-1); border-bottom: 1px solid var(--border); }
.tab {
  padding: var(--sp-3) var(--sp-4);
  background: transparent; border: none; cursor: pointer;
  font: var(--fw-medium) var(--fs-md) var(--font-body);
  color: var(--text-2); position: relative;
  transition: color var(--dur-fast) var(--ease-out);
}
.tab:hover { color: var(--text-1); }
.tab[aria-selected="true"] {
  color: var(--accent);
}
.tab[aria-selected="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 2px; background: var(--accent);
}
```

### 2.9 BottomSheet (mobile)

```html
<div class="sheet-backdrop">
  <div class="sheet" role="dialog">
    <div class="sheet-handle"></div>
    <div class="sheet-body">...</div>
  </div>
</div>
```

Comportement : drag-to-dismiss, snap points (full, half).

### 2.10 Skeleton loader

```html
<div class="card">
  <div class="skel skel-line" style="width:60%"></div>
  <div class="skel skel-line" style="width:40%"></div>
  <div class="skel skel-block" style="height:80px"></div>
</div>
```

```css
.skel {
  background: linear-gradient(90deg, var(--bg-2), var(--bg-3), var(--bg-2));
  background-size: 200% 100%;
  animation: skelShimmer 1.2s ease infinite;
  border-radius: var(--r-sm);
}
.skel-line  { height: 12px; margin-bottom: var(--sp-2); }
.skel-block { width: 100%; }
@keyframes skelShimmer { from { background-position: -100% 0; } to { background-position: 100% 0; } }
```

---

## 3. Patterns d'interaction

### 3.1 Confirmation destructive

Remplacer **tous** les `confirm("...")` natifs par un modal stylé :

```javascript
modalConfirm({
  title: "Supprimer DUPONT J",
  body: "Cette action est irréversible. Toutes ses données (planning, mdp, identité) seront perdues.",
  confirmLabel: "Supprimer définitivement",
  confirmVariant: "danger",
  requireType: "OUI"   // optionnel : tape "OUI" pour confirmer
}).then(ok => { if(ok) doDelete(); });
```

### 3.2 Liste vide

Toute liste doit avoir un `Empty State` quand vide (jamais un `<div></div>` blanc).

### 3.3 Chargement

- < 200ms : rien (le rendu suffit).
- 200ms–2s : skeleton loader.
- > 2s : spinner + message "Chargement…".
- Network error : Empty State avec bouton "Réessayer".

### 3.4 Focus management

- Modal s'ouvre → focus sur le 1er bouton.
- Modal se ferme → focus retour sur l'élément déclencheur.
- `Esc` ferme la modal au top de la pile.
- Tab loop dans la modal.

---

## 4. Règles emoji (anti-bruit)

- ✅ Emojis OK dans : titres de section vAdmin (1 emoji/section), badges sémantiques
  (état avec icône), illustrations Empty State.
- ❌ Emojis BANNIS sur : labels de boutons individuels dans une liste de 10+ items,
  toolbar de commandes (utiliser icônes ligne fine ou pictogrammes Unicode sobres
  type ◆, ●, ▸, ✕).

**Avant** : `📥 Importer · ✅ Vérifier · 📋 Passation · 🔄 Sync · ⚡ Apex` (5 emojis alignés, bruit)

**Après** : `Importer · Vérifier · Passation · Sync · Apex AI` (texte + icône ligne fine cohérente)

---

## 5. Accessibilité

- Contraste WCAG AA minimum (4.5:1) pour tout texte normal, 3:1 pour large.
- Tous les boutons icon-only ont un `aria-label`.
- Live region `aria-live="polite"` pour les toasts.
- Modals `role="dialog" aria-modal="true" aria-labelledby="..."`.
- Tabs avec `role="tablist"` + `aria-selected`.
- Focus visible obligatoire (jamais `outline: none` sans alternative).
- Respect `prefers-reduced-motion` : désactive animations non essentielles.
- Tap targets minimum 44×44px (Apple HIG) sur mobile.

---

## 6. Migration mapping

Table de correspondance ancien → nouveau pour la refonte progressive :

| Ancien (v9.675)                              | Nouveau (v10)                   |
|----------------------------------------------|---------------------------------|
| `<button style="background:rgba(80,200,100,.1)…">` | `<button class="btn btn-secondary">` |
| `<div style="padding:14px;border:1px solid…">`    | `<div class="card">` |
| `confirm("…")`                                | `await modalConfirm({…})` |
| `toast("OK")`                                 | `toast("OK", "success")` |
| `prompt("…")`                                 | `<input class="input">` dans modal |
| `document.createElement('div')` + innerHTML inline | `modalOpen(html, opts)` |
| `style="background:#c9a227;color:#000;…"`     | `class="btn btn-primary"` (tokens) |
| `position:fixed;top:10px;right:10px;…` (toast) | `.toast-stack > .toast` |

Implémentation des helpers `modalOpen`, `modalClose`, `modalConfirm`, `toast(msg, variant)`
au Sprint 0.

---

## 7. Sprint 0 — Injection sans rupture

Le sprint 0 ajoute les `:root { --token: ... }` SANS modifier le code existant
(les composants actuels n'utilisent pas encore les tokens, donc zéro impact visuel).

Après Sprint 0, chaque sprint suivant migre **une vue à la fois** vers le système.
Les anciens styles cohabitent jusqu'à la fin de la refonte, puis suppression du
code mort en Sprint 7.

---

## 8. Validation

À chaque sprint :
- Test mobile 375px obligatoire (iPhone SE).
- Test desktop 1280px.
- Contraste vérifié avec un outil (ex: Stark, Contrast.app).
- `prefers-reduced-motion` testé.
- Pas de régression sur les vues non encore migrées.
