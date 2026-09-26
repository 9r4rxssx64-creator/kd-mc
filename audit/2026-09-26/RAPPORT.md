# Audit du 26.09.2026 — domaine kd-mc.com, Javis, tuiles

> Demandé par Kevin : « rajoute les tuiles qui manquent à tout le monde · vérifie la
> qualité du Javis, où on en est · fais ton audit · et un audit d'amélioration ».
>
> **Chaque chiffre de ce rapport a été mesuré**, jamais estimé. Les commandes sont citées.
> Statuts : ✅ **VÉRIFIÉ** (commande exécutée) · 🟡 **DÉDUIT** (lecture de code) · 🔴 **NON VÉRIFIÉ**.

---

## 0. Ce que la passe LIVE a fini par mesurer — et ce qu'elle a trouvé

**Mise à jour du 26.09 à 18 h.** La limite écrite plus tôt dans la journée (« la passe LIVE
n'a pas pu tourner : les machines GitHub sont coupées ») **est levée** : Kevin a monté le
budget Actions à 20 $, les machines sont revenues vers 17:09 UTC, et la passe live a tourné.
Elle a trouvé ce qu'aucune lecture de code ne pouvait trouver.

### 0.1 ✅ Le domaine servait l'ANCIENNE page — Kevin ne voyait PAS ses tuiles

Mesure : `audit/verif-live/tuiles.md`, écrit par la machine GitHub à **17:53 UTC**
(`tests/verif-tuiles-live.mjs`, lecture seule sur le vrai domaine).

| Surface | Dépôt | Servi en ligne | |
|---|---|---|---|
| `kd-mc.com` | `v1.0.34` | **`v1.0.33`** | ❌ publication en retard |
| `shops.kd-mc.com` | `v1.0.3` | **`v1.0.2`** | ❌ publication en retard |
| widget Javis | 72 270 o | **69 857 o** | ❌ durcissement pas en ligne |

Tuiles **absentes de la page servie** : Rotaplan · Kit IA de l'indépendant · Devenir croupier ·
« Changer mon code admin » · EcoCraft (vitrine). Elles étaient bien dans le dépôt depuis la
fusion #4024, et `test:tuiles-apps` était vert : **un garde de fichier ne voit pas ce que
l'iPhone de Kevin reçoit.**

Ce qui allait bien, mesuré aussi : les **41 destinations** de tuiles répondent (aucune tuile
vers une page morte), les 8 tuiles « en construction » sont grisées exprès, et l'icône 192 px
de Javis est servie.

### 0.2 ✅ CAUSE RACINE — la publication ne compare rien à ce qu'elle vient d'envoyer

Dans **un seul journal** (run `36259584640`), à **une seconde d'intervalle** :

| adresse Cloudflare Pages | `kd-mc.com` servi |
|---|---|
| éphémère du déploiement (`934b74ff.…`) | **26 502** car. ← la page NEUVE |
| **stable**, celle que le routeur lit | **24 961** car. ← la VIEILLE |

Et la sonde a écrit « alias de production vérifié ✅ ». Elle mesure le code HTTP et la taille ;
elle ne vérifie jamais que c'est **le paquet qu'on vient d'envoyer**. Le paquet, lui, était bon
(fabriqué ici : v1.0.34, 27 024 o, `javis/` présent avec le widget à 72 270 o). Le repère
`__paquet.txt` étant **constant**, aucune mesure ne pouvait distinguer une publication arrivée
d'une publication perdue. **Publication verte, domaine périmé, 17 minutes, rien de rouge.**

**Fix posé** : `__paquet.txt` porte l'empreinte du contenu (sha256 sur 1 864 fichiers, aucune
horloge → reproductible : `cb8ed9f6334bb059` deux fois de suite, `7763a7af958a9d99` après un
octet changé), et la publication **attend** que l'adresse stable serve cette empreinte, en
échouant à voix haute sinon — fail-CLOSED sur les trois issues (correspond / diffère / illisible).

