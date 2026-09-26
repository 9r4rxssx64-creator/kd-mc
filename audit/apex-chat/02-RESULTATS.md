# Apex Chat — 02 · Résultats mesurés (attendu / obtenu / statut)

**Date d'exécution** : 2026-09-10 · **Version** : `v1.1.288`
Chaque ligne porte une **commande réellement exécutée** et sa **sortie brute**.
Rien n'est estimé. Quand je n'ai pas pu mesurer, c'est écrit 🔴 et la raison est donnée.

---

## 1. Le filet de sécurité — suite de tests

```
$ npx vitest run --coverage          # vitest 5.0.0 / happy-dom 20, 10/09 22:01

 Test Files  61 passed (61)
      Tests  1123 passed (1123)
   Duration  17.25s
```

| Attendu | Obtenu | Statut |
|---|---|---|
| La suite passe entièrement | **1123 / 1123**, 61 fichiers, 0 échec (matin : 1115 / 59 sous vitest 1) | ✅ VÉRIFIÉ |
| Durée acceptable en CI | 17,25 s | ✅ VÉRIFIÉ |

## 2. Couverture réelle

**Deux mesures le même jour, avec le même code, parce que la règle a changé.** Le matin
(vitest 1.6, `v8-to-istanbul`) ; le soir (vitest 5, remappage par l'AST `ast-v8-to-istanbul`,
exigé par la correction des 7 vulnérabilités des outils de test). vitest ≥ 4 **compte les
rappels et les branches jamais exécutés** que l'ancien outil ignorait, et **inclut tous les
fichiers** dans un seuil global (« différent de Jest », doc officielle). Les chiffres baissent
sans qu'une seule ligne de test ait été retirée — c'est la règle qui s'est allongée.

```
$ npx vitest run --coverage          # matin, vitest 1.6
All files          |   89.47 |     84.3 |   94.96 |   89.47
 lib               |     100 |      100 |     100 |     100
  api-worker.js    |   83.42 |    76.88 |    89.4 |   83.42
 durable-objects   |     100 |      100 |     100 |     100

$ npx vitest run --coverage          # soir, vitest 5.0.0 — mêmes tests + 8 ajoutés
File               | % Stmts | % Branch | % Funcs | % Lines
All files          |   82.86 |       76 |   78.55 |   85.52
 lib               |     100 |     97.4 |   99.17 |     100
  visio-mesh.js    |     100 |    95.58 |     100 |     100
  privacy-recip.js |     100 |    83.33 |     100 |     100
 workers           |   78.11 |    71.06 |   70.08 |   81.28
  api-worker.js    |   75.71 |    68.48 |   64.47 |    79.2
  ia-worker.js     |     100 |      100 |     100 |     100   (revenu à 100 : test du délai 8 s)
  push-worker.js   |     100 |      100 |     100 |     100
  sms-worker.js    |     100 |      100 |     100 |     100
 durable-objects   |   99.38 |    96.41 |   89.74 |   99.31
  ConversationDO   |   99.38 |    96.41 |   89.74 |   99.31   (lignes 552, 702)
 workers/lib       |     100 |      100 |     100 |     100
```

| Attendu | Obtenu | Statut |
|---|---|---|
| `lib/` : lignes et instructions à 100 % | **100 % / 100 %** sur les 11 fichiers ; branches **83,3–98,5 %** (rappels jamais appelés, désormais comptés) | ✅ mesuré |
| `crypto-core.js` à 100 % partout | **100 / 100 / 100 / 100** — la branche « pas de `window` » (Worker) est maintenant exécutée par `crypto-core-node.test.js` | ✅ |
| Durable Objects | ConversationDO **99,3 %** lignes ; `BroadcastDO.js` / `PresenceDO.js` = **purs réexports** (0 instruction mesurable → le résumé JSON écrit « 0 % », vitest les tient pour satisfaits) ; contrat prouvé par `durable-objects-shims.test.js` | ✅ |
| 3 workers secondaires à 100 % | **100 %** (ia, push, sms) | ✅ |
| `api-worker.js` au-dessus de son plancher | ~~79,20 % lignes · 68,48 % branches · 64,47 % fonctions~~ → **11/09 : 94,25 % lignes · 81,92 % branches · 100 % fonctions · 91,98 % instructions** (118 tests ajoutés pour les 108 fonctions jamais appelées, `api-worker-fonctions-non-appelees.test.js`) ; plancher relevé à **93,5 / 81 / 99 / 91** | ✅ mesuré |
| Le gate ne ment pas et ne bloque pas pour une raison d'outil | seuils **par fichier** = valeur mesurée (dixième inférieur) dans `vitest.config.js` ; `messaging-app-tests.yml` **lit cette table** (plus de copie à tenir en miroir) ; `npx vitest run --coverage` → **exit 0** | ✅ VÉRIFIÉ |

