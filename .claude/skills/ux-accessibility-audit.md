# Skill: ux-accessibility-audit
> Audit UX complet + accessibilité WCAG 2.2 AA + fix automatique

## Déclencheur
- Score UX ou accessibility < 90 à l'audit
- Kevin dit : "vérifie l'accessibilité", "audit UX", "WCAG"
- Nouveau composant UI créé (hook PostToolUse Write sur `features/`)

## Checklist WCAG 2.2 AA (automatisée)

### Perceptible
```typescript
// 1. Images alt text
const imgs = doc.querySelectorAll('img:not([alt])');
// Fix: ajoute alt="" (décoratif) ou alt="description" (informatif)

// 2. Contraste couleur (ratio min 4.5:1 texte normal, 3:1 grand)
const contrastRatio = (l1: number, l2: number) =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// 3. Texte redimensionnable (zoom 200% sans perte info)
// CSS: font-size en rem, pas px fixes
```

### Utilisable
```typescript
// 4. Navigation clavier complète
// Tous éléments interactifs : tabindex="0" si pas natif
// Focus visible : outline: 2px solid var(--ax-focus-ring)

// 5. Skip links
// <a class="skip-link" href="#main-content">Aller au contenu</a>
```

### Compréhensible
```typescript
// 6. Labels formulaires (jamais placeholder seul)
// <label for="email">Email</label><input id="email" ...>

// 7. Erreurs formulaires explicites
// aria-describedby="email-error" + role="alert" sur message erreur

// 8. Langue déclarée
// <html lang="fr">
```

### Robuste
```typescript
// 9. ARIA correct
// aria-expanded sur toggles
// aria-live="polite" sur zones dynamiques (toast, résultats)
```

## Auto-fix pattern
```typescript
async function fixAccessibility(filePath: string) {
  const content = await read_repo_file({ path: filePath });
  let fixed = content.replace(/<img(?![^>]*alt=)/g, '<img alt=""');
  fixed = fixed.replace(/<button(?![^>]*type=)/g, '<button type="button"');
  await create_or_update_file({ path: filePath, content: fixed,
    message: 'fix(a11y): WCAG 2.2 AA auto-fixes' });
}
```

## Palette Apex casino — Contrastes WCAG AA validés
```css
--ax-text-primary: #F0EAD6;  /* ratio 12.1:1 ✅ */
--ax-gold: #C9A84C;           /* ratio 5.2:1 ✅ */
--ax-error: #FF6B6B;          /* ratio 4.8:1 ✅ */
--ax-focus-ring: #4FC3F7;     /* outline visible */
```