### 0.3 ✅ `npm install` était cassé pour TOUT le dépôt — 82 robots morts

La passe live a d'abord échoué **en 15 secondes** à l'étape « installer un navigateur », et
**toutes les étapes suivantes ont été sautées** : aucun rapport, aucune trace de ce qui manquait.
`npm error Cannot read properties of null (reading 'edgesOut')`, identique dans le conteneur
d'agent et sur la machine GitHub → **le dépôt, pas la machine**.

Cause racine : `@vitest/coverage-v8` en `^4` dans le `package.json` de la **racine**, qui n'a
aucune configuration vitest (son `test:coverage` est un script Node) — vitest vit dans les
sous-projets (`^3` et `^5`). Paquet orphelin, plage flottante, publication en amont : tout casse.
Bissection : sans lui sortie 0 · avec lui + `vitest` en pair sortie 1 · retiré, vraie
installation **sortie 0, 150 paquets, 145 modules** (il y en avait 6). **82 workflows font
`npm i`.** C'était aussi la vraie raison des arrêts de `test:ci` en local aux étapes 26/70/138
que j'avais mis sur le compte de « l'environnement » — c'était ça.

### 0.4 ✅ Un garde exigeait une adresse MORTE et rendait `test:ci` rouge pour tout le monde

`verify-router-secours.mjs`, contrôle H-bis : « sans réglage, on garde le comportement
d'avant » exigeait que le routeur parte sur `9r4rxssx64-creator.github.io`, **éteint** depuis
que le dépôt est privé. Mesuré **59 OK / 1 FAIL, exit 1, sur `main`** — sans rapport avec la
branche qui le lançait. Corrigé en **lisant** le défaut dans le code du routeur → 62/0.

### 0.6 ✅ 3 robots Face ID rouges depuis le 23.09 — le remède existait, posé sur 1 fichier sur 4

« KDMC SSO — test navigateur réel » échoue sur **toutes** les branches et sur `main` depuis au
moins le 23.09 : **12 exécutions consultées, 12 rouges**. Un rouge permanent est un rouge que tout
le monde apprend à ignorer.

Cause : trois des quatre tests lisaient `process.env.KDMC_ADMIN_CODE`, un secret que le workflow ne
pose **nulle part** → code vide → « Code trop court » → et l'échec s'affichait comme
« timeout en attendant le bouton `#pk-go` », qui ne dit rien de la vraie cause.

Ce qui rend le cas instructif : le diagnostic **et** le remède étaient déjà écrits le **22.09**, en
tête de `tools/kdmc-sso-e2e/run.mjs`… et appliqués à ce fichier **seulement**. Une correction posée
sur une copie sur quatre n'est pas une correction.

| Test (vrai Chromium, ici) | Avant | Après |
|---|---|---|
| `kdmc-sso-e2e` | 8/0 | 8/0 |
| `kdmc-passkey-e2e` | **mort au 1er contrôle** | **15/0** |
| `kdmc-multiapp-e2e` | **mort** | **7/0** |
| `kdmc-cmcteams-sso-e2e` | **mort** | **3/0** |

**25 contrôles ne protégeaient plus rien** : Face ID virtuel, enrôlement, session forte, admin auto
pour Kevin seul, anti-doublon d'appareil, auto-login de CMCteams. Le vrai code admin n'approche
aucun test (règle absolue) : un code de test suffit, le domaine décide l'identité par le NOM.

### 0.7 🟡 Une fausse alerte de ma part, dite franchement

`test:ci` s'est arrêtée à l'étape **79/214** sur `test:finances-docfiche` (« `#tabs` introuvable en
5 s »). Ce n'était **pas** le dépôt : je lançais 4 tests navigateur **en parallèle** de la chaîne.
Relancé machine au repos : **18 OK / 0 FAIL**. Même piège que le clignotement de Bee ce matin —
un seuil en millisecondes mesure la charge de la machine autant que le produit.