**Lecture honnête** : la couverture « réelle » d'Apex Chat n'a pas baissé, elle a été
**mieux mesurée**. Ce qu'on appelait 100 % sur `lib/` cachait des rappels d'erreur jamais
exercés (ex. `visio-mesh.js` lignes 183-193 : `ontrack`/`onicecandidate`). Le fichier le moins
couvert reste le plus critique (`api-worker.js`, 6 045 lignes : OTP, admin, JWT, premium) :
**64 % de ses fonctions** seulement sont appelées par un test. Il n'est **pas exclu** de la
mesure ; son plancher est un cliquet (il ne peut que monter). Je n'ai pas listé une par une les
fonctions non appelées — c'est le prochain chantier utile, pas un chiffre à maquiller.

**Chantier fait le 11/09.** Les 108 fonctions jamais exécutées ont été listées (16 routes
nommées : `check-phone`, cercle de confiance, avatar, réglages par utilisateur, cercle privé,
fiche contact, suppression de conversation, recherche IA, abonnement/désabonnement/test push,
mise à jour forcée ×3, configuration TURN ; ~90 rappels anonymes : `.catch` des écritures D1
« au mieux », abandons `setTimeout(() => ctrl.abort())`, envois de files rejetés) et couvertes
par **118 tests** qui passent tous par `worker.fetch` avec la vraie route, méthode et
authentification, et vérifient status + code d'erreur exact + `detail`. Mesure après :

```
$ npx vitest run --coverage          # 11/09, vitest 5.0.0 — 1241 tests, 62 fichiers
All files          |   94.31 |       86 |   99.05 |   95.96
  api-worker.js    |   91.98 |    81.92 |     100 |   94.25   (avant : 75.71 / 68.48 / 64.47 / 79.20)
```

## 3. Le P0 — la porte admin

| # | Attendu | Commande | Obtenu | Statut |
|---|---|---|---|---|
| 3.1 | Le numéro admin a quitté le fichier public | `grep -rn "‹tél. admin›" index.html` | **0 ligne** | ✅ |
| 3.2 | Il ne subsiste que hors du site servi | `grep -rln "‹tél. admin›" .` | **12 fichiers de test uniquement** — plus aucun `.md` (nettoyé le 10/09) | ✅ voir finding P3 |
| 3.3 | La garde est active en config | `grep … wrangler.toml` | `ADMIN_BYPASS_REQUIRE_MFA = "true"` (l. 140) | ✅ |
| 3.4 | Le backdoor OTP universel est fermé | `grep … wrangler.toml` | `ALLOW_TEST_OTP = "false"` (l. 149) | ✅ |
| 3.5 | Les deux gardes passent | `npx vitest run …mfa… …phone…` | **6 / 6 verts** en 1,01 s | ✅ |
| 3.6 | Le worker **déployé** refuse la requête | `curl -X POST …workers.dev/api/auth/verify-otp` | `CONNECT tunnel failed, response 403` | 🔴 **NON MESURABLE ICI** |

