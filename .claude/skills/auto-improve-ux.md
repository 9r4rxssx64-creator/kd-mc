# Skill : Auto-amélioration UX

## Objectif
Apex optimise l'UX automatiquement (Apple HIG + WCAG 2.1 AA + Casino Monaco premium).

## Corrections auto

### Tap Targets iOS (min 44x44px)
```css
.ax-btn, .ax-tab-item { min-height: 44px; min-width: 44px; }
```

### Loading States (tout async obligatoire)
```ts
btn.disabled = true;
try { await asyncAction(); } finally { btn.disabled = false; }
```

### Haptic Feedback
```ts
import { haptic } from '../ui/haptic.js';
haptic.success() | haptic.error() | haptic.light()
```

### Safe Area PWA iOS
```css
padding: env(safe-area-inset-top) env(safe-area-inset-right)
         env(safe-area-inset-bottom) env(safe-area-inset-left);
```

### Accessibilité WCAG 2.1 AA
- aria-label tous icons | role="button" si div cliquable
- aria-live="polite" zones dynamiques | Contrast >= 4.5:1

### Focus Management
```ts
modal.addEventListener('open', () => modal.querySelector('input')?.focus());
modal.addEventListener('close', () => triggerEl.focus());
```

## Métriques
- Tap targets 100% >= 44px ✅ | Loading 100% async ✅ | Lighthouse >= 95 ✅
