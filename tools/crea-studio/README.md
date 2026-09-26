# 🎨 Créa Studio — Vidéo · Photo · Cartoon

**Une seule app** qui réunit **montage vidéo**, **retouche photo (niveau Photoshop/GIMP)** et **création de dessins animés**.
100 % dans le navigateur, **hors-ligne**, **sans compte**, **sans pub**, installable sur iPhone (PWA).

👉 **Sur ton domaine :** https://studio.kd-mc.com
👉 **Lien direct GitHub Pages :** https://9r4rxssx64-creator.github.io/CMCteams/tools/crea-studio/

Sur iPhone : ouvre le lien dans Safari → bouton **Partager** → **« Sur l'écran d'accueil »** → l'app s'installe comme une vraie appli.

---

## 🧠 Reverse-engineering : d'où vient chaque fonction

Le point de départ (photo Google) listait les logiciels pros. J'ai décortiqué **ce que chacun fait de mieux**, puis j'ai gardé la meilleure idée de chacun — plus celles des meilleures alternatives web (Photopea, Snapseed, Lightroom, VSCO, CapCut, VN, Krita, FlipaClip) — pour les fondre dans **une seule app** qui tourne sur ton téléphone.

| Logiciel pro | Sa fonction phare | Ce que Créa Studio en reprend |
|---|---|---|
| **DaVinci Resolve** | Étalonnage couleur pro | Réglages fins (expo, contraste, hautes lumières, ombres, température, teinte, HSL) |
| **Adobe Premiere Pro** | Montage timeline, découpe | Découpe précise début/fin + sous-titres |
| **Adobe After Effects** | Effets & motion design | Filtres cinéma + textes/incrustations |
| **Toon Boom Harmony** | Animation 2D image par image | Studio Cartoon complet (frames, pelure d'oignon, lecture) |
| **Blender** | Anim/3D gratuit, export vidéo | Export vidéo de l'animation (frame-par-frame) |
| **Photopea / Snapseed** | Retouche + réglages sélectifs | Recadrage, rotation, miroir, netteté, vignette, grain |
| **Lightroom / VSCO** | Presets « film » | 20 filtres pros (Ciné, N&B, Vintage, HDR, Sunset, Cyber…) |
| **CapCut / VN** | Vitesse, musique, sous-titres, filtres | Vitesse (ralenti/accéléré), musique de fond, filtres, sous-titres |
| **Krita / FlipaClip** | Dessin animé, onion skin, timeline | Pinceau/gomme/pot, palette, timeline de frames, lecture fluide |
| **Adobe Photoshop** | Détourage, calques, dessin, niveaux | **Détourage → fond transparent** (gomme magique / fond auto / gomme / restaurer), **Niveaux** (noirs/gamma/blancs), **dessin sur la photo**, **stickers/logo** (calques-lite), **redimensionner** |
| **GIMP** | Alternative libre de Photoshop | Mêmes outils avancés ci-dessus, 100 % gratuits et hors-ligne |

**Le plus (« va plus loin ») :** un effet **Cartoonize** (photo → dessin animé) qui n'existe nulle part réuni comme ça sur mobile : posterisation des couleurs + détection de contours (Sobel) + lissage. Et la passerelle **« Partir d'une image »** dans le studio Cartoon : ta photo est transformée en croquis pour dessiner par-dessus.

---

## 🎬 Ce que tu peux faire

### 🕺 Danse IA — photo → vidéo *(la tendance du moment)*
Comme **Viggle / Kling / Hailuo** : tu mets **une photo**, l'app génère une **petite vidéo où le sujet danse**, façon vidéos virales.
- **Pas de danse guidés en 1 tap** : Danse, **Floss**, **Robot**, **Moonwalk**, **Gangnam**, **Break**, Saut de joie, Coucou, Ciné (+ texte libre).
- **Choix du modèle** : ⚡ Standard (rapide) ou 💎 Qualité max.
- **🎵 Ajouter une musique** sur la vidéo générée (elle est réencodée avec ton son).
- Génération asynchrone (≈ 1 à 3 min), aperçu auto, **Enregistrer / Partager** / **Regénérer**.
- 100 % serveur (ta clé Replicate), modèles image→vidéo `minimax/video-01-live` & `video-01`.

### 🎙️ Le micro — tu **vois** ta voix pendant que tu parles
Un seul micro pour toute l'app (Mini-moi *et* Magie IA « chanter »). Avant, tu appuyais, tu parlais… et tu découvrais **après** que rien n'avait été capté.
- **Gros bouton rond** (88 px) : touche pour démarrer, touche pour arrêter.
- **Barre de niveau en direct** : elle bouge = **le micro t'entend vraiment**.
- **Minuteur** + arrêt automatique (60 s pour ton mini-moi, 45 s pour chanter).
- **▶️ Réécouter** avant de valider · **🔁 Refaire** · **✅ Utiliser cette voix**.
- L'app **prévient** quand elle ne t'entend presque pas, au lieu de te laisser fabriquer une vidéo muette.
- Le micro est **toujours relâché** en sortant — il ne reste jamais allumé en fond.

### 💳 Recharger l'IA — **n'importe qui peut le faire, en 1 tap**
Quand la cagnotte IA est vide, l'app ne bloque pas ta famille : **tout le monde peut la recharger**, sans créer de compte.
- **Bandeau doré permanent** en haut : *« ⏳ IA en pause — 2 créations en attente »* → **1 tap** ouvre l'écran de recharge, depuis n'importe quel écran.
- **Montant en 1 tap** : 5 € · 10 € · 20 € · 50 € → le bouton **💎 Payer 20 € avec Revolut** ouvre directement le paiement **avec le montant déjà rempli** (`revolut.me/kdmc/20eur`).
- **📤 Demander à quelqu'un de payer** : envoie le lien par SMS/WhatsApp — la personne paie sans avoir l'app.
- **✅ J'ai payé — prévenir** : message prêt à envoyer à Kevin.
- **🔄 Vérifier si l'IA est repartie** : relance ta création en attente pour de vrai.
- **Honnête** : il est écrit noir sur blanc que *« ton paiement arrive à Kevin, qui remet le crédit »* — on ne laisse croire à personne que le paiement recharge la machine tout seul. L'admin, lui, voit en plus le bouton **🔧 Recharger le compte IA**.
- **PayPal** n'apparaît **que** si Kevin l'a renseigné (bouton *« Ajouter mon PayPal »*) — aucun lien inventé.

### 💳 Crédit IA épuisé → on attend, on ne rend jamais un résultat raté
**Règle (Kevin, 12 août 2026) :** quand l'IA payante n'a plus de crédit et que la version sans IA serait **nettement moins belle**, l'app **ne te rend pas le résultat moche en douce**. Elle te le **dit** et **attend le crédit**.
- Concerné (repli vraiment médiocre) : **🤖 Détourage IA** (sinon bords sales), **🤖 Cartoon IA** (sinon simple posterisation), **✨ Améliorer** (sinon juste un coup de netteté), **✨ Magie IA / photo à deux** (aucune version sans IA), **💎 Bouche IA** du Mini-moi.
- Ce que tu vois : *« ⏳ Crédit IA épuisé »* + **🔄 Réessayer maintenant** · **⚡ Le faire quand même (moins beau)** *(le choix reste à toi)* · **🔗 Recharger le compte (quelques €)**.
- **Ça repart tout seul :** la création reste en attente ; dès que tu rouvres l'app (ou toutes les 5 min), elle réessaie **une** fois. Quand le crédit revient : *« ✅ Le crédit IA est revenu »* et c'est fait.
- **Si ce n'est PAS le crédit** (réseau, serveur occupé), rien ne change : la version rapide s'applique comme avant — **l'app marche toujours**.
- **Fini les messages qui mentent :** l'app ne dit plus « version rapide appliquée » quand elle n'a rien appliqué.

### 🧑‍🎤 Mini-moi — ta version numérique qui parle *(comme l'AI Avatar de CapCut)*
Reverse-engineering de la fonction **AI Avatar / avatar parlant** de CapCut, refaite pour tourner **dans ton téléphone** :
- Tu mets **une photo de ton visage** (ou tu te prends en photo).
- Tu **écris** ce qu'il doit dire → **Voix IA** le lit, **ou** tu **enregistres ta propre voix**, **ou** tu importes un fichier audio.
- L'app fabrique une **petite vidéo où toi tu parles** : la **bouche suit le volume réel de la voix**, avec un léger « vivant » (respiration, micro-balancement, zoom lent).
- **👄 La bouche FORME les sons, elle ne fait pas qu'ouvrir/fermer** : à partir de ton texte, l'app déduit les sons (a, é, i, o, ou, m/b/p, f/v…) et donne à la bouche la bonne forme — large et étirée sur un « i », ronde et petite sur un « o », fermée sur un « m ». Le volume réel de la voix règle l'ouverture. *Mesuré : bouche 2,09× plus large sur « iiii » que sur « oooo ».*
- **😉 Vivant** : cligne des yeux tout seul (~toutes les 4,5 s, en recopiant ta vraie peau du front — jamais une tache peinte), hoche la tête quand tu parles, respire, léger zoom.
- **💬 Dialogue à deux** : choisis **2 de tes mini-moi**, écris **une ligne = une réplique** (ça alterne tout seul, rien de spécial à taper) → la vidéo montre **celui qui parle**, chacun avec son ton de voix. *Mesuré : le visage bascule à 1,27 s pour une bascule attendue à 1,22 s — synchronisé avec la voix.*
- **😀 Expressions** : 😐 Neutre · 🙂 Sourire · 🧐 Sérieux · 😮 Surpris. Ce sont les **commissures** qui font l'expression (bouche dessinée en deux lèvres courbes), plus l'ouverture des paupières. *Mesuré sur la vidéo : coins de bouche relevés en sourire, tombants en sérieux, neutre entre les deux.*
- **👤 Mes mini-moi** : garde ton personnage (photo + bouche repérée + réglages) et rappelle-le en **1 tap** la fois d'après — plus besoin de tout refaire. Jusqu'à 6, ~6 Ko chacun.
- **🎚️ Ton de la voix** : Grave 🐻 / Normale / Aiguë 🐿️.
- **🌆 Vrai décor derrière toi** : l'app te **découpe** de ta photo (détourage) et met ce que tu veux derrière — **🫧 Flou portrait** (effet iPhone), **🎬 Studio** (dégradé), **🖼️ ton image**. *Mesuré : l'ancien fond disparaît à 0 %, le nouveau décor occupe 55 % de l'image.* Sans découpe possible (hors-ligne / crédit vide), le bouton **revient tout seul sur « Ma photo »** — on ne laisse jamais croire qu'un décor est actif alors qu'il ne l'est pas.
- **👁 Aperçu en direct** : la bouche bouge **tout de suite** à l'écran (bouche, clignement, décor, ambiance) — plus besoin d'attendre un rendu complet pour découvrir que c'est à refaire. Touche l'aperçu pour l'arrêter.
- **⏱️ Durée annoncée pendant que tu écris** : *« ≈ 10 s »*, et un avertissement clair si ton texte dépasse la limite de **60 s**.
- **🎬 Ambiance** : Aucune / Studio (vignette) / Doux / Ciné (bandes noires + teal-orange), avec fondu d'entrée-sortie. *(L'ambiance habille l'image ; le décor, lui, change ce qu'il y a derrière toi — ce sont deux réglages différents.)*
- **🎙️ Dicter** au lieu d'écrire (si le navigateur le permet — sinon l'app te renvoie vers le micro du clavier iPhone).
- **Formats** Story 9:16 / Carré / Paysage · **Sous-titres karaoké** (le mot dit passe en or) · **repérage auto du visage** (touche la bouche pour la replacer).
- **⚡ Rapide** = 100 % hors-ligne (aucune clé, aucun réseau). **💎 Bouche IA** = poses de bouche plus réalistes via le worker, avec **repli automatique** sur le mode hors-ligne — **l'app marche toujours**.
- Chaque mini-moi est **enregistré tout seul** dans « Mes créas » + **Enregistrer / Partager**.

