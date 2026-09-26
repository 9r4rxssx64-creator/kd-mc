---
name: apex-taste
description: Heuristiques de goût — layout, typographie, couleur, mouvement. Ce qui sépare une UI pro d'une UI générique. Inspiré de taste-skill (LeonxInx).
when_to_use: Avant de livrer une UI, pour départager deux options visuelles, pour transformer un design "correct" en design "soigné".
model: sonnet
---

# Skill : apex-taste

## Mission

Le goût n'est pas subjectif au hasard : ce sont des décisions répétables. Ce skill donne les **arbres de décision** layout / typo / couleur / mouvement.

## Layout

- Doute entre 2 espacements → **prends le plus grand**. Le manque d'air tue plus d'UI que l'excès.
- Aligne sur une grille, pas à l'œil. Tout décalage non aligné se voit.
- Hiérarchie = taille + poids + couleur + espace. Jamais la couleur seule.
- Un écran = une action principale évidente en < 1 seconde.
- Bordures : préfère 1px très discret OU pas de bordure (ombre/fond). Jamais 2-3px gris moyen.

## Typographie

- Échelle : choisis un ratio (1.2 à 1.333) et tiens-t'y. Pas de tailles arbitraires.
- Interlignage : titres serrés (1.1-1.2), corps aéré (1.5-1.6).
- Poids : contraste fort (400 corps / 600-700 titres). Éviter le 500 partout = mou.
- Pas de texte centré au-delà de 2 lignes. Le corps de texte s'aligne à gauche.
- `letter-spacing` : léger négatif sur gros titres, léger positif sur petites capitales.

## Couleur

- Un accent. Un seul. Réservé aux actions et à rien d'autre.
- Neutres avec une température (jamais #808080). Le fond raconte déjà une ambiance.
- Saturation : haute = jeune/ludique, basse = sérieux/premium. Choisir, pas hésiter.
- Le texte n'est jamais noir pur sur blanc pur — adoucir légèrement les deux.
- Tester en pleine lumière ET en mode sombre. Une palette qui ne marche que la nuit est cassée.

## Mouvement

- L'animation doit avoir une **raison** (orienter l'attention, confirmer une action). Sinon, supprime-la.
- Court (150-250ms). Une animation lente paraît un bug.
- Easing : entrée rapide / sortie douce. Jamais linéaire, jamais `bounce` sur de l'UI sérieuse.
- Anime `transform` et `opacity` uniquement (60fps). Jamais `width`/`top`/`margin`.
- `prefers-reduced-motion` : couper les transforms, garder les fondus.

## Le test "générique vs soigné"

Une UI générique a : dégradé violet, ombres floues partout, padding serré, easing `bounce`, tout centré, gris plats, emojis en décoration. Si tu en vois → c'est de l'AI-slop, corrige (voir `apex-impeccable-design`, `stop-slop`).

Une UI soignée a : un parti pris de style assumé, de l'air, une hiérarchie nette, un accent discipliné, des micro-interactions justifiées.

## Test mental

> "Si je retire cet élément / cette couleur / cette animation, l'interface est-elle pire ? Si non → retire-le."
