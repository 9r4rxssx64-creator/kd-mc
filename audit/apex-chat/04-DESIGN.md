# Apex Chat — 04 · Design, mesuré (pas au feeling)

**Date** : 2026-09-10 · **Version** : `v1.1.288`
Chaque affirmation ci-dessous vient d'un `grep` sur `index.html`. Quand une valeur me gêne,
je la donne quand même — c'est l'intérêt de mesurer plutôt que d'apprécier.

---

## 1. Système de jetons — 20 variables CSS ✅ VÉRIFIÉ

```
--ax-bg  --ax-bg-2  --ax-bg-3          (3 fonds)
--ax-text  --ax-text-2  --ax-text-3    (3 niveaux de texte)
--ax-border  --ax-border-2             (2 bordures)
--ax-gold  --ax-gold-2  --ax-blue      (accents)
--ax-ok  --ax-warn  --ax-err           (états sémantiques)
--ax-radius-sm  --ax-radius  --ax-radius-lg   (3 rayons)
--ax-shadow
--ax-safe-top  --ax-safe-bottom        (encoche iPhone)
```

**Ce qui est bon** : la palette est **sémantique**, pas décorative — `--ax-err` et non
`--ax-rouge`. Trois niveaux de texte et trois de fond suffisent à construire une hiérarchie
sans inventer une couleur à chaque écran. Les rayons sont sur une échelle à 3 crans.

**Ce qui l'est moins, mesuré** : **62 couleurs hexadécimales en dur** cohabitent avec ces
20 variables. Ce n'est pas dramatique (beaucoup sont des dégradés ponctuels et des couleurs
d'avatar générées), mais c'est le début d'une dérive : le jour où le thème change, ces 62-là
ne suivront pas. **P3 — à surveiller, pas à corriger en urgence.**

## 2. Thème clair / sombre ✅ VÉRIFIÉ

`@media (prefers-color-scheme:light)` est présent : l'app **suit le réglage du téléphone**.
Le sombre est le défaut. C'est le bon sens par défaut pour une messagerie qu'on ouvre le soir.

## 3. Mobile d'abord — l'app est faite pour un iPhone ✅ VÉRIFIÉ

| Mesure | Valeur | Verdict |
|---|---|---|
| Points de rupture | `max-width:360px`, `max-width:380px`, `min-width:768px`, `min-width:1024px` | ✅ le plus petit est traité **en premier**, pas en rattrapage |
| Encoche / barre d'accueil iOS | **3** usages de `safe-area-inset` + 2 variables dédiées | ✅ |
| Cibles tactiles ≥ 44 px | **9** déclarations explicites (4× `min-height:44px`, 3× `48px`, 2× `min-width:44px`) | 🟡 explicite là où ça compte, implicite ailleurs (padding) |
| Taille de police < 14 px | **1 seule** occurrence (`11px`) | ✅ (14 px est le seuil sous lequel iOS zoome tout seul dans un champ) |
| Impression | `@media print` présent | ✅ détail rare, bon signe |

**Kevin travaille sur iPhone.** Les quatre points de rupture, l'encoche traitée et l'unique
police sous 14 px disent que c'est réellement le cas — ce n'est pas une app de bureau rétrécie.

## 4. Mouvement ✅ VÉRIFIÉ

- **6 animations** (`@keyframes`) — nombre sobre.
- `@media (prefers-reduced-motion:reduce)` présent, avec `transition:none` : quelqu'un de
  sensible au mouvement (ou en mal des transports) coupe tout depuis les réglages iOS. ✅
- Les transitions portent sur `transform`, `opacity`, `background`, `border-color` — soit ce
  que le processeur graphique sait animer sans faire ramer la page. **Aucune** transition sur
  `top`/`left`/`width`, qui forcent un recalcul de mise en page à chaque image. ✅
- Durées : `.1s` à `.16s`. Court, donc l'interface répond au doigt au lieu de « jouer une
  animation ». La courbe `cubic-bezier(.2,.8,.3,1)` sur `transform` est un ressort doux —
  choix délibéré, pas un `ease` par défaut.

**Un point à nuancer honnêtement** : quelques `transition:all .15s` traînent. `all` anime
*tout*, y compris des propriétés coûteuses qu'on n'avait pas prévu d'animer. C'est le raccourci
qui finit par coûter des saccades. **P3.**

## 5. Accessibilité ✅ VÉRIFIÉ