### 🤖 IA (qualité pro) — nouveau
Branchée sur un **worker serveur sécurisé** (ta clé Replicate reste côté serveur, jamais exposée). Repli automatique sur la version hors-ligne si l'IA n'est pas joignable — **l'app marche toujours**.
- **🤖 Détourage IA** — isole automatiquement le sujet (personne / objet), fond transparent parfait (bien mieux que la gomme couleur).
- **🌆 Remplacement de fond** — après détourage : couleur, dégradé, flou d'origine, **ton image**, ou **🤖 Fond IA** (décris le décor → l'IA le génère et le met derrière le sujet).
- **🤖 Cartoon IA** — transforme la photo en dessin animé de qualité (vrai style, pas juste posterize).
- **✨ Améliorer (IA)** — upscale ×2 + netteté + amélioration des visages.

### 🎬 Pack créateur pro *(le plus viral 2026)*
- **🎤 Sous-titres karaoké mot-par-mot** (vidéo) — le mot dit est surligné en jaune et agrandi (style TikTok/Hormozi). Styles **Simple / Karaoké / Pop**. Le texte se répartit tout seul sur la durée.
- **🥁 Zoom automatique sur le rythme** (vidéo) — détecte les temps forts de ta musique et fait un punch-in zoom sur le beat.
- **🩹 Tampon correcteur** (photo) — touche une zone saine (source) puis dessine sur le défaut : enlève un bouton, un objet, une tache.
- **😂 Texte meme** (photo) — style Impact blanc contour noir, haut/bas, en 1 tap.

