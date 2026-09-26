---
name: apex-ui-ux-pro-max
description: Système de design complet — familles de styles, construction de palettes, 99 règles UX condensées. Inspiré de ui-ux-pro-max-skill (nextlevelbuilder).
when_to_use: Création/refonte d'interface, choix de palette, choix de style visuel, audit UX, génération de page ou composant.
model: sonnet
---

# Skill : apex-ui-ux-pro-max

## Mission

Donner à Apex un système de design exploitable : choisir le bon **style**, la bonne **palette**, et appliquer les **règles UX** éprouvées — au lieu de produire du générique.

Complémentaire (PAS doublon) : `apex-frontend-design` = fondations tokens/composants, `apex-impeccable-design` = vocabulaire, `apex-taste` = heuristiques de goût. Ce skill = catalogue de décision.

## 1. Familles de styles (choisir 1 selon le contexte)

| Famille | Quand | Marqueurs visuels |
|---|---|---|
| Minimal éditorial | SaaS, dashboard pro | whitespace large, serif titres, 1 accent |
| Glassmorphism sobre | app premium, overlays | `backdrop-filter: blur(20px) saturate(180%)`, bordures 1px translucides |
| Néo-brutalisme doux | landing produit jeune | bords nets, ombres décalées franches, couleurs vives mesurées |
| Dark spatial | IA, outils dev | fond near-black, accent gradient, profondeur par élévation |
| Luxe sombre + or | Apex / casino Monaco | fond #0b1409, `var(--ax-gold)`, gradients 135°, contraste élevé |
| Clair chaleureux | grand public, seniors | fond crème, contrastes doux, gros touch targets |

Règle : **un seul style par produit**. Ne pas mélanger glassmorphism + brutalisme.

## 2. Construction de palette (méthode, pas hasard)

Une palette = 1 base neutre + 1 accent + sémantiques. Procédé :
1. **Neutres** : 9 paliers d'une teinte (du fond au texte). Garde une légère température (jamais gris pur #888).
2. **Accent** : 1 couleur de marque. Décline en 3 (hover plus clair, actif plus sombre, focus ring).
3. **Sémantiques** : succès (vert), alerte (ambre), erreur (rouge), info (bleu) — désaturées pour s'accorder.
4. **Vérifier WCAG AA** : texte/fond ≥ 4.5:1, gros texte/UI ≥ 3:1. Toujours mesurer, jamais supposer.
5. Dark + light dérivés de la MÊME palette (inversion paliers, pas re-choix).

Anti-pattern : dégradé violet→bleu par défaut, gris plat, accent qui vibre sur le fond.

## 3. Règles UX (les 99 condensées en principes)

**Layout** — grille 8px stricte · max 5-7 items par groupe · whitespace = hiérarchie · 1 action primaire par écran.
**Typographie** — échelle modulaire (1.25) · 2 familles max · longueur de ligne 45-75 caractères · titres serif / corps sans-serif OK.
**Couleur** — 60/30/10 (neutre/secondaire/accent) · accent réservé aux actions · jamais l'info portée par la couleur seule.
**Interaction** — touch targets ≥ 44px · feedback < 100ms · état hover/active/focus/disabled pour chaque contrôle · focus ring visible.
**Mouvement** — 150-300ms · easing `cubic-bezier(.2,.8,.2,1)` · `transform`/`opacity` seulement · respecter `prefers-reduced-motion`.
**Contenu** — états vide/chargement/erreur conçus · libellés = verbes d'action · messages d'erreur = quoi + comment corriger.
**Mobile-first** — concevoir à 375px d'abord · pas de scroll horizontal non voulu · safe-area-inset iOS · font ≥ 16px sur inputs (anti-zoom iOS).
**Accessibilité** — contraste AA · aria-labels · navigation clavier · ne jamais désactiver le zoom.

## Test mental obligatoire avant livraison

> "Stripe / Linear / Apple trouveraient-ils cette interface acceptable ? Style unique respecté ? Palette WCAG AA mesurée ? Touch targets ≥ 44px ? Testé à 375px ?"

Si non à 1+ → reprendre avant de livrer.

## Références
- ui-ux-pro-max-skill : github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Apex : `assets/css/tokens.css`, `assets/css/components.css`
