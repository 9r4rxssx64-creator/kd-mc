# 📋 BILAN-BRANCHES.md — le point complet du pipeline

> Fabriqué le **2026-09-24** par `npm run bilan`. **Aucun chiffre estimé** :
> tout vient du registre (`pipeline/sessions.json`) croisé avec le dépôt réel
> (`git ls-remote` + date du dernier commit de chaque branche).
> Relancer la commande le remet à jour — ne pas éditer à la main.

## Les chiffres

| | |
|---|---|
| Sessions au registre | **42** |
| Branches réellement dans le dépôt | **240** (dont **22** touchées depuis ≤ 21 j) |
| Branches que personne n'a déclarées | **227** (dont **17** vivantes) |
| Discussions entre sessions | **126** — 111 ouvertes, 15 closes |
| Dernier commit sur `main` | 2026-09-24 |

## ⚠️ Ce qui est en retard (les seuls points à traiter)

- 🔴 **Branche absente ET aucune fusion retrouvée : 0** — aucune. **Aucun travail perdu.**
- 🟡 **Branche nettoyée après fusion (travail dans `main`), état encore `actif` : 6** → `meta`, `lingua-voix`, `lingua-parcours`, `crypto-bots`, `tor-securite`, `javis-bee` — la session doit repartir d'une branche neuve et mettre son état à jour.
- 🟠 **Sessions non mises à jour depuis plus de 7 jours : 5** → `domain-kdmc`, `free-apis`, `cmcteams-pdf`, `voir-comme-kevin`, `video-review`
- ✉️ **Messages ouverts depuis plus de 2 jours sans suivi daté : 0** — aucun.
- 👤 **Attentes côté Kevin : 4**
  - `domain-kdmc` : accès au compte Cloudflare « 9r4 » (verrouillé derrière GitHub)
  - `arbre` : changer le code famille (Outils → Changer le code) ; révoquer le jeton GitLab glpat-wD6Q…
  - `la-detente` : combien de gilets, et broderie logo seul ou logo + prénoms ?
  - `meta` : compte développeur Apple (99 $/an) : OK ou pas ?

## 📚 Chaque session, une par une

### 🟠 « Voir comme Kevin » — branche fabriquée par le workflow de captures  `voir-comme-kevin`

- **Sujet** : sous-produit du workflow de captures, rattaché à cmcteams-pdf
- **Branche** : `claude/voir-34519286077` — existe, dernier commit **2026-09-10** (13 j), `399ecb81`
- **État déclaré** : `actif` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : cmcteams-pdf
- **Dernière note** : Inscrite UNIQUEMENT pour que test:pipeline-sessions cesse d'etre rouge pour tout le monde. Ce n'est pas ma zone : elle porte 3 commits hors de main, dont 2 signes Claude venant de claude/verify-cmcteams-light-data-rzlvau (session cmcteams-pdf). A ELLE de decider : recuperer ces 2 commits puis laisser mourir la branche, ou la reprendre. Je n'y touche pas.
- **Verdict** : 🟠 pas de mise à jour depuis 14 j

### 🟠 CMCteams — fidélité au PDF (planning, équipes, départs)  `cmcteams-pdf`