### 🔥 Effets viraux & formats réseaux *(tendances 2026)*
D'après le tour du web des tendances TikTok / Reels / CapCut, ajoutés en qualité max :
- **🔥 Effets Tendance (photo)** : Ciné (teal & orange), **Flou d'arrière-plan** (bokeh portrait), Glow, Light leak, **Duotone**, **Glitch / RGB split**, **VHS / Y2K**, Chroma, Polaroïd — avec **intensité réglable**.
- **📱 Formats réseaux** (photo **et** vidéo) : **9:16** (TikTok/Reels/Shorts), **1:1**, **4:5**, **16:9**, avec **fond flou** tendance (plus de bandes noires), noir ou blanc.
- **🔥 Pack Viral vidéo** : **format vertical 9:16**, **ambiance Grain / VHS / Light leak**, **fondu entrée/sortie**, **sous-titre stylé** (gros, contour épais, style viral).

### 📸 Studio Photo *(niveau Photoshop / GIMP)*
- **Réglages** : exposition, contraste, saturation, vibrance, température, teinte, hautes lumières, ombres, **Niveaux (noirs / gamma / blancs)**, couleur (°), netteté, vignette, grain.
- **20 filtres** en 1 tap : Éclat, Ciné, N&B, Sépia, Chaud/Froid, Vintage, HDR, Pop, Noir, Sunset, Menthe, Drama, Insta, Pastel, Or, Cyber…
- **✂️ Cadrer + Redimensionner** : recadrage libre / 1:1 / 4:3 / 16:9, rotation ±90°, miroir, taille en pixels (720/1080/1920/Max).
- **🪄 Détourer** *(le gros ajout Photoshop/GIMP)* : **rends le fond transparent** — gomme magique (touche une couleur), fond auto (efface le contour), gomme et restaurer au doigt. → **export PNG transparent**.
- **🖌️ Dessin** : pinceau / feutre / gomme directement sur la photo (couleur + taille).
- **😀 Stickers** : bibliothèque d'emojis + **import de logo/image** ; déplaçables, taille réglable (calques-lite).
- **🖍️ Cartoon** : transforme la photo en dessin animé (contours + aplats), réglable.
- **🅣 Texte** : couleur + taille, glisse-le où tu veux.
- **Export** : PNG **transparent** (si détouré) ou JPG haute qualité. Partage direct (Instagram, Messages…).

