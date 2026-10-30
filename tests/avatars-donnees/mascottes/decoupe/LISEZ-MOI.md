# Bee et Bourricot (3D animé) — détourés et découpés (30.10.2026)

Demande de `javis-bee` (pont 1502) : fond transparent + pièces mobiles, pour `tools/3d/personnages-def.mjs` et `lingua/<mascotte>/rig`.
Fabriqué **gratuitement**, en local : `rembg` (modèle `isnet-general-use`) pour le détourage, puis découpe géométrique des pièces. Aucune IA payante, aucune donnée de personne.
Source : les planches choisies par Kevin le 29.10 (`../bee-3d-face.jpg`, `../bourricot-3d-face.jpg` et les vues de trois quarts).

| Personnage | Pièces (WebP sans perte, avec transparence) |
|---|---|
| Bee | `bee/base.webp` (corps + tête + antennes + bras, SANS ailes) · `bee/wing-l.webp` · `bee/wing-r.webp` (ailes translucides) |
| Bourricot | `bourricot/base.webp` (tête + crinière + corps, SANS oreilles) · `bourricot/ear-l.webp` · `bourricot/ear-r.webp` |
| Entières | `*/…-3d-face-detoure.webp`, `*/…-3d-trois-quarts-detoure.webp` (1024 × 1024, sans pièces séparées) |

## Comment les remonter
`assemblage.json` donne, pour chaque pièce, sa boîte dans le cadre 1024 × 1024 de la planche de face (`x`, `y`, `w`, `h`), son **pivot** (point de charnière, dans le même cadre) et l'**ordre de dessin** : les pièces « derrière » (ailes, oreilles) d'abord, puis `base.webp` par-dessus. Chaque pièce « derrière » se prolonge un peu SOUS le corps (pixels recopiés qui s'estompent) : en la faisant tourner autour du pivot, aucune fente n'apparaît. Mesuré : ailes ±25°, oreilles ±22°, remontage au repos = planche détourée (≈ 0,15 % de pixels qui diffèrent, sur le bord des poils).

## Ce qui n'y est pas
- **Queue de Bourricot** : invisible de face, donc pas de pièce (à demander sur une vue de dos si besoin).
- **Pattes / bras de Bee** : restent dans `base.webp` (bras collés au corps sur la planche).
- Les vues de trois quarts sont détourées en entier, pas découpées.

Garde : `npm run test:crea-mascottes-decoupe`.