**Sur 3.6** : le 403 vient de la politique de sortie réseau de cette session, pas du service.
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` ne montre **aucun** `recentRelayFailures` — c'est
donc bien un refus de politique, et la règle est de le **signaler, pas de le contourner**. Le
chemin légitime existe et a le réseau ouvert : Actions → `apex-chat-e2e.yml`.

## 4. Les quatre autres findings

| Finding | Attendu | Obtenu | Statut |
|---|---|---|---|
| P1 — admin par le nom | Le repli hors-ligne ne donne plus l'admin | `no-client-side-admin-by-name.test.js` : **3/3** | ✅ v1.1.285 |
| P2 — jeton dans l'URL du WebSocket | Ticket à usage unique, rejeu refusé | `ws-ticket-usage-unique.test.js` : **6/6** | ✅ v1.1.286 |
| P2c — jeton dans l'URL des médias | Ticket à portée limitée, ignoré ailleurs | `media-ticket-portee-limitee.test.js` : **6/6** | ✅ v1.1.288 |
| P2 — CORS ouvert à tous | Liste blanche, `Vary` cumulé, 101 intact | `cors-origines-autorisees.test.js` : **5/5**, `cors.js` **100 %** | ✅ v1.1.287 |

## 5. Inventaire — écarts entre ce que disent les docs et ce que dit le code

| Vérification | Attendu | Obtenu | Statut |
|---|---|---|---|
| Version cohérente | `package.json` == `index.html` | **1.1.288 == 1.1.288** | ✅ (l'écart signalé le 05/09 est résorbé) |
| Dépendances de production | 0 | **0** (`"dependencies": {}`) | ✅ |
| Secrets en dur | 0 hors tests | **0** | ✅ |
| README | à jour | annonce une « Phase 1 en cours » alors que tout existe | ❌ **périmé** |
| `MEMO_KEVIN_RESTE_A_FAIRE.md` | à jour | **285 versions de retard** ; le numéro admin en a été **retiré le 10/09**, avec la ligne périmée qui le portait | 🟡 **partiellement corrigé** |

## 6. Les passes obligatoires — **exécutées** le 2026-09-10

> Ces quatre passes étaient déclarées « non exécutées » plus tôt dans la journée, au motif que
> l'egress de la session est refusé. C'était une **conclusion prématurée** : je n'avais testé
> que `gh` (absent) et les outils MCP. L'**API GitHub**, elle, répond — le proxy y injecte
> l'authentification (`curl https://api.github.com/user` → 200, 15 000 req/h). Les quatre
> passes ont donc été **déclenchées depuis cette session**, via l'outil `tools/ci/ci.mjs`.

