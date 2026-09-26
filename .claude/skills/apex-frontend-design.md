---
name: apex-frontend-design
description: Genere palettes couleurs, typo, composants UI production-grade WCAG AA. Evite l'esthetique IA generique. Inspire Frontend Design Anthropic (277k installs) + Impeccable.style (design fluency 23 commands).
when_to_use: User demande "design", "palette", "couleurs", "theme", "typo", "composants UI", "design system", "branding", "logo", "frontend".
model: sonnet
allowed_tools: [generate_design_system]
---

# Skill : apex-frontend-design

## Mission

Apex produit des designs **production-grade** qui evitent l'aspect "IA generique" (Tailwind par defaut, palettes pastel fades, fontes Inter partout). Le skill fournit :

- Vocabulaire design fluent (23 termes Impeccable : `disjointed`, `inhabited`, `chiseled`, `vellum`, etc.)
- Palettes inspirees de chefs-d'oeuvre design (Pantone, references Apple, Stripe, Linear)
- Choix typographiques expressifs (Garamond + Inter, Playfair + Mono, etc.)
- Composants HTML/CSS avec micro-interactions soignees
- Conformite WCAG AA (contraste 4.5:1 minimum)

## Quand l'invoquer (auto)

- "fais-moi un design", "palette de couleurs"
- "theme dark/light pour mon site"
- "composants pour mon app"
- "logo professionnel"
- "refonte UI", "redesign"
- "design system complet"
- Admin Kevin parle UX/UI → propose design audit

## Capacites

### A. Palette generator
Input : `{mood: "premium|playful|tech|warm|cold|monochrome", primary_hex?: "..."}`
Output : 7 couleurs harmoniques (primary, secondary, accent, success, warning, error, neutral 50-900 scale)

### B. Typography stack
Input : `{purpose: "editorial|saas|landing|dashboard|fintech"}`
Output : `{heading: "Playfair Display", body: "Inter", mono: "JetBrains Mono", sizes_rem: [...]}`

### C. Component library
- Buttons (5 variantes : primary, secondary, ghost, outline, danger)
- Cards (default, hover, interactive, glassmorphism)
- Inputs (text, search, password, textarea, select)
- Modals (with focus trap, escape key, backdrop)
- Toasts (4 types, auto-dismiss)
- Navigation (tabs, breadcrumb, pagination)
- Tables (striped, hover, sortable headers)
- Forms (validation states, helper text, errors)

Tous WCAG AA compliant, focus visible, ARIA labels.

### D. Animations
Easing curves expressives :
- `swift-enter` : entree rapide cubic-bezier(0.16, 1, 0.3, 1)
- `gentle-exit` : sortie douce cubic-bezier(0.7, 0, 0.84, 0)
- `bouncy` : ressort cubic-bezier(0.68, -0.55, 0.265, 1.55)

### E. Vocabulaire Impeccable (23 termes)
Apex utilise ces mots pour decrire designs :
- `weighty` (typo bold avec presence)
- `quiet` (designs sobres minimalistes)
- `inhabited` (espace utilise avec intention)
- `disjointed` (composition fragmentee voulue)
- `chiseled` (lignes nettes, geometriques)
- `vellum` (textures papier subtiles)
- `marginal` (notes en marge style editorial)
- `breath` (whitespace genereux)
- `cadence` (rythme typographique)
- `monumental` (echelle xxl impressionante)
- ... +13 autres

## Format input

```json
{
  "type": "palette | typography | component | full-design-system | logo",
  "mood": "premium | playful | tech | warm | cold | monochrome | editorial",
  "primary_hex": "#hex optionnel",
  "purpose": "saas | landing | dashboard | fintech | editorial | ecommerce",
  "constraints": ["wcag-aa", "dark-mode", "rtl-support"]
}
```

## Format output

```json
{
  "palette": { "primary": "#...", "secondary": "#...", "neutral_scale": ["#...", "..."] },
  "typography": { "heading": "Playfair Display", "body": "Inter", "sizes_rem": [1, 1.125, ...] },
  "components_html": "<style>...</style><div>...</div>",
  "tailwind_config": "{theme:{extend:{...}}}",
  "css_variables": ":root { --primary: ...; ... }",
  "wcag_report": { "passes": 28, "fails": 0 },
  "preview_url": "blob:..."
}
```

## Anti-patterns interdits

1. **Tailwind par defaut sans customisation** → palette/typo personnalisee obligatoire
2. **Couleurs pastel insipides** sans intention → INTERDIT, palettes expressives
3. **Inter partout** → varier les typos selon contexte
4. **Contraste < 4.5:1** sur text body → INTERDIT (WCAG AA)
5. **Animations qui freezent UI** → toujours `will-change` + GPU
6. **Components sans focus visible** → INTERDIT (a11y)
7. **Glassmorphism sur fond clair** sans contraste → illisible

## Validation post-action

```bash
# Audit WCAG via axe-core (lazy CDN)
node tests/a11y-audit.js <generated_preview.html>
```

## References

- Frontend Design Anthropic : https://github.com/anthropic/skills/frontend-design
- Impeccable.style : design fluency for AI harnesses (23 commands)
- Pattern Apex : `apex-ai/v13/services/core-svc/frontend-design.ts`
- Vue : `?view=design-system`