### 0.5 🔴 Ce qui reste non vérifié

Le **second avis indépendant** (Qodo/GPT, Semgrep, gitleaks) n'a pas été relancé : les machines
sont revenues, mais le plafond de 2 000 min/mois tient jusqu'à la bascule du 1er octobre, et
j'ai dépensé les minutes du jour sur les mesures ci-dessus, qui prouvaient une panne vivante.
À relancer en premier le 1er octobre, quand les minutes du dépôt public seront illimitées.

---

## 1. Inventaire réel (✅ lu dans le code, pas dans la doc)

| Mesure | Valeur | Commande |
|---|---|---|
| CMCteams | `v9.916` | `grep APP_VER index.html` |
| Apex (vivant) | `13.4.355` | `apex-ai/v13/package.json` |
| Javis / Bee | `v1.6` | `grep JAVIS_VER tools/javis/javis-widget.js` |
| Portail kd-mc.com | `v1.0.34` | `data-version` |
| Portail boutiques | `v1.0.3` | `data-version` |
| Adresses servies (`ROUTES`) | **32** | parse du worker |
| Adresses au périmètre (`APPS`) | **32** (était 34 : 2 doublons) | idem |
| `index.html` CMCteams | **3 358 Ko** | `audit:improvements` |
| Workflows actifs / rangés | **161 / 35** | `ls .github/workflows` |
| Étapes de `test:ci` | **214** | parse de `package.json` |
| Scripts de test déclarés | **237** | idem |

⚠️ La doc parlait encore de « 26 adresses » : il y en a **32** (26 apps distinctes + 6 alias).

---

## 2. Tuiles — ce qui était introuvable (✅ mesuré, ✅ corrigé)

Hier, 5 apps servies n'avaient aucune tuile. Aujourd'hui, l'inventaire a été poussé à
**toutes** les surfaces de navigation, pas seulement le portail.

| Trouvé | Preuve | Corrigé |
|---|---|---|
| `kd-mc.com/empreinte/` — la page qui calcule l'empreinte du **nouveau code admin** — **0 lien entrant dans tout le domaine** | `grep -rno 'href="[^"]*/empreinte'` → aucun résultat | tuile dans l'espace privé du portail (Face ID) |
| `shops/ecocraft/` — boutique de 116 Ko — absente du portail boutiques alors que ses 3 sœurs y sont | boucle sur `shops/*/` vs `shops/index.html` | tuile « 🚧 En construction », comme ses sœurs |
| `rotaplan` / `kit` / `croupier` — **belles adresses jamais montrées** sur kd-mc.com (atteignables seulement en chemin relatif) | union des surfaces : 24/26 | 3 tuiles sur le portail, adresse affichée |
| Admin du domaine : **7 apps sur 26**, et 1 produit vendu sur 3 | `grep -c "card('"` → 10 | + Rotaplan, + Devenir croupier, + « Qui se connecte », + Centre de contrôle → **14 tuiles** |
| `APPS` du routeur : `rotaplan` et `croupier` déclarés **deux fois** (la 2ᵉ écrase la 1ʳᵉ en silence) | `Counter` sur le bloc | doublons retirés → 32 = 32 |

**Écarté avec preuve** (pas un bug) : `shops/sourcing/` n'a pas de tuile dans la vitrine
publique — c'est un **back-office fournisseurs**, sa place est dans l'espace privé du
portail, où il est déjà. Exception écrite dans la garde, avec sa raison.

