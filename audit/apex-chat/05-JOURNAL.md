# Apex Chat — 05 · Journal de l'audit : décisions, hypothèses, non-vérifié

**Période** : 2026-09-05 (passe 1) → 2026-09-10 (passe 2, re-mesure et livrables manquants)
**Version auditée** : `v1.1.281` → `v1.1.288`

Ce document existe pour une seule raison : **déclarer les angles morts au lieu de les masquer.**

---

## 1. Chronologie

| Date | Ce qui s'est passé |
|---|---|
| 05/09 | Passe 1. Lecture du code + reproduction de la faille en bac à sable. 5 findings, dont un P0. Seul `03-FINDINGS.md` est écrit. |
| 06/09 | Correctifs livrés : v1.1.283/284 (porte admin), 285 (admin par le nom), 286 (ticket WebSocket), 287 (CORS), 288 (ticket média). Chacun avec son test discriminant. |
| 06–09/09 | Chapitre annexe : ménage des branches. Verrou identifié — `GH013`, une **règle du dépôt** (ruleset `16725169`), qu'aucun jeton ne contourne. 18 annulations dormantes fermées. |
| **10/09** | **Passe 2.** Re-mesure complète, correction du P0 périmé, écriture des 5 livrables manquants. |

## 2. Décisions prises, et pourquoi

### 2.1 Ne pas réécrire le finding P0 — l'annoter

Le P0 était rédigé comme *ouvert* alors qu'il est fermé depuis le 6. J'aurais pu réécrire la
section proprement. Je ne l'ai pas fait : **la description de la faille d'origine est ce qui
permet de vérifier que le correctif ferme bien ce trou-là**. Un audit qui efface le problème
une fois réglé ne laisse aucun moyen de contrôler le correctif. J'ai donc gardé le texte du
05/09 tel quel, et ajouté au-dessus un bandeau daté + en dessous la chaîne de preuve mesurée.

### 2.2 Ne pas contourner le refus réseau

