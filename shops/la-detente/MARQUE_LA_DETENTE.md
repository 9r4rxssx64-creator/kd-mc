# 🎯 LA DÉTENTE — Cadrage marque & architecture (avant de coder la suite)

> Marque textile perso de Kevin, **gratuite à lancer**, motif **AR15 + cœur rouge** (thème de lancement,
> PAS une limite : n'importe quel logo/image/texte/montage), **ventes entre amis** avec ses moyens de
> paiement, **sous-traitance qualité/prix** (print-on-demand sans stock). Esprit « entre amis ».

## La vision complète (synthèse de tout ce que Kevin a demandé)
« Je crée mes logos → je les **monte / superpose** (plusieurs images + textes ensemble) → je les **place
où je veux** sur **les textiles que je choisis** → **le reste est automatique** : fournisseur, clients,
commandes. Gratuit, meilleur qualité/prix, ventes entre amis avec mes paiements. »

## Les 4 briques
1. **STUDIO** — création + montage multi-calques + placement libre + export
2. **BOUTIQUE** — catalogue + panier + paiement (« La Détente », déjà rebrandée ✓)
3. **COMMANDES & CLIENTS** — capture, dashboard, suivi
4. **FOURNISSEUR (POD)** — fabrication/expédition sous-traitée

## Ce qui EXISTE déjà (à réutiliser, pas à refaire)
- Boutique `shops/la-detente/` rebrandée (thème noir/rouge, 34 produits, mockups SVG) ✓
- Capture commandes → `_shared/firebase-orders.js` → Firebase `shops_admin_v1/orders/<shop>/<id>`
  (⚠️ **méta seulement, aucune donnée perso** : pas d'adresse ni email aujourd'hui)
- Dashboard admin cloud `shops/dashboard/` qui lit `shops_admin_v1`
- Paiement **manuel** : `paypal.me/kdmc`, `revolut.me/kdmc`, IBAN
- Emails (EmailJS) : confirmation commande + notif

## ⚠️ La vérité honnête sur « le reste se fait automatiquement »
Pour qu'une commande parte **seule** chez le fournisseur, il manque aujourd'hui 3 choses :
1. **L'ADRESSE du client** — le checkout ne la demande pas (choix de confidentialité actuel). Obligatoire
   pour expédier. → à ajouter (stockée en privé/chiffré).
2. **Le FICHIER D'IMPRESSION par produit** (le design HD transparent) + le vêtement/SKU + l'emplacement
   (poitrine/dos/manche). → produit par le Studio, attaché au produit.
3. **Un PONT vers le fournisseur**, 2 niveaux :
   - **Manuel-assisté (GRATUIT, 0 clé)** : chaque commande génère un **bon de production prérempli**
     (produit, taille, emplacement, fichier d'impression, adresse) → tu soumets chez le POD en 1 clic.
   - **Full-API (AVANCÉ)** : Cloudflare Worker + **clé API Printful/Printify** → la commande payée part
     **toute seule**, suivi auto. Nécessite 1 compte POD + 1 clé collée (1 action).

**Paiement entre amis** : reste **manuel** (PayPal/Revolut) tant qu'on n'ajoute pas Stripe (= compte pro,
plus « entre amis »). Donc ton **seul geste récurrent incontournable = confirmer le paiement reçu** de
l'ami. Tu avances le coût de prod (≈ remboursé par son paiement).

➡️ Le plus proche réaliste de « automatique » en **gratuit + entre amis** :
`ami commande → te paie (PayPal/Revolut) → tu confirmes le paiement → la prod part (auto via clé API,
ou 1 clic) → livré direct chez l'ami`.

## Phasage proposé
- **Phase 1 — FONDATIONS (gratuit, maintenant)** : finir la boutique (corriger 1 bug vProducts, lien
  Studio) + **STUDIO** (créer/upload logos+images+textes, montage/superposition, choisir vêtement+couleur
  +emplacement, prévisualiser, exporter mockup PNG + fichier impression HD transparent, « Ajouter à la
  boutique ») + catalogue éditable.
- **Phase 2 — COMMANDES & CLIENTS (gratuit)** : checkout + **adresse** (privé) + **taille** ; dashboard
  commandes « La Détente » (clients, statut payé/en prod/expédié, **bon de production téléchargeable**).
- **Phase 3 — FOURNISSEUR (1 clé)** : choix fournisseur + bon manuel-assisté (gratuit) OU Worker+API (auto).

## ✅ Actions KEVIN par PRIORITÉ (pour plus tard — 1 clic chacune, gratuites)
1. **▶️ Créer 1 compte fournisseur POD gratuit** (choisir) :
   - [Gelato](https://www.gelato.com/) (livraison EU rapide) · [Printify](https://printify.com/) (marge max)
   - [Printful](https://www.printful.com/) (qualité) · [T-Pop](https://www.tpop.com/) (FR/éco, packaging à ton nom)
2. **💳 Confirmer/personnaliser tes moyens de paiement** dans la boutique (sinon ça pointe sur `kdmc`) :
   ton `paypal.me/…`, ton `revolut.me/…`, ton IBAN.
3. **🔀 Fusionner la branche** `claude/textile-shop-ar15-heart-mMJ0j` → `main` (via PR) pour mettre en
   ligne « La Détente » sur GitHub Pages.
4. *(Phase 3, si full-auto)* **🔑 Coller la clé API du fournisseur** choisi (1 fois) pour l'envoi
   automatique des commandes.
5. *(Optionnel)* Valider/ajuster le **motif** AR15+cœur (couleurs, formes) — on itère le SVG.

## ✅ DÉCISIONS VERROUILLÉES (2026-06-03)
1. **Studio = réservé à l'admin (Kevin)**. Pas de personnalisation client en ligne pour l'instant.
2. **Fournisseur = Phase 3 / plus tard** (0 clé, 0 API maintenant). Cible probable **T-Pop** (FR/éco) — à
   confirmer. On prépare TOUT pour brancher facilement après (bon de production + fichiers d'impression).
3. **On construit Studio + Commandes/adresse EN MÊME TEMPS** (Phase 1 + Phase 2).
4. **Standard qualité = PRO / COMMERCIAL / EXPERT** (niveau Stripe/Linear/Apple — cf. CLAUDE.md UX) :
   design soigné, mobile-first 375px, touch ≥44px, animations 60fps, 0 doublon, contraste AA, rien
   d'amateur. Texte FR clair. Tout testé (screenshots + node --check) avant push.

## 🎨 SPÉC STUDIO (admin) — `shops/la-detente/studio.html`
Atelier de création + **montage multi-calques** :
- **Plan de travail** : vêtement choisi (tee/hoodie/polo/cap/tote/bandana) + couleur + **zone d'impression**
  (poitrine/dos/manche/avant casquette) avec gabarit visuel.
- **Calques (montage/superposition)** : ajouter **plusieurs** éléments empilés —
  (a) **image uploadée** (drag&drop / fichier, PNG/JPG/SVG), (b) **texte** (police, taille, couleur,
  contour, courbe), (c) **emblèmes marque** (AR15+cœur, cœur, thèmes tir/précision/chasse/ball-trap).
- **Manipulation** par calque : déplacer, redimensionner, pivoter, opacité, ordre (z-index), dupliquer,
  supprimer, aligner/centrer. Sélection au clic, poignées.
- **Export** : (1) **mockup PNG** (vêtement + design, pour la boutique), (2) **fichier d'impression PNG
  transparent HD** (design seul, haute résolution, pour le fournisseur POD).
- **Projets** : sauvegarder/charger (localStorage `ld_studio_projects`), dupliquer.
- **« Ajouter à la boutique »** : crée un produit (nom, prix, catégorie, vêtement, emplacement, mockup =
  img, **printFile** = fichier d'impression) → persisté dans `ld_custom_products` (fusionné au catalogue
  `P` au boot de la boutique). Le produit porte les infos nécessaires au **bon de production**.
- Accès admin only (PIN simple `ld_admin` ou garde localStorage), discret depuis la boutique.
- Techno : Canvas HTML5 (ou SVG+DOM) vanilla, **0 dépendance**, offline, mobile-friendly.

## 🧾 SPÉC CHECKOUT / COMMANDES (Phase 2)
- Avant paiement : **formulaire client** = prénom+nom, email, **adresse complète** (rue, CP, ville, pays),
  **taille** par article (S→XXL). Validation simple.
- Stockage commande **complète** (avec adresse + tailles + réf design/printFile) en **privé** :
  localStorage `kdmc_orders_<shop>` + Firebase **chemin privé** distinct de la méta publique (ex
  `shops_admin_v1/orders_private/<shop>/<id>` — à protéger par règles). La remontée publique
  `kdmcPushOrder` reste **sans PII**.
- **Bon de production** (par commande) : vue/téléchargement récapitulant produit + taille + emplacement +
  **fichier d'impression** + adresse → prêt à copier chez T-Pop (Phase 3). 
- Réutiliser `shops/dashboard/` pour le suivi ; ajouter au besoin une vue admin commandes dans la boutique
  (statut : payé / en prod / expédié) + bouton « bon de production ».
- Paiement inchangé (PayPal/Revolut/IBAN, manuel). Geste récurrent = confirmer paiement reçu.

## 🐞 BUG CONNU À CORRIGER (Phase 1)
- `sv('products')` a levé une erreur (index.html ~l.211/`sv`→`dc`→`vProducts`) lors d'un appel direct en
  test headless. La home rend OK (cartes visibles). À investiguer/corriger + re-tester par vraie
  navigation (clic) avant push.
- Polish : boutons rouges avec `color:#000` → passer en **blanc** (`#fff`) pour rendu pro.

## 📌 ÉTAT (2026-06-03) — Phase 1 + Phase 2 FAITES + vraies images
- ✅ **v1.11.0 — Refonte visuels « premium » (Kevin : « ça fait cheap »)** : vêtements SVG
  réalistes (dégradés tissu lumière/ombre, col côtelé, plis, capuche/poche hoodie, col+boutons polo,
  ombre de contact, fond **studio** neutre) au lieu des aplats. **Toutes les images régénérées**
  (64 produits + 7 catégories + 4 packs + 6 lifestyle) en HD. Sprite synchronisé sur boutique +
  bibliothèque + studio. Cache `v1.11.0`.
  ⚠ **IA images Gemini** : clé du MCP invalide + aucune clé dans l'env → pour de vraies **photos IA**
  il faut une **clé Gemini valide** (https://aistudio.google.com/apikey) ; le réseau Google est joignable
  d'ici (HTTP 403 = clé manquante seulement), donc une clé collée → génération directe possible (curl).
- ✅ **v1.10.0 — Packs thématiques + Photos lifestyle** : **4 packs** (Chasse, Tir & Ball-Trap,
  Entre Amis, Hiver) en catégorie « 🎁 Packs », prix de lot **−15 %**, fiche « Contenu du pack »
  (pièces incluses + économie), visuels composites. **6 scènes lifestyle éditoriales** rendues
  (vêtement + ambiance + props + signature) dans le **Lookbook**, cliquables vers la sélection.
  *(IA images Gemini indisponible — clé API invalide — donc scènes rendues déterministes, fidèles à la marque.)*
  Cache `v1.10.0`.
- ✅ **v1.9.0 — social proof + client (options 1 & 3)** : **avis clients** sur fiche produit
  (affichage + formulaire étoiles/texte, stockés localement) · **récemment vus** (home + fiche) ·
  **stock/urgence** (« 🔥 Plus que X en stock ») · **lot −10 % dès 3 articles** (auto, affiché panier) ·
  **Mes commandes & suivi** (page + recherche par n° KDMC, statuts) · **Lookbook** (galerie éditoriale).
  Liens footer (📸 Lookbook / 📦 Mes commandes / ❤️ Favoris) + bouton « Suivre ma commande » sur la
  confirmation. Cache `v1.9.0`. (Carte cadeau volontairement écartée : logistique/argent réel, hors « entre amis ».)
- ✅ **Upgrade « boutique pro »** (cache `v1.8.0`, inspiré des meilleures boutiques merch/POD) :
  **bandeau promo** dismissible · **livraison offerte dès 60 €** + **barre de progression** dans le panier
  (sinon 4,90 €) · **fiche produit** = sélecteur de **taille** + **quantité** + **📏 guide des tailles** (modal)
  + bloc **réassurance** (livraison/retours/paiement/bio) · **favoris** (cœur sur cartes + ❤ header + page
  « Mes favoris ») · badges **Nouveau** / **★ Top** sur les cartes · **filtre par couleur** sur la liste produits.
- ✅ **Bibliothèque de designs** (`bibliotheque.html`, cache `v1.7.0`) : page galerie des **18 motifs**
  (signature + 12 maison + variantes), prévisualisation sur n'importe quel vêtement/couleur, recherche +
  filtres par catégorie, **téléchargement PNG HD + SVG vectoriel**, et bouton **« 🎨 Studio »** par motif
  (deep‑link `studio.html?motif=ID`). Liée depuis la boutique (header 📚 + footer) et le Studio.
  Le **Studio** embarque désormais les **18 motifs** dans sa galerie (avant : 6).
- ✅ **12 designs maison** (cache `v1.6.0`) dans le style marque (motif blanc + cœur rouge), ajoutés au
  sprite SVG → **60 produits** au total en **vraies images PNG**. Motifs :
  🦌 Cerf · ✕ Cartouches · 🌿 Bois de cerf · 🎯 Plateau · 🪶 Plume · 🦆 Canard ·
  🐾 Empreinte · 🌲 Sapin · ➹ Flèches · ⛰ Montagne · 🎯 **Badge « Vise Juste »** · ❤ **Badge « Entre Amis »**.
- ✅ **Vraies images boutique** (Kevin 2026-06-03 « vraies images avec les logos créés, catégories avec
  vraies images ») : les 34 mockups catalogue rendus en **fichiers PNG réels** (`img/products/ld*.png`,
  fond dégradé noir/rouge + ombre, vrai emblème LA DÉTENTE) ; **grille Catégories** sur la home avec
  6 **vraies images** (`img/cat/*.png`) cliquables → filtre. `pimg()` gère les chemins fichiers.
  Les produits du **Studio** stockent déjà un PNG réel du design (`img:` via `svgToPng`). Cache PWA v1.3.0.

- ✅ **Phase 1** : boutique « La Détente » (rebrand complet, thème noir/rouge, 34 produits mockups SVG,
  bugs corrigés, paiement panier réparé) ; **Studio admin** (`studio.html` v1.2.0) multi-calques + montage +
  upload image/dossier/drag&drop + **auto-logo (retrait fond + recadrage)** + **formes** (cercle/cœur/
  bouclier/étoile/hexa) + filtres + duotone + miroir + fusion + export **mockup** + **fichier impression
  HD transparent** + « Ajouter à la boutique » ; merge produits custom ; manifest/sw/parent/sitemap/og.png.
- ✅ **Studio — création récurrente** (Kevin 2026-06-03 « créer d'autres motifs régulièrement, choisir
  textiles, logo sur la poitrine, créer les thèmes ») : **sélecteur d'emplacement** par vêtement
  (Poitrine / Dos / Cœur gauche / Manche / Avant casquette / Centre) qui repositionne la zone d'impression
  + champ **Thème / Collection** à l'enregistrement → stocké sur le produit (`placement`, `theme`,
  `garmentColor`, `motif`). Création illimitée de nouveaux motifs/thèmes sur n'importe quel textile.
- ✅ **Phase 2 — Checkout + Bon de production** (cache `kdmc-la-detente-v1.2.0`) :
  - `showCheckout()` : étape AVANT paiement → **sélecteur de taille par article** (S→XXL) +
    **formulaire adresse de livraison** (nom, email, tél, rue, CP, ville, pays, note) avec validation
    FR claire (toasts), pré-rempli depuis `localStorage ld_checkout`.
  - **Bon de production** (`buildProductionSheetHTML`/`Text`, `ldOpenSheet`/`ldPrintSheet`) : tableau
    N°/Produit/**Vêtement**/**Couleur**/**Thème·Motif**/**Emplacement**/**Taille**/Qté + total +
    **bloc livraison** complet → **Imprimer/PDF** + **Copier** (texte) → prêt à envoyer au fournisseur.
    Aperçu « brouillon » dispo dans le checkout + bouton « 📄 Bon de production » sur la confirmation.
  - `processOrder` enrichi : commande locale (`kdmc_orders_la-detente`) + **EmailJS** (taille + adresse +
    bon de production envoyés) + push dashboard **méta-only (aucune PII)** inchangé.
  - Boutons panier « Payer » → « 📦 Commander » (vCartPage + tiroir panier, bug guillemet parasite corrigé).
- ✅ **Phase 3 — Handoff fournisseur + hero image** (cache `v1.4.0`) :
  - Sur le **bon de production** : champ **email fournisseur** (mémorisé `ld_supplier_email`) +
    bouton **« ✉️ Envoyer au fournisseur »** (mailto pré-rempli avec le bon complet) +
    **« ⬇️ Export CSV »** (commande + livraison, prêt import T-Pop/atelier). 100 % autonome, sans backend.
  - **Image hero** réelle sur l'accueil (`img/hero.png` : emblème LA DÉTENTE, fond cinématique noir/rouge).
- ⏳ **RESTE** : la SEULE étape humaine = Kevin crée un compte **T-Pop** (KYC). Ensuite, brancher l'API
  T-Pop (envoi auto du CSV + fichier impression HD) + suivi de statut — automatisable une fois le compte créé.

## 🛠️ SÉQUENCE DE BUILD (Phase 1+2)
1. Corriger bug `vProducts` + polish boutons + lien Studio (admin) depuis la boutique.
2. Construire `studio.html` (multi-calques, export mockup + print file, add-to-shop).
3. Boutique : fusionner `ld_custom_products` dans `P` au boot ; produit custom → img mockup.
4. Checkout : formulaire adresse + taille ; commande privée + bon de production.
5. SEO/PWA/parent : `manifest.json`, `sw.js` (cache `kdmc-la-detente-v1.0.0`), carte dans `shops/index.html`,
   `sitemap.xml`, `og.png` (screenshot emblème).
6. Tests (screenshots mobile 375px + desktop, node --check tous blocs) → commit → push branche
   `claude/textile-shop-ar15-heart-mMJ0j` → PR.

---

## 🔥 Session 2026-06-03 — Designs Kevin + Worker IA + sécurité studio (v1.13→v1.17)

- **Logos premium** (v1.13) : emblème badge or + cœur glossy 3D + AR15 acier + motifs argent (bibliothèque/studio/boutique). Emblème de présentation conservé.
- **MAJ auto forcée** (v1.14) : service worker network-first pour les pages + auto-reload sur nouvelle version + check 60s. **1 refresh** la 1ʳᵉ fois pour adopter.
- **Studio sécurisé** (v1.14) : accès réservé **Kevin + Laurence** (prénom+nom + PIN PBKDF2 200k, device-trust, Face ID, lockout progressif). Échelle logo min 0.04.
- **Worker Cloudflare Gemini** (autonome) : `https://ld-gemini-proxy.9r4rxssx64.workers.dev` — clé en secret worker, déploiement auto (wrangler + secrets CF), URL commitée dans `proxy-config.json`. Studio : panneau « 🎨 Générer un design IA » (derrière le login).
- **Designs (modèles Kevin)** générés via Gemini (nano-banana-pro / gemini-3-pro-image), fond transparent : `img/designs/` = rose-pistol, rose-shotgun, hearts-ar15/shotgun/pistol/revolver, clays-perazzi, crest.
- **Bibliothèque** (v1.16) : ces designs remplacent les motifs SVG ; studio ouvre un design via `?design=`.
- **12 produits vendables** (v1.17) catégorie « Designs ★ » : `ld200`→`ld211` (tee/hoodie/tote), mockups composités dans `img/products/`.
- Workflows : `la-detente-worker-deploy.yml`, `la-detente-ai-designs.yml` (dispatch + auto-run sur merge main).

⚠️ À tester par Kevin (navigateur réel) : endpoint worker depuis le studio (le fetch automatisé hors-navigateur est filtré 403).

---

## 🛠️ Studio pro + qualités + coupes (v1.15 → v1.20)

- **Worker Gemini** (autonome) : génération de designs IA à la volée dans le studio (clé en secret worker).
- **Sélecteur Qualité à la commande** : **Standard → Printify** (pas cher, meilleure marge) · **Bio coton ✦ → T-Pop** (coton bio FR). Prix auto, qualité suivie dans le panier. Tarifs définitifs à fixer par fournisseur.
- **White-label** : envoi « au nom de ta boutique » (T-Pop inclus ; Printify bon de livraison à ta marque).
- **Coupes studio** : T-shirt, Débardeur, Polo, Chemise, Hoodie, Sweat zippé, Jogging, Short, Casquette, Tote, Bandana (+ palette couleurs étendue).
- **Éditeur photo pro** (calque image → ✏️ Retoucher) : **gomme manuelle**, **gomme magique** (efface fond OU objet en 1 clic, tolérance réglable), **recadrer**, restaurer.
- **Presse-papier calques** : copier / couper / coller (Ctrl+C/X/V), **annuler/refaire** (Ctrl+Z/Y), Suppr, déplacement flèches, dupliquer (Ctrl+D).
- **Fix** : débordement horizontal (studio + boutique).
- **Catalogue** : les **vraies images produit + infos détaillées viendront des fournisseurs** (Printify/T-Pop génèrent des mockups photoréalistes à partir des designs uploadés). Les mockups SVG actuels sont des placeholders.

À venir (proposés) : templates slogans, textures vintage, export PDF 300 dpi, « créer un produit en 1 clic » depuis le studio.
