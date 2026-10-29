# Studio Avatars — marionnettes et personnages animés (Créa Studio v9.22.0, 29.10.2026)

> Demande de Kevin : créer des marionnettes / avatars / personnages animés, avec des looks et des filtres, à partir d'une photo, d'une vidéo ou d'une vidéo « tour de la personne » ; qui reproduisent la personne à l'identique OU qui sont des personnages (animaux, dessins) ; avec une voix, et plus tard la voix clonée (autre branche). 100 % gratuit.

## Ce que ça fait
- **Me copier** : une photo (ou une vidéo, ou un tour de la personne en vidéo) → la VRAIE photo est déformée sur un maillage de 478 points de visage (MediaPipe) : bouche, mâchoire, paupières, sourcils, regard, tête. Identité conservée (mesuré : écart 0,36/255 au repos).
- **Personnage** : 8 personnages vectoriels (panda, lion, âne, abeille…) qui reçoivent les MÊMES 15 réglages d'expression.
- **Un animal ou un dessin** : 3 touchés (œil gauche, œil droit, bouche) posent le rig à la main sur n'importe quelle image.
- **Looks** : filtres (cinéma, noir et blanc, chaud, froid, pastel) + looks IA via le service `crea-ai` `/cartoon` avec `avatar:true` (toon3d, anime, feutre, peluche, lego, clay, bd, sticker) ; le visage est re-détecté sur l'image stylisée (accepté si l'écart moyen < 0,14 × distance des yeux, sinon on garde les points de la photo).
- **Vie** : texte (voix du service), micro, fichier son, ou caméra « je te copie en direct » ; humeurs (8), clignements, balancement.
- **Sortie** : vidéo mp4/webm avec le son (9:16, 1:1, 16:9), partage, « Garder » (IndexedDB `crea_avatars`), export du paquet.

## Fichiers
| Fichier | Rôle |
|---|---|
| `avatar-core.js` | Pur (UMD, testé sous Node) : réglages, rig, déformation, analyse de voix, hauteur de voix, paquet |
| `avatar-rendu.js` | Rendu WebGL (repli Canvas2D), bouche/dents/paupières, lunettes |
| `avatar-persos.js` | 8 personnages vectoriels, teintes, accessoires |
| `avatar-studio.js` | Interface `window.Avatar` : import, looks, lecture, enregistrement, caméra, mémoire |

## Intégrer dans une autre app
Charger `avatar-core.js` + `avatar-rendu.js` (+ `avatar-persos.js` pour les animaux). `AvatarRendu.creer(canvas)` puis `charger(vues)` et `dessiner(P)` où `P` = les 15 réglages (`AvatarCore.PARAMS`, valeurs assainies par `AvatarCore.assainir`). Un paquet (`AvatarCore.empaqueter`) se relit avec `validerPaquet` (refuse SVG et formats inconnus).

## Brancher la voix clonée (autre branche)
Contrat unique : `Avatar.Voix.ajouter({ id, nom, emoji, fabriquer(texte) → Promise<Blob audio> })`. La voix apparaît dans la liste, le suivi des lèvres se fait tout seul sur le son rendu, la hauteur par personnage (`HAUTEURS`) s'applique en gardant la durée. Voix par défaut : `crea-ai /voice` (MeloTTS, gratuit).

## Consentement
Une personne réelle n'est copiée qu'avec son accord. Les paquets restent sur l'appareil (IndexedDB) ; rien n'est envoyé au service IA sauf l'image pour un look IA.

## Gardes (tout est dans `test:ci` sauf le navigateur)
- `npm run test:crea-avatars` : 77 contrôles Node sur de vrais points de visage (fixtures fictives `tests/fixtures/avatars/`) + 7 sabotages rouges.
- `npm run verif:crea-avatars` (Chromium + vrai MediaPipe, 28 contrôles, 6 sabotages) ; `avatars-plateformes.yml` (public : Chromium, WebKit, Firefox).
- `verif-live-avatars.yml` (public, admin en lecture) + `test:verif-live-avatars-robot(-sabotage)`.
- `test:studio-plateformes` (10 studios), `test:crea-cartoon-styles` (K3 : `avatar:true`).
