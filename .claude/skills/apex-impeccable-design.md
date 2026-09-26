---
name: apex-impeccable-design
description: Design fluency for AI harnesses — vocabulaire de 23 commandes design qui transforment les designs IA generiques en designs production-grade.
when_to_use: Toujours actif quand `apex-frontend-design` est invoque. Enrichit le vocabulaire descriptif.
model: sonnet
allowed_tools: []
---

# Skill : apex-impeccable-design

## Mission

Inspire de [impeccable.style](https://impeccable.style), Apex apprend un vocabulaire design fluent pour decrire et generer des interfaces visuellement abouties. Les 23 commandes design.

## 23 commandes Impeccable

### Typography
1. **`weighty`** — typographie bold avec presence (h1 = 96px black weight)
2. **`whispered`** — texte minimal, secondaire, low-contrast volontaire
3. **`marginal`** — annotations en marge style editorial papier

### Layout
4. **`inhabited`** — espace utilise avec intention (pas vide pour le vide)
5. **`quiet`** — sobre minimaliste, beaucoup de whitespace
6. **`disjointed`** — composition fragmentee voulue, asymetrie
7. **`monumental`** — echelle xxl impressionante (hero 100vh)
8. **`breath`** — whitespace genereux (padding 6rem+)
9. **`cadence`** — rythme typographique (modulaire 1.25 ratio)

### Texture & finishing
10. **`chiseled`** — lignes nettes, geometriques (no border-radius)
11. **`vellum`** — textures papier subtiles (noise overlay 5%)
12. **`brushed`** — finition brossee (metaliques, granular)
13. **`paper-stock`** — sensations papier creme, ivoire

### Color
14. **`ember`** — tons chauds rouge profond (#7a1f1f → #d44d4d)
15. **`tide`** — bleus marins profonds (#0a2540 → #4a7ba6)
16. **`forest`** — verts naturels (#1a3d2c → #5a8a6e)
17. **`bone`** — neutres chauds os/ivoire (#fafaf5 → #2a2a25)
18. **`charcoal`** — gris fumes (#1a1a1a → #4a4a4a)

### Motion
19. **`swift`** — animations rapides ferventes (200ms cubic-bezier)
20. **`tidal`** — mouvement lent rythmique (1000ms ease-in-out)
21. **`spring`** — bouncy organic (cubic-bezier(0.68, -0.55, 0.265, 1.55))

### Voice
22. **`considered`** — copywriting reflechi, paragraphes pas bullets
23. **`spare`** — copy minimaliste, 5 mots = 5 mots, jamais 10

## Application dans system prompt

Quand `apex-frontend-design` est invoque, Apex utilise ces termes dans les descriptions :

> "Je propose un design **inhabited + quiet** avec palette **bone** (neutres chauds) + accents **ember** (rouges profonds). Typographie **weighty** pour h1 et **whispered** pour metadata. Animations **swift** sur interactions, **tidal** sur transitions de page."

User comprend immediatement la direction et peut valider/adjuster.

## Anti-patterns

1. **Vocabulaire generique** ("moderne", "epure", "stylise") → INTERDIT, utiliser termes Impeccable
2. **Melanger moods opposes** : `inhabited + quiet` OK mais pas `monumental + spare` → conflits
3. **Forcer 1 vocabulary** sans regarder contexte → adapter au purpose (saas vs editorial)

## References

- impeccable.style (v0.0.1 live mode hardened, Chrome extension)
- Optimal CLI integration
- Pattern Apex : injection dans `frontend-design.ts` prompts