| Passe | Statut | Résultat mesuré |
|---|---|---|
| **LIVE Apex Chat** (`apex-chat-e2e.yml`) | ✅ **EXÉCUTÉE, puis VERTE** | 1ʳᵉ passe : **prod HTTP 200**, **18 OK / 2 KO** (le même test sur 2 navigateurs) → cause identifiée, test corrigé → **2ᵉ passe : 20/20 ✅** (run `34518010574`, l'issue d'échec #3742 s'est refermée automatiquement) |
| **LIVE domaine** (`audit-live.yml`) | ✅ **EXÉCUTÉE** | Toutes les surfaces répondent **sauf `lingua.kd-mc.com`** (hors périmètre Apex Chat, signalé à part). **11/09** : relancé après le correctif de l'écran blanc (run `34588152564`, lu dans le nouveau check-run) → **toujours rouge sur Lingua, même message**. Rejoué en local : la fenêtre « Nouveau compte » demande **prénom + nom** depuis le 05/09 (`#acPrenom`/`#acNom`), la sonde remplissait l'ancien `#acName` → **défaut de la sonde, pas de l'app** (16 langues, 189 unités, 607 boutons, 0 erreur JS après correction). Sonde corrigée et poussée ; le balayage qu'elle déclenche donne le verdict en ligne |
| **Second avis indépendant** (`ai-review-independent.yml`) | 🔴 **ÉTEINT — découverte majeure** | **0 succès sur 100 runs** (92 sautés, 6 échecs, 2 annulés). Cause + correctif : voir ci-dessous |
| **Scan sécu outillé** (`security-suite.yml`) | ✅ **EXÉCUTÉ, LU, TRIÉ** (run `34519764156`) | **2 211 signalements bruts** sur tout le dépôt, **0 secret confirmé vivant** (TruffleHog). Pour Apex Chat : voir § 6.5 — 0 vulnérabilité en production, 7 dans les outils de test **corrigées**, 3 durcissements de workflows **appliqués**, 9 signalements Semgrep encore à identifier (outil livré pour les lire) |
| **Pentest IA** (`strix-scan.yml`) | ⏱ **EXÉCUTÉ mais TUÉ par le délai** (run `34520670517`, rc = 124 à 26 min) → **11/09 : cause comprise, workflow corrigé, relancé** | Le tableau de bord annonçait **1 vulnérabilité MEDIUM** « non écrite ». Lu dans le code de Strix 1.6.2 : il écrit dans `strix_runs/` (le workflow copiait `agent_runs/`) et **écrit son rapport à l'interruption**. Corrigé : bon dossier copié, dépense bornée (`--max-budget-usd 15`) au lieu du temps, profondeur `standard`, 75 min, inventaire + rapport + fiches dans le check-run. Coût du 1ᵉʳ run : **13,77 $** (31,8 M jetons). **Relance lue** (run `34588162278`, 38 min, 14,00 $) : **2 MEDIUM confirmées et corrigées** — session SSO faible forgée → lisait/coupait les sessions de Kevin (routeur, Face ID exigé + Origin) ; lien piégé `?grant_premium=` → Premium activé sans confirmation (v1.1.289, confirmation nommée). Détail dans `03-FINDINGS.md` |

### 6.1 Le seul échec e2e était un **test périmé**, pas une régression de l'app

```
[chromium-desktop] smoke.spec.js:23 > SEO meta complets — expect(received).toContain(expected)
[webkit-iphone]    smoke.spec.js:23 > SEO meta complets — expect(received).toContain(expected)
```

| | Valeur |
|---|---|
| Ce que le test exigeait | `canonical` contient `messaging-app` (ancienne URL GitHub Pages) |
| Ce que l'app déclare | `<link rel="canonical" href="https://apex-chat.kd-mc.com/">` (l. 35) |
| Qui avait raison | **L'app.** Le domaine propre est le canonique depuis v1.1.287 |

Rétrograder le `canonical` pour faire verdir le test aurait **dispersé le référencement** entre
deux adresses pour une seule page. C'est donc le **test** qui a été corrigé — en gardant sa
force : il exige toujours une URL absolue `https://` **et** le domaine propre.

**Vérifié après correction** : l'e2e relancé depuis cette session passe **entièrement** contre
la production (`Pre-flight check (HTTP 200)` ✅ · `Run Playwright smoke tests` ✅), et le
workflow a **refermé tout seul** l'issue d'échec qu'il avait ouverte (#3742 → `closed`). C'est
la boucle complète : détecter → diagnostiquer → corriger → re-prouver, sans intervention.

### 6.2 Le « second avis indépendant » n'avait jamais produit une seule revue

C'est la passe que le protocole d'audit rend obligatoire précisément pour éviter que ce soit
moi qui relise mon propre travail. Mesuré sur les 100 derniers runs : **0 succès**.
**Cause racine** : **29 PR sur 30** sont créées par `github-actions[bot]` (le robot
d'auto-fusion des branches `claude/*`), et la condition du workflow excluait explicitement ce
robot. Le dispositif existait, était marqué « actif », et ne s'exécutait jamais — erreur **#28**
(Déclaration ≠ Déploiement) dans sa forme la plus coûteuse : **on croyait avoir un contre-pouvoir
externe, il n'y en avait aucun depuis le début.**
**Correctif livré** : un job `revue-a-la-demande` (`workflow_dispatch` + numéro de PR) qui ne
dépend plus de qui a ouvert la PR. Laissé **manuel à dessein** : chaque revue consomme des
jetons OpenAI réels — l'activer sur toutes les PR du robot, c'est une revue payante à chaque
push, et cet arbitrage revient à Kevin.

### 6.3 Ce que ces passes changent pour la valeur de l'audit

Ce qui reste vrai : je certifie **le code du dépôt**. Ce qui a changé : le **service en ligne
a été touché pour de vrai** — il répond, et 18 de ses 20 contrôles de bout en bout passent
contre la vraie production. Ce n'est plus un audit purement statique.
Ce qui reste ouvert (corrigé le même soir, voir § 6.4) : les 19 autres scénarios navigateur
**sont** lancés (`messaging-app-tests.yml`, 4 navigateurs) — mais leurs deux voies iPhone étaient
rouges depuis le 6 septembre (finding **P2**). Le chiffrement bout en bout, le verrou Face ID et
l'auto-réparation des notifications sont donc **vérifiés sur Chromium/Android**, et sur iPhone
à partir du premier run vert après correctif.

### 6.4 Les 19 scénarios de `tests/e2e/` — exécutés (2026-09-10)

| Attendu | Obtenu | Statut |
|---|---|---|
| Les 19 fichiers (56 tests) passent sur Chromium, serveur HTTPS local | `npx playwright test` (Chromium préinstallé) → **56 passed (29.6s)** | ✅ VÉRIFIÉ |
| Les 4 voies de `messaging-app-tests.yml` sont vertes | 60 derniers runs : **28 échecs, dont 19 « iPhone seulement »**, depuis le 06/09 16:00 | ❌ puis correctif |
| Cause exacte, pas un symptôme | erreur WebKit : `…/api/system/config due to access control checks` → `LOCAL_DEV` n'acceptait que `http://localhost`, les tests servent `https://localhost:4173` | ✅ VÉRIFIÉ |
| Le correctif est prouvé sans réseau | `cors-origines-autorisees.test.js` : `https://localhost:4173` autorisé, `https://localhost.evil.example` refusé → 5/5 | ✅ VÉRIFIÉ |
| Le correctif est prouvé en vrai (4 voies vertes) | run **34520911544** (19:37 UTC, après déploiement du worker) : `tests` ✅ · `e2e (iphone-se)` ✅ · `e2e (iphone-safari)` ✅ · `e2e (chromium-desktop)` ✅ · `e2e (pixel-android)` ✅ — **premier run 4/4 vert depuis le 6 septembre** | ✅ VÉRIFIÉ |
| Ça ne se reperd pas | `npm run test:specs-lances` (dans `test:ci`) suit ce que chaque workflow **exécute** | ✅ VÉRIFIÉ |

### 6.5 Scan sécu : ce qu'il dit vraiment d'Apex Chat — lu ligne par ligne (run 34527892077)

Le scan « arsenal » relancé avec `detail_path=messaging-app,.github/workflows` a posé sur le
commit **47 lignes** (outil · gravité · fichier:ligne · règle). Chacune a été ouverte. Aucune
n'est une faille. Zéro correctif de code ; deux recommandations P3 déjà connues.

| # | Outil · règle | Où | Ce qu'il y a vraiment à cette ligne | Verdict |
|---|---|---|---|---|
| 4 | Semgrep `missing-integrity` | `messaging-app/index.html` | `<link rel="canonical">` et `<link rel="dns-prefetch">` — pas un script ni une feuille de style : l'attribut `integrity` ne s'y applique pas | faux positif |
| 1 | Semgrep `dynamic-urllib-use-detected` | `messaging-app/e2e/report-fails.py:34` | appel `urllib` vers `api.github.com/repos/$REPO/issues`, `$REPO` posé par le workflow, script CI seulement, aucune entrée utilisateur | faux positif |
| 5 | Semgrep `unsafe-formatstring` (INFO) | `messaging-app/index.html` | ``console.warn(`[x] ${p.name} failed:`, e.message)`` — un gabarit de journal, aucun puits de format | faux positif |
| 1 | Semgrep `cors-misconfiguration` | `workers/lib/cors.js:78` | l'origine n'est **reflétée qu'après** passage dans la liste blanche (`ALLOWED_ORIGINS` + exception locale) ; comportement voulu, couvert par `cors-origines-autorisees.test.js` (5/5) | voulu |
| 3 | Semgrep `gha-curl-pipe-shell` (ERROR) | `apex-chat-e2e.yml:137`, `deploy-apex-chat.yml:73`, `:94` | les trois sont des ``curl … \| python3 -c "json.load(sys.stdin)…"`` : la réponse (GitHub / Cloudflare, jeton Bearer, TLS) est **parsée comme donnée**, jamais exécutée. La règle vise `curl \| sh` | faux positif · reco P3 : `jq` |
| n | Semgrep `mutable-action-tag` | workflows du périmètre | actions officielles sur un tag de version publié (`@v4`, `@v6`) | reco P3 déjà notée (épingler un SHA) |
| 3 | gitleaks (clé « privée » ?) | `deploy.sh:152`, `index.html:709`, `push-worker.js:16` | **la même clé VAPID publique**, envoyée à chaque navigateur par conception | faux positif |
| 1 | gitleaks | `index.html:300` | une longue chaîne dans le CSS (dégradé / police encodée) | faux positif |
| 1 | gitleaks | `tests/unit/push-worker.test.js:44` | `APNS_TEAM_ID: 'TEAMID'` — un mot de remplissage de test | faux positif |
| 2 | gitleaks | `push-worker.js:176`, `:182` | les chaînes `-----BEGIN/END PRIVATE KEY-----` qui servent à **retirer** l'en-tête d'une variable d'environnement, aucune valeur | faux positif |

| Attendu | Obtenu | Statut |
|---|---|---|
| Chaque signalement du périmètre porte sa ligne | **47 / 47** listés par le check-run (`detail_path`), 0 valeur de secret imprimée | ✅ VÉRIFIÉ |
| Chaque ligne a été ouverte, pas seulement comptée | 47 lues ; verdict et preuve dans le tableau | ✅ VÉRIFIÉ |
| Failles à corriger | **0** — 2 recommandations P3 (`jq` au lieu de `python3 -c`, SHA au lieu de tag) → **appliquées le 11/09** (3 workflows en `jq`, 23 actions des 10 workflows épinglées `@<sha> # vN`, 4 gardes vertes) | ✅ |

---

## Synthèse chiffrée

| Indicateur | Valeur mesurée |
|---|---|
| Tests | ~~1123 / 1123, 61 fichiers~~ → **1241 / 1241** verts, 62 fichiers (vitest 5 / happy-dom 20) — 11/09 |
| Couverture globale | ~~85,52 % lignes · 76,00 % branches · 78,55 % fonctions~~ → **95,96 %** lignes · 86,00 % branches · 99,05 % fonctions (11/09, `api-worker.js` 64 → 100 % de fonctions) — **mesure AST de vitest 5** (le 10/09 au matin, l'ancien outil disait 89,47 / 84,30 / 94,96 pour le même code : voir § 2) ; gate par fichier, exit 0 |
| Findings d'audit | **6** — les **5 de sécurité corrigés et prouvés** (0 ouvert) + **1 P3 vie privée** partiellement traité (numéro personnel dans 12 fichiers de test) |
| Fonctions cartographiées | **78** (F01–F78) |
| Fonctions sans aucun test | **2** (F18 sentinelles, F19 chronologie — vues admin en lecture seule) |
| Routes API | **64** dont **20 d'administration** |
| Secrets dans le dépôt | **0** |
| Passes obligatoires | **exécutées le 10/09** — live Apex Chat ✅ **20/20 après correction** (prod HTTP 200) · live domaine ✅ (1 surface KO hors périmètre) · **scan sécu exécuté, lu et trié** (§ 6.5) · pentest IA tué par le délai (1 MEDIUM non lisible) · **second avis : trouvé ÉTEINT (0 succès/100), réparé** |
| Tests navigateur réellement lancés en CI | ~~3 fichiers sur 22~~ → **22 / 22** (corrigé le 10/09, § 6.4 : `messaging-app-tests.yml` les lance sur 4 navigateurs ; premier run 4 voies vertes `34520911544`) |

---

## 7. Passe 3 — 2026-09-17 (v1.1.289 → v1.1.290) — mesures

| Passe | Résultat mesuré | Preuve |
|---|---|---|
| Live domaine (`audit-live.yml`) | ✅ 28/28 surfaces dont Apex Chat | run `35238418129` |
| Parcours live Apex Chat (`apex-chat-e2e.yml`, 2 clients) | ✅ | run `35238420921` |
| Tests CI (`messaging-app-tests.yml`, vitest + 4 navigateurs) | ✅ sur `main` avant correctifs | run `35238423613` |
| Scan sécu outillé (`security-suite.yml`, détail `messaging-app`) | 11 signalements Semgrep (5 WARNING dont 4 `missing-integrity` sur `dns-prefetch`/`preconnect`, 1 CORS déjà trié) + gitleaks faux positifs (PEM strip, jeton de test) | run `35238487325` |
| Pentest IA (`strix-scan.yml`) | ⚠️ lancé **sans `target`** → cible par défaut `worldmonitor` : 1 **CRITICAL** hors périmètre (Firebase `/apex` anonyme) ; **relancé sur `messaging-app`** → run `35254628554` ✅ rc=0, 33 min, gpt-5.4, **0 vulnérabilité confirmée**, verdict « inconclusive » : 5 zones « à valider » (JWT/SSO, autorisation objet, sinks worker, rendu/SW, CORS) — toutes déjà couvertes par des tests nommés (voir 03) ; **709 erreurs de flux LLM** pendant le run (outil instable) | runs `35238490127`, `35254628554` |
| Prod D1 (`system_config`, lu via MCP Cloudflare) | `ADMIN_MODE=B`, `KEVIN_INVISIBLE_ADMIN=false`, `e2e_strict` absent ; 7 utilisateurs, 3 conversations, 40 messages, 2 admins | requête SQL du 17/09 |
| Unitaires locaux avant | 63 fichiers · 1245 tests · couverture 94,31 / 86,00 / 99,05 / 95,96 | `vitest run --coverage` |
| Unitaires locaux après | **70 fichiers · 1341 tests** (96 tests neufs, 7 fichiers de garde) — ⚠️ mesuré **sans** `--coverage` | `vitest run` |
| CI `messaging-app-tests.yml` sur la branche | ❌ run `35255340099` : cliquet `ConversationDO.js` sous le seuil (fonctions 88,09 % < 89,7 %) — six `.catch` jamais exercés | `vitest run --coverage` |
| Unitaires locaux après correctif | **71 fichiers · 1347 tests**, `ConversationDO.js` 100 / 98,18 / 100 / 100, cliquet remonté ; tous seuils par fichier tenus | `vitest run --coverage` (sortie `EXIT=0`) |
| CI e2e 4 voies sur `703cc23db` | ❌ run `35256174034` : `tests` ✅, `chromium-desktop` ✅, `pixel-android` ✅, **`iphone-safari` ❌ 52, `iphone-se` ❌ 52** — WebKit ne démarre pas avec le drapeau Chromium posé en global (annotations du check-run) | `playwright test --project=…` (CI) |
| CI e2e 4 voies sur `14ef3cb53` (drapeau par projet) | ✅ runs `35256809407` et `35256814524` : `tests` ✅, **iphone-safari ✅, iphone-se ✅**, chromium ✅, pixel ✅ | `messaging-app-tests.yml` |
| e2e contre la **production** (`apex-chat-e2e.yml`) | ✅ run `35256269640` — « Prod OK (HTTP 200) », 3 scénarios (smoke, deux clients, push) | annotations du check-run |
| Audit LIVE de toutes les surfaces (`audit-live.yml`) | ✅ run `35256272025` — rc=0, **40 pages OK, 0 bloquante** ; Apex Chat : 1 requête tierce tolérée, 2 lignes de console (CSP `frame-ancestors` en meta) ; « version servie : non exposée par la page » (amélioration à faire) | check-run |
| Fusion | PR **#3890** fusionnée 18:03 UTC (`d4a2697f2`), PR **#3892** (WebKit) fusionnée ; `deploy-apex-chat.yml` sur main ✅ `35256806578` (worker v1.1.290 en ligne) | API GitHub |
| Second avis indépendant | Qodo run `35256337495` ✅ sur #3890 : 2 findings confirmés et corrigés (modales, IndexedDB), 1 faux positif (ticket #33), 39 fichiers non relus (budget) | commentaires PR |
| Tempête de télémétrie (locale, Firebase refusé) | **3 636 connexions en ~2 min** avant → **≤ 3 puis pause 5 min** après (test e2e) | proxy de session + Playwright |
| e2e local après correctifs Qodo | `retour-modale-et-effacement.spec.js` **3/3** Chromium | `playwright test` |
| Version servie lisible par l'audit live | `window.APEX_CHAT_VERSION` + `[data-ver]` sur le splash, concordance avec la barre — test e2e réel (4/4 dans le spec, 12/12 en répétition ×3) | `playwright test` |
| Boucle IndexedDB (locale, `indexedDB.open` refusé) | **7,9 Mo de journal en 2 min, rechargement impossible** avant → **≤ 3 avertissements**, `lg()` vivant après (test e2e) | trace locale + Playwright |
| Suite `retour-modale-et-effacement.spec.js` | **6 tests, 12/12** en répétition ×2 (Chromium) | `playwright test --repeat-each=2` |
| Second avis Qodo sur #3894 | run `35258517353` ✅ : 1 point valide (effacement bloqué), corrigé ; « ticket #33 » = faux positif récurrent → corps de PR du bot reformulé | commentaires PR |
| Passes d'amélioration (sous-agents, chiffrées) | UX/UI : **110 vues × 3 largeurs, 259 captures**, 6 P0 / 21 P1 / 11 P2 / 4 P3 · Code/archi : 16 orphelines (14,6 Ko), 0 doublon, `getAuthUser` 2–5 requêtes D1 × 83 handlers, 42 `catch` vides, 17/19 vues sans e2e, `npm audit` 0 vulnérabilité — annexes `annexes/2026-09-17-*.md` | scripts exécutés, sorties en annexe |
| **Toutes les fonctions en réel** (`tools/fonctions-reelles.mjs`) | **83 ✅ · 2 ❌ · 0 ⚪ / 85** en 175 s (front Chromium réel 174,9 s : 19 vues, 0 exception, **179 boutons cliqués, 0 mort**, 139 requêtes interceptées ; worker 0,7 s : 103 routes × 3 identités, gardes 401/403, 1 seul 500) ; 2 ❌ = `key-vault.js` non chargé (F36) et `PATCH /api/conversations/:id` 500 (F30) — relancé 2× avec le même verdict | `npm run test:fonctions-reelles` (sortie collée dans 06) |
| e2e Chromium local après | **56 / 56** (dont SW actif + cache peuplé) | `playwright test --project=chromium-desktop` |
| Boot (Chromium 375×812, API mockée) | LCP 116 ms (login) / 88 ms (liste) ; 0 exception ; 0 mutation DOM et 0 rendu au repos sur 3 vues ; 7–8 minuteries, aucune ≤ 1 s | passe perf |
| Chat 1 000 messages | rendu 84 ms ; 20 messages entrants 8,6 ms/msg ; 0 fuite DOM après 20 cycles | passe perf |
| Trafic de version | **6 × 841 Ko en 65 s** avant → HEAD + empreinte après | passe perf |
| WebSocket injoignable | **337 connexions / 5 min, 194 toasts** avant → backoff respecté, 3 toasts max après | passe UX |
| Cibles < 44 px à 375 | conversation 18/33, réglages 2/43 (mesuré avant) — en-tête corrigé, rail d'outils reste 40 px | passe UX |
| Navigation | 211 clics, 0 exception ; 2 boutons morts (📞 Contacts) corrigés | passe UX |
| `lint` | `echo 'no eslint config yet'` — **no-op** (inchangé, P3) | `npm run lint` |
