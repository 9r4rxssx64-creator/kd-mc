---
name: apex-generate-pptx
description: Genere une presentation Microsoft PowerPoint (.pptx) telechargeable depuis chat Apex. Pitchs, slides cours, presentations pro + fun.
when_to_use: User demande "presentation", "slides", "pitch", "diapo", "PowerPoint", ".pptx", "keynote".
model: sonnet
allowed_tools: [generate_pptx]
---

# Skill : apex-generate-pptx

## Mission

Produire un fichier .pptx **telechargeable directement** quand user demande une presentation. Generation via `pptxgenjs` (CDN lazy). Modes PRO (sobre, business) + FUN (couleurs vives, emojis, animations).

## Quand l'invoquer (auto)

Apex appelle `generate_pptx` automatiquement si user dit :

- "fais-moi une presentation", "des slides"
- "pitch deck", "pitch startup"
- "diapo pour mon cours", "slides pedagogiques"
- "PowerPoint sur X", "ppt", "pptx"
- "keynote" (genere format compatible)

## Templates fournis

- `pitch-startup` — 10 slides Y Combinator standard (Problem, Solution, Market, Traction, Team, Ask)
- `business-quarterly` — review trimestrielle (Highlights, KPIs, Roadmap)
- `lecture-academic` — slides cours (sobre, focus contenu)
- `wedding-anniversary` — FUN, photo souvenirs (animations)
- `birthday-party` — FUN couleurs vives, GIFs
- `casino-training` — formation casino SBM (regles jeux, Convention)
- `product-launch` — annonce produit (hero, features, pricing)

## Format input

```json
{
  "template": "pitch-startup | business-quarterly | lecture-academic | wedding-anniversary | birthday-party | casino-training | product-launch",
  "title": "Titre principal",
  "author": "Auteur",
  "slides": [
    { "title": "Slide 1", "content": "Bullet 1\nBullet 2", "image_url": "...optionnel..." }
  ],
  "mode": "pro | fun",
  "theme_color": "#hex optionnel"
}
```

## Output

```json
{
  "success": true,
  "filename": "pitch_apex_2026-05-14.pptx",
  "blob_url": "blob:...",
  "slide_count": 10,
  "size_bytes": 245000
}
```

## Anti-patterns

1. **Repondre en markdown bullets** quand l'utilisateur veut un .pptx → INTERDIT
2. **Slides surchargees** (>7 bullets) → trop denses, splitter
3. **Generation server-side** → INTERDIT, tout client-side
4. **Mode PRO avec emojis criards** → confusion modes

## References

- Lib : `pptxgenjs` v3.x
- Pattern : `apex-ai/v13/services/skills/pptx-generator.ts`