### 🎬 Studio Vidéo
- **Découpe** : choisis le début et la fin de l'extrait.
- **Filtres** cinéma en temps réel.
- **Vitesse** : ralenti / accéléré (0,25× à 3×).
- **Sous-titre** affiché sur la vidéo (couleur au choix).
- **Musique** de fond (remplace le son à l'export, volume réglable).
- **Export** vidéo (MP4 sur iPhone) — partage direct.

### ✏️ Studio Cartoon / Animation
- **Dessin** image par image (pinceau, gomme, pot de peinture, annuler).
- **Pelure d'oignon** : tu vois l'image précédente en transparence pour bien animer.
- **Timeline** de frames + bouton ＋ pour ajouter une image.
- **Lecture** fluide à vitesse réglable (2 à 24 img/s).
- **Export** : image PNG, ou **animation en vidéo**.
- **Partir d'une image** : importe une photo (transformée en croquis) et anime par-dessus.

---

## 🔒 Confidentialité & technique

- **Retouche / montage / dessin : tout se passe sur ton téléphone.** Rien n'est envoyé sur Internet, aucun compte, aucune pub, marche hors-ligne.
- **Fonctions IA uniquement** (🤖 Détourage / Cartoon / Améliorer, 🕺 Danse IA) : la photo est envoyée à **ton worker sécurisé** puis à Replicate le temps du traitement (nécessaire — l'IA ne tourne pas sur le téléphone). Ta clé reste côté serveur. Si tu ne cliques pas ces boutons, rien ne part.
- **Aucune dépendance externe** dans l'app : un seul fichier HTML autonome (respecte la règle d'isolation max — ne touche aucune autre app).

### Sous le capot (pour info)
- Moteur image : pipeline pixel Canvas 2D (aperçu WYSIWYG + export plein résolution).
- Cartoonize : lissage (box blur) → posterisation → contours Sobel → composition.
- Animation : Canvas + Pointer Events + pelure d'oignon + flood-fill (pot de peinture).
- Export vidéo : `canvas.captureStream` + `MediaRecorder` (MP4/H.264 priorisé sur iOS, WebM en repli) + audio via WebAudio. Détection des capacités au lancement, repli propre si l'export vidéo n'est pas supporté (message → enregistrement d'écran).

### Limites honnêtes (iOS)
- L'export vidéo enregistre **en temps réel** : reste sur l'écran pendant le rendu.
- Si un très vieil iPhone ne supporte pas `MediaRecorder`, l'app te propose l'enregistrement d'écran (même résultat).
- Pistes d'évolution : export via **WebCodecs + mp4-muxer** (iOS 26+) pour un rendu hors temps réel plus rapide et net ; détourage IA du fond (MediaPipe) ; LUTs 3D importables.

---

## 🌐 Intégré à ton domaine

L'app est branchée sur **`studio.kd-mc.com`** (sous-domaine auto-provisionné : DNS + certificat SSL automatiques via le routeur Cloudflare `kdmc-router`, **zéro action manuelle**). Elle apparaît aussi dans le **Portail kd-mc.com** (tuile 🎬 Créa Studio). Le test anti-dérive `apps-consistency` garantit la cohérence (apps.json ⇔ routeur ⇔ wrangler ⇔ portail ⇔ admin).

## ✅ Vérifié (tests navigateur réels, viewport iPhone)

- **v1** : chargement photo, filtres, sliders, cartoonize, bascule des 3 studios, dessin (encre détectée), timeline de frames, feuille d'export — **0 erreur JS**.
- **v2** : Niveaux, **détourage → transparence confirmée**, dessin, stickers, redimensionnement, **export PNG transparent détecté** — **0 erreur JS**.
- **v3** : effets tendance (glitch/ciné/bokeh changent bien l'image), **export vidéo viral 9:16 + grain + fondu → MP4 produit** — **0 erreur JS**.
- **v4** : **texte meme** (encre rendue), **tampon correcteur** (clone), **export vidéo karaoké + zoom sur le beat + 9:16 + musique → MP4** — **0 erreur JS**.
- **v5** : **IA** — succès (image remplacée) + **repli automatique** vérifiés (worker simulé), overlay de chargement OK — **0 exception JS**.
- **v6** : **Danse IA** — photo → génération async → vidéo affichée + feuille d'export, vérifié bout-en-bout (backend simulé) — **0 exception JS**.
- **v7** : **danses guidées + choix du modèle + musique** sur la vidéo + **remplacement de fond (couleur/dégradé/flou/image/IA)** — vérifiés (backend simulé) — **0 exception JS**.
- **v8** : IA déplacée sur **crea-ai.kd-mc.com** (custom_domain, corrige l'« IA indisponible » liée à workers.dev) + **modèle de secours** détourage + **auto-test CI** des vrais modèles.
- Cohérence domaine : `apps-consistency` **7/7**.

Captures d'écran de preuve générées à chaque test.

## 🤖 Comment marche l'IA (technique)
- Worker Cloudflare **`kdmc-crea-ai`** servi sur **`https://crea-ai.kd-mc.com`** (custom_domain = DNS+SSL auto sur ta zone, plus fiable que workers.dev) — relaie vers **Replicate** — ta clé `AX_REPLICATE_KEY` est injectée en secret serveur par `deploy-kdmc-crea-ai.yml`, **jamais côté client**.
- Modèles : détourage `cjwbw/rembg`, cartoon `catacolabs/cartoonify`, upscale `nightmareai/real-esrgan`, photo→vidéo `minimax/video-01-live` & `video-01`, **fond IA `black-forest-labs/flux-schnell`** (résolus à leur dernière version au runtime — faciles à changer).
- Endpoints : images `POST /cutout|/cartoon|/enhance` ; fond IA `POST /bg` ; vidéo `POST /animate` (choix `model`) → `GET /job?id=` (async) → `GET /proxy?url=` (enregistrement même-origine).
- CORS limité à `*.kd-mc.com` + GitHub Pages + localhost. `/proxy` n'accepte que `replicate.delivery`.
- **Repli automatique** (images) : réseau/IA KO → version hors-ligne + toast honnête. **Danse IA** ne peut pas se faire hors-ligne (génération) → message clair si indispo.
- URL du worker configurable côté app (`window.CREA_AI_URL` / `localStorage.crea_ai_url`) pour pointer une autre IA sans changer le code.

## 🔭 Prochaines étapes possibles
Déjà livré : IA (détourage/cartoon/upscale), karaoké, zoom-beat, tampon correcteur, meme, effets tendance, formats réseaux. À venir si tu veux : **remplacement de fond IA** (mettre un décor), **speed-ramp**, **export GIF**, **calques complets multi-photos**, **cartoon IA sur vidéo**.

*Version 6.0.0 — Studio créatif tout-en-un + pack viral + créateur pro + IA serveur + Danse IA (photo→vidéo), pour kd-mc.com (studio.kd-mc.com).*

## ✨ Magie IA (v8.2.0) — reverse-engineering des apps virales

Sources étudiées (captures Kevin 2026-08-04) : **AI Mirror** (figurine/anime/action figure),
**ToonApp** (photo → danse TikTok), **AI Catch** (scènes impossibles : anniversaire avec un lion),
**Donna IA Musique** (photo + voix → clip musical, chanson rap/pop), **AI Music** (te voir chanter un titre).

**Ce qui a été reproduit — et comment (100 % gratuit)**

| Fonction | Équivalent app | Chez nous |
|---|---|---|
| 🧸 Figurine / 📦 en boîte | AI Mirror | Gemini 2.5 Flash Image (édition d'image, free tier) |
| 🌸 Anime · 🎬 Toon 3D | AI Mirror / ToonApp | idem |
| ✨ Clip néon (glow-up) | Donna | idem |
| 🦁 Anniv. lion · 🚀 Espace · 🌟 Tapis rouge | AI Catch | idem |
| 🦸 Super-héros · 📼 Vintage · 👶 enfant · 👴 +50 ans | AI Mirror | idem |
| 🪄 Transformation libre | toutes | prompt utilisateur + garde « garder le même visage » |
| 🎤 Je chante (lip-sync) | AI Music | 3 poses de bouche générées par l'IA + **synchro sur le volume réel du son** (Web Audio RMS), montage dans le téléphone |
| 🎵 Chanson IA | Donna | paroles écrites par Gemini (6 styles) + **instru jouée par le téléphone** (WebAudio, gamme pentatonique = toujours juste) |
| 💃 Danse | ToonApp | poses de danse IA + montage aller-retour rythmé (onglet Danse IA) |

**Honnêteté** : la musique n'est pas un modèle type Suno (payant) — l'instru est synthétisée
localement et les paroles viennent de l'IA ; on chante par-dessus, puis « Je chante » anime la photo.
Aucune de ces fonctions ne consomme de crédit payant.

**Preuves mesurées** (navigateur réel, iPhone 390 px) : 12/12 vérifications vertes, 0 erreur JS —
les 12 styles envoient le bon preset, la vidéo chantée dure exactement la longueur du son (2,996 s
pour un fichier de 3 s), paroles + instru OK, aucun débordement horizontal.
