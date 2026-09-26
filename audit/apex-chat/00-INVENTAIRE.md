# Apex Chat — 00 · Inventaire réel

**Date de mesure** : 2026-09-10, re-mesuré le 2026-09-17 · **Version auditée** : `v1.1.288` → `v1.1.290`
**Méthode** : lecture des fichiers + commandes exécutées. Aucune valeur estimée.
**Statuts** : ✅ VÉRIFIÉ (commande exécutée) · 🟡 DÉDUIT (lecture) · 🔴 SUPPOSÉ

> Règle appliquée : **ne rien supposer sur la pile**. Tout ce qui suit vient de
> `package.json`, `wrangler.toml`, `ls`, `wc -l`, `grep` — pas d'un README.

---

## 1. Ce que c'est, en une phrase

Une messagerie privée (texte, médias, appels, stories) servie comme **une seule page HTML**
statique, adossée à **quatre Workers Cloudflare** et trois Durable Objects. Pas de framework,
pas d'étape de build, pas une seule dépendance en production.

---

## 2. Pile réelle ✅ VÉRIFIÉ

| Question | Réponse **mesurée** | Preuve |
|---|---|---|
| Framework front | **Aucun** — JS vanilla, un fichier | `index.html`, 0 import de framework |
| Bundler / build | **Aucun** | `package.json` : pas de `build` dans `scripts` |
| Dépendances de production | **Zéro** | `package.json` → `"dependencies": {}` |
| Dépendances de dev | **6** | vitest, @vitest/coverage-v8, @vitest/ui, happy-dom, @playwright/test, http-server |
| Backend | **Cloudflare Workers** (4) | `workers/*.js` + `wrangler.toml` |
| Temps réel | **Durable Objects** (3) | `workers/durable-objects/` |
| Base de données | **D1** (SQLite) — 27 tables | `d1-migrations/*.sql` |
| Fichiers | **R2** | `wrangler.toml` |
| Cache / éphémère | **KV** | `wrangler.toml` |
| Tests unitaires | **Vitest** + happy-dom | `vitest.config.js` |
| Tests navigateur | **Playwright** — 2 dossiers, **deux rôles** (les deux sont lancés — correction du 10/09) | `e2e/` (**3** fichiers, contre la **prod**, `apex-chat-e2e.yml`) · `tests/e2e/` (**19** fichiers, 56 tests, en **local HTTPS** sur 4 navigateurs, `messaging-app-tests.yml`) — voies iPhone rouges du 6 au 10/09 (finding P2, corrigé) |
| Hébergement du front | GitHub Pages | `.github/workflows/deploy-apex-chat.yml` |

> ⚠️ Le `README.md` du projet décrit une « Phase 1 (Foundation) en cours » avec des fichiers
> « à créer ». C'est **faux depuis longtemps** : tout existe. Le README est le document
> périmé, pas le code (voir `03-FINDINGS.md`, section « le code est juste, les docs mentent »).

---

## 3. Taille réelle ✅ VÉRIFIÉ (`wc -l`)

| Fichier | Lignes | Rôle |
|---|---:|---|
| `index.html` | **16 293** | Toute l'application cliente (HTML + CSS + JS) |
| `workers/api-worker.js` | **6 045** | API principale : auth, conversations, admin, médias, premium |
| `workers/ia-worker.js` | 418 | Fonctions IA (résumé, traduction, réponse suggérée) |
| `workers/push-worker.js` | 351 | Notifications push (VAPID) |
| `workers/sms-worker.js` | 132 | Envoi d'OTP par SMS |
| `workers/durable-objects/ConversationDO.js` | 823 | Temps réel d'une conversation (WebSocket) |
| `workers/durable-objects/BroadcastDO.js` | 7 | Diffusion |
| `workers/durable-objects/PresenceDO.js` | 4 | Présence en ligne |
| `workers/lib/cors.js` | 88 | Filtre CORS (v1.1.287) |
| `workers/lib/push-send.js` | 33 | Envoi push mutualisé |
| **Total code applicatif** | **24 194** | |