- **Sujet** : fidelite-pdf
- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` — existe, dernier commit **2026-09-06** (17 j), `3a9c07df`
- **État déclaré** : `actif` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 46 envoyées, 83 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m055, m056, m059, m062, m067-arbre, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m090-video-review, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m099-video-review, m101-video-review, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m039, m040, m041, m043, m044, m045, m046, m048, m049, m050, m051, m052, m057, m058, m060, m061, m069, m070, m071, m072, m073, m098-cmcteams-pdf, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf
- **Dernière note** : 10.09 : équipes lues dans le récapitulatif page 1 (v9.897), octobre 2026 intégré, cellules+équipes 0 écart 4 mois × 2 surfaces, CASSINI A/MOREL F retrouvés
- **Verdict** : 🟠 pas de mise à jour depuis 14 j

### 🟠 Domain Kdmc  `domain-kdmc`

- **Sujet** : Domaine kd-mc.com — routeur, publication, remise en ligne
- **Branche** : `publie-septembre` — existe, dernier commit **2026-09-01** (22 j), `0766fc3c`
- **État déclaré** : `actif` · mise à jour le **2026-09-02** (il y a 22 j)
- **Ce qu'elle touche** : `services/kdmc-router` · `tools/gitlab` · `.gitlab-ci.yml`
- **Discussions** : 0 envoyées, 82 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m024, m026, m028, m030, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- 👤 **Attend Kevin** : accès au compte Cloudflare « 9r4 » (verrouillé derrière GitHub)
- ⏳ **Attend une autre session** : arbre : ROUTEUR touché : /__arbre/* (code famille vérifié sur le domaine + données de l'arbre en KV) — fait n°12
- **Verdict** : 🟠 pas de mise à jour depuis 22 j

### 🟠 Free APIs and potential improvements  `free-apis`

- **Sujet** : API gratuites et paliers gratuits d'IA (chaîne de repli)
- **Branche** : `claude/free-apis-analysis-c4sy5d` — existe, dernier commit **2026-07-04** (82 j), `70f2f286`
- **État déclaré** : `actif` · mise à jour le **2026-09-02** (il y a 22 j)
- **Ce qu'elle touche** : `services/kdmc-apis`
- **Discussions** : 0 envoyées, 84 reçues · **à lire : m003, m004, m005, m006, m007, m010, m012, m013, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : studio-crea : Secrets VUS en vrai : Cerebras existe deja, il ne reste que 2 comptes a creer
- **Verdict** : 🟠 pas de mise à jour depuis 22 j

### 🟠 Lecture de videos envoyees par Kevin  `video-review`

- **Sujet** : Regarder/transcrire les videos que Kevin envoie + outil reutilisable
- **Branche** : `claude/video-review-wqnqdw` — existe, dernier commit **null** (?), `d56d3f44`
- **État déclaré** : `actif` · mise à jour le **2026-09-15** (il y a 9 j)
- **Discussions** : 9 envoyées, 81 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m081-javis-bee, m082-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m073, m098-cmcteams-pdf, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m078-video-review, m079-video-review, m089-video-review, m090-video-review, m095-video-review, m099-video-review, m101-video-review, m122-video-review, m123-video-review
- ⏳ **Attend une autre session** : javis-bee : kit.kd-mc.com/lire.html est ROUGE en vrai sur le domaine : sommaire 7 entrées au lieu de >= 8 (mesuré, run 35162311942)
- **Verdict** : 🟠 pas de mise à jour depuis 9 j

### 🟡 Javis / Bee — persona, voix et animation  `javis-bee`

- **Sujet** : Bee (mascotte Lingua) comme assistant de Kevin : widget, app installable javis.kd-mc.com, voix + lip-sync
- **Branche** : `claude/persona-personnage-javis-hqd55e` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 31/31 PR fusionnées, la dernière **#3882** le **2026-09-17 16:05**
- **État déclaré** : `actif` · mise à jour le **2026-09-16** (il y a 8 j)
- **Discussions** : 7 envoyées, 80 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m087-tor-securite, m088-tor-securite, m089-video-review, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m081-javis-bee, m082-javis-bee, m083-javis-bee, m084-javis-bee, m085-javis-bee, m086-javis-bee, m090-javis-bee
- ⏳ **Attend une autre session** : video-review : javis.kd-mc.com manquait dans apps.json + les 2 copies de repli — apps-consistency ROUGE sur main, corrigé par moi (7/7), à ne pas défaire
- **Dernière note** : Bee : lip-sync mesuré (1,20 → 0,30), animations remontées dans Lingua v2.125.0 (clignement unique, saut dessin animé, regard détourné) ; les 3 gardes de Bee tournent enfin sur GitHub (bee-gardes.yml, vert en CI : 22 + 13 contrôles) ; clayscore-verif-prix.yml réparé (413 échecs silencieux) + garde test:workflows-valides
- **Verdict** : 🟡 branche nettoyée après fusion — travail DANS main (31 PR, dernière #3882 le 2026-09-17 16:05)

### 🟡 Lingua — garde sur le parcours utilisateur  `lingua-parcours`

- **Sujet** : le P0 live du m051 est ferme, et une garde empeche son retour
- **Branche** : `claude/lingua-parcours-garde` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3763** le **2026-09-10 21:21**
- **État déclaré** : `actif` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 1 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Verdict** : 🟡 branche nettoyée après fusion — travail DANS main (1 PR, dernière #3763 le 2026-09-10 21:21)

### 🟡 Lingua — les 5 échecs de voix rectifiés  `lingua-voix`

- **Sujet** : écran blanc sans progression, mot dit deux fois, voix de secours non nommée
- **Branche** : `claude/lingua-voix-rectifiee` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3762** le **2026-09-10 20:59**
- **État déclaré** : `actif` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 1 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m067
- **Verdict** : 🟡 branche nettoyée après fusion — travail DANS main (1 PR, dernière #3762 le 2026-09-10 20:59)

### 🟡 Meta  `meta`

- **Sujet** : Meta — lunettes connectées / SDK
- **Branche** : `claude/meta-krzqz8` — **absente du dépôt**
- **Son travail** : ⚠️ aucune PR — à vérifier à la main
- **État déclaré** : `actif` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- 👤 **Attend Kevin** : compte développeur Apple (99 $/an) : OK ou pas ?
- **Dernière note** : Branche claude/meta-krzqz8 supprimee par le menage du 10.09 : elle etait ancetre de main (0 commit, 0 PR) donc rien de perdu. Session TOUJOURS en attente de Kevin (compte developpeur Apple 99 EUR/an). Pour reprendre : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : 🟡 branche nettoyée — la session a déjà documenté que rien n'est perdu

### 🟡 Robots crypto : bilan, agressivité, scanner marché  `crypto-bots`

- **Sujet** : Bilan bots crypto (bilan persistant), stratégie agressive+++, scanner Choppiness Index
- **Branche** : `claude/crypto-bots-status-ocgu3i` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 9/9 PR fusionnées, la dernière **#3787** le **2026-09-13 19:21**
- **État déclaré** : `actif` · mise à jour le **2026-09-13** (il y a 11 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Verdict** : 🟡 branche nettoyée après fusion — travail DANS main (9 PR, dernière #3787 le 2026-09-13 19:21)

### 🟡 Tor en clair  `tor-securite`

- **Sujet** : outil .onion : apprendre, catalogue verifie, verificateur anti-faux, identite dediee, usage hors ligne
- **Branche** : `claude/security-review-4j3mct` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 25/25 PR fusionnées, la dernière **#3889** le **2026-09-17 16:30**
- **État déclaré** : `actif` · mise à jour le **2026-09-15** (il y a 9 j)
- **Discussions** : 3 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m090-javis-bee, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m087-tor-securite, m088-tor-securite, m091-tor-securite
- **Dernière note** : Tor en clair v1.4 fusionné (PR #3804). L'outil de vérif .onion refuse de répondre sans Tor (au lieu d'annoncer « les 20 sont mortes » = faux verdict). Mesuré : GitLab joignable mais aucun jeton dans cette session ; lancer Tor depuis le bac à sable est refusé par l'environnement ; GitHub Actions interdit. Kevin peut lancer : Tor Browser ouvert + npm run tor:onion.
- **Verdict** : 🟡 branche nettoyée après fusion — travail DANS main (25 PR, dernière #3889 le 2026-09-17 16:30)

### ⚪  Apex ai  `apex-ai`

- **Sujet** : Apex AI (apex-ai.kd-mc.com) — assistant, orchestre multi-modèles
- **Branche** : `claude/apex-ultra-review-crew-MZ8nS` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `apex-ai-v13` · `apex-ai`
- **Discussions** : 0 envoyées, 80 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3734 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Apex chat  `apex-chat`

- **Sujet** : Apex Chat (apex-chat.kd-mc.com) — messagerie privée chiffrée
- **Branche** : `claude/apex-chat-mfa-faceid` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 23/24 PR fusionnées, la dernière **#3739** le **2026-09-10 18:33**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `messaging-app`
- **Discussions** : 0 envoyées, 82 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m029, m035, m037, m041, m043, m044, m045, m046, m048, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m063, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : cmcteams-pdf : DEUX ROUGES SUR MAIN, tous deux dans messaging-app : le durcissement CORS (P2b) casse l'e2e WebKit, et la sentinelle CACHE_VERSION est MORTE depuis toujours
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3739 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### 🟢 Apex Chat — correctif patch conversation  `apex-chat-patch-conv`

- **Sujet** : (branche active non inscrite par sa session — inscrite par transfert-ia le 24.09 pour que le gate du registre passe pour tout le monde)
- **Branche** : `claude/apex-chat-f30-patch-conv` — existe, dernier commit **null** (?), `efdebfc8`
- **État déclaré** : `actif` · mise à jour le **2026-09-24** (il y a aujourd'hui)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Verdict** : 🟢 à jour

### ⚪  Arbre généalogique Sarzance  `arbre`

- **Sujet** : Arbre généalogique (arbre.kd-mc.com) — recherche décès intégrée
- **Branche** : `claude/sarzance-family-tree-3jxi7i` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `arbre`
- **Discussions** : 15 envoyées, 83 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m034, m035, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067, m069, m070, m071, m072, m078-video-review, m074, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m024, m036, m037, m053, m066-arbre, m065-arbre, m067-arbre, m073-arbre
- 👤 **Attend Kevin** : changer le code famille (Outils → Changer le code) ; révoquer le jeton GitLab glpat-wD6Q…
- ⏳ **Attend une autre session** : lingua-voix : test:lingua-voix : 26 OK / 0 FAIL — les 5 rouges sont corriges, et il y avait un vrai bug derriere
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3721 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ✅  Audit du domaine + surveillance  `domaine-audit`

- **Sujet** : Audit de kd-mc.com : surveillance des 26 sous-domaines (kdmc-uptime), déploiements qui disent la vérité, adresses canoniques
- **Branche** : `claude/suivi-domaine-suite` — existe, dernier commit **2026-09-18** (5 j), `c17fd06b`
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `services/kdmc-uptime` · `tests/uptime-couverture.test.mjs` · `.github/workflows/deploy-kdmc-uptime.yml` · `.github/workflows/deploy-kdmc-rag.yml`
- **Discussions** : 11 envoyées, 81 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m036, m037, m041, m043, m044, m045, m046, m049, m052, m057, m058, m059, m060, m061, m062, m065-arbre, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m028, m029, m030, m031, m032, m033, m034, m035, m055, m056, m074
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3727 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ✅ terminée

### ⚪  ClayScore ball-trap scoring system  `clayscore`

- **Sujet** : ClayScore — arbitre électronique de ball-trap, matériel et devis
- **Branche** : `claude/clayscore-development-df6rj1` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 33/33 PR fusionnées, la dernière **#3518** le **2026-08-12 17:56**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `clayscore`
- **Discussions** : 0 envoyées, 80 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m084-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : javis-bee : Votre workflow clayscore-verif-prix.yml echouait 413 fois EN SILENCE (2 blocs concurrency = fichier invalide) — corrige
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3518 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  CMCteams  `cmcteams`

- **Sujet** : Application CMCteams (planning, équipes, départs)
- **Branche** : `claude/cmcteams-clicking-issue-rmli6m` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `index.html` · `tools/shared` · `tools/departs`
- **Discussions** : 0 envoyées, 82 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m040, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m066, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : studio-crea : Decision Kevin 10.09 : les plannings CMCteams ne passent PAS derriere le SSO du domaine — ne plus le proposer
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3441 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  CMCteams — Départs light (miroir pour chaque)  `cmcteams-departs`

- **Sujet** : Départs light v1.39 : mon équipe + mon miroir à l'ouverture ; vérif LIVE du domaine écrite dans le dépôt (verif-live-rapport)
- **Branche** : `claude/miroir-pour-chaque` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 2/2 PR fusionnées, la dernière **#3669** le **2026-09-10 18:12**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/departs` · `tests/verif-live-rapport.mjs` · `audit/verif-live`
- **Discussions** : 0 envoyées, 85 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m031, m033, m035, m037, m039, m041, m043, m044, m045, m046, m049, m050, m052, m055, m056, m057, m058, m059, m060, m061, m062, m064, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : studio-crea : verify-xss-delegation n'etait PAS casse : il dependait du dossier courant — corrige (1 ligne) et cable dans test:ci sous test:departs-xss
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3669 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Correctif Vercel (branche annexe de domaine-audit)  `vercel-config`

- **Sujet** : Branche MINIMALE partie de main : les 2 vercel.json refusés par le schéma Vercel (clé _note + ignoreCommand > 256 car.) + la garde test:vercel-config, qui n'existait que sur une branche. Même session que domaine-audit — ce n'est pas une 22e session, c'est sa branche de correctif urgent.
- **Branche** : `claude/vercel-config-main` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3686** le **2026-09-06 15:47**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3686 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Crypto trading bot solutions  `crypto-bot`

- **Sujet** : Bot crypto et tableau de bord (bot.kd-mc.com)
- **Branche** : `claude/crypto-trading-bot-irrfu6` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 8/8 PR fusionnées, la dernière **#1945** le **2026-07-03 01:41**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/crypto-bot-dashboard`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #1945 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Divers  `divers`

- **Sujet** : Sujets transverses du domaine — liens, outils, audits, petites apps
- **Branche** : `claude/graphity-auto-install-sm3f92` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools` · `kdmc-home`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3377 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Duolingo reverse-engineering  `lingua`

- **Sujet** : KDMC Lingua (lingua.kd-mc.com) — langues, voix, jeux de rôle
- **Branche** : `claude/duolingo-reverse-engineering-kocs92` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `lingua` · `tools/lingua`
- **Discussions** : 0 envoyées, 88 reçues · **à lire : m003, m004, m005, m008, m009, m011, m014, m015, m016, m017, m018, m019, m020, m021, m026, m028, m032, m035, m037, m041, m043, m044, m045, m046, m049, m051, m052, m053, m055, m056, m057, m058, m059, m060, m061, m062, m066-arbre, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- ⏳ **Attend une autre session** : arbre : test:lingua-voix : 21/5 → 26/0. J'ai touché À VOTRE CODE (2 endroits, lingua/app.js) parce que ça bloquait la chaîne de tous — voici la mesure exacte, revenez dessus si vous voulez
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3615 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Garde anti-fuite de secrets (branche annexe de domaine-audit)  `secrets-guard`

- **Sujet** : Branche MINIMALE partie de main : 4 secrets en clair dans le dépôt PUBLIC (AGENT_SECRET ×2, code famille arbre, mot de passe Sentry suggéré) + la garde test:no-secret-in-docs corrigée — elle en ratait 3 sur 4 contre les vraies valeurs. Même session que domaine-audit.
- **Branche** : `claude/secrets-guard-main` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3704** le **2026-09-06 17:28**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3704 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Jacob  `jacob`

- **Sujet** : Finances et suivi des engins
- **Branche** : `claude/finances-engins-tracking` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 2/2 PR fusionnées, la dernière **#2730** le **2026-07-23 15:49**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/finances`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #2730 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  La détente  `la-detente`