| Mesure | Valeur |
|---|---|
| `aria-label` | **67** |
| `aria-modal` | 4 |
| `aria-labelledby` | 3 |
| `aria-current` | 2 |
| `aria-live` + `aria-atomic` | 1 + 1 |
| `role="…"` | 9 |

67 libellés accessibles, c'est bien au-delà du décoratif — les boutons à icône seule ont un nom
lisible par VoiceOver. Les modales déclarent `aria-modal`, donc le lecteur d'écran ne s'échappe
pas derrière. **Un seul `aria-live`** en revanche : dans une messagerie, l'arrivée d'un message
mériterait probablement d'être annoncée. **P3, à vérifier avec un vrai VoiceOver — ce que je
n'ai pas pu faire.**

## 6. Dette de style — le chiffre qui pique 🟡

**1 428 attributs `style="…"` en ligne** dans `index.html`.

Il faut le dire sans le dramatiser. Dans un fichier unique de 16 293 lignes sans étape de
build, le style en ligne est en partie **un choix d'architecture** : pas de feuille externe à
charger, pas de classe à inventer pour un cas unique. Mais 1 428, c'est le point où :

- une couleur change → il faut la chercher à 1 428 endroits ;
- deux boutons « identiques » divergent sans que personne le voie ;
- la CSP ne peut pas interdire `unsafe-inline` sur les styles.

**Ce n'est pas un bug**, l'app fonctionne. C'est une **dette chiffrée**, et c'est exactement ce
qu'un audit doit produire : un nombre, pas une impression. **P2 — à figer par un cliquet**
(compter l'existant, échouer seulement si ça augmente), pas à refactorer d'un bloc.

## 7. Ce que je n'ai **pas** mesuré 🔴

- **Le contraste réel** des couples texte/fond. Il faudrait calculer le rapport WCAG de chaque
  paire ; je ne l'ai pas fait, donc je ne prétends pas que l'app est conforme AA.
- **La fluidité réelle** (images par seconde, scintillement, décalage de mise en page). Ça se
  mesure dans un vrai navigateur avec un `MutationObserver` au repos — la passe de stabilité
  exigée par le protocole. Elle n'a pas tourné ici (egress refusé).
- **Le rendu sur un vrai iPhone.** Tout ce qui précède est de la lecture de source. Les
  captures d'écran de `apex-chat-e2e.yml` sont le seul moyen honnête de voir la page.

---

## Verdict

Le design d'Apex Chat est **cohérent et pensé pour le mobile** : jetons sémantiques, thème
suivant le système, encoche traitée, mouvement réductible, 67 libellés accessibles. Ce ne sont
pas des cases cochées après coup, c'est visible dans la structure.

Les deux points à surveiller sont des **dettes mesurées, pas des défauts** : 1 428 styles en
ligne et 62 couleurs hors palette. Aucun ne casse quoi que ce soit aujourd'hui ; les deux
rendront le prochain changement de thème plus cher qu'il ne devrait.


---

## Mesures UX du 2026-09-17 (Chromium 375×812, session simulée) et correctifs

| Point | Avant (mesuré) | Après |
|---|---|---|
| Nom du contact dans l'en-tête de conversation | **14 px** de large à 375 (6 boutons de 44 px) | ≥ 96 px (🔎 et 📹 dans ⋯ sous 420 px) |
| Heure sur bulle envoyée | gris sur or **1,86:1**, 8,6 px | `rgba(8,8,15,.72)`, 0,72 em |
| Toasts | jusqu'à 194 empilés, cliquables, sur l'en-tête | 3 max, dédoublonnés, non cliquables, sous l'en-tête |
| ✕ des modales | dessiné sur le bouton « Inviter » du topbar (`.modal` non positionnée) | dans la modale |
| Pastille « ← KDMC » | z-index 1200 au-dessus des modales | 150 |
| Geste retour iOS | quittait l'app (0 `pushState`) | ferme la modale, puis la conversation |
| Écran code SMS | ni renvoi, ni délai, ni aide | « Renvoyer (60 s) », « valable 5 min », lien aide |
| Erreur réseau au login | « Failed to fetch » | « Réseau indisponible — vérifie le Wi-Fi ou la 4G » |
| Reste (P2/P3) | rail d'outils 40 px (10 boutons), réglages 41 lignes plates, 41 `div[onclick]` sans `role`, focus non piégé, polices 9,6 px (bnav) | consigné, non corrigé |