`lib/` (côté client, modules ESM testables) : 11 fichiers — `crypto-core`, `key-vault`,
`gesture-core`, `gif`, `media-gallery`, `message-grouping`, `message-search`,
`privacy-reciprocity`, `push-key`, `sw-handlers`, `visio-mesh`.

---

## 4. Surface d'API : 64 routes uniques ✅ VÉRIFIÉ

| Famille | Nb | Détail |
|---|---:|---|
| `/api/admin/*` | **20** | all-users, commands, configure-core-pair, connections, diag, force-update, force-update-ts, force-update-via-token, grant-premium, heal-dm, invite-magic, live-users, map, premium-requests, search, toggles, trusted-circle, turn-config, user-toggles, whitelist-bulk |
| `/api/ai/*` | 7 | image-describe, rewrite, search, smart-reply, summarize, translate, voice-transcribe |
| `/api/auth/*` | 8 | check-phone, magic-login, media-ticket, send-otp, sso-from-apex, sso-from-kdmc, verify-otp, ws-ticket |
| `/api/premium/*` | 3 | quota, request, status |
| `/api/push/*` | 3 | subscribe, test, unsubscribe |
| `/api/users/*` | 3 | heartbeat, me, me/avatar |
| `/api/test/*` | 2 | cleanup, login (verrouillées par `X-Test-Auth`) |
| `/api/turn*` | 2 | turn, turn/health |
| Autres | 16 | cgu/accept, contacts, conversations, gif, health, ia/chat, invitations, keys/prekeys, letters, media, memory-lane, polls, signalements, stories, system/config, time-capsules |

**Ce qui saute aux yeux** : **20 routes sur 64 sont des routes d'administration** — soit
presque un tiers de la surface. C'est ce qui rendait le P0 aussi grave (un jeton admin ouvrait
un tiers de l'API), et ce qui justifie que la porte admin soit le point le plus surveillé.

---

## 5. Base de données — 27 tables D1 ✅ VÉRIFIÉ

`ai_summary_cache` · `audit_log` · `cgu_acceptances` · `connections` · `contacts` ·
`conversation_members` · `conversations` · `device_trust` · `invitations` · `letters_queue` ·
`media` · `memory_lane_index` · `messages` · `otp_pending` · `polls` · `push_subscriptions` ·
`ratelimit_otp` · `signalements` · `stories` · `streaks` · `system_config` ·
`telemetry_buffer` · `time_capsules` · `user_activity` · `user_feature_overrides` · `users` ·
`voice_prints`

Migrations versionnées dans `d1-migrations/` (`0001_init.sql` → `0008_users_merged_into.sql`).

---

## 6. Scan de secrets — **P0 absolu, à faire en premier** ✅ VÉRIFIÉ

| Motif cherché | Résultat hors tests |
|---|---|
| `sk-ant-`, `AIza`, `ghp_`, `whsec_`, `sk_live_` | **0 résultat** ✅ |
| Numéro admin dans le fichier servi (`index.html`) | **0 résultat** ✅ (retiré v1.1.285) |
| Numéro admin ailleurs | **12 fichiers de test** uniquement (non servis). Retiré des documents en prose le 10/09 — voir finding **P3** (vie privée, pas sécurité) |

**Aucun secret actif n'est présent dans le dépôt.** Je le dis avec la preuve, plutôt que de
fabriquer un P0 pour faire riche.

---

## 7. Configuration déployée (`workers/wrangler.toml`) ✅ VÉRIFIÉ

| Variable | Valeur | Ce que ça décide |
|---|---|---|
| `ENV` | `production` | — |
| `ADMIN_MODE` | `A` | Mode admin (bascule réelle via D1 `system_config`, cette var = repli) |
| `KEVIN_INVISIBLE_ADMIN` | `true` | L'admin est membre invisible des conversations |
| **`ADMIN_BYPASS_REQUIRE_MFA`** | **`true`** | **Ferme la porte admin (P0)** — exige `X-Apex-Admin-Token` |
| **`ALLOW_TEST_OTP`** | **`false`** | **Ferme le backdoor OTP universel `000000`** |
| `AUTH_PROVIDER` | `firebase` | — |
| `JWT_ISSUER` | `apex-chat` | — |