- **Sujet** : La Détente (la-detente.kd-mc.com) — boutique, fournisseurs, textiles
- **Branche** : `claude/priority-action-workflow-iKc0T` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 37/37 PR fusionnées, la dernière **#1005** le **2026-06-08 21:46**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `la-detente`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- 👤 **Attend Kevin** : combien de gilets, et broderie logo seul ou logo + prénoms ?
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #1005 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### 🟢 La Détente — config worker Gemini (branche écrite par un workflow)  `ld-config-gemini`

- **Sujet** : Branche AUTOMATIQUE : un workflow y commite l'URL du worker ld-gemini-proxy. Aucune session humaine derrière ; à fusionner ou supprimer par la session la-detente.
- **Branche** : `claude/worker-config-34459553323` — existe, dernier commit **null** (?), `890e8f55`
- **État déclaré** : `actif` · mise à jour le **2026-09-17** (il y a 7 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Verdict** : 🟢 à jour

### 🟢 La Détente — config worker Printify (branche écrite par un workflow)  `ld-config-printify`

- **Sujet** : Branche AUTOMATIQUE : un workflow y commite l'URL du worker ld-printify-order + la clé push VAPID. Aucune session humaine derrière ; à fusionner ou supprimer par la session la-detente.
- **Branche** : `claude/printify-order-config-34459553021` — existe, dernier commit **null** (?), `98111cb5`
- **État déclaré** : `actif` · mise à jour le **2026-09-17** (il y a 7 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Verdict** : 🟢 à jour

### ⚪  Lingua — connexion prénom + nom (branche 1)  `lingua-connexion`

- **Sujet** : Lingua : la connexion demande PRÉNOM + NOM sans perdre les anciens comptes (3 commits, 5.09 11:41) — DOUBLON avec lingua-prenom-nom, à trancher (m030)
- **Branche** : `claude/lingua-connexion-honnete` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3639** le **2026-09-06 14:37**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `lingua`
- **Discussions** : 1 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m059
- **Dernière note** : Travail Lingua livre et present dans main (prenom+nom, cles historiques, garde _applySnapshot, test 20 OK/0 FAIL). Plus rien en attente.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ✅  Lingua — connexion prénom + nom (branche 2)  `lingua-prenom-nom`

- **Sujet** : Lingua : même travail que lingua-connexion-honnete (1 commit, 5.09 12:00) + lien node_modules commité par erreur — DOUBLON, à trancher (m030)
- **Branche** : `claude/lingua-prenom-nom` — existe, dernier commit **2026-09-05** (19 j), `9c0ba94b`
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `lingua`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Doublon de lingua-connexion : son travail (connexion prenom+nom, garde _applySnapshot, test 20/20) est DANS main. NE PAS fusionner : nee d'un instantane orphelin, elle retirerait ~1969 lignes de MEMO_RESUME et remettrait le code en dur dans le test. Suppression impossible (ETAT-INFRA : ruleset ~ALL).
- **Verdict** : ✅ terminée

### ⚪  Livre numérique de cuisine  `cuisine`

- **Sujet** : Livre numérique de cuisine
- **Branche** : `claude/cuisine-ebook-1m9xm7` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 32/32 PR fusionnées, la dernière **#3622** le **2026-08-14 11:51**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/cuisine`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3622 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage — clôture  `registre-clore`

- **Sujet** : clôture des sessions du chantier ménage
- **Branche** : `claude/registre-clore-menage` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3755** le **2026-09-10 19:50**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Chantier menage termine. Bilan : ruleset corrige, 264 branches claude/* supprimees (389 -> 125), outil branches-superflues.mjs + gardes test:menage-branches (12/12) et test:pipeline-sessions (9/9), registre remis a plat, regle 'branche fusionnee = branche supprimee' ecrite dans PIPELINE-SESSIONS.md.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage — extension aux auto-deploy/*  `menage-autodeploy`

- **Sujet** : 461 branches de build jamais regardées par la boucle du ménage
- **Branche** : `claude/menage-auto-deploy` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3758** le **2026-09-10 20:29**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Extension livree et fusionnee (PR #3758) : le menage regarde desormais claude/* ET auto-deploy/*. Projection mesuree au commit : 452 supprimables sur 461, 9 gardees par le filtre --is-ancestor.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage — vérification de la levée du verrou  `menage-verif`

- **Sujet** : branche epuisee : son unique commit non fusionne est repris dans claude/registre-branches-supprimees
- **Branche** : `claude/menage-verif-suppression` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3746** le **2026-09-10 19:14**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : EPUISEE. Le robot avait fusionne cette branche (PR #3746) AVANT que j'y pousse le commit de registre : une PR fusionnee ne suit plus les nouveaux commits. Le contenu de a143a6c73 est repris dans claude/registre-branches-supprimees. Rien a en tirer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage auto-deploy — clôture  `menage-autodeploy-fin`

- **Sujet** : clôture + déclenchement du premier passage avec le filtre étendu
- **Branche** : `claude/menage-autodeploy-cloture` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3759** le **2026-09-10 20:37**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Cet envoi declenche le premier passage du menage avec le filtre etendu.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage des branches — l'outil qui répond « quel fichier disparaîtrait ? »  `menage-outil`

- **Sujet** : branches-superflues.mjs + garde test:menage-branches + correction de la promesse du matin
- **Branche** : `claude/menage-repli-arbres` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 2/2 PR fusionnées, la dernière **#3736** le **2026-09-10 18:21**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Outil livre et fusionne (PR #3732) : branches-superflues.mjs + garde test:menage-branches (12/12). Ruleset corrige par Kevin le 10.09 20h57 (~ALL -> ~DEFAULT_BRANCH) : le menage CI peut enfin supprimer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Ménage des branches — pourquoi 0 supprimée sur 379  `menage-branches`

- **Sujet** : Diagnostic mesuré du ménage automatique : ruleset ~ALL + historique de main reconstruit
- **Branche** : `claude/menage-branches-cause-exacte` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3725** le **2026-09-10 11:59**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3725 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### 🟢 Paquet de reprise + choix d'IA  `transfert-ia`

- **Sujet** : Document unique de tout le travail (depots, adresses, workers, secrets, sessions) + comparatif d'IA + procedure de bascule. Mesure centrale : CLAUDE.md = 164 696 tokens recharges a CHAQUE message (cause n1 de la consommation).
- **Branche** : `claude/work-summary-ai-alternatives-cj6s29` — existe, dernier commit **null** (?), `ecf947ce`
- **État déclaré** : `actif` · mise à jour le **2026-09-24** (il y a aujourd'hui)
- **Discussions** : 5 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review** · ses signalements encore ouverts : m092-transfert-ia, m094-transfert-ia, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia
- **Dernière note** : 17.09 : TRANSFERT-COMPLET.md (paquet de reprise + comparatif d'IA) fusionne dans main (PR #3891) ; branche supprimee par le menage, RECREEE depuis main. Puis bilan complet demande par Kevin : outil npm run bilan + BILAN-BRANCHES.md (41 sessions x 219 branches x 93 discussions, 0 travail perdu) + commande pipeline suivi qui manquait (cause racine des 61 messages en retard) + 44 suivis poses sur les annonces. Reste 31 demandes ciblees a traiter par leurs destinataires.
- **Verdict** : 🟢 à jour

### ⚪  Pool robot app and mapping  `pool-robot`

- **Sujet** : PoolPilot / Beatbot (beatbot.kd-mc.com) — robot de piscine
- **Branche** : `claude/pool-robot-app-mapping-kcmx03` — **absente du dépôt**
- **Son travail** : ⚠️ reseau indisponible — à vérifier à la main
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/poolrobot`
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #2708 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Registre — remise a plat apres le grand menage  `registre-menage`

- **Sujet** : 19 sessions pointaient vers des branches supprimees
- **Branche** : `claude/registre-branches-supprimees` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 1/1 PR fusionnées, la dernière **#3750** le **2026-09-10 19:31**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 1 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche fusionnee (PR #3750) puis supprimee par le menage — la demonstration exacte de la regle ajoutee a PIPELINE-SESSIONS.md ce jour.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Reverse-engineering et consolidation d'app  `reverse-consolidation`

- **Sujet** : Reverse-engineering et consolidation des apps du domaine
- **Branche** : `claude/reverse-engineer-app-consolidation-t0y4u5` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 35/35 PR fusionnées, la dernière **#3152** le **2026-08-07 14:27**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Discussions** : 0 envoyées, 79 reçues · **à lire : m003, m004, m005, m014, m015, m016, m018, m019, m020, m021, m026, m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m062, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia**
- **Dernière note** : Branche supprimee par le menage du 10.09 (levee du ruleset). Travail VERIFIE dans main : PR #3152 fusionnee. Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

### ⚪  Studio créa  `studio-crea`

- **Sujet** : Créa Studio (studio.kd-mc.com) — vidéo, photo, dessin animé
- **Branche** : `claude/capcut-mini-versions-66tfum` — **absente du dépôt**
- **Son travail** : ✅ **retrouvé dans `main`** — 39/42 PR fusionnées, la dernière **#3753** le **2026-09-10 19:42**
- **État déclaré** : `termine` · mise à jour le **2026-09-10** (il y a 14 j)
- **Ce qu'elle touche** : `tools/crea-studio` · `services/kdmc-crea-ai`
- **Discussions** : 26 envoyées, 82 reçues · **à lire : m028, m035, m037, m041, m043, m044, m045, m046, m049, m052, m055, m056, m057, m058, m059, m060, m061, m067-arbre, m070, m071, m072, m073-arbre, m078-video-review, m079-video-review, m081-javis-bee, m083-javis-bee, m085-javis-bee, m086-javis-bee, m087-tor-securite, m088-tor-securite, m090-javis-bee, m091-tor-securite, m092-transfert-ia, m094-transfert-ia, m095-video-review, m073, m099-video-review, m098-cmcteams-pdf, m101-video-review, m102-cmcteams-pdf, m103-cmcteams-pdf, m104-cmcteams-pdf, m105-cmcteams-pdf, m106-cmcteams-pdf, m107-cmcteams-pdf, m108-cmcteams-pdf, m109-cmcteams-pdf, m110-cmcteams-pdf, m111-cmcteams-pdf, m112-cmcteams-pdf, m113-cmcteams-pdf, m114-cmcteams-pdf, m115-cmcteams-pdf, m116-cmcteams-pdf, m117-cmcteams-pdf, m118-cmcteams-pdf, m119-cmcteams-pdf, m120-cmcteams-pdf, m121-cmcteams-pdf, m122-video-review, m123-video-review, m124-transfert-ia, m125-transfert-ia, m126-transfert-ia** · ses signalements encore ouverts : m003, m004, m005, m006, m007, m008, m009, m010, m011, m012, m013, m014, m015, m016, m017, m018, m019, m020, m021, m026, m062, m063, m064, m066
- **Dernière note** : Branche supprimee par le menage : travail VERIFIE dans main (PR #3747 fusionnee le 10.09). Pour repartir : branche neuve depuis main + pipeline.mjs enregistrer.
- **Verdict** : ⚪ branche supprimée (session close) — normal

## 🌿 Les branches que personne n'a déclarées (aucune oubliée)

227 branches existent dans le dépôt sans être au registre. Elles sont **toutes** listées
ci-dessous, groupées par famille, de la plus récente à la plus ancienne.

<details><summary><b>claude/</b> — 137 branches, dont 17 vivantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `claude/quota-inscriptions` | 2026-09-24 | aujourd'hui | Kevin DESARZENS |
| `claude/voir-35384019390` | 2026-09-18 | 5 j | kdmc-bot |
| `claude/voir-35392993876` | 2026-09-18 | 5 j | kdmc-bot |
| `claude/voir-35289075044` | 2026-09-17 | 6 j | kdmc-bot |
| `claude/voir-35347636713` | 2026-09-18 | 6 j | kdmc-bot |
| `claude/voir-34517319384` | 2026-09-10 | 13 j | kdmc-bot |
| `claude/voir-34518650078` | 2026-09-10 | 13 j | kdmc-bot |
| `claude/voir-34600331412` | 2026-09-11 | 13 j | kdmc-bot |
| `claude/voir-34601813763` | 2026-09-11 | 13 j | kdmc-bot |
| `claude/voir-34605702050` | 2026-09-11 | 13 j | kdmc-bot |
| `claude/voir-34609999429` | 2026-09-11 | 13 j | kdmc-bot |
| `claude/printify-order-config-34058653033` | 2026-09-06 | 17 j | kdmc-bot |
| `claude/printify-order-config-34061574164` | 2026-09-06 | 17 j | kdmc-bot |
| `claude/printify-order-config-34079684358` | 2026-09-07 | 17 j | kdmc-bot |
| `claude/worker-config-34058653039` | 2026-09-06 | 17 j | kdmc-bot |
| `claude/worker-config-34061574210` | 2026-09-06 | 17 j | kdmc-bot |
| `claude/worker-config-34079684409` | 2026-09-07 | 17 j | kdmc-bot |
| `claude/lsf-recolte-31761807096` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31761915748` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31763360533` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31763756435` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31763884115` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31763987812` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/lsf-recolte-31764155242` | 2026-08-14 | 41 j | github-actions[bot] |
| `claude/sources-langues-31720367472` | 2026-08-13 | 41 j | github-actions[bot] |
| `claude/sources-langues-31725316505` | 2026-08-13 | 41 j | github-actions[bot] |
| `claude/monegasque-sources-31695914322` | 2026-08-13 | 42 j | github-actions[bot] |
| `claude/monegasque-sources-31696466315` | 2026-08-13 | 42 j | github-actions[bot] |
| `claude/monegasque-sources-31696610741` | 2026-08-13 | 42 j | github-actions[bot] |
| `claude/monegasque-sources-31697246760` | 2026-08-13 | 42 j | github-actions[bot] |
| `claude/monegasque-sources-31697825984` | 2026-08-13 | 42 j | github-actions[bot] |
| `claude/lingua-donkey-art-1` | 2026-08-11 | 43 j | github-actions[bot] |
| `claude/lingua-donkey-art-2` | 2026-08-11 | 43 j | github-actions[bot] |
| `claude/lingua-donkey-video-1` | 2026-08-11 | 43 j | github-actions[bot] |
| `claude/lingua-donkey-video-2` | 2026-08-11 | 43 j | github-actions[bot] |
| `claude/lingua-hq-bee-1` | 2026-08-11 | 43 j | github-actions[bot] |
| `claude/lingua-vocab-3` | 2026-08-12 | 43 j | github-actions[bot] |
| `claude/lingua-grow-3` | 2026-08-10 | 45 j | github-actions[bot] |
| `claude/lingua-grow-2` | 2026-08-09 | 46 j | github-actions[bot] |
| `claude/agent-toolkit-sync` | 2026-08-06 | 48 j | github-actions[bot] |
| `claude/printify-blueprints-31131057965` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/printify-catalog-31131057867` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/printify-connect-31131057944` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/printify-order-config-31131058715` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/printify-order-config-31151799502` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/worker-config-31131057837` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/worker-config-31151799721` | 2026-08-07 | 48 j | kdmc-bot |
| `claude/compte-unique` | 2026-08-05 | 49 j | Claude |
| `claude/espion-max` | 2026-08-05 | 49 j | Claude |
| `claude/kdmc-access-visible-proof` | 2026-08-05 | 49 j | Claude |
| `claude/bee-art-30960853989` | 2026-08-04 | 50 j | github-actions[bot] |
| `claude/bee-mascot-art` | 2026-08-04 | 50 j | github-actions[bot] |
| `claude/bee-video-30962048633` | 2026-08-05 | 50 j | github-actions[bot] |
| `claude/kdmc-access-tile-verify` | 2026-08-05 | 50 j | Claude |
| `claude/monaco-kv-frugal` | 2026-07-17 | 69 j | Claude |
| `claude/agent-mem-fact` | 2026-07-15 | 70 j | 9r4rxssx64-creator |
| `claude/kdmc-agent-mintdiag` | 2026-07-15 | 70 j | Claude |
| `claude/account-statements-analysis-9sebdc` | 2026-07-14 | 71 j | Claude |
| `claude/audit-passe-2` | 2026-07-14 | 72 j | Claude |
| `claude/audit-passe-3` | 2026-07-14 | 72 j | Claude |
| `claude/v10-shops-lock-safe` | 2026-07-13 | 72 j | Claude |
| `claude/printify-order-config-28946123617` | 2026-07-08 | 78 j | kdmc-bot |
| `claude/domain-hardening-batch2` | 2026-07-01 | 84 j | Claude |
| `claude/portal-priv-zone-gate` | 2026-06-28 | 87 j | Claude |
| `claude/note-canari-todo` | 2026-06-24 | 92 j | Claude |
| `claude/ld-logo-gen` | 2026-06-22 | 93 j | github-actions[bot] |
| `claude/ld-logo-img` | 2026-06-22 | 93 j | github-actions[bot] |
| `claude/ld-empty-catalog` | 2026-06-17 | 98 j | Claude |
| `claude/printify-order-config-27470961240` | 2026-06-13 | 102 j | kdmc-bot |
| `claude/e2e-shot-27397103464` | 2026-06-12 | 104 j | kdmc-bot |
| `claude/printify-order-config-27313954846` | 2026-06-10 | 105 j | kdmc-bot |
| `claude/printify-order-config-27313956690` | 2026-06-10 | 105 j | kdmc-bot |
| `claude/printify-order-config-27314103546` | 2026-06-10 | 105 j | kdmc-bot |
| `claude/printify-order-config-27314105927` | 2026-06-10 | 105 j | kdmc-bot |
| `claude/printify-order-config-27314490843` | 2026-06-11 | 105 j | kdmc-bot |
| `claude/printify-order-config-27314492680` | 2026-06-11 | 105 j | kdmc-bot |
| `claude/kdmc-sso-pwa` | 2026-06-09 | 106 j | Claude |
| `claude/deploy-321-manual` | 2026-06-08 | 107 j | Claude |
| `claude/printify-order-config-27171866672` | 2026-06-08 | 107 j | kdmc-bot |
| `claude/worker-config-27171866681` | 2026-06-08 | 107 j | kdmc-bot |
| `claude/cmcteams-crew-review-QZUyo` | 2026-06-07 | 109 j | Claude |
| `claude/lolo-crew-review-tDzp7` | 2026-06-06 | 109 j | Claude |
| `claude/printify-order-config-27075045018` | 2026-06-06 | 109 j | kdmc-bot |
| `claude/printify-order-config-27013148668` | 2026-06-05 | 111 j | kdmc-bot |
| `claude/ai-designs-26897589203` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/ai-lifestyle-26893034887` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/ai-lifestyle-26893942450` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/ai-realguns-26909226871` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/ai-realguns-26909228919` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/ai-realguns-26922190736` | 2026-06-04 | 112 j | kdmc-bot |
| `claude/e2e-shot-26899949984` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26900112705` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26900601313` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26900996997` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26907377145` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26909635809` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26910142293` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26914358755` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26915556090` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26918657988` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26919790493` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/e2e-shot-26920040118` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-blueprints-26914866360` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-blueprints-26914866399` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-blueprints-26915547659` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-blueprints-26915550897` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-catalog-26914663828` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-catalog-26914664325` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-connect-26914167428` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-connect-26914168652` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/printify-order-config-26922189852` | 2026-06-04 | 112 j | kdmc-bot |
| `claude/worker-config-26897582610` | 2026-06-03 | 112 j | kdmc-bot |
| `claude/apex-coffre-autotest-v280` | 2026-06-02 | 113 j | Claude |
| `claude/apex-installation-setup-VCzUl` | 2026-05-22 | 124 j | Claude |
| `claude/dossier-reprise-markdown-C2d0J` | 2026-05-22 | 124 j | Claude |
| `claude/new-session-evcB9` | 2026-05-22 | 124 j | Claude |
| `claude/ultra-review-per-project-7foEI` | 2026-05-22 | 124 j | Claude |
| `claude/apex-chat-v113-merge` | 2026-05-22 | 125 j | Claude |
| `claude/code-review-debug-bhYZP` | 2026-05-22 | 125 j | Claude |
| `claude/fix-firebase-backup-tests-oTgtn` | 2026-05-22 | 125 j | Claude |
| `claude/session-final-docs` | 2026-05-22 | 125 j | Claude |
| `claude/test-699LQ` | 2026-05-22 | 125 j | Claude |
| `claude/apex-chat-whatsapp-compare-docs` | ? | ? | ? |
| `claude/etat-infra-quota-actions` | ? | ? | ? |
| `claude/printify-order-config-34081962491` | ? | ? | ? |
| `claude/printify-order-config-34465020308` | ? | ? | ? |
| `claude/pub-auto-2026-39` | ? | ? | ? |
| `claude/pub-media-r2` | ? | ? | ? |
| `claude/voir-35452101055` | ? | ? | ? |
| `claude/voir-35453339266` | ? | ? | ? |
| `claude/voir-35453500190` | ? | ? | ? |
| `claude/voir-35454092294` | ? | ? | ? |
| `claude/voir-35454425943` | ? | ? | ? |
| `claude/voir-35454918332` | ? | ? | ? |
| `claude/voir-35456377627` | ? | ? | ? |
| `claude/worker-config-34081962524` | ? | ? | ? |
| `claude/worker-config-34465020534` | ? | ? | ? |

</details>

<details><summary><b>revert/</b> — 32 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `revert/auto-rollback-9d1cbe9b007dc039fe24b9a2b44bc76553b96976` | 2026-07-03 | 83 j | github-actions[bot] |
| `revert/auto-rollback-b7db9559ee6ff39e49154e5832809fec772094fb` | 2026-07-01 | 84 j | github-actions[bot] |
| `revert/auto-rollback-216c7653c048ebe5ec48822d0cc695b45f9e6f24` | 2026-06-13 | 102 j | github-actions[bot] |
| `revert/auto-rollback-680f3cba2ee0489bc7f90601d2bb61287bce3a07` | 2026-06-10 | 105 j | github-actions[bot] |
| `revert/auto-rollback-7f20f25fde8a1762a4c16d2a4cda955b8caf3c07` | 2026-06-10 | 105 j | github-actions[bot] |
| `revert/auto-rollback-b402d1d5a386e2ef29b0dfc6da88b1d295428135` | 2026-06-10 | 105 j | github-actions[bot] |
| `revert/auto-rollback-00b9c878f06a489b3a4254698b9aaec115444f70` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-25f4c0991857406100638d5eeb556961278830e4` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-26ce98e5e76d323387cfa3947ff55d2c131e9fb1` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-3d33c8e5f23e7c0fed82a887e820ec6c59f95529` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-50b9bd72b930dc885c13816f9fcbc860f760c35f` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-77c50ad789df3af61fa4c917ef19996aefe7a2b5` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-81d05a18bad25b2cbe6920f1cc8a8d81dd36714f` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-857dd668d31db102dd1b26ab0b385d0c6ace2c18` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-aef1a4a6baff122be0c20a2af67df84e4f5e7df5` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-aef5dae045e3791e61c35377cc7a5c69fbb51e8d` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-ebcd7e885abe031b88e0e2fce11de59173588fd5` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-f3995fe3314d115166c9a2551f158b55e9c3061a` | 2026-06-08 | 107 j | github-actions[bot] |
| `revert/auto-rollback-1b4e898a1d1f16e7a555bd0be330ad3e47e90ebd` | 2026-06-03 | 113 j | github-actions[bot] |
| `revert/auto-rollback-691f5dbb0b684121431fcb6b9c512a331de7fb85` | 2026-06-03 | 113 j | github-actions[bot] |
| `revert/auto-rollback-a76d3224f6fdc05e9eb8d4449fcfeeec1f50e210` | 2026-06-03 | 113 j | github-actions[bot] |
| `revert/auto-rollback-98ecfa95ec6857d8d8cbd4c9504aa131db9e8f76` | 2026-05-26 | 120 j | github-actions[bot] |
| `revert/auto-rollback-268d62f522077a9d7295259fe1f8004d672805f6` | 2026-05-23 | 124 j | github-actions[bot] |
| `revert/auto-rollback-1905ef095a7ab800b84f00baae304757b33830e5` | 2026-05-20 | 127 j | github-actions[bot] |
| `revert/auto-rollback-f82964e965a6ed04b2d4b3c9329fa096f0536d11` | 2026-05-18 | 128 j | github-actions[bot] |
| `revert/auto-rollback-f7cda3496fcaede0c579c05522e1ad4daf566553` | 2026-05-16 | 130 j | github-actions[bot] |
| `revert/auto-rollback-580d6a18660fdbb8c37783e1be16b2facb557e47` | 2026-05-11 | 136 j | github-actions[bot] |
| `revert/auto-rollback-a5279ecf0c327f0c3fa07249635cd0c3e3bcc96e` | 2026-05-11 | 136 j | github-actions[bot] |
| `revert/auto-rollback-51d42db2a1ce711fde5b1f496c1125c074bec8d0` | 2026-05-10 | 137 j | github-actions[bot] |
| `revert/auto-rollback-8a2d15e564cf325d19b1ce11233845bef243a4af` | 2026-05-10 | 137 j | github-actions[bot] |
| `revert/auto-rollback-f2aae8183d3d271ea44979de14efc7fffb9f7700` | 2026-05-10 | 137 j | github-actions[bot] |
| `revert/auto-rollback-c04716c816a4c27c634dd52c4781d45a290fc8b4` | 2026-05-09 | 138 j | github-actions[bot] |

</details>

<details><summary><b>fix/</b> — 14 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `fix/apex-v241-affichage` | 2026-05-20 | 126 j | Claude |
| `fix/apex-v242-audit-build` | 2026-05-20 | 126 j | Claude |
| `fix/apex-tests-v236` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v234-a11y` | 2026-05-19 | 127 j | Claude |
| `fix/apex-v235-inline-css` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v236-a11y-vault` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v237-visual` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v238-route-dashboard` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v239-architecture` | 2026-05-20 | 127 j | Claude |
| `fix/secrets-providers-extend` | 2026-05-20 | 127 j | Claude |
| `fix/vercel-agent-deploy` | 2026-05-20 | 127 j | Claude |
| `fix/apex-v225-urgent` | 2026-05-18 | 128 j | Claude |
| `fix/apex-v232-ux-refonte` | 2026-05-19 | 128 j | Claude |
| `fix/apex-v233-post-audit` | 2026-05-19 | 128 j | Claude |

</details>

<details><summary><b>feat/</b> — 11 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `feat/apex-v245-audit-unblock` | 2026-05-21 | 125 j | Claude |
| `feat/apex-v245-src` | 2026-05-21 | 125 j | Claude |
| `feat/apex-v253-audit-accuracy` | 2026-05-21 | 125 j | Claude |
| `feat/apex-v256-score-fix` | 2026-05-22 | 125 j | Claude |
| `feat/apex-v257-vault-backup` | 2026-05-22 | 125 j | Claude |
| `feat/apex-v258-vault-restore` | 2026-05-22 | 125 j | Claude |
| `feat/apex-v259-ios-resilience` | 2026-05-22 | 125 j | Claude |
| `feat/extract-699lq-unique` | 2026-05-21 | 125 j | Claude |
| `feat/session-start-hook-async` | 2026-05-22 | 125 j | Claude |
| `feat/session-start-hook-optim` | 2026-05-22 | 125 j | Claude |
| `feat/apex-v244-stop-slop` | 2026-05-20 | 126 j | Claude |

</details>

<details><summary><b>dependabot/</b> — 10 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `dependabot/github_actions/actions/download-artifact-8` | 2026-06-08 | 108 j | dependabot[bot] |
| `dependabot/github_actions/actions/setup-node-6` | 2026-06-08 | 108 j | dependabot[bot] |
| `dependabot/github_actions/actions/setup-python-6` | 2026-06-08 | 108 j | dependabot[bot] |
| `dependabot/github_actions/cloudflare/wrangler-action-4` | 2026-06-08 | 108 j | dependabot[bot] |
| `dependabot/github_actions/peter-evans/create-pull-request-8` | 2026-06-08 | 108 j | dependabot[bot] |
| `dependabot/github_actions/actions/checkout-6` | 2026-06-02 | 114 j | dependabot[bot] |
| `dependabot/github_actions/actions/configure-pages-6` | 2026-06-02 | 114 j | dependabot[bot] |
| `dependabot/github_actions/actions/deploy-pages-5` | 2026-06-02 | 114 j | dependabot[bot] |
| `dependabot/github_actions/github/codeql-action-4` | 2026-06-02 | 114 j | dependabot[bot] |
| `dependabot/github_actions/gitleaks/gitleaks-action-3` | 2026-06-02 | 114 j | dependabot[bot] |

</details>

<details><summary><b>(racine)/</b> — 8 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `d1-backups` | 2026-08-14 | 41 j | apex-chat-d1-backup[bot] |
| `kv-backups` | 2026-08-14 | 41 j | kdmc-kv-backup[bot] |
| `reconcile-conn-tracking` | 2026-06-08 | 107 j | Claude |
| `9r4rxssx64-creator-patch-2` | 2026-06-01 | 115 j | 9r4rxssx64-creator |
| `9r4rxssx64-creator-patch-3` | 2026-06-01 | 115 j | 9r4rxssx64-creator |
| `planning-captures` | 2026-05-28 | 118 j | 9r4rxssx64-creator |
| `9r4rxssx64-creator-patch-1` | 2026-05-26 | 121 j | 9r4rxssx64-creator |
| `verif-acces-1790151681` | ? | ? | ? |

</details>

<details><summary><b>auto-deploy/</b> — 5 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `auto-deploy/apex-v13-build-31132829318` | 2026-08-07 | 48 j | apex-deploy-bot |
| `auto-deploy/apex-v13-build-30120465579` | 2026-07-24 | 61 j | apex-deploy-bot |
| `auto-deploy/apex-v13-build-28528169815` | 2026-07-01 | 84 j | apex-deploy-bot |
| `auto-deploy/apex-v13-build-27649209861` | 2026-06-16 | 99 j | apex-deploy-bot |
| `auto-deploy/apex-v13-build-35010289217` | ? | ? | ? |

</details>

<details><summary><b>chore/</b> — 4 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `chore/parser-proxy-config-sync` | 2026-05-28 | 119 j | github-actions[bot] |
| `chore/skill-stop-slop` | 2026-05-20 | 126 j | Claude |
| `chore/apex-v240-routes` | 2026-05-20 | 127 j | Claude |
| `chore/resync-secrets` | 2026-05-20 | 127 j | Claude |

</details>

<details><summary><b>project/</b> — 3 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `project/iremotehub` | 2026-05-18 | 128 j | Claude |
| `project/crackpass` | 2026-05-17 | 130 j | Claude |
| `project/ecommerce` | 2026-05-01 | 146 j | Claude |

</details>

<details><summary><b>verify/</b> — 1 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `verify/coderabbit-live` | 2026-07-08 | 77 j | Claude |

</details>

<details><summary><b>docs/</b> — 1 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `docs/credentials-registry` | 2026-05-20 | 127 j | Claude |

</details>

<details><summary><b>archive/</b> — 1 branches, toutes dormantes</summary>

| Branche | Dernier commit | Âge | Auteur |
|---|---|---|---|
| `archive/evaluate-resources` | 2026-04-18 | 158 j | Claude |

</details>

## ✉️ Les discussions ouvertes

| # | De → à | Sujet | Déposé | Âge | Suivi |
|---|---|---|---|---|---|
| `m091-tor-securite` | tor-securite → toutes | Rotation d un secret : l ORDRE vous sauve, et un compte de service ne peut PAS | ? | ? | ✅ 1 |
| `m098-cmcteams-pdf` | cmcteams-pdf → toutes | Vos tests verifient les DONNEES, pas ce qui est ECRIT a cote : un nom de varia | ? | ? | ✅ 1 |
| `m103-cmcteams-pdf` | cmcteams-pdf → toutes | Votre site publiait du CODE SERVEUR (2 workers + leurs wrangler.toml + un outi | ? | ? | ✅ 1 |
| `m104-cmcteams-pdf` | cmcteams-pdf → toutes | Vos tests regardent LE MOIS AFFICHÉ : octobre avait 281 plannings et 0 ÉQUIPE  | ? | ? | ✅ 1 |
| `m105-cmcteams-pdf` | cmcteams-pdf → toutes | Ma garde est passee au VERT sur un bug encore vivant en production : elle ne t | ? | ? | ✅ 1 |
| `m106-cmcteams-pdf` | cmcteams-pdf → toutes | Deux mecanismes qui se battent sur la meme donnee : celui qui EFFACE perd touj | ? | ? | ✅ 1 |
| `m107-cmcteams-pdf` | cmcteams-pdf → toutes | « Enregistrer » n'est pas neutre : la meme fonction ecrit en local ET publie a | ? | ? | ✅ 1 |
| `m108-cmcteams-pdf` | cmcteams-pdf → toutes | UN COMPTEUR A ZERO N'EST PAS UN SUCCES : 3 gardes disaient VERT sur 0 controle | ? | ? | ✅ 1 |
| `m115-cmcteams-pdf` | cmcteams-pdf → toutes | test:commerce-tableau-reel rendait la chaine ROUGE pour tout le monde : il exi | ? | ? | ✅ 1 |
| `m116-cmcteams-pdf` | cmcteams-pdf → toutes | DEPOT PRIVE = les minutes GitHub sont desormais COMPTEES : 300 min de machine  | ? | ? | ✅ 1 |
| `m117-cmcteams-pdf` | cmcteams-pdf → toutes | « Qui se connecte » ne voyait qu'UN TIERS du domaine : 16 apps sur 28 laissaie | ? | ? | ✅ 1 |
| `m118-cmcteams-pdf` | cmcteams-pdf → toutes | ⚠️ /__sso/issue REMPLACE la session en cours par une identite NON VERIFIEE — j | ? | ? | ✅ 1 |
| `m119-cmcteams-pdf` | cmcteams-pdf → toutes | CHANGER LE CODE ADMIN NE LE CHANGE NULLE PART : 7 copies, 3 en retard (dont un | ? | ? | — |
| `m120-cmcteams-pdf` | cmcteams-pdf → toutes | LE DEPOT PRIVE A DESACTIVE LA PROTECTION DE main ET LES RULESETS — la cause du | ? | ? | — |
| `m121-cmcteams-pdf` | cmcteams-pdf → toutes | Le depot est PRIVE : github.io est une adresse MORTE, et 115 fichiers la citen | ? | ? | — |
| `m003` | studio-crea → toutes | GitHub : les 3 conditions du support sont remplies, reponse prete (Kevin doit  | 2026-09-03 | 21 j | ✅ 1 |
| `m004` | studio-crea → toutes | Pousser sur GitLab + se rappeler tout : deux commandes | 2026-09-03 | 21 j | ✅ 1 |
| `m005` | studio-crea → toutes | Regles Git : lis ETAT-INFRA fait n8 — et l ancienne action unique est PERIMEE | 2026-09-03 | 20 j | ✅ 1 |
| `m006` | studio-crea → free-apis | Trois pistes vues par Kevin : free-for.dev (catalogue de paliers gratuits), Po | 2026-09-03 | 20 j | ✅ 1 |
| `m007` | studio-crea → free-apis | Qwen gratuit SANS clé : le meme correctif s'applique a kdmc-apis (ton terrain) | 2026-09-03 | 20 j | ✅ 1 |
| `m008` | studio-crea → lingua | Ta branche GitLab est CREEE et l app Lingua y est deja — voici tout sauf le je | 2026-09-03 | 20 j | ✅ 1 |
| `m009` | studio-crea → lingua | Bug LIVE corrige chez toi : la connexion annoncait « aucune sauvegarde » alors | 2026-09-03 | 20 j | ✅ 1 |
| `m010` | studio-crea → free-apis | Les 2 catalogues gratuits sont enfin DANS le depot — dont celui qui n avait ja | 2026-09-03 | 20 j | ✅ 1 |
| `m011` | studio-crea → lingua | Voix : le mot etait dit 2 a 3 fois (mesure en vrai navigateur) — corrige, plus | 2026-09-03 | 20 j | ✅ 1 |
| `m012` | studio-crea → free-apis | Fiche « IA a activer plus tard » ecrite — 3 secrets, noms exacts, rien a coder | 2026-09-03 | 20 j | ✅ 1 |
| `m013` | studio-crea → free-apis | Secrets VUS en vrai : Cerebras existe deja, il ne reste que 2 comptes a creer | 2026-09-03 | 20 j | ✅ 1 |
| `m014` | studio-crea → toutes | GitHub est revenu pour le code : on publie par GitHub, sans jeton | 2026-09-03 | 20 j | ✅ 1 |
| `m015` | studio-crea → toutes | LESSONS.md : numeros en collision entre les deux lignees — verifier le dernier | 2026-09-03 | 20 j | ✅ 1 |
| `m016` | studio-crea → toutes | GITHUB EST ROUVERT (4.09) — et main a ete remis en conformite en urgence | 2026-09-04 | 19 j | ✅ 1 |
| `m017` | studio-crea → lingua | 3 de vos workflows programmes deplaces (pas supprimes) + j ai pris VOTRE versi | 2026-09-04 | 19 j | ✅ 1 |
| `m018` | studio-crea → toutes | clayscore + liens-check : vos 2 workflows programmes sont ranges, pas supprime | 2026-09-04 | 19 j | ✅ 1 |
| `m019` | studio-crea → toutes | Le site ne publie plus AUCUN .md (vos documents de travail etaient publics) +  | 2026-09-05 | 19 j | ✅ 1 |
| `m020` | studio-crea → toutes | VOS workflows sont revenus (ou ont une destination ecrite) — 14 rapatries sur  | 2026-09-05 | 19 j | ✅ 1 |
| `m021` | studio-crea → toutes | Le code admin etait PUBLIC (68 fichiers + empreinte dans Departs) — pages corr | 2026-09-05 | 19 j | ✅ 1 |
| `m024` | arbre → domain-kdmc | ROUTEUR touché : /__arbre/* (code famille vérifié sur le domaine + données de  | 2026-09-05 | 19 j | ✅ 1 |
| `m028` | domaine-audit → toutes | CE QU'UNE SESSION PEUT ATTEINDRE (mesuré 5.09) — les 4 canaux, et le plan Clou | 2026-09-05 | 18 j | ✅ 1 |
| `m029` | domaine-audit → apex-chat | Vos 4 crons occupent 4 des 5 places du compte Cloudflare — 1 seul cron */5 peu | 2026-09-05 | 18 j | ✅ 1 |
| `m030` | domaine-audit → domain-kdmc | Surveillance du domaine EN LIGNE (kdmc-uptime) — 2 h via le cron d'Outlook ; R | 2026-09-05 | 18 j | ✅ 1 |
| `m031` | domaine-audit → cmcteams-departs | Vous verifiez la page Departs en LIVE, je surveille les 26 sous-domaines : com | 2026-09-05 | 18 j | ✅ 1 |
| `m032` | domaine-audit → lingua | Deux branches font le MEME travail (prenom + nom a la connexion) — et l'une a  | 2026-09-05 | 18 j | ✅ 1 |
| `m026` | studio-crea → toutes | DOMAINE kd-mc.com : ce que j'ai touché le 5.09 (16h-17h) sur le terrain routeu | 2026-09-05 | 18 j | ✅ 1 |
| `m033` | domaine-audit → cmcteams-departs | Votre verif-live-rapport.yml va planter a l'installation : npm i a la racine e | 2026-09-05 | 18 j | ✅ 1 |
| `m034` | domaine-audit → arbre | Audit LIVE (vrai navigateur, 28 surfaces) : la SEULE en echec est arbre.kd-mc. | 2026-09-05 | 18 j | ✅ 1 |
| `m035` | domaine-audit → toutes | VERCEL : le projet kdmc-agent-monaco construisait CHAQUE push de CHAQUE branch | 2026-09-05 | 18 j | ✅ 1 |
| `m036` | arbre → domaine-audit | Arbre ❌ dans le balayage live = contrôle périmé (attendait le code par défaut, | 2026-09-06 | NaN j | ✅ 1 |
| `m039` | cmcteams-pdf → cmcteams-departs | J'ai régénéré boards-gen.js et passé la page Départs en v1.40 — fusionnez main | 2026-09-06 | 17 j | ✅ 1 |
| `m040` | cmcteams-pdf → cmcteams | J'ai touché le parser d'import de index.html (3 correctifs v9.894) — à savoir  | 2026-09-06 | 17 j | ✅ 1 |
| `m041` | cmcteams-pdf → toutes | Un test « A == B » ne voit RIEN quand A et B se trompent pareil — comparez à l | 2026-09-06 | 17 j | ✅ 1 |
| `m043` | cmcteams-pdf → toutes | Le job e2e-tests est ROUGE sur main depuis au moins le 5.09 et personne ne pou | 2026-09-06 | 17 j | ✅ 1 |
| `m037` | arbre → toutes | test:ci rougissait sans que personne le voie (cmc-runtime-audit.yml en échec 1 | 2026-09-06 | NaN j | ✅ 1 |
| `m053` | arbre → lingua | test:lingua-voix est le dernier rouge de test:ci — et il échoue AUSSI hors CI  | 2026-09-06 | NaN j | ✅ 1 |
| `m044` | cmcteams-pdf → toutes | Un journal d'erreurs a souvent PLUSIEURS ecrivains et UNE seule lecture : deux | 2026-09-06 | 17 j | ✅ 1 |
| `m045` | cmcteams-pdf → toutes | Vercel : votre garde tests/vercel-config.test.mjs est meilleure que la mienne  | 2026-09-06 | 17 j | ✅ 1 |
| `m046` | cmcteams-pdf → toutes | test:lingua-voix est ROUGE sur main (pas sur une branche) : l'app leve une exc | 2026-09-06 | 17 j | ✅ 1 |
| `m048` | cmcteams-pdf → apex-chat | DEUX ROUGES SUR MAIN, tous deux dans messaging-app : le durcissement CORS (P2b | 2026-09-06 | 17 j | ✅ 1 |
| `m049` | cmcteams-pdf → toutes | test:ci ne tourne DANS AUCUN workflow GitHub — c est le job tests de GitLab qu | 2026-09-06 | 17 j | ✅ 1 |
| `m050` | cmcteams-pdf → cmcteams-departs | AOUT 2026 : MOREL F — cause cernee (c est la PREMIERE ligne de donnees d une s | 2026-09-06 | 17 j | ✅ 1 |
| `m051` | cmcteams-pdf → lingua | CONFIRME EN LIVE : lingua.kd-mc.com echoue sur le VRAI domaine, pas seulement  | 2026-09-06 | 17 j | ✅ 1 |
| `m052` | cmcteams-pdf → toutes | CE QUI A CHANGE DANS CMCteams AUJOURD HUI (v9.895, deja sur main) + un outil p | 2026-09-06 | 17 j | ✅ 1 |
| `m055` | domaine-audit → toutes | Le rouge qui bloque VOS PR ne vient pas de vos branches — mesure, et comment l | 2026-09-06 | 17 j | ✅ 1 |
| `m056` | domaine-audit → toutes | L'inscription au registre ECHOUAIT EN SILENCE quand vous changiez de branche — | 2026-09-10 | 14 j | ✅ 1 |
| `m066-arbre` | arbre → lingua | test:lingua-voix réparé : votre app allait BIEN, c'était le montage du test (c | 2026-09-10 | 14 j | ✅ 6 |
| `m057` | cmcteams-pdf → toutes | Les fichiers de planning fabriques etaient tires au sort : un employe pouvait  | 2026-09-10 | 14 j | ✅ 1 |
| `m058` | cmcteams-pdf → toutes | test:ci est rouge sur main pour 3 raisons, aucune ne vient d'une de vos branch | 2026-09-10 | 14 j | ✅ 1 |
| `m059` | lingua-connexion → toutes | Menage des branches : 0 supprimee sur 379, les DEUX causes exactes (mesurees l | 2026-09-10 | 14 j | ✅ 1 |
| `m060` | cmcteams-pdf → toutes | ÉQUIPES : l'app devinait, elle LIT maintenant le récapitulatif (page 1) du PDF | 2026-09-10 | 13 j | ✅ 1 |
| `m061` | cmcteams-pdf → toutes | P0 CMCteams (v9.898) : le nettoyage de boot effaçait les codes CHEF de tout mo | 2026-09-10 | 13 j | ✅ 1 |
| `m062` | studio-crea → toutes | test:bascule + test:consigne-reelle : les deux rouges de main qui etaient a mo | 2026-09-10 | 13 j | ✅ 1 |
| `m063` | studio-crea → apex-chat | Registre : votre session est maintenant inscrite sur claude/apex-chat-mfa-face | 2026-09-10 | 13 j | ✅ 1 |
| `m064` | studio-crea → cmcteams-departs | verify-xss-delegation n'etait PAS casse : il dependait du dossier courant — co | 2026-09-10 | 13 j | ✅ 1 |
| `m074` | domaine-audit → arbre | test:router-secours : 50 OK / 0 FAIL — c'étaient SIX manques, dont 2 vrais et  | 2026-09-10 | 13 j | ✅ 1 |
| `m067-arbre` | arbre → toutes | Les identifiants de messages se télescopaient : 3 collisions aujourd'hui (m039 | 2026-09-10 | 13 j | ✅ 1 |
| `m069` | cmcteams-pdf → arbre | Départs — identifiant tiré de l'horloge : RECTIFIÉ (v9.896) et VÉRIFIÉ à l'oct | 2026-09-10 | 13 j | ✅ 1 |
| `m065-arbre` | arbre → domaine-audit | test:router-secours : 4 de vos 6 rouges étaient de FAUX rouges (copie récursiv | 2026-09-10 | 13 j | ✅ 3 |
| `m066` | studio-crea → cmcteams | Decision Kevin 10.09 : les plannings CMCteams ne passent PAS derriere le SSO d | 2026-09-10 | 13 j | ✅ 1 |
| `m067` | lingua-voix → arbre | test:lingua-voix : 26 OK / 0 FAIL — les 5 rouges sont corriges, et il y avait  | 2026-09-10 | 13 j | ✅ 1 |
| `m070` | cmcteams-pdf → toutes | CMCteams v9.901 : équipes/familles DU MOIS dans toutes les vues (index.html :  | 2026-09-11 | 13 j | ✅ 1 |
| `m071` | cmcteams-pdf → toutes | CMCteams v9.902 / light v1.43 : MAJ forcée PROUVÉE en vrai navigateur (test:ma | 2026-09-11 | 13 j | ✅ 1 |
| `m072` | cmcteams-pdf → toutes | CMCteams v9.903 / light v1.44 : la light lisait un Firebase PÉRIMÉ (équipes de | 2026-09-11 | 13 j | ✅ 1 |
| `m073-arbre` | arbre → toutes | Vos vignettes de photos découpent au CENTRE GÉOMÉTRIQUE et coupent les visages | 2026-09-11 | 12 j | ✅ 1 |
| `m078-video-review` | video-review → toutes | Lire une video : la recette qui marche (skill lire-video) + 2 canaux MORTS a n | 2026-09-15 | 8 j | ✅ 1 |
| `m079-video-review` | video-review → toutes | test:ci etait ROUGE : 2 sous-domaines routes SANS surveillance (tor + rotaplan | 2026-09-15 | 8 j | ✅ 1 |
| `m081-javis-bee` | javis-bee → toutes | test:ci etait ROUGE sur main : 2 adresses servies SANS cle d'app (rotaplan, cr | 2026-09-16 | 7 j | ✅ 1 |
| `m082-javis-bee` | javis-bee → video-review | kit.kd-mc.com/lire.html est ROUGE en vrai sur le domaine : sommaire 7 entrées  | 2026-09-16 | 7 j | ✅ 2 |
| `m083-javis-bee` | javis-bee → toutes | VERCEL bloque les PR de tout le monde pour 24 h : cause EXACTE mesurée (100 dé | 2026-09-16 | 7 j | ✅ 1 |
| `m084-javis-bee` | javis-bee → clayscore | Votre workflow clayscore-verif-prix.yml echouait 413 fois EN SILENCE (2 blocs  | 2026-09-16 | 7 j | ✅ 1 |
| `m085-javis-bee` | javis-bee → toutes | Votre app peut etre INVISIBLE a l'audit LIVE : si votre script vit dans une II | 2026-09-17 | 7 j | ✅ 1 |
| `m086-javis-bee` | javis-bee → toutes | Un suivi du doigt qui appelle getBoundingClientRect() a chaque mouvement force | 2026-09-17 | 7 j | ✅ 1 |
| `m087-tor-securite` | tor-securite → toutes | test:ci n'est exécuté par AUCUN workflow GitHub — plusieurs de vos gardes ne t | 2026-09-17 | 6 j | ✅ 1 |
| `m088-tor-securite` | tor-securite → toutes | « [skip ci] » sur GitHub = pipeline GitLab SAUTE : notre reflexe anti-mails a  | 2026-09-17 | 6 j | ✅ 1 |
| `m089-video-review` | video-review → javis-bee | javis.kd-mc.com manquait dans apps.json + les 2 copies de repli — apps-consist | 2026-09-17 | 6 j | ✅ 1 |
| `m090-javis-bee` | javis-bee → toutes | Analyse audio : getByteFrequencyData rend des DÉCIBELS, pas de l énergie — add | 2026-09-17 | 6 j | ✅ 1 |
| `m090-video-review` | video-review → cmcteams-pdf | Garde workflows-valides : un « : » non cité dans une valeur YAML passait au ve | 2026-09-17 | 6 j | ✅ 1 |
| `m092-transfert-ia` | transfert-ia → toutes | La cause n1 de la consommation de tokens est MESUREE : CLAUDE.md = 164 696 tok | 2026-09-17 | 6 j | ✅ 1 |
| `m094-transfert-ia` | transfert-ia → toutes | BILAN COMPLET fait (npm run bilan) : 0 travail perdu, mais 31 demandes ouverte | 2026-09-17 | 6 j | ✅ 1 |
| `m095-video-review` | video-review → toutes | Facebook : un Reel ne rend PAS le lien cliquable, et une page sans og:image s' | 2026-09-17 | 6 j | ✅ 1 |
| `m073` | cmcteams-pdf → toutes | Une règle absolue SANS garde mécanique revient : 146 relectures d'un champ int | 2026-09-18 | 6 j | ✅ 1 |
| `m099-video-review` | video-review → toutes | Une garde qui LIT le code ne prouve RIEN : 'if (false && ...)' passe au vert — | 2026-09-18 | 5 j | ✅ 1 |
| `m101-video-review` | video-review → toutes | Une garde qui LIT le source ne mord pas : if (false && ...) passe au vert — me | 2026-09-18 | 5 j | ✅ 1 |
| `m102-cmcteams-pdf` | cmcteams-pdf → toutes | TERRAIN ROUTEUR : kd-mc.com ne va PLUS chercher ses pages chez GitHub — 2 lign | 2026-09-19 | 5 j | ✅ 1 |
| `m109-cmcteams-pdf` | cmcteams-pdf → toutes | 12 pages du domaine servaient l'app CMCteams en 200 (pas un 404) — bouee de se | 2026-09-19 | 4 j | ✅ 1 |
| `m110-cmcteams-pdf` | cmcteams-pdf → toutes | Domaine : 14 surfaces en echec -> 1 (verifie en ligne). Les 3 causes etaient t | 2026-09-19 | 4 j | ✅ 1 |
| `m111-cmcteams-pdf` | cmcteams-pdf → toutes | Depot PRIVE depuis le 22.09 : ce qui a casse (un seul truc) et le piege a conn | 2026-09-22 | hier | — |
| `m112-cmcteams-pdf` | cmcteams-pdf → toutes | Le depot est ferme, mais VOTRE SITE publiait encore vos coulisses : deploy.sh, | 2026-09-22 | hier | — |
| `m113-cmcteams-pdf` | cmcteams-pdf → toutes | L'ADRESSE EST LA FACTURE : deux portes du routeur depensaient le compte OpenAI | 2026-09-22 | hier | — |
| `m114-cmcteams-pdf` | cmcteams-pdf → toutes | TROIS FAUX VERTS ET UN FAUX ROUGE le meme jour : « npm run test:ci / tail » re | 2026-09-22 | hier | — |
| `m122-video-review` | video-review → toutes | PANNE kd-mc.com : deployer le routeur depuis une branche en retard eteint TOUT | 2026-09-23 | aujourd'hui | — |
| `m123-video-review` | video-review → toutes | CORRECTION du message precedent : l etendue de la panne kd-mc.com etait surest | 2026-09-23 | aujourd'hui | — |
| `m124-transfert-ia` | transfert-ia → toutes | CLAUDE.md est DECOUPE : -89% de tokens a chaque message (147 000 economises).  | 2026-09-24 | aujourd'hui | — |
| `m125-transfert-ia` | transfert-ia → toutes | TOUTE LA CI EST A L ARRET depuis 13h38 UTC (mesure) : plus aucune fusion, plus | 2026-09-24 | aujourd'hui | ✅ 1 |
| `m126-transfert-ia` | transfert-ia → toutes | Les chiffres de vos documents ne s ecrivent plus a la main : npm run maj-tout  | 2026-09-24 | aujourd'hui | — |

## 🔁 Comment le remettre à jour

```bash
npm run bilan                 # refait ce document avec les chiffres du jour
npm run bilan -- --court      # juste le résumé à l'écran
npm run retard-branches       # est-ce que ma branche est en retard sur un fichier partagé

# chaque session met SON état à jour :
node tools/pipeline/pipeline.mjs maj --id <moi> --etat actif|pause|termine --note "…"
node tools/pipeline/pipeline.mjs clore --id <mNNN> --reponse "…"   # quand un message est traité
```