Toute requête vers le worker déployé revient en `CONNECT tunnel failed, response 403`.
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` ne montre aucun `recentRelayFailures` : le refus
vient de la **politique de sortie**, pas du service. La règle est explicite — on signale un
403, on ne le contourne pas. J'ai donc écrit noir sur blanc que **la vérification en production
n'a pas eu lieu**, et nommé le chemin qui a le réseau ouvert (`apex-chat-e2e.yml`), plutôt que
de chercher un tunnel de traverse ou de laisser croire que c'était vérifié.

### 2.3 Ne pas lire le code du worker déployé via MCP

`workers_get_worker_code` aurait pu me donner le code réellement en ligne — c'était la réponse
directe à « la production porte-t-elle le correctif ? ». J'ai renoncé : 6 045 lignes ramenées
dans le contexte pour une seule ligne d'intérêt. Le rapport coût/bénéfice ne tenait pas.
**Conséquence assumée** : la question reste ouverte, et elle est écrite comme telle.

### 2.4 Ne pas toucher à la règle du dépôt (branches)

375 branches `claude/*` traînent ; 231 sont supprimables sans risque (toutes ancêtres de `main`,
inactives depuis plus de 7 jours). La suppression est refusée par une **règle du dépôt**
(`GH013`, ruleset `16725169`) — pas par un problème de jeton, contrairement à ce que j'ai cru
pendant quatre heures. **Recommandation : laisser la règle en place.** Ces branches ne coûtent
rien (invisibles dans l'app, impossibles à fusionner par accident), et la règle protège du vrai
travail contre une suppression automatique. L'automatisation sonde une fois par livraison, écrit
la cause exacte dans `.github/CLEANUP-REPORT.md`, puis s'arrête — elle repartirait seule si la
règle changeait.

## 3. Hypothèses assumées

| # | Hypothèse | Pourquoi je l'assume | Ce qui l'invaliderait |
|---|---|---|---|
| H1 | Le worker en production tourne bien la v1.1.288 | Le dépôt et la config versionnée portent le correctif ; les workflows de déploiement existent et passent | Un déploiement bloqué ou en retard — visible dans l'onglet Actions |
| H2 | Les 20 routes `/api/admin/*` sont toutes derrière la même garde d'authentification | Lecture du routage : elles passent par le même `getAuthUser` | Une route ajoutée plus tard qui court-circuiterait le contrôle |
| H3 | Les ~16 % non couverts d'`api-worker.js` sont des branches d'erreur | Les zones non couvertes signalées par v8 sont en fin de fichier et dans les `catch` | Un audit ligne à ligne, que je n'ai pas fait |

**H3 est la plus fragile** et je la donne comme telle : je ne l'ai pas vérifiée exhaustivement.

## 4. Ce que je n'ai PAS pu vérifier — liste complète

| # | Non vérifié | Bloquant | Comment le fermer |
|---|---|---|---|
| 1 | Le comportement du service **en production** | Egress 403 | Actions → `apex-chat-e2e.yml` |
| 2 | La **version déployée** du worker | `workers_get_worker` ne renvoie pas `modified_on` | Onglet Actions, dernier `deploy-apex-chat.yml` réussi |
| 3 | Les **19 scénarios Playwright** | ~~Navigateurs absents de cette session~~ → **fermé le 10/09** : Chromium **était** préinstallé (`/opt/pw-browsers`), 56/56 en local ; en CI, voies iPhone rouges depuis le 06/09 (P2, corrigé) | Lire le premier run vert de `messaging-app-tests.yml` |
| 4 | Le **second avis indépendant** (non-Claude) | Non déclenché dans cette passe | Actions → `ai-review-independent.yml` |
| 5 | Le **scan sécu outillé** (gitleaks, Semgrep, OSV, Trivy, zizmor) | Idem | Actions → `security-suite.yml`, `strix-scan.yml` |
| 6 | La **passe de stabilité** (re-rendus au repos, scintillement) | Pas de navigateur | Mesure `MutationObserver` en CI |
| 7 | Le **contraste WCAG** des couples de couleurs | Non calculé | axe-core en CI |
| 8 | `e2e_strict` en production | La valeur vit en base (`system_config`), pas dans le dépôt | Requête D1 ou `/api/system/config` |
| 9 | Les **99 `innerHTML`** un par un | Seuls les 8 qui interpolent une variable ont été inspectés | Cliquet sur `innerHTML` sans `esc()` |
| 10 | **F18** (sentinelles admin) et **F19** (chronologie admin) | Aucun test nommé | Un smoke de rendu de ces deux vues |

## 5. Ce dont je ne suis pas certain

- **L'étendue réelle de l'accès au contenu des conversations avec un jeton admin volé.** Le
  statut de membre invisible est certain (`kevin_invisible`). Savoir si l'attaquant peut
  *déchiffrer* demanderait de rejouer un vrai échange de clés entre deux clients. Je décris
  donc ce qui est prouvé (identités, numéros, GPS, pouvoirs d'administration) et je laisse le
  reste ouvert, plutôt que d'annoncer « il lit tous tes messages ».
- **Si `MEMO_KEVIN_RESTE_A_FAIRE.md` contenant le numéro admin est un vrai risque.** Le fichier
  n'est pas servi par le site, mais le dépôt est **public**. Le numéro n'est plus un secret
  d'authentification depuis v1.1.284 — donc ce n'est plus une faille, c'est une donnée
  personnelle qui traîne. Je le signale sans le classer P0 : ce serait crier au loup.

## 6. Auto-critique de cette passe 2 (obligatoire)

**Le point le plus faible de mon audit** : j'ai laissé un livrable **mentir pendant quatre
jours**. Le P0 était corrigé le 6, prouvé par un test discriminant, et `03-FINDINGS.md` le
décrivait toujours comme ouvert le 10. Ce n'est pas un détail de mise à jour : un document
d'audit périmé sur son point le plus grave discrédite les quatre lignes justes qui
l'accompagnent. La cause est identifiable — j'ai livré les correctifs et les tests (le travail
qui « compte »), sans revenir fermer la ligne dans le document qui, lui, est ce que Kevin lit.
La règle des documents à jour dans le même commit existait déjà ; je ne l'ai pas appliquée au
dossier d'audit.

**Le deuxième point faible** : le protocole exige six livrables. Il n'y en avait **qu'un**
pendant cinq jours. Un audit qui ne produit qu'un fichier de findings n'a pas d'inventaire à
opposer aux affirmations, pas de cartographie pour prouver qu'il n'a rien sauté, pas de journal
pour dire ce qu'il n'a pas vu. Les cinq manquants sont écrits aujourd'hui — mais ils décrivent
un état mesuré **le 10**, pas ce que j'aurais vu le 5. C'est honnête, ce n'est pas équivalent.

**Ce que je n'ai pas pu vérifier** : les dix points de la section 4. Le plus gênant est le n°1
— je certifie le **code du dépôt**, pas le **service en ligne**. Ces deux phrases ne sont pas
interchangeables et je me suis interdit de les confondre dans les cinq documents.

**Ce dont je ne suis pas certain** : que la cartographie F01–F78 soit vraiment exhaustive. Elle
est construite à partir des routes API, des fonctions `render*` et des modules `lib/` — donc
elle attrape tout ce qui a une adresse ou un nom de rendu. Une fonctionnalité qui vivrait
uniquement dans un gestionnaire d'événement anonyme, sans route ni vue, n'apparaîtrait pas.
Je n'ai pas de moyen de prouver qu'il n'y en a aucune ; je dis donc « 78 fonctions
identifiées », pas « les 78 fonctions de l'application ».

---

## 2026-09-10 (soir) — le scan sécu est lu ; ce que j'ai décidé

| Décision | Pourquoi |
|---|---|
| Trier le scan **par reproduction locale** (npm audit, lecture des fichiers, awk sur les workflows) plutôt qu'attendre le rapport détaillé | Le rapport détaillé est derrière un 403 ; ce qui se reproduit sans réseau se prouve ici, ligne par ligne |
| Mettre à jour les outils de test (vitest 5, happy-dom 20) au lieu de « noter pour plus tard » | 7 vulnérabilités connues, correctif sans risque pour l'app (paquets de test), prouvé par 1117/1117 |
| Ne **pas** épingler les actions officielles sur un SHA | La règle du dépôt exige une version publiée, c'est le cas ; le SHA est un durcissement, pas une faille — consigné en recommandation. **11/09 : appliqué** sur le « Go » de Kevin (23 `uses:`, SHA résolus par `git ls-remote`) |
| Ne **pas** relancer Strix | 13,77 $ l'exécution, tuée par le délai ; relancer sans allonger le délai reproduirait l'échec. Décision de Kevin. **11/09 : « Go »** → avant de relancer, lecture du code de Strix (il écrit dans `strix_runs/`, pas `agent_runs/`, et il écrit à l'interruption) ; workflow corrigé (bon dossier, plafond de dépense 15 $, profondeur `standard`, 75 min, inventaire dans le check-run), puis relancé |
| Réparer l'environnement de test local par des **liens**, pas en modifiant le test | `verify-lingua-voix.mjs` échouait pour `Cannot find package 'playwright'` puis pour une version de Chromium (1243 attendue, 1194 installée) : deux liens symboliques (paquet de `messaging-app/node_modules`, binaire `headless_shell`), zéro téléchargement, test inchangé → 26/26 |
| Construire `detail_path` sur `security-suite.yml` | 9 signalements Semgrep impossibles à identifier autrement ; un compte ne se trie pas |

**Hypothèse écrite** : les 9 signalements Semgrep non identifiés de `messaging-app` sont
probablement de la même famille que les 1 159 du dépôt (balises sans `integrity`, liens `http`,
`path.join`), donc des recommandations plutôt que des failles — **c'est une hypothèse, pas un
résultat**, et elle sera remplacée par la lecture du check-run détaillé.

**Non vérifié** : le contenu de la vulnérabilité MEDIUM annoncée par Strix — **11/09 : lu**
(run `34588162278`) : 2 MEDIUM, les deux vérifiées dans le code et corrigées (voir
`03-FINDINGS.md`). **Vérifié ensuite** : routeur corrigé déployé (runs `34591858792` puis
`34593899829`, gate SSO 25/25 avant chaque déploiement) ; page Apex Chat v1.1.289 publiée
(`deploy.yml` run `34592467330`) et parcours live vert après (`apex-chat-e2e.yml` run
`34593090073`) ; test navigateur réel du SSO vert sur le vrai routeur (`kdmc-sso-e2e.yml` run
`34593741155`, après 30 exécutions rouges d'affilée pour une installation cassée).
**Hypothèse écrite** : le résiduel « passage écrit dans la fiche par un uid forgé » n'a pas
d'impact au-delà du journal des connexions — non prouvé par un test, consigné comme accepté.
**Vérifié le 11/09** : le balayage live relancé (run `34588152564`) donnait Lingua rouge avec le
même message ; cause trouvée en rejouant la sonde pas à pas en local — elle remplissait un champ
(`#acName`) remplacé le 05/09 par prénom + nom (`#acPrenom`/`#acNom`). **Défaut de la sonde**,
corrigé dans `tools/smoke/audit-live.mjs`. **Non vérifié depuis la session** : le verdict en
ligne après cette correction — il est dans le check-run du balayage déclenché par le push.

---

## Passe 3 — 2026-09-17 — décisions, hypothèses, non-vérifié

| Décision | Pourquoi |
|---|---|
| Lancer les 5 passes CI **avant** de lire une ligne de code | Elles sont longues ; leur verdict sur `main` intact sert de référence (tout était vert). |
| 7 sous-agents en parallèle, **lecture seule**, puis vérification par moi de chaque finding | Un sous-agent sur-cote (règle #83) : 5 « findings » écartés avec preuve (voir 03). |
| SW en **module** plutôt qu'un fichier généré par script | Un générateur = un fichier de plus à oublier de régénérer (c'est exactement ce qui est arrivé à `sw.js`) ; le module est le montage natif, gardé par test. |
| Bloquer le SW dans les tests e2e mockés, l'autoriser dans le seul test qui le vérifie | `page.route` n'intercepte pas les fetch d'un SW : 6 tests cassés dès que le SW a marché. Le test SW est strict sur Chromium, **annoncé** (annotation) sur WebKit. |
| Chiffrer la sauvegarde avec une clé dérivée de `JWT_SIGN_KEY` | Règle « pas de nouveau secret par app » ; HKDF isole l'usage. Outil de déchiffrement livré (une sauvegarde sans restauration n'en est pas une). |
| **Ne pas patcher** les règles Firebase `/apex` | Apex v13 s'y connecte lui-même en anonyme ; bloquer = casser. Correctif réel = jetons par rôle. Reporté à Kevin comme P0 domaine. |
| `e2e_strict` appliqué mais **OFF par défaut** | Activer d'office casserait les conversations dont la clé du pair n'est pas encore publiée. Kevin l'allume dans l'admin quand il veut. |
| Liens d'invitation vers `apex-chat.kd-mc.com` | C'est l'adresse officielle (canonical, CGU, routeur) et github.io cessera de répondre le jour où le dépôt passe en privé. |
| `check-phone` garde le prénom (« re-bonjour Marie ») mais perd `admin_authorized` et gagne un plafond | Le prénom est l'UX voulue ; le statut admin n'a rien à faire avant preuve de possession. |

**Erreur commise et corrigée** : Strix lancé **sans `--input target`** → il a scanné la cible par défaut (World
Monitor), 15 $ pour une autre app. Relancé sur `messaging-app`. La règle est notée (leçon #271). Le résultat
de ce second run n'était pas disponible à l'écriture de ce journal.

**Hypothèses** :
- H4 : WebKit (Playwright) fait tourner un SW module sur certificat auto-signé — **non prouvé localement**
  (pas de WebKit ici) ; le run CI 4 voies le dira, le test l'annote plutôt que d'échouer.
- H5 : GitHub Pages (via le routeur) renvoie un `ETag` stable sur `HEAD` — sinon la page est relue au plus
  toutes les 10 min (dégradé sûr, jamais bloqué).
- H6 : `APEX_CHAT_KV` est lié en production (wrangler.toml le dit) — sinon les « soins » tournent comme avant.

**Non vérifié** : le rendu iPhone réel (icône PNG, bandeau d'installation, clavier) ; la suppression de compte sur
la vraie base (testée sur mocks D1/R2, pas en prod) ; le déchiffrement d'une sauvegarde réelle de R2 avec le vrai
secret ; le comportement des liens d'invitation via le routeur (query string) ; Vonage en production.

**Faux vert commis et corrigé (17/09, 17:55 UTC)** : j'avais annoncé « 1 341 tests verts » sur la foi d'un
`vitest run` local **sans `--coverage`**. La CI (`messaging-app-tests.yml`, run `35255340099`) lance
`vitest run --coverage`, et le cliquet par fichier de `ConversationDO.js` a rougi : 99,02 / 96,36 / 88,09 / 99,13
contre 99,3 / 96,4 / 89,7 / 99,3. Cause racine : mon code neuf (alarme de flush, E2E strict) était couvert, mais il a
grossi le dénominateur pendant que **six rappels d'erreur `.catch(...)` anciens n'avaient jamais été déclenchés**
par aucun test. Correctif = `tests/unit/conversation-do-rappels-erreur.test.js` (6 tests : config qui plante,
`read` en panne D1, push d'appel en échec, web-push qui rejette, `setAlarm` qui rejette, télémétrie qui rejette)
→ mesuré **100 / 98,18 / 100 / 100**, cliquet remonté à cette mesure. 71 fichiers · 1 347 tests. Leçon #272.

**Deuxième faux vert (17/09, 18:05 UTC)** : le run `35256174034` de `messaging-app-tests.yml` a rougi sur les deux
voies **iPhone (WebKit)** — 52 tests — alors que Chromium et Pixel étaient verts. Cause : le drapeau Chromium
`--ignore-certificate-errors` (ajouté pour que le Service Worker accepte le certificat local) était dans le `use`
global de Playwright et partait aussi à WebKit, qui ne démarre pas avec. Je n'ai pas de WebKit en local : je n'avais
vu que Chromium. Correctif : drapeau posé **par projet Chromium** ; WebKit garde `ignoreHTTPSErrors`. Leçon #273.

**Suite (18:10–18:30 UTC)** : PR #3890 puis #3892 fusionnées ; 4 voies e2e vertes en CI sur `14ef3cb53` ; e2e prod ✅ ;
audit live 40/40 ✅ ; worker redéployé depuis main ✅. Second avis Qodo lu et trié : 2 vrais points corrigés (v1.1.291)
avec tests réels, 1 faux positif, couverture partielle déclarée. **Trouvé en passant, en mesurant** : la boucle de
télémétrie (P1, 3 636 requêtes/2 min quand Firebase est refusé) — ni les 7 sous-agents ni les scanners ne l'avaient
vue ; c'est le proxy de session qui l'a fait remonter. Leçon #274.
**Kevin (18:20)** : « Test toutes les fonctions en réel toujours · audit d'amélioration +++ UX/UI » → trois passes
lancées en parallèle (harnais F01…F78 en vrai Chromium, audit UX/UI mesuré à 375 px, audit code/archi chiffré) ;
résultats à consigner dans `06-*.md` à leur arrivée. Strix `messaging-app` reçu 18:20 : 0 confirmé, inconclusive, 5 zones déjà couvertes par des tests nommés (03-FINDINGS).
**19:00** : harnais « toutes les fonctions en réel » livré et exécuté 2× (même verdict 83/2/85). **Erreur commise** : j'ai
relancé le volet worker seul (`--only=worker`) pour vérifier, ce qui a **écrasé** le rapport complet (36 ⚪) — relancé en
entier (175 s) avant de committer. Piège noté dans l'en-tête de l'outil : `--only` régénère aussi le rapport.
Décision : le coffre à clés (F36, P1) sera activé dans un lot **séparé** après le lot UX (même fichier `index.html`), avec
vérification d'aller-retour avant tout retrait de clé en clair — pas de course sur le fichier, pas de perte d'historique.

## Passe 4 — 2026-09-24 — comparaison au schéma d'architecture WhatsApp (Kevin « compare et améliore »)

Kevin a envoyé le schéma d'architecture WhatsApp de référence (HackProduct) sans légende, puis a précisé
vouloir une comparaison à Apex Chat + implémentation des améliorations qui en valent vraiment la peine.
Un sous-agent en lecture seule a comparé pièce par pièce (fichier:ligne cité) : la forme générale correspond
(socket live séparé du REST historique/média, relais qui ne lit pas les tickets, un seul WS par device via
`ConversationDO`) ; deux écarts (pas de Redis pub/sub cross-instance — inutile tant qu'un DO = une conversation ;
pas de pipeline Kafka événements/analytics séparé) sont des simplifications raisonnables à l'échelle actuelle,
pas des fautes d'architecture. **Une seule piste identifiée comme potentiellement « vraiment utile »** :
`e2eStrict()` reste un interrupteur admin (D1 `FEATURE_E2E_STRICT`), pas une garantie absolue « le serveur ne
lit jamais » — contrairement au principe du schéma.

**Vérifiée avant d'agir (règle #83/#131) — et reclassifiée, pas corrigée.** Lecture de `lib/crypto-core.js:339-353`
(`decideWire`) : le mode `'clear'` (texte assumé en clair) est un **choix explicite et testé côté client**, pas
un oubli — un utilisateur peut opter pour du clair sur une conversation (`e2eOn=false`), et le mode `'pending'`
protège déjà le cas où la clé du contact n'est pas encore là (jamais d'envoi en clair silencieux). Et le
`05-JOURNAL.md` lui-même (Passe 3, 17/09) avait déjà tranché : *« Activer d'office casserait les conversations
dont la clé du pair n'est pas encore publiée. Kevin l'allume dans l'admin quand il veut. »* Rendre `e2eStrict()`
inconditionnel casserait donc une fonctionnalité opt-out réelle et déjà décidée — ce serait une régression, pas
une amélioration. **Aucun changement de code effectué.** Le sous-agent de comparaison avait raison sur la forme
(c'est bien un interrupteur, pas une garantie structurelle) mais tort sur la conclusion (« à rendre absolu ») :
il n'avait pas vu `decideWire` côté client ni la décision déjà actée en Passe 3. Leçon : un « écart versus un
schéma de référence » n'est pas automatiquement un bug à corriger — vérifier d'abord si l'écart est un choix
produit assumé.


## Passe 5 — 2026-09-26 — F30 en production

- Les Actions sont revenues (~17:09 UTC, voir ETAT-INFRA fait n°23). Déploiement Apex Chat relancé
  à la main sur `main` → **réussi**.
- **Ajouté** à `e2e/two-clients.spec.js` : Bob (créateur, donc propriétaire) renomme la conversation
  de test → **200** exigé ; Alice (membre) → **403** exigé. Conversation effacée avec les comptes
  de test en fin de run, rien ne traîne.
- **Piège évité** : un run « vert » ne prouvait rien, ce test se **saute** quand le secret de test
  manque, et journaux + artefacts sont inatteignables (proxy). Ajouté au workflow : bilan
  réussis/sautés/échoués **en annotations** (seul canal lisible par l'API). Résultat lu :
  17 réussis, 3 sautés (WebKit WebSocket + 2 permissions notifications, connus), 0 échec →
  `two-clients` a bien **tourné** sur Chromium.
- Reste ouvert : **F36** (clé privée E2E en clair dans localStorage, `key-vault.js` non chargé).
