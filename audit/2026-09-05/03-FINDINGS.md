# 03 — FINDINGS (format obligatoire : [P] titre · axe · fichier:ligne · preuve · impact · cause racine · correctif · test · effort · régression)

## Corrigés dans cette passe (commit 4c4a469)

**[P0] Le réveil de la sonde par `fetch` vers `workers.dev` aurait échoué en 1042 — la surveillance n'aurait jamais tourné** · Exactitude · `services/kdmc-outlook/worker.js` · Preuve : doc Cloudflare (« only way … is via service bindings »), précédent identique sur ce compte (`19890a6d5`, apex-chat). · Impact : 0 passage, en silence. · Cause racine : je n'avais pas relu le précédent du dépôt avant de choisir `fetch`. · Correctif : `[[services]] binding="UPTIME"` + `env.UPTIME.fetch`, ping lancé **avant** la synchro mail (budget 50 sous-requêtes), `console.warn` au lieu d'un `catch` vide. · Test : smoke `/` doit rendre `"ts"` après un passage ; le prochain `modified_on`. · S · Régression : nulle (fail-open, ping en `waitUntil`).

**[P0] `notify()` n'a jamais pu envoyer une notification** · Exactitude · `services/kdmc-uptime/worker.js` · Preuve : `apex-push-worker.js handleSend` exige `{userIds, payload}` → `400 no_userIds` ; le routeur utilise `/send-all` + `{payload}`. · Impact : zéro alerte iPhone, jamais. · Cause racine : contrat du push-worker non relu. · Correctif : `/send-all` + `{payload:{title, body, tag, url}}`, `why` conservé. · Test : smoke `push.sent` quand `PUSH_ADMIN_TOKEN` est posé et qu'il y a quelque chose à signaler. · S.

**[P1] `/run` public = amplificateur ×33 sur le quota gratuit + push en rafale** · Sécurité · `worker.js` · Correctif : `POST` seul, en-tête `x-uptime-key = sha256(UPTIME_RUN_KEY + ':uptime-run')`, 1 passage / 5 min, CORS retiré sur `/run` ; smoke : 401 sans clé, 405 en GET. · S.

**[P1] État dans le Cache API = par datacenter** · Exactitude · Correctif : KV `ACCOUNTS` (id réel partagé), clé `upt:state:v1`, repli cache. · S.

**[P2] `push: claude/**` déployait la production depuis n'importe quelle branche** · Sécurité · 2 `deploy-*.yml` corrigés — ⚠️ **mais un TROISIÈME reste ouvert** : `deploy-apex-chat.yml:16` a toujours `- 'claude/**'` (re-mesuré 6.09.2026), donc tout push d'une branche de travail touchant `messaging-app/workers/**` déploie les Workers de production. C'est **délibéré et daté** dans le fichier (« v1.1.125 : tout push claude/* avec workers/** déclenche deploy ») → arbitrage rapidité de dev vs prod protégée, **à trancher par Kevin**, pas à changer en silence. · Preuve : `auto-merge-claude.yml:202-225` dispatche déjà chaque `deploy-*.yml` après fusion. · Correctif : `main` seul + `workflow_dispatch`, concurrence globale. Leçon #213 et fait n°16 corrigés. · S.

**[P2] `npm i -g wrangler` non épinglé, avec le jeton dans l'env du job** · Sécurité (Sonar C) · Correctif : `wrangler@4 --ignore-scripts`, jeton uniquement sur les étapes wrangler, `/accounts/<id>` masqué dans annotations et résumé. · S.

**[P2] `grep | tail | while` sous `pipefail` : un grep sans résultat tuait l'étape (faux rouge après un déploiement réussi)** · Exactitude · Preuve : reproduit par le relecteur (`code sortie=1`). · Correctif : `{ grep … || true; } |` partout (0 pipe non protégé, vérifié par script). · S.

**[P2] Test de couverture : commentaires lus comme des routes, ajouts hors littéral invisibles, `WORKERS` comparé à rien** · Architecture · Correctif : lignes `//` retirées (pas les blocs `/* */` : un `/*` dans une route avalait 13 entrées — mesuré), écriture hors littéral refusée, chaque `WORKERS` doit avoir un `wrangler.toml` (exception nommée `apex-secrets-proxy`). 2 sabotages prouvés. · S.

**[P3] Paquets de 8 > 6 connexions ; corps jamais consommé ; 429 compté en panne** · Exactitude · Correctif : paquets de 6, `body.cancel()`, 429 = vivant pour un worker. · S.

**[P3] `/` exposait les URL internes et les détails d'erreur longs** · Sécurité · Correctif : vue publique sans `url`, `detail` tronqué à 80. · S.

## Ouverts (par priorité)

**[P1] kdmc-rag : le jeton `CLOUDFLARE_API_TOKEN` n'a pas le droit Vectorize** · Infra · run 33979141283 `Authentication error [code: 10000]` · Impact : mémoire longue d'Apex jamais déployée (worker du 08/07, `/health` 404). · Correctif : Kevin, 1 clic (`KEVIN_ACTIONS_TODO.md`), puis relancer. · Effort : 1 min Kevin.

**[P1] 6 workers « en panne » au premier relevé — dont un qui n'existe pas (`apex-v13-backend`)** · Fonctionnalités · Preuve : annotation run 33979141313. · Cause probable : `/health` absent en ligne (rag = code du 08/07), rate-limit, ou worker jamais déployé. · Correctif **APPLIQUÉ le 6.09.2026** : cause racine = un Worker ne peut pas joindre un `*.workers.dev` du même compte (faux rouge, pas une panne) ; `apex-v13-backend` retiré de `WORKERS` ; santé des workers mesurée depuis le runner CI. · M.

**[P2] `apex-chat-api` tient 4 des 5 crons du compte** · Infra · `messaging-app/workers/wrangler.toml` · Correctif proposé (m027, territoire apex-chat) : 1 cron `*/5` + aiguillage sur l'heure → 3 places rendues (sonde horaire, monaco, sentinels). · M.

**[P2] `kdmc-monaco` : synchro 2 h morte depuis le 15/08 (réveillée par un cron GitHub rangé)** · Infra · `services/kdmc-monaco/wrangler.toml:13-16` · Correctif : même Service Binding depuis Outlook (territoire domain-kdmc, m028) ou une place cron libérée. · S.

**[P2] `KDMC_PUSH_TOKEN` = jeton admin du push-worker prêté à la sonde** · Sécurité · Correctif : jeton dédié accepté seulement sur `/send-all` (nouveau secret → Kevin). · S.

**[P2] Semgrep « vulnerable patterns » sur PR #3652 non trié** · Sécurité · illisible depuis la session ; à lire sur le run `semgrep.yml` (annotations) ou par Kevin.

**[P2] 47 noms de secrets consommés par des workflows mais absents de la liste documentée** · Infra · `06-SECRETS-CONNECTEURS.md` · Impact : un workflow qui attend un secret inexistant tourne avec une valeur vide et échoue tard. · Correctif : Kevin confirme la liste (capture), ou chaque workflow vérifie ses secrets en première étape avec un `::error::` nommé (schéma `deploy-kdmc-uptime.yml`).

**[P3] Améliorations chiffrées CMCteams (`audit:improvements`)** : 9 fonctions définies plusieurs fois (`fmtTs×2, normName×3, _norm×4, norm×3, _calcCycle×2, fmtD×3`) · 116 `innerHTML` sans `esc()` visible (figés par `xss-guard`) · 77 fonctions orphelines · 11 `setInterval` de plus que de `clearInterval` · 40/102 vues sans test · 5171 `style=`. Aucun en hausse.