Les secrets (`APEX_CHAT_ADMIN_TOKEN`, `JWT_SIGN_KEY`, clés SMS) sont des **secrets Cloudflare**,
jamais des `[vars]` — donc absents du dépôt.

---

## 8. Automatisations liées ✅ VÉRIFIÉ

| Workflow | Rôle |
|---|---|
| `messaging-app-tests.yml` | Suite de tests (le filet) |
| `apex-chat-e2e.yml` | **Deux vrais téléphones qui s'écrivent**, contre le worker déployé. ✅ Exécuté le 10/09 : **prod HTTP 200**, 18/20 puis **20/20 après correction d'un test SEO périmé**. Ne lance que `messaging-app/e2e/` (3 fichiers) |
| `deploy-apex-chat.yml` | Publication |
| `apex-chat-d1-backup.yml` | Sauvegarde de la base |
| `apex-chat-auto-force-update.yml` | Force la mise à jour des PWA en cache |
| `messaging-app-cache-sync.yml` | Aligne `sw.js` sur `APP_VER` |

---

## 9. Ce que cet inventaire n'a **pas** pu établir 🔴

- **La version réellement déployée.** `workers_get_worker` (MCP Cloudflare) ne renvoie ici que
  `name`/`id`, sans date de modification. Je ne peux donc pas affirmer que le worker en ligne
  porte la v1.1.288.
- ~~**Le comportement en production.**~~ ✅ **RÉSOLU le 10/09.** `workers.dev` reste refusé
  depuis la session, mais **`api.github.com` répond** (le proxy y injecte l'authentification) :
  la CI a donc été **déclenchée depuis ici** (`tools/ci/ci.mjs`). Résultat : **prod HTTP 200,
  20/20 des contrôles de bout en bout**. Ce n'était pas un mur, c'était un canal non testé.
- **`e2e_strict`** (chiffrement de bout en bout imposé ou non côté serveur) : la valeur vit en
  base (`system_config`), pas dans le dépôt. Elle décide si les messages sont stockés chiffrés
  ou en clair — c'est une inconnue qui compte, elle est reportée au `05-JOURNAL.md`.


---

## Re-mesure du 2026-09-17 (v1.1.290)

| Mesure | Valeur |
|---|---|
| `index.html` | 16 300+ lignes, 841 Ko brut / 232 Ko gzip, 15 blocs `<script>` (9 modules `lib/`), 1 428 `style=`, 138 `innerHTML` (621 `esc(`), 115 `catch(_){}` vides |
| `workers/api-worker.js` | ≈ 6 300 lignes après correctifs ; **96 couples méthode/chemin** (71 exacts + 25 motifs) — pas 64 comme écrit le 10/09 |
| Fichiers de tests | **70** vitest (1 341 tests) · 19 specs `tests/e2e` (4 navigateurs) · 3 specs `e2e/` (prod) |
| Pages statiques | `index`, `cgu`, `privacy`, **`mentions` (nouveau)**, **`aide` (nouveau)**, `diag`, `force-update`, `force-logout` |
| Icônes | `icons/icon-{180,192,512}.png` (nouveaux, générés depuis `icon.svg`) + SVG |
| Service Worker | `sw.js` **module** (import statique de `lib/sw-handlers.js`), 3 caches `apex-chat-v1.1.290-*` mesurés |
| Prod D1 (lu le 17/09) | 7 utilisateurs · 3 conversations · 40 messages · `ADMIN_MODE=B` · `KEVIN_INVISIBLE_ADMIN=false` |
| Adresse officielle | `https://apex-chat.kd-mc.com/` (routeur → GitHub Pages) ; `APEX_CHAT_BASE_URL` alignée |
| `lib/` non chargés en prod | `key-vault.js` (jamais importé), `crypto.js` (wrapper redondant) — P2 |
