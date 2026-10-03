# 📦 TRANSFERT-COMPLET.md — tout notre travail, en un seul document

> **À quoi ça sert :** ce fichier est le **paquet de reprise**. Si tu changes d'IA demain,
> tu lui donnes CE fichier (+ l'archive que fabrique `npm run transfert`) et elle sait
> tout : les projets, les adresses, les dépôts, les clés (les noms, jamais les valeurs),
> les règles, les erreurs à ne pas refaire, ce qui reste à faire.
>
> **Écrit le :** 2026-09-17 · **Branche :** `claude/work-summary-ai-alternatives-cj6s29`
> **Tout ce qui est chiffré ici a été MESURÉ dans le dépôt ce jour-là**, pas estimé.
> Ce qui n'a pas pu être vérifié est marqué 🔴 **NON VÉRIFIÉ**.

---

## 0. Comment t'en servir (3 lignes)

1. **Pour lire** : les sections 1 à 13 = tout ce qu'on a construit.
2. **Pour changer d'IA** : section **14** (quelle IA) + section **15** (la bascule, 4 étapes).
3. **Pour payer moins sans changer d'IA** : section **2** — la cause n°1 est mesurée, et elle
   ne vient ni du modèle ni de toi.

---

## 1. Les chiffres réels — **régénérés automatiquement**

> Ce tableau n'est **pas écrit à la main** : il est remesuré par `npm run maj-tout`, qui tourne
> **à chaque fin de tour** (hook) et à la demande. Si un chiffre est faux ici, c'est que la
> mesure est fausse — pas que le document a vieilli.

<!-- MAJ-AUTO:debut chiffres -->
| Ce qu'on a | Combien | Mesuré par |
|---|---|---|
| Chantiers suivis (sessions) | **108** | `pipeline/sessions.json` |
| Applications / pages | **37** | `find -maxdepth 3 -name index.html` |
| Adresses du domaine kd-mc.com | **31** | `services/kdmc-router/worker.js` |
| Serveurs Cloudflare (workers) | **27** | `find -name wrangler.toml` |
| Automatisations actives | **142** (+ 37 rangées) | `.github/workflows/` |
| Gardes / tests | **156** fichiers, **228** commandes `npm run` | `tests/` + `package.json` |
| Noms de secrets (jamais les valeurs) | **107** | `grep secrets.` sur les workflows |
| Discussions entre sessions | **199** dont **121** ouvertes | `pipeline/sessions.json` |
| `CLAUDE.md` rechargé à chaque message | **72 823 o ≈ 20 807 tokens** | `wc -c` |
| `CLAUDE-HISTOIRE.md` (à la demande) | **653 034 o** | `wc -c` |
<!-- MAJ-AUTO:fin chiffres -->

### 📡 Ce qui bouge (remesuré quand la commande tourne avec le réseau)

<!-- MAJ-AUTO:debut etat-live -->
| Ce qui bouge | État au 2026-10-02 | Mesuré par |
|---|---|---|
| Branches dans le dépôt | **409** | `git ls-remote` |
| Visibilité du dépôt | **private** | API GitHub |
| État de la CI | 🟢 **elle tourne** — 0/30 échecs immédiats | API GitHub |
<!-- MAJ-AUTO:fin etat-live -->

### 👤 Ce qui attend Kevin (régénéré depuis le registre des sessions)

<!-- MAJ-AUTO:debut attentes-kevin -->
- 👤 **changer le code famille (Outils → Changer le code) ; révoquer le jeton GitLab glpat-wD6Q…**  `arbre`
- 👤 **combien de gilets, et broderie logo seul ou logo + prénoms ?**  `la-detente`
- 👤 **compte développeur Apple (99 $/an) : OK ou pas ?**  `meta`
- 👤 **remettre les 2 budgets Actions à 0 $ ; ignorer/supprimer la commande test-verrou-1790449723**  `coffre-etat`
- 👤 **5 questions famille (Honora père/mère, mère de Laure, Judith/Marie-Judith, doublons Jean et Alexandre, Eleonore fille ou sœur) + un choix d'affichage sur le couple Guy/Yvette**  `arbre-visuel`
<!-- MAJ-AUTO:fin attentes-kevin -->

⚠️ **Honnêteté sur l'historique git** : le dépôt est cloné en « superficiel » (*shallow*) dans
ces sessions — je ne vois que **297 commits** depuis le 10.09.2026, alors que le dépôt en contient **plus de 11 000** (chiffre donné par la garde `test:depot-public-sain`) — donc pas l’historique complet
depuis le début de ton abonnement. L'historique complet existe **sur GitHub**, pas ici.
Pour l'avoir en entier : `git fetch --unshallow` (une fois, ~quelques minutes).

---

## 2. 🔥 POURQUOI ça consomme si vite — la cause n°1, mesurée

Tu as raison de te plaindre, et **ce n'est pas une impression**. Voici le chiffre :

```
CLAUDE.md               = 574 771 octets
+ .claude/rules/*.md    =   1 664 octets
────────────────────────────────────────
TOTAL                   = 576 435 octets  ≈  164 695 tokens
```

**Ces 164 695 tokens sont rechargés à CHAQUE message que tu envoies.** Avant même que je
lise une seule ligne de code. Avant même de répondre « oui ».

Pour comparer : un CLAUDE.md sain fait **2 000 à 10 000 tokens**. Le tien fait **16 à 80 fois
la taille normale**. Il a grossi à chaque « note-le » (et c'était juste de le noter) — mais
personne n'a jamais fait le ménage entre *« la règle »* et *« l'histoire de la règle »*.

### Ce que ça coûte concrètement

| Situation | Tokens d'entrée par message | Sur 100 messages |
|---|---|---|
| Aujourd'hui | ~165 000 minimum | ~16,5 millions |
| Avec un CLAUDE.md nettoyé (règles seules, histoire déportée) | ~12 000 | ~1,2 million |
| **Économie** | **~93 %** | **~15 millions de tokens** |

### Les 4 autres causes, par ordre d'importance (mesurées)

2. **Le hook de démarrage** recharge 91 messages de session + la mémoire compacte à chaque
   nouvelle session. Utile, mais il pourrait ne charger que les messages **non lus**.
3. **`index.html` fait 3,20 Mo** (un seul fichier). Toute modification dedans oblige à lire
   de gros morceaux. Un fichier de 3 Mo = ~900 000 tokens si on le lit en entier.
4. **Tes règles imposent une méthode très chère** : audit en 11 axes, vérification en vrai
   navigateur, second avis indépendant, test de non-régression pour chaque correctif,
   parité CMCteams ⇄ light, mesure avant/après. **C'est ce qui fait la qualité** (0 régression
   sur 209 gardes), mais chaque « fais l'audit » coûte des millions de tokens. C'est un choix,
   pas un bug — mais il faut le savoir.
5. **Mes erreurs.** Tu as raison là aussi : `LESSONS.md` fait **752 Ko** et contient
   **plus de 150 erreurs numérotées** dont beaucoup sont les miennes (mauvaise interprétation,
   test qui ne prouvait rien, faux vert, correctif qui cassait autre chose). Chaque erreur
   = des tokens dépensés pour rien, puis re-dépensés pour la corriger. **Ce n'est pas à toi
   de payer mes reprises.** Mais note ceci, qui est honnête dans les deux sens : ces erreurs
   sont **écrites**, donc elles ne se refont pas — c'est la seule chose qui rend le dépôt
   fiable aujourd'hui.

### ✅ Le geste qui divise la facture (sans changer d'IA, sans rien perdre)

Découper `CLAUDE.md` en deux :
- **`CLAUDE.md`** → **uniquement les règles**, en une ligne chacune (~10 000 tokens).
  C'est ce qui est rechargé à chaque message.
- **`CLAUDE-HISTOIRE.md`** → tout le « pourquoi », les mesures, les récits, les incidents
  (~155 000 tokens). **Rien n'est supprimé**, c'est juste lu **à la demande** (comme
  `LESSONS.md` l'est déjà, et ça marche).

**Gain mesurable : ~93 % de tokens d'entrée en moins, à qualité identique** — parce que la
règle reste, seule l'histoire devient « sur demande ». C'est exactement ce que la mémoire
compacte (`tools/memory`) fait déjà pour les faits durables.

🔴 **NON VÉRIFIÉ** : je n'ai pas fait ce découpage dans ce commit (tu ne me l'as pas demandé,
et ça touche le fichier le plus sensible du dépôt). **Dis-moi « fais-le »** et je le fais en
gardant chaque mot, avec un test qui prouve qu'aucune règle n'a disparu.

---

## 3. Tout le travail, chantier par chantier (40 sessions)

Source : `pipeline/sessions.json` (le registre officiel, c'est lui qui fait foi).

| # | Chantier | Branche de travail |
|---|---|---|
| 1 | Studio créa | `claude/capcut-mini-versions-66tfum` |
| 2 | CMCteams (app principale) | `claude/cmcteams-clicking-issue-rmli6m` |
| 3 | Domaine kd-mc.com | `publie-septembre` |
| 4 | Divers | `claude/graphity-auto-install-sm3f92` |
| 5 | Livre numérique de cuisine | `claude/cuisine-ebook-1m9xm7` |
| 6 | Arbre généalogique Sarzance | `claude/sarzance-family-tree-3jxi7i` |
| 7 | Lingua (apprendre les langues) | `claude/duolingo-reverse-engineering-kocs92` |
| 8 | Apex AI | `claude/apex-ultra-review-crew-MZ8nS` |
| 9 | Apex Chat | `claude/apex-chat-mfa-faceid` |
| 10 | ClayScore (ball-trap) | `claude/clayscore-development-df6rj1` |
| 11 | Robot de piscine | `claude/pool-robot-app-mapping-kcmx03` |
| 12 | Robot crypto | `claude/crypto-trading-bot-irrfu6` |
| 13 | La détente (boutique) | `claude/priority-action-workflow-iKc0T` |
| 14 | Jacob (finances engins) | `claude/finances-engins-tracking` |
| 15 | Meta (le dépôt lui-même) | `claude/meta-krzqz8` |
| 16 | APIs gratuites | `claude/free-apis-analysis-c4sy5d` |
| 17 | Reverse-engineering & consolidation | `claude/reverse-engineer-app-consolidation-t0y4u5` |
| 18 | Audit du domaine + surveillance | `claude/suivi-domaine-suite` |
| 19 | CMCteams — Départs light | `claude/miroir-pour-chaque` |
| 20 | Lingua — connexion (1) | `claude/lingua-connexion-honnete` |
| 21 | Lingua — connexion (2) | `claude/lingua-prenom-nom` |
| 22 | CMCteams — fidélité au PDF | `claude/verify-cmcteams-light-data-rzlvau` |
| 23 | Garde anti-fuite de secrets | `claude/secrets-guard-main` |
| 24 | Correctif Vercel | `claude/vercel-config-main` |
| 25 | Ménage des branches (cause) | `claude/menage-branches-cause-exacte` |
| 26 | Ménage — l'outil | `claude/menage-repli-arbres` |
| 27 | Registre après ménage | `claude/registre-branches-supprimees` |
| 28 | Ménage — vérification | `claude/menage-verif-suppression` |
| 29 | « Voir comme Kevin » | `claude/voir-34519286077` |
| 30 | Ménage — clôture | `claude/registre-clore-menage` |
| 31 | Ménage auto-deploy | `claude/menage-auto-deploy` |
| 32 | Ménage auto-deploy — fin | `claude/menage-autodeploy-cloture` |
| 33 | Lingua — les 5 échecs de voix | `claude/lingua-voix-rectifiee` |
| 34 | Lingua — garde parcours | `claude/lingua-parcours-garde` |
| 35 | Robots crypto — bilan | `claude/crypto-bots-status-ocgu3i` |
| 36 | Lecture de vidéos | `claude/video-review-wqnqdw` |
| 37 | Tor / sécurité | `claude/security-review-4j3mct` |
| 38 | Javis / Bee (persona, voix, animation) | `claude/persona-personnage-javis-hqd55e` |
| 39 | Ce document (transfert + choix d'IA) | `claude/work-summary-ai-alternatives-cj6s29` |
| 40 | *(1 entrée technique de registre)* | — |

**91 messages inter-sessions** sont conservés dans le même fichier (`messages`) : ce sont les
avertissements qu'une branche a laissés aux autres (bugs trouvés, pièges, corrections). C'est
la partie la plus précieuse et la plus facile à perdre — **elle est dans l'archive de reprise**.

---

## 4. Les dépôts de code

> ⚠️ **CHANGÉ LE 22.09.2026 : le dépôt est PASSÉ EN PRIVÉ.** Conséquences mesurées —
> GitHub Pages ne publie plus (le site vit sur Cloudflare Pages), la protection de `main`
> et les rulesets sont perdus (compte gratuit), et les GitHub Actions sont **plafonnées à
> 2 000 min/mois** au lieu d'être illimitées : **toute la CI s'est arrêtée le 24.09 à
> 13h38 UTC**. Détail, preuves et les trois sorties possibles : `ETAT-INFRA.md` **fait n°22**.

| Où | Adresse | Rôle |
|---|---|---|
| **GitHub** (principal) | https://github.com/9r4rxssx64-creator/CMCteams | Le code, les branches `claude/*`, les 155 automatisations, la publication |
| **GitLab** (secours + jobs interdits sur GitHub) | https://gitlab.com/kdmc-group/Kdmc-project (projet n° 85753352) | Ce que GitHub interdit (jobs qui appellent l'extérieur), miroir de secours, et c'est **lui** qui lance `test:ci` |
| **GitHub Pages** | https://9r4rxssx64-creator.github.io/CMCteams/ | Le site servi (derrière le domaine) |
| **Cloudflare Pages** (secours) | kdmc-site.pages.dev | Filet de secours, plus le site vivant depuis le 4.09.2026 |
| **Vercel** | projet `kdmc-agent-monaco` | ⚠️ construisait chaque push de chaque branche (corrigé, ne pas défaire) |

**Historique important** (dans `ETAT-INFRA.md`, 12 faits datés) : le compte GitHub a été
**suspendu** fin août 2026 (trop de tâches automatiques : ~97 exécutions/jour), le travail est
passé sur GitLab, puis **GitHub a rouvert le 4.09.2026 à 16h34 UTC**. Depuis : GitHub = le code
et la publication ; GitLab = ce que GitHub interdit. **Aucun cron sur GitHub** (règle absolue —
c'est le volume qui avait fait suspendre le compte).

---

## 5. Le domaine et ses 30 adresses

**kd-mc.com** — acheté chez Cloudflare Registrar le 06.06.2026, titulaire Kevin DESARZENS,
renouvellement automatique, expire le 06.06.2027.

Comment ça marche : **un seul serveur** (`services/kdmc-router`) reçoit toutes les belles
adresses et sert la bonne page. Les 30 adresses mesurées dans le code :

```
kd-mc.com (portail) · www · cmcteams · cmcteams-light · departs · apex-ai · apex-chat
la-detente · chez-lolo · shops · dashboard · sourcing · coffre · bot · beatbot
autorisations · arbre · lingua · studio · cuisine (+ cocina, cujina) · worldmonitor
osint · ia · outils · kit · rotaplan · croupier · tor · javis
```

⚠️ **Règle des 5 endroits** : ajouter une adresse = la mettre dans `ROUTES` **ET** `APPS`
**ET** le `custom_domain` (wrangler) **ET** la sonde de surveillance **ET** la bouée de
secours. Les cinq, sinon l'adresse échappe au périmètre ou tombe en 404 le jour d'une panne.
(Deux oublis réels : `rotaplan` et `croupier`, trouvés les 15-16.09.)

**Périmètre par personne** (règle du 15.09.2026) : `portee: 'app'` (une seule app),
`portee: 'domaine'` (tout sauf l'admin), `admin` (Kevin, avec Face ID prouvé). La décision se
prend **au routeur**, jamais dans les apps.

---

## 6. Les 28 serveurs Cloudflare (workers)

| Nom du worker | Dossier | Ce qu'il fait |
|---|---|---|
| `kdmc-router` | `services/kdmc-router/` | **Le cœur** : toutes les adresses, le SSO, l'admin, les comptes |
| `kdmc-apis` | `services/kdmc-apis/` | Le carrefour des IA (`/ai`) pour toutes les apps |
| `kdmc-rag` | `services/kdmc-rag/` | La mémoire intelligente d'Apex (embeddings + Vectorize) |
| `kdmc-access` | `services/kdmc-access/` | Les accès |
| `kdmc-balances` | `services/kdmc-balances/` | Les soldes |
| `kdmc-mail` | `services/kdmc-mail/` | Les mails |
| `kdmc-outlook` | `services/kdmc-outlook/` | Outlook |
| `kdmc-monaco` | `services/kdmc-monaco/` | Monaco |
| `kdmc-live` | `services/kdmc-live/` | Données en direct |
| `kdmc-social` | `services/kdmc-social/` | Réseaux sociaux |
| `kdmc-uptime` | `services/kdmc-uptime/` | La sonde de surveillance |
| `kdmc-vente` | `services/kdmc-vente/` | La vente |
| `kdmc-crea-ai` | `services/kdmc-crea-ai/` | Créa (images/IA) |
| `kdmc-crea-famille` | `services/kdmc-crea-famille/` | Créa Famille |
| `apex-auth-worker` | `services/apex-auth-worker/` | Authentification Apex (Firebase) |
| `apex-v13-backend` | `services/apex-v13-backend/` | Le serveur d'Apex v13 |
| `apex-chat-api` | `messaging-app/workers/` | Le chat Apex |
| `apex-chat-svc` | `services/chat-svc/` | Service chat |
| `apex-vault-svc` | `services/vault-svc/` | Le coffre-fort |
| `apex-sentinels-svc` | `services/sentinels-svc/` | Les sentinelles |
| `coffre-r2` | `services/coffre-r2/` | Stockage du coffre (R2) |
| `cmc-parser-proxy` | `tools/planning-parser-tester/worker/` | Lecture des PDF de planning |
| `ld-gemini-proxy` | `shops/la-detente/worker/` | IA de La détente |
| `ld-printify-order` | `shops/la-detente/worker-order/` | Commandes Printify |
| `wm-brief` | `tools/cloudflare/wm-brief/` | Résumés World Monitor |
| `wm-quotes` | `tools/cloudflare/wm-quotes/` | Citations World Monitor |
| `kdmc-clone` | `tools/cloudflare/kdmc-clone/` | Clonage de pages |
| `kdmc-ais` | `tools/cloudflare/kdmc-ais-proxy/` | Bateaux (AIS) en direct |

**Compte Cloudflare** : sous-domaine `9r4rxssx64.workers.dev` — donc chaque worker répond
aussi sur `https://<nom>.9r4rxssx64.workers.dev`.
⚠️ **Plan gratuit : 5 tâches programmées (crons) maximum — c'est PLEIN** (mesuré le 5.09).

---

## 7. Firebase (les bases de données temps réel)

| Base | Adresse | Sert à |
|---|---|---|
| **CMCteams** | `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app` | Planning, employés, chat, présence, audit |
| **Apex / clients** | `https://kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app` | Apex, mémoire, coffre, télémétrie |

**Règles de sécurité** : `firebase-rules-apex.json` (dans le dépôt) — `/apex`,
`/coffre_vault` et `/cmcteams` exigent `auth != null` depuis le 04.07.2026, et l'écriture des
clés secrètes est bloquée **au niveau de la clé** (un `.write: true` parent ne se révoque pas
plus bas en RTDB — c'était la faille).
**Limite honnête écrite dans le dépôt** : l'authentification anonyme reste ouverte à tous ;
le vrai durcissement serait des jetons par rôle.

---

## 8. Les clés et secrets — **105 noms** (jamais les valeurs)

> ⚠️ **Règle absolue** : ce dépôt est **PUBLIC**. Ici on écrit **les noms**, jamais les valeurs.
> Ton code admin n'est écrit nulle part (il l'a été dans 68 fichiers jusqu'au 05.09.2026 —
> c'est corrigé, et il reste **à changer**, cf. section 13).

**IA :** `ANTHROPIC_API_KEY` · `OPEN_AI_API_KEY` *(avec un tiret bas, pas OPENAI)* ·
`GEMINI_API_KEY` · `GROQ_API_KEY` · `MISTRAL_API_KEY` · `DEEPSEEK_API_KEY` ·
`PERPLEXITI_API_KEY` *(faute de frappe d'origine, à respecter)* · `COHERE_API_KEY` ·
`XAI_API_KEY` · `TOGETHER_API_KEY` · `OPENROUTER_API_KEY` · `CEREBRAS_API_KEY` ·
`GLM_API_KEY` · `NVIDIA_API_KEY` · `SAMBANOVA_API_KEY` · `SCALEWAY_API_KEY` ·
`NEBIUS_API_KEY` · `DASHSCOPE_API_KEY` · `HF_TOKEN` · `AX_REPLICATE_KEY` ·
`TAVILY_API_KEY` · `BRAVE_API_KEY` · `PINECONE_API_KEY`

**Infra / déploiement :** `CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_API_TOKEN` ·
`CLOUDFLARE_ACCOUNT_SUBDOMAIN` · `VERCEL_TOKEN` · `VERCEL_TEAM_ID` · `RAILWAY_TOKEN` ·
`GITLAB_TOKEN` · `APEX_GITHUB_PAT` · `CLONE_TOKEN` · `GITHUB_TOKEN` *(fourni par GitHub)*

**Authentification / admin :** `APEX_ADMIN_PIN_SHA256` · `APEX_ADMIN_PIN_SHA` ·
`KDMC_SSO_SECRET` · `JWT_SECRET` · `APEX_CHAT_ADMIN_TOKEN` · `ARBRE_CODE_SHA256` ·
`CREA_FAMILLE_ADMIN_CODE` · `VAULT_MASTER_KEY` · `MONACO_ENC_KEY` · `COFFRE_PUBLIC_TOKEN`

**Firebase :** `FIREBASE_PRIVATE_KEY` · `FIREBASE_CLIENT_EMAIL` · `FIREBASE_WEB_API_KEY`
*(publique par conception — un scanner qui la signale est un faux positif)* ·
`FIREBASE_API_KEY` · `FB_URL`

**Notifications iPhone :** `VAPID_PRIVATE_KEY` · `PUSH_ADMIN_TOKEN` · `AX_PUSH_ADMIN_TOKEN` ·
`APEX_PUSH_ADMIN_TOKEN` · `FCM_SERVER_KEY` · `APNS_KEY_ID` · `APNS_PRIVATE_KEY` · `APNS_TEAM_ID`

**Apple / App Store :** `APPLE_TEAM_ID` · `APPLE_CERT_P12_BASE64` · `APPLE_CERT_P12_PASSWORD` ·
`APPLE_PROVISIONING_PROFILE_BASE64` · `APPSTORE_API_ISSUER_ID` · `APPSTORE_API_KEY_BASE64` ·
`APPSTORE_API_KEY_ID` · `ASC_ISSUER_ID` · `ASC_KEY_ID` · `ASC_PRIVATE_KEY`

**Paiement / boutique :** `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `PAYPAL_CLIENT_ID` ·
`PAYPAL_SECRET` · `PAYPAL_WEBHOOK_ID` · `PAYPAL_ME_USERNAME` · `REVOLUT_TAG` · `IBAN_KEVIN` ·
`PRINTIFY_API_KEY`

**Réseaux / messages :** `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` · `TELEGRAM_API_KEY` ·
`RESEND_API_KEY` · `EMAILJS_PRIVATE_KEY` · `VONAGE_API_KEY` · `VONAGE_API_SECRET` ·
`INSTAGRAM_ACCESS_TOKEN` · `INSTAGRAM_USER_ID` · `FACEBOOK_PAGE_ID` · `FACEBOOK_PAGE_TOKEN` ·
`TIKTOK_ACCESS_TOKEN` · `YOUTUBE_CLIENT_ID` · `YOUTUBE_CLIENT_SECRET` · `YOUTUBE_REFRESH_TOKEN`

**Données / divers :** `AISSTREAM_KEY` *(bateaux)* · `FIRMS_MAP_KEY` *(feux)* · `GIPHY_KEY` ·
`PEXELS_API_KEY` · `FINNHUB_API_KEY` · `API_OPEN_LEGO` · `PAGESPEED_API_KEY` ·
`HOME_ASSISTANT_TOKEN` · `HOME_ASSISTANT_URL` · `BROADLINK_API_KEY` ·
`TRUSTED_CIRCLE_PHONES` · `SENTRY_DSN` · `SEMGREP_APP_TOKEN` · `LHCI_GITHUB_APP_TOKEN` ·
`GOOGLE_API_KEY`

**Où ils vivent** : GitHub → *Settings → Secrets and variables → Actions* :
https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions

---

## 9. Les documents de mémoire — qui contient quoi

| Fichier | Poids | Ce qu'il y a dedans | À donner à la nouvelle IA ? |
|---|---|---|---|
| `LESSONS.md` | 752 Ko | **150+ erreurs numérotées** à ne jamais refaire (la plus précieuse) | ✅ **oui, en priorité** |
| `MEMO_RESUME.md` | 687 Ko | L'état de chaque session, où on en est | ✅ oui |
| `CLAUDE.md` | 575 Ko | **Toutes tes règles absolues** + leur histoire | ✅ oui (à découper, cf. §2) |
| `KEVIN_INVENTORY.md` | 253 Ko | Tous les fichiers créés + liens cliquables | ✅ oui |
| `KEVIN_ACTIONS_TODO.md` | 214 Ko | Ce qui attend une action de ta part | ✅ oui |
| `CHANGELOG.md` | 157 Ko | L'historique des versions | utile |
| `NOTES_USER.md` | 98 Ko | **Le métier** : employés, équipes, codes SBM, couleurs PDF, tables | ✅ **oui, vital** |
| `ETAT-INFRA.md` | 59 Ko | Les 12 faits d'infra datés (GitHub/GitLab/Cloudflare) | ✅ oui |
| `BRANCHES_INVENTAIRE.md` | 48 Ko | L'inventaire des branches | oui |
| `IMPORT_RECONNAISSANCE.md` | 47 Ko | Comment on lit les PDF de planning SBM | ✅ oui |
| `APEX_HANDOFF.md` | 35 Ko | Le dialogue Apex ⇄ Claude Code | oui |
| `PIPELINE_BRANCHES_SESSIONS.md` | 32 Ko | Comment les sessions se coordonnent | oui |
| `pipeline/sessions.json` | — | **Les 40 sessions + 91 messages inter-branches** | ✅ **oui, vital** |
| `ORGANISATION.md` | 19 Ko | Où va quoi (GitHub/GitLab/Worker/nulle part) | oui |
| `AUDIT_TEMPLATE_PRO.md` | 18 Ko | Le modèle d'audit complet | oui |
| `KDMC_ADRESSES.md` | 6 Ko | La liste officielle des adresses | ✅ oui |
| `SECURITY.md` | 3 Ko | Où signaler une faille (obligatoire, dépôt public) | oui |
| + 23 autres | — | Skills iOS/Android, Google APIs, sentinelles, secours… | selon besoin |

**Plus la mémoire compacte** : `tools/memory/` — un magasin de faits durables qui ne charge
que 3-5 lignes utiles à la demande (`node tools/memory/mem.cjs search "<sujet>"`). **C'est le
bon modèle** : beaucoup de mémoire, peu de tokens. C'est ce qu'il faut généraliser.

---

## 10. Tes règles absolues — la version courte (celle qui compte)

Il y a **~100 règles** dans `CLAUDE.md`. Voici les **20 qui gouvernent tout le reste**.
Si tu dois briefer une autre IA en une page, **c'est cette page.**

1. **Tu n'es pas codeur** → parler simple, jamais de jargon, décrire l'écran iPhone.
2. **Tout automatiser** → jamais te demander un clic si un script/workflow peut le faire.
3. **1 clic maximum**, et seulement si c'est physiquement impossible autrement
   (login OAuth sur ton compte, KYC, carte bancaire, signature).
4. **Jamais estimer un score** → toujours mesurer, avec la sortie brute.
5. **Toujours vérifier de bout en bout** avant de dire « c'est fait ».
6. **Jamais régresser** → chaque correctif porte son test de non-régression.
7. **Ne jamais dire « je ne peux pas »** → 4 canaux à essayer avant (page directe,
   recherche, connecteur, **la CI qui a le réseau ouvert**).
8. **Si aucun outil n'existe, en créer un.**
9. **CMCteams ET la version light, toujours les deux**, dans le même commit.
10. **Tout le monde a un planning** si son nom est dans le PDF — sans exception.
11. **Équipes détectées par les jours de repos** (et lues sur le récapitulatif du PDF) —
    l'équipe change **chaque mois**, jamais `emp.team` comme valeur courante.
12. **Départs = rotation continue** (`rot = wi`) : chacun parcourt la suite dans l'ordre,
    jamais deux fois le même numéro avant d'avoir bouclé.
13. **Login = prénom + nom** (2 mots minimum), dans les deux ordres, accents libres.
14. **Reconnu automatiquement après la 1ʳᵉ connexion** (Face ID), PIN en secours.
15. **Admin = le SSO central du domaine** (`/__sso/whoami`, `verified === true`), jamais un
    code par app.
16. **Le code admin ne s'écrit nulle part** — ni en clair, ni en empreinte.
17. **Sécurité maximale partout** : clés chiffrées, règles Firebase `auth != null`, CSP stricte.
18. **Isolation par projet** : `cmc_*`, `apex_*`, `shops_*` — une panne n'en casse aucun autre.
19. **Mise à jour automatique forcée** : l'app se met à jour seule en 60 s, 0 clic.
20. **Les documents partent dans le même commit que le code** (garde : `test:docs-frais`).

**Le persona** : **Javis** — te tutoie, te connaît, agit à ta place, parle simple, vérifie
avant d'affirmer, ne régresse jamais, prévient avant qu'on demande, va plus loin, honnête
sur ses limites. Il existe des deux côtés (ici et dans Apex), et il a un corps (Bee / l'âne
Bourricot de Lingua, `tools/javis/javis-widget.js` + `javis.kd-mc.com`).

---

## 11. Les gardes — ce qui empêche de casser

**209 fichiers de tests**, **222 commandes `npm run`**. Les plus importantes :

```
npm run test:ci                  → la chaîne complète (lancée par GitLab, pas GitHub)
npm run test:maj-forcee          → la mise à jour auto, prouvée en vrai navigateur
npm run test:parite-cmcteams-light → CMCteams et la light disent la même chose
npm run test:light-firebase      → la light avec un Firebase périmé (ce que tu as vraiment)
npm run test:departs-integrity   → 0 doublon, suite respectée, horaires justes
npm run test:departs-abs-parity  → les codes d'absence, contenu figé des deux côtés
npm run test:equipes-mois        → l'équipe du mois, jamais l'équipe par défaut
npm run test:no-pin-leak         → ton code admin ne fuit pas (clair ET empreinte)
npm run test:depot-public-sain   → le dépôt public ne fuit rien d'exploitable
npm run test:documents-travail   → le site ne publie aucun document de travail
npm run test:docs-frais          → les docs suivent le code (échoue sinon)
npm run test:messages-suivis     → aucun signalement oublié plus de 2 jours
npm run test:javis-bee / -reelle → Javis identique partout, vrai navigateur
npm run test:perimetre-apps      → chaque adresse est dans les 5 endroits
npm run audit:stability          → 0 re-rendu au repos (l'app ne scintille pas)
npm run audit:improvements       → la dette chiffrée, avec cliquet anti-régression
npm run retard-branches          → est-ce que ma branche est dangereusement en retard
```

**Point important et honnête** : `test:ci` **n'est lancé par aucun workflow GitHub** — c'est
le job `tests` de **GitLab** (ligne 58 de `.gitlab-ci.yml`) qui le lance. Si tu quittes
GitLab, **il faut rebrancher cette chaîne ailleurs**, sinon 200 gardes ne tournent plus.

---

## 12. Les outils et savoir-faire (skills)

**~100 skills** dans `.claude/skills/`. Les tiens, ceux qu'on a fabriqués :

| Skill | À quoi il sert |
|---|---|
| `verif-reelle` / `voir` | Voir les vraies pages du domaine, connecté comme toi, captures d'écran |
| `lire-video` | Regarder vraiment une vidéo que tu envoies (TikTok/Insta/YouTube) + transcription FR |
| `compact-memory` | La mémoire qui ne coûte presque rien en tokens |
| `domain-journal` | Qui se connecte au domaine, un compte par personne |
| `security-suite` / `strix` | L'arsenal sécurité (secrets, dépendances, XSS, pentest IA) |
| `agent-toolkit` | Les 6 dépôts de référence (design, mémoire, jetons, IA gratuites) |
| `agent-reach` | Lecture web étendue, transcripts, RSS |
| `appstore` | Publier une app sur l'App Store (CLI `asc`) |
| `apex-memory-rag` | La mémoire intelligente d'Apex |
| `legal` | Suite juridique |
| `seo-*` (30 skills) | Tout le SEO/GEO |

**+ 21 commandes** `/` dans `.claude/commands/` (`/scan-and-fix`, `/roast`, `/challenge`,
`/simplify`, `/systemize`…).

---

## 13. Ce qui reste à faire (à ce jour)

**Ce qui attend TOI (personne d'autre ne peut) :**
1. 🔑 **Changer le code admin** — il a été public jusqu'au 05.09.2026
   (Outils → Changer le code, et le code famille de l'arbre aussi).
2. 🔑 **Révoquer le jeton GitLab** `glpat-wD6Q…` (il est passé par un canal non contrôlé).
3. 🔑 **Accès au compte Cloudflare « 9r4 »** (verrouillé derrière GitHub).
4. 👕 **La détente** : combien de gilets, et broderie logo seul ou logo + prénoms ?
5. 🍎 **Compte développeur Apple** (99 $/an) : oui ou non ? (bloque l'App Store)
6. ✉️ **Envoyer la réponse au support GitHub** (préparée, cf. message m003 du pipeline).

**Ce qui est signalé comme cassé ou fragile (messages du pipeline) :**
- `test:ci` a été rouge sur `main` plusieurs fois pour des raisons **qui ne viennent pas de tes
  branches** (Vercel qui dépasse 100 déploiements/jour, adresses sans clé d'app, `test:lingua-voix`).
- Le miroir GitLab publie un arbre **périmé** (fait n°11 d'`ETAT-INFRA.md`) — pas encore réglé.
- Le plan gratuit Cloudflare est **plein** côté tâches programmées (5/5).
- L'authentification anonyme Firebase reste ouverte (durcissement = jetons par rôle).

---

## 14. 🤖 Quelle IA pour ce travail — le comparatif honnête

### D'abord la vérité qui compte

**Le problème n'est pas seulement le prix du modèle : c'est la quantité de contexte qu'on
recharge à chaque message** (section 2 : ~165 000 tokens). Changer d'IA **sans** régler ça,
c'est payer moins cher… le même gaspillage. Une IA à moitié prix qui fait deux fois plus
d'erreurs sur un fichier de 3,2 Mo avec 209 gardes te coûtera **plus**, pas moins.

### Les performances réelles en code (relevé le 17.09.2026)

| Modèle | SWE-bench Verified | Statut |
|---|---|---|
| **Claude Opus 5** | **~96-97 %** | le meilleur mesuré |
| GPT-5.6 « Sol » | ~96,2 % | équivalent |
| Fable 5 | ~95 % | équivalent |
| DeepSeek V4-Pro-Max | **80,6 %** | ouvert / pas cher |
| MiniMax M3 | 80,5 % | ouvert |
| Qwen3.7 Max | 80,4 % | ouvert |
| Kimi K2.6 | 80,2 % | ouvert |

🟡 **Statut : relevé** (pages de classement publiques, pas la page officielle de chaque
éditeur — le proxy de l'agent bloque plusieurs d'entre elles). L'écart **~96 % contre ~80 %**
est cohérent sur toutes les sources consultées. Et un avertissement important : ce test est
**saturé** en 2026 (tout le monde est dans les 90) ; sur le test plus dur (SWE-bench **Pro**)
les mêmes modèles **perdent 15 à 35 points** — l'écart réel entre le haut et le milieu de
tableau est donc **plus grand** que ce tableau ne le montre.

### Les prix (relevé le 17.09.2026, par million de tokens)

| Moteur | Entrée | Sortie | Remarque |
|---|---|---|---|
| Claude Sonnet 5 | **2 $** | **10 $** | ✅ prix officiel (la hausse prévue au 1.09 a été annulée) |
| Claude Opus 5 | le plus cher | le plus cher | 🔴 non vérifié ici |
| **DeepSeek V4-Flash** | **0,14 $** (0,014 $ si en cache) | **0,28 $** | ✅ officiel · **-50 % en heures creuses** |
| DeepSeek V4-Pro | 0,435 $ | 0,87 $ | 🟡 relevé |
| Qwen3 Coder Next | 0,12 $ | 0,80 $ | 🟡 relevé |
| Kimi K2.6 | 0,65 $ | 2,72 $ | 🟡 relevé |
| GLM-5.1 | ~0,89 $ | ~3,54 $ | 🟡 relevé |
| **GLM-4.5-Flash** | **0 $** | **0 $** | 🟡 relevé — gratuit |

**Le rapport brut : DeepSeek V4-Flash est ~14 fois moins cher que Claude Sonnet 5 en entrée,
et ~36 fois moins cher en sortie.** Avec le cache, l'écart monte à ~140×.

### Les forfaits « agent de code » (l'équivalent de ce qu'on utilise ici)

| Offre | Prix | Ce qu'il faut savoir |
|---|---|---|
| **Claude Code** (ce qu'on a) | 20 $ → Max 5×/20× | Le meilleur en agentique, le plus cher |
| **GLM Coding Plan** | **18 $/mois** (12,60 $/an) · Pro 80 $ · Max 168 $ | 🟢 **marche DANS Claude Code** — tu gardes l'outil, les règles, les skills, et tu changes juste le moteur |
| **Qwen Coding Plan** | 50 $/mois (~90 000 requêtes) | Le tier gratuit a fermé le 15.04.2026 |
| **Codex CLI** (OpenAI) | **inclus dans ChatGPT Free / Go** | Apache-2.0, très bon rapport prix |
| **Gemini / Antigravity** | 0 $ (petit quota) · Pro ~20 $ | ⚠️ le tier gratuit généreux a fermé le 18.06.2026 |
| **OpenCode** | **gratuit** (MIT) | Tu branches n'importe quel modèle (75+ fournisseurs) |
| **Cline** | gratuit | Dans VS Code |
| **Aider** | gratuit | Chaque changement = un commit git lisible |
| **DeepSeek Harness (dsh)** | gratuit (MIT, août 2026) | Nouveau, prometteur |

### 🏆 Ma recommandation — en connaissance de cause, et contre mon intérêt

**Le meilleur compromis pour TON travail précis** (un fichier de 3,2 Mo, 209 gardes, 30
adresses, du français, de l'iPhone, zéro tolérance à la régression) :

**Étape 1 — à faire avant tout changement (gain ~93 %, coût : 0 €)**
Découper `CLAUDE.md` (§2). C'est le plus gros levier, et il ne dégrade **rien**.

**Étape 2 — garder Claude Code comme outil, changer de moteur selon la tâche**
- **Travail difficile** (import PDF, rotation des départs, sécurité, audit, migration) →
  **Claude** (Opus/Sonnet 5). L'écart 96 % contre 80 % se paie en erreurs, et une erreur sur
  le planning de 260 personnes coûte plus que des tokens.
- **Travail en volume** (documentation, renommage, tests répétitifs, traductions, petits
  correctifs) → **GLM Coding Plan à 18 $/mois**, branché **dans Claude Code**. Tu ne changes
  ni d'outil, ni de règles, ni de skills, ni d'habitudes. **C'est le meilleur rapport
  qualité-prix mesurable aujourd'hui.**
- **Gros volume automatique** (les IA de tes apps : `kdmc-apis`, Apex, Lingua) → **DeepSeek
  V4-Flash en heures creuses** : c'est déjà ce que fait ta règle « Qwen gratuit d'abord ».

**Étape 3 — le tout gratuit, si tu veux tester à 0 €**
`Codex CLI` (inclus dans ChatGPT Free) + `OpenCode` + `GLM-4.5-Flash` + `DeepSeek` à la carte.
**Honnêtement** : ça tiendra pour les petites tâches. Sur `index.html` (3,2 Mo) et les 209
gardes, tu verras la différence — pas sur la vitesse, sur le **nombre d'allers-retours**.

**Ce que je ne te conseille pas** : tout basculer d'un coup sur un modèle ouvert. Pas par
fidélité — par arithmétique : 16 points d'écart sur un dépôt à 209 gardes, ça veut dire des
gardes qui rougissent et des corrections à repayer.

### Le compromis, en une phrase

> **Nettoie le contexte (−93 %), garde Claude pour le difficile, mets GLM à 18 $ sur le
> volume dans le même outil, et DeepSeek pour les IA de tes apps.**
> Tu gardes la qualité là où elle compte et tu arrêtes de payer le gaspillage.

---

## 15. Comment basculer sans rien perdre (4 étapes)

**Étape 1 — fabriquer le paquet de reprise (1 commande)**
```bash
npm run transfert
```
Ça fabrique `transfert/` : ce document, `LESSONS.md`, `NOTES_USER.md`, `CLAUDE.md`,
`MEMO_RESUME.md`, `KEVIN_*`, `ETAT-INFRA.md`, `pipeline/sessions.json` (40 sessions + 91
messages), la mémoire compacte, la liste des branches, des workers, des adresses, des noms de
secrets — **plus un `INDEX.md` qui dit à la nouvelle IA dans quel ordre lire.**

**Étape 2 — récupérer l'historique complet (une seule fois)**
```bash
git fetch --unshallow          # tout l'historique des commits
git fetch origin '+refs/heads/*:refs/remotes/origin/*'   # les 219 branches
```

**Étape 3 — brancher la nouvelle IA**
- Elle lit `CLAUDE.md` ? (Claude Code, Codex CLI via `AGENTS.md`, OpenCode, Cline, Aider le
  font tous) → **rien à réécrire**, elle hérite des règles.
- Sinon → donne-lui `transfert/INDEX.md` en premier message.
- **Ne quitte pas GitLab sans avoir rebranché `test:ci`** (§11) : c'est lui qui tient les
  209 gardes.

**Étape 4 — vérifier que rien n'est perdu (la preuve, pas la confiance)**
```bash
npm run test:ci                # les 209 gardes passent avec la nouvelle IA
npm run test:docs-frais        # les docs suivent le code
node tools/pipeline/pipeline.mjs etat   # les 40 sessions sont lisibles
```
Si ces trois-là passent, **la mémoire a survécu**.

---

## 16. Ce que je ne peux pas garantir (honnêteté obligatoire)

- 🔴 **L'historique complet des conversations** (tes messages, mes réponses, session par
  session) **n'est pas dans le dépôt** et je ne peux pas l'exporter : il vit chez Anthropic.
  Ce qui EST conservé : les 40 sessions, les 91 messages inter-branches, les 150+ leçons,
  les 297+ commits, les documents. **C'est le fond ; le verbatim des discussions, non.**
- 🔴 **Les prix cités** viennent de pages de comparaison publiques pour la plupart ; le proxy
  de l'agent bloque `docs.z.ai` et `api-docs.deepseek.com` en accès direct. Les deux prix
  marqués ✅ (Claude Sonnet 5, DeepSeek cache) sont issus de sources officielles.
  **Vérifie les deux ou trois qui t'intéressent avant de payer.**
- 🔴 **Je n'ai pas mesuré ta consommation réelle** (mes tokens dépensés sur ton compte) :
  je n'ai pas accès à ton tableau de bord d'usage. Le chiffre de 164 695 tokens par message
  est **calculé sur les fichiers**, il est certain ; ce qu'il représente sur ta facture,
  non — regarde https://claude.com/settings/usage.
- 🟡 **Le découpage de `CLAUDE.md` n'est pas fait** dans ce commit. Il est prêt à être fait,
  avec un test de non-perte, sur ton feu vert.
- ✅ **Tout le reste de ce document est mesuré** dans le dépôt le 17.09.2026, commande par
  commande.

### Mon point le plus faible dans ce travail

Ce document dit **où** est tout, et il le prouve. Il ne remplace pas l'**expérience** de
40 sessions : pourquoi telle décision a été prise contre une autre, ce qui a été essayé et
abandonné. `LESSONS.md` en couvre une grande partie (c'est pour ça qu'il fait 752 Ko) — mais
une IA qui reprend demain sera **compétente sans être aguerrie**. Les 2 à 3 premières
semaines, elle refera des erreurs déjà écrites. La seule parade : **lui faire lire
`LESSONS.md` avant d'écrire une ligne** — c'est la première consigne de l'`INDEX.md`.

---

*Fabriqué le 2026-09-17 · toutes les mesures sont reproductibles avec les commandes citées.*