### La garde (la cause mécanique, pas le symptôme)
`npm run test:tuiles-apps` : **70 → 91 contrôles, 0 échec**. Elle couvre maintenant
(a) routeur → tuile, (b) **les sous-chemins de kd-mc.com** (c'est ce qui rendait
`/empreinte/` invisible à la garde d'hier), (c) **les dossiers de boutiques**,
(d) **aucune adresse déclarée deux fois**.

✅ **Prouvée discriminante par sabotage** : tuile `empreinte` retirée → 1 échec ·
tuile `ecocraft` retirée → 1 échec · doublon remis dans `APPS` → 1 échec · restauré → 91/0.

---

## 3. Javis / Bee — où on en est (✅ mesuré)

### Ce qui est solide
- ✅ **Une seule Bee** : les 3 copies ont le même md5 (`e6efee4…`), et la garde compare
  les **octets**, pas les intentions.
- ✅ **Gate fail-CLOSED réel** : 4 chemins d'échec distincts ramènent tous à « invisible »,
  comparaisons `=== true`. Prouvé en vrai navigateur.
- ✅ **0 asset dupliqué** : les **17** fichiers cités (images + 12 clips vidéo) vivent tous
  chez Lingua et existent tous.
- ✅ **0 `setInterval`** dans 1 223 lignes, et une boucle de vie qui se démonte elle-même.
- ✅ **Gardes** : `test:javis-bee` **58/0** (était 51) · `test:javis-bee-reelle` **45/0**
  (vrai Chromium) · `test:lingua-bee` **13/0**.

### Ce qui était fragile — corrigé aujourd'hui
| # | Problème mesuré | Correctif |
|---|---|---|
| 1 | Aucun outil de recopie : les 3 copies tenaient sur la mémoire de celui qui modifie (oubli réel le 16.09) | `npm run sync:javis` — la liste des pages est **déduite du dépôt**, jamais écrite à la main |
| 2 | La garde listait les pages porteuses **à la main** : ajouter Bee à une page dont la CSP n'a pas `media-src` passait les 51 contrôles sans un mot | pages **trouvées par lecture du dépôt** + CSP exigée page par page. Sabotage (page à CSP nue) → **4 échecs** |
| 3 | `0` `AbortController` : un `/__sso/whoami` qui **pend** ne rappelait jamais le callback → en mode app, l'écran « Bee arrive… » disparaît à 900 ms → **écran noir sans message** | délai de **4 s** puis même chemin que le refus (donc même message). Sabotage → 3 échecs |
| 4 | 4 écouteurs de réveil audio posés **au chargement, avant le gate** : tout visiteur anonyme les portait et créait un `AudioContext` au premier toucher ; jamais retirés | armés **après** le gate, retirés quand Bee quitte la page |
| 5 | `javis/sw.js` figé sur `javis-v1.3` alors que le widget est en `v1.6` — une étiquette qui mentait depuis 3 versions | aligné + **garde de cohérence** (sabotage → 1 échec) |
| 6 | Manifest : **une seule icône 512**, pas de 192 → installabilité Android au bord | `icon-192.png` générée (192×192 vérifié dans l'en-tête PNG) + mise en cache |

### Ce qui reste, honnêtement (non corrigé aujourd'hui, et pourquoi)
- 🟡 **P1 — la vraie dette #142 n'est pas là où la doc la regardait.** Les *assets* ne
  sont pas dupliqués, mais le **code** l'est : le widget a porté `mascotAlive`, le
  clignement et le lip-sync depuis `lingua/app.js`. Et **les deux ont divergé** : le
  widget est à `fftSize 2048` + voyelles + consonnes, `lingua/app.js` est resté à
  `fftSize 256`, amplitude seule, **0 occurrence de voyelle/consonne** (✅ mesuré).
  **La Bee d'origine est aujourd'hui la moins bonne des deux.** Non corrigé : ça touche
  l'app la plus visible et demande sa propre mesure avant/après.
- 🟡 **P2** — Bee n'est embarquée que sur **2 pages sur 32** (`arbre`, `javis`), alors que
  la demande était « quand j'ouvre le domaine ». Le portail `kdmc-home` n'a **ni
  `media-src`, ni `lingua` en `img-src`, ni `apis` en `connect-src`** : l'y ajouter
  demande d'ouvrir sa CSP d'abord (la garde le refuse maintenant si on l'oublie).
- 🟡 **P2** — le jeton SSO est persisté en `localStorage` sur une page publique (`arbre`).
- 🟡 **P3** — 1 223 lignes / 70 Ko recopiés 3 fois = 212 Ko dans le dépôt.

---

## 4. Audit d'amélioration (✅ chiffré, `npm run audit:improvements`)

| Mesure | Valeur | Ratchet |
|---|---|---|
| Fonctions déclarées / orphelines | 1 498 / **77** | stable |
| Fonctions définies **plusieurs fois** | **9** (`_norm`×4, `normName`×3, `norm`×3, `fmtD`×3…) | stable |
| `innerHTML` sans échappement visible | **76** | stable |
| `setInterval` sans `clearInterval` | **42 vs 31** → 11 de trop | — |
| `addEventListener` sans retrait | **85 vs 3** | — |
| Vues non couvertes par un test | **37 / 102** | **38 → 37 (amélioré)** |
| Styles en dur (`style="`) | 5 193 | stable |
| `console.log` / TODO | 46 / **0** | stable |
| Dépendances à jour | 🔴 **non mesuré** (réseau) — à relancer avec `--deps` en CI |

### ⚠️ Le vrai résultat de cet audit : **4 mesures fausses**, dont un faux rouge qui bloquait tout le monde

L'audit a surtout révélé que **les instruments mentaient**. Une mesure fausse est pire que pas
de mesure : elle fait « corriger » du code sain et elle noie le vrai risque.

| Mesure | Ce qu'elle annonçait | Ce qui est vrai (mesuré) | Corrigé |
|---|---|---|---|
| `duplicate_functions` | **9 doublons · P1 · « la 2e écrase la 1re en silence »** | **0 au niveau global.** Dans un vrai navigateur, 7 des 9 noms n'existent même pas sur `window` ; la profondeur d'accolades montre qu'elles sont **toutes imbriquées** (5 à 59) → fonctions locales à des portées différentes | 2 compteurs : signal de lisibilité (P3) + `duplicate_functions_global` = 0 au ratchet |
| `views_untested` | **37/102 vues non testées · P2** | **95 routes reconnues par l'app, 95 testées par le smoke — 0 manquante, 0 fantôme = 100 %.** Les 37 autres `vXxx` sont des **fragments**, pas des pages | nouveau `routes_untested` = 0, comparé à la liste du **smoke** (la 1ʳᵉ version du contrôle passait au vert sans rien prouver — vu par sabotage) |
| `test:maj-tout` | **« périmé »** → `test:ci` rouge à l'étape **138/214**, pour toutes les sessions | Le bloc **comparé** contenait « Branches dans le dépôt » : **le document disait 249 pendant que la mesure disait 250** — le nombre change tout seul (robots, autres sessions) | valeur volatile sortie du bloc comparé (elle reste affichée ailleurs) ; garde toujours discriminant sur le reste |
| Test réel de Bee | **« 3 battements au lieu de ~8 »** → 1 faux rouge | Machine chargée : les minuteurs retardés repartent en rafale. Même code, machine calme → **45/0** | critère en **rapport** (cachée ×2 ≤ visible) au lieu d'un seuil absolu ; le sabotage connu échoue toujours |

Et ce n'est pas la première fois pour deux d'entre elles : `views_untested` annonçait **85**
le 09.08 (déjà faux), et le commentaire de `maj-tout.mjs` **décrivait** le piège de la valeur
volatile… tout en la laissant dans le bloc comparé.

**Backlog classé, après correction des instruments** : P1 les 76 `innerHTML` à trier ·
P2 les 77 orphelines · P2 les **11 minuteries sans arrêt** (batterie iPhone) · P3 les 9 noms
réutilisés (lisibilité, aucun bug) · P3 les 5 193 styles en dur. **Les « 37 vues non testées »
ont disparu du backlog : elles n'existaient pas.**

**Stabilité** (✅ `npm run audit:stability`, vrai Chromium) : **0 FAIL, 0 WARN**.
8 domaines appelés, **tous couverts par la CSP**. Au repos : accueil `render=0 dc=1`
(topbar 23 mutations/6 s), admin `0/0` (3 mutations), monplanning `0/0` (0 mutation).

---

## 5. Sécurité (✅ passe locale vérifiée)

- ✅ **Aucun secret** dans le dépôt : les 9 lignes trouvées par le scan sont toutes des
  **manipulations de chaîne PEM** (`.replace('-----BEGIN PRIVATE KEY-----', '')`), pas des clés.
- ✅ `test:p0-secu` 17/0 · `test:no-secret-in-docs` 0 fuite · `test:xss-guard` OK ·
  `test:depot-public-sain` OK · `test:depot-public-secrets` 8/0.
- 🟡 **Angle mort déclaré** : `test:no-pin-leak` annonce lui-même « recherche du code en
  clair **NON EFFECTUÉE** » en local — il ne peut pas chercher une valeur qu'il n'a pas
  (le code admin vient d'un secret CI). Ce contrôle n'est réel **qu'en CI**, donc il ne
  tourne pas en ce moment.
- 🔴 `security-suite` + `strix` (Semgrep, gitleaks, TruffleHog, OSV, Trivy) : **pas
  exécutables** aujourd'hui (machines coupées).

---

## 6. Un rouge de `test:ci` qui bloquait TOUT LE MONDE (✅ corrigé)

✅ Mesuré : `npm run test:ci` s'arrêtait à sa **2ᵉ étape sur 214**.
Cause exacte : `coffre-previent-public.yml` (créé le 24.09 par une autre session) avait
`concurrency: group: coffre-previent-public` **sans la branche** + `cancel-in-progress: true`
→ un commit sur `main` annulait les vérifications d'une **autre** branche.
Correctif : `group: coffre-previent-public-${{ github.ref }}`.
✅ Sabotage : groupe fixe remis → **1 échec** · restauré → **5 OK / 0**.

---

## 7. Auto-critique (obligatoire)

- **Le point le plus faible de cet audit** : il est **local**. Le domaine réel n'a pas été
  chargé une seule fois, parce que la CI est coupée et que l'agent n'a pas d'accès sortant
  vers `kd-mc.com` (mesuré : `connect_rejected`). Tout ce qui est « en ligne » reste
  **non vérifié** aujourd'hui.
- **Ce que je n'ai pas pu vérifier** : les dépendances (réseau), le scan de secrets côté
  CI (Semgrep/gitleaks/OSV/Trivy), le second avis indépendant non-Claude, et la recherche
  du code admin en clair (valeur absente en local).
- **Ce dont je ne suis pas certain** : le test réel de Bee compte des **battements de
  paupières en temps réel sur 9 s**. Au premier passage, machine chargée, il a mesuré
  3 battements au lieu de ~8 → **1 faux rouge**. Second passage, même code, machine
  calme : **45/0**. Ce test est donc **sensible à la charge** : ce n'est pas une
  régression, mais c'est une fragilité de mesure à corriger (compter sur une fenêtre plus
  longue, ou piloter l'horloge).
- **Ce que cet audit apprend de plus utile** : avant de corriger ce qu'un outil signale, il
  faut **vérifier l'outil**. Sur 6 entrées de backlog, **2 étaient fausses** (9 doublons « qui
  s'écrasent », 37 vues « non testées ») et un garde donnait un **faux rouge permanent**. Si
  j'avais « corrigé » le code, j'aurais touché du code sain dans un fichier de 3,3 Mo.
- **Ce que j'ai volontairement laissé** : remonter le lip-sync dans `lingua/app.js`
  (risque moyen/élevé sur l'app la plus visible), les 9 fonctions dupliquées et les 11
  minuteries de `index.html` (mono-fichier de 3,3 Mo : à faire une par une, avec mesure
  avant/après, pas dans un lot).
