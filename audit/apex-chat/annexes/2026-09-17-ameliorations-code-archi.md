# RAPPORT — PASSE AMÉLIORATIONS TOTALES · Apex Chat (`messaging-app/`)

**Date** : 2026-09-17 · **Mode** : lecture seule (0 fichier suivi touché, 0 commit)
**État mesuré** : commit `6138d9612` (« Apex Chat v1.1.291 », 2026-09-17 18:17:40 UTC), figé dans `snapshot/` — `index.html` sha256 `0e42dcbd…`, `workers/api-worker.js` sha256 `774eaf60…` (fichier `snapshot.sha256`).
**Ce qui a bougé pendant l'audit** : `index.html` a été modifié deux fois par une autre session entre 17:51 et 18:17 (16 538 → 16 609 lignes), puis encore après le snapshot (sha courant `c7dfcf9f…`). **Tous les chiffres et numéros de ligne ci-dessous viennent du snapshot = commit 6138d9612.** Un chiffre d'une passe antérieure au snapshot est signalé « (avant snapshot) ».

**Outils créés (dans ce dossier, jamais dans le dépôt)** : `audit-messaging.cjs` (réapplication des 5 axes de `tools/audit/improvements-audit.cjs` + mesures 1-9), `worker-catch.cjs` (analyse fine des `catch` du worker), `rendered-measure.cjs` (Chromium 141 local, API mockée, réseau externe bloqué), `eslint.config.mjs` / `eslint.config.front.mjs` (ESLint 10.1.0 global `/opt/node22/bin/eslint`). Sorties brutes : `audit-messaging.log/.json`, `worker-catch.log/.json`, `rendered-measure.log/.json`, `eslint-front.json`, `eslint-modules.json`, `eslint-tests.json`, `vitest-run.log`.

**Réseau** : contrairement au brief, le **registre npm a répondu** (`npm outdated` et `npm audit` ont tourné et sont donc mesurés). Les sites tiers (workers.dev, Firebase, unpkg) restent bloqués par le proxy (mesuré : `ERR_FAILED`).

Statuts : ✅ mesuré (commande exécutée, sortie dans les fichiers cités) · 🟡 déduit (lecture du code) · 🔴 non mesuré.

---

## A. TABLEAU DES MESURES

| # | Mesure | Nombre | Méthode | Statut |
|---|---|---|---|---|
| 1 | Fonctions déclarées dans `index.html` (`K.x = function` 536, `K.x = (…)=>` 1, `function x` 48, `const x = ()=>` 3) | **588** | `audit-messaging.cjs` §1 (regex ligne à ligne) | ✅ |
| 1 | …dont **jamais citées ailleurs** (ni appel, ni `K[name]`, ni `onclick=`, ni gabarit, ni autre page/lib/test) | **16** = 14 580 o | comptage d'identifiants sur tout le fichier + grep 7 pages html, 11 lib, sw, 97 fichiers de tests ; `K[…]` dynamique = **0** occurrence | ✅ |
| 1 | Bloc de code inatteignable (après `return`) | **1** = l.7378-7431, 53 lignes, 2 022 o (`K._handleAuthPhone`, « LEGACY OTP désactivé v1.1.170 ») | ESLint `no-unreachable` | ✅ |
| 1 | `render*` définies mais absentes du `switch` de `K.render` | **1** (`renderAdminUsers` l.12940 ; `renderAuthStep` et `renderToggleSection` sont appelées directement, 11 et 9 refs) | §1 | ✅ |
| 2 | Fonctions définies 2 fois — index.html / api-worker.js (158 déclarations top-level) / lib intra-fichier / même export dans 2 libs | **0 / 0 / 0 / 0** | §2 | ✅ |
| 3 | Modules `lib/*.js` : chargés par `<script type=module>` | **9** (l.85-93) = 45 870 o brut / 16 141 o gzip | §3 + `python3` gzip | ✅ |
| 3 | `key-vault.js` chargé ? | **NON** — `crypto.js:18` : `// await import('./lib/key-vault.js');` (commenté). `index.html` l'appelle 8× derrière `window.ApexVault &&` (l.6907, 6950, 7095) → le chiffrement de la clé privée par PIN **ne tourne jamais en prod** ; 2 918 o testés à 100 % jamais livrés | grep | ✅ |
| 3 | `crypto.js` (racine) | loader de `crypto-core.js` ; `ApexCrypto` cité **72×** → utilisé | §3 | ✅ |
| 3 | `gif.js` côté navigateur | chargé (2 460 o / 1 111 gz) mais **aucune fonction appelée** : 1 seule référence `window.ApexGif &&` l.11578 (test de présence). Le worker, lui, importe `giphySearchUrl/giphyTrendingUrl/mapGiphyResults` (l.42, 5687, 5692) | §3 + grep | ✅ |
| 3 | Autres modules | tous consommés (par alias : `ApexGesture` l.6799, `ApexGallery` l.4494, `ApexSearch` l.6560/6600, `ApexPushKey` l.2820, `ApexGrouping` l.7879, `ApexPrivacy` 3 sites, `ApexVisio` 3 sites) ; exports non exposés sur `window` : `gif.giphySearchUrl/giphyTrendingUrl`, `visio-mesh.ICE_SERVERS` | grep | ✅ |
| 4 | `index.html` brut / gzip-9 | **863 368 o / 238 281 o** ; JS inline 828 360 o / 228 769 o ; CSS 25 660 o / 6 535 o | `python3 gzip` | ✅ |
| 4 | `style="` inline | **1 451** (1 dans le HTML statique, 1 450 dans les gabarits JS) · 676 chaînes distinctes · `flex:1` ×121, `margin-top:14px` ×64, `margin-top:10px` ×36, `color:var(--ax-text-3)` ×31, `color:var(--ax-gold)` ×30 · `display:flex` inline ×110 | §4 + `grep -o \| sort \| uniq -c` | ✅ |
| 4 | `innerHTML =` | **139** affectations · **35** sans `esc()`/`escapeHtml`/`textContent` ET avec donnée interpolée (liste §B4) | §4 (méthode `estTexteFixe` de l'outil racine, étendue aux gabarits multi-lignes) | ✅ |
| 4 | `TODO/FIXME/HACK/XXX` | **1** (`TODO` l.14181) | §4 | ✅ |
| 4 | `console.log` en prod | **10** (l.477, 484, 594, 597, 641, 1004, 1686, 8365, 8447, 8703) · `console.warn/error` 29 | §4 | ✅ |
| 4 | `setInterval` vs `clearInterval` | **19 vs 15** · **9** `setInterval` dont l'id n'est stocké nulle part (inarrêtables) : l.531, 624, 657, 1282, 4293, 4799, 10774, 15073, 16425 | §4 | ✅ |
| 4 | Minuteries **réellement actives** après boot (DOM rendu) | **7** intervalles (3×60 s : `_checkRemoteVersion`, `_checkAdminForceUpdate`, `_autoDeleteCron` ; 4×30 s : `_runSentinelsEnriched`, `_updateUnreadBadge`, `ax_scheduled_msgs`, `msg_reminders`) + 37 `setTimeout` posés | `rendered-measure.cjs` (wrap de `setInterval`) | ✅ |
| 4 | `addEventListener` vs `removeEventListener` | **64 vs 0** · `{once:true}` : 1 (l.1832) | §4 | ✅ |
| 4 | Écouteurs `window/document` posés dans une fonction | 35 lignes détectées, dont 16 = boilerplate d'installation one-shot (`readyState`/`DOMContentLoaded`, 8 fonctions `_install*` à 2 sites d'appel chacune) ; **réellement re-posés à chaque `_postLogin`** : 7 (l.15077, 15082 ; `_startHeartbeat` l.1284, 1287, 1294 ; `_startScheduledChecker` l.6100, 6101) | §4 + comptage des sites d'appel | ✅ (empilement réel si reconnexion sans rechargement : 🟡) |
| 4 | `!important` | **6** (`prefers-reduced-motion` ×4, `.h{display:none}`, mode impression, `.msg.find-active`, `.msg-selected`) | §4 | ✅ |
| 4 | CSS : règles / sélecteurs / variables / `@media` / `@keyframes` | **231 / 220 / 20 / 9 / 7** | §4 | ✅ |
| 4 | Sélecteurs `.classe/#id` dont la classe n'existe **nulle part** dans le HTML/JS | **12** : `.tabbar`, `.bottomnav`, `.fl`, `.fc`, `.fg`, `.gap`, `.gap2`, `.gap3`, `.pseudo-chip`, `.gallery-tab`, `.gallery-tab.active`, `.mention` — les 12 sont aussi « jamais appliqués » au DOM rendu | §4 statique ∩ couverture CSS Chromium | ✅ |
| 4 | Règles jamais appliquées au DOM rendu (19 vues, données **vides**) | 179/231 — **borne haute non fiable** : l'outil marque `body` et `.bnav-btn` « non appliqués » alors qu'ils le sont → couverture CSS Chromium inexploitable sur une feuille inline | `page.coverage.startCSSCoverage` | 🔴 (résultat rejeté) |
| 4 | `catch` silencieux côté front | `_safeCatch('silent', …)` **101** / 182 appels `_safeCatch` · ESLint `no-empty` **156** blocs vides | grep + ESLint | ✅ |
| 5 | Routes du worker / handlers distincts | **96 / 95** (`_workerHandler.fetch` l.5703-5895) | §5 (parse de la table `if (path === …)`) | ✅ |
| 5 | Routes admin (`/api/admin/*`, `/api/test/*`) / sans garde `is_admin`/`ADMIN_TOKEN` | **24 / 1** : `GET /api/admin/force-update-ts` → **volontairement publique** (commentaire l.5472 « tous users peuvent fetch ») → reclassée OK | §5 (garde cherchée dans le handler et ses délégués) | ✅ |
| 5 | Routes sans aucune authentification | **8** : send-otp, check-phone, sso-from-apex, sso-from-kdmc, force-update-ts, `GET /api/invitations/:code`, magic-login, system/config | §5 | ✅ |
| 5 | `catch` dans le worker | **156** : 42 vides `{}` · 26 non vides qui n'utilisent PAS l'erreur et ne loggent rien · 1 `return json(…)` générique sans cause (force-update-ts, fail-open voulu) · 44 renvoient la cause · 26 loggent la cause · 2 re-throw | `worker-catch.cjs` | ✅ |
| 5 | Boucles contenant `.prepare()` (N+1) | **35** — sur chemin chaud : `getAuthUser` (l.259, appelé par **83** handlers : 2 à 5 requêtes D1 par requête HTTP), `handleContacts` (l.3452 : 1 requête par contact, admin = tous les comptes), `handleAdminAllUsers` (l.3615 : 1 COUNT par user), `handleAdminLiveUsers` (l.3872 : 1 COUNT par user, ≤200), `handleAdminDiag` (l.2800/2818/2823) ; les 30 autres = cron/heal/maintenance | §5 (scan d'accolades) | ✅ |
| 5 | `Cache-Control` | **1** occurrence dans tout le worker (média l.1818) ; `makeJson` n'en pose jamais → **173** `json()` + **294** `err()` sans ; **36/37 routes GET** sans | §5 | ✅ |
| 5 | Listes sans `LIMIT` | **2/19** GET `.all()` : `handleListMembers` (`/api/conversations/:id/members`), `handleContacts` (`/api/contacts`) ; `handleExportMe` LIMIT 100 000 | §5 | ✅ |
| 5 | Secrets / clés en dur | **0** clé (motifs sk-ant/AIza/ghp_/xkeysib/PEM/JWT) ; 7 numéros = fixtures de test (`+336000000 91/92` l.1027/1076 du worker, `+33612345678` l.13587-13593 exemple UI) | §5 | ✅ |
| 5 | En-têtes de sécurité posés par le worker | HSTS 0 · Permissions-Policy 0 · Referrer-Policy 0 · X-Frame-Options 0 · CSP 0 · COOP/CORP 0 · `X-Content-Type-Options` 1 (média) · `Set-Cookie` 0 (Bearer) · point unique existant : `applyCors` l.6266 | §5 | ✅ |
| 5 | Handlers avec rate-limit (429) | **11/95** ; sensibles sans : sso-from-apex, sso-from-kdmc, `POST /api/media`, `GET /api/media/:id`, prekeys, ws-ticket, media-ticket, signalements, premium/request, admin/grant-premium, admin/premium-requests, premium/status, premium/quota, push/subscribe, push/unsubscribe, push/test, magic-login, test/login (18) | §5 | ✅ |
| 5 | Fonctions du worker jamais citées dans le worker | **1** (`_isTrustedCircleAsync` l.516, exportée, citée par les tests seulement) | §5 | ✅ |
| 6 | Suite unitaire | **71 fichiers · 1 347 tests · 100 % verts · 21,1 s** (happy-dom créé 71× = 33 s / 67 % du temps) | `npx vitest run` (`vitest-run.log`) | ✅ |
| 6 | Fichiers unit par cible | api-worker **39**, ConversationDO 7, crypto-core 4, sw-handlers 2, cors/push-send/ia/push/sms/gesture/gif/key-vault/gallery/grouping/search/privacy/push-key/visio/Broadcast/Presence **1** chacun, gardes-grep 8 · **0** import pour `index.html`, `sw.js`, `crypto.js` | §6 | ✅ |
| 6 | Assertions | **2 491** `expect()` dans 1 264 `it()` · molles **141 (5,7 %)** : `toBeTruthy()` 60, `toBeDefined()` 30, `toBeUndefined()` 26, `resolves.toBeUndefined()` 13, `not.toThrow()` 9, `toBeFalsy()` 3 · **10** `it()` dont la seule assertion est `resolves.toBeUndefined()` (liste §B6) | §6 | ✅ |
| 6 | E2E | `tests/e2e` **20 specs / 59 test()** (4 projets Playwright) + dossier legacy `e2e/` **3 specs / 10 test()** sur prod live, config séparée, `@playwright/test ^1.45` non installé | ls + grep | ✅ |
| 6 | Vues `K.sv` sans aucune mention e2e | **17/19** (seules `chats` et `chat` sont citées) | §6 | ✅ |
| 6 | `npm run lint` | `echo 'no eslint config yet'` (no-op) · ESLint 10 global disponible | package.json | ✅ |
| 6 | ESLint réel (config minimale §annexe) | **index.html** : 1 erreur (`no-unreachable` l.7378) + 415 avertissements (259 `no-unused-vars` dont 244 paramètres de `catch`, 15 vraies variables mortes ; 156 `no-empty`) · **22 modules** : 0 erreur réelle (2 `no-undef AbortSignal` = global Workers absent de ma config) + 129 avert. (81 unused, 48 empty) · **97 fichiers de tests** : 0 erreur réelle (3 `EventTarget` idem) + 39 avert. | `eslint -f json` | ✅ |
| 7 | Ordre de chargement | l.85-93 : 9 `<script type=module src>` (différés, exécutés dans l'ordre après le parse) · l.94 `crypto.js defer` · l.464 script inline classique 10,8 Ko · l.618 inline (K défini) · **l.708 inline classique 785,6 Ko (bloque le parseur)** · l.16555 inline 1 Ko · HTML statique avant le gros script : 8,8 Ko | §7 | ✅ |
| 7 | Boot rendu (Chromium local, sans réseau) | `domInteractive` **219 ms**, DCL 222 ms, load 222 ms · `ScriptDuration` 43 ms · `TaskDuration` 264 ms · Layout 74 ms · heap JS 2,0 Mo · 316 nœuds · 69 écouteurs ; après 19 vues : 2 423 nœuds, 239 écouteurs, heap 2,1 Mo | `rendered-measure.cjs` (CDP `Performance.getMetrics`) | ✅ (sur 4G réelle : 🔴) |
| 7 | Requêtes ratées au boot local | 2×404 `/__sso/whoami` (SSO domaine, attendu hors kd-mc.com) + `…/health` et `firebase …/ax_telemetry_in.json` bloqués | `page.on('response')` | ✅ |
| 7 | Repos 6 s vue `chats` | **0** `K.render()`, **1** mutation DOM | MutationObserver + wrap | ✅ |
| 7 | 19 vues rendues | **19/19 sans `pageerror`** · 5 `console.error` (1 « frame-ancestors ignoré en meta », 2×404 whoami, 2 unpkg bloqués sur admin-map) · cibles tactiles < 44 px : chats 1, chat 1, calls 1, admin-diag 1 | `rendered-measure.cjs` | ✅ |
| 7 | Polices | `@font-face` 0, Google Fonts 0, 9 `font-family` (système) | §7 | ✅ |
| 7 | `<img>` | **14** (statiques + gabarits) · `loading=lazy` 5 · `decoding=async` 0 · 9 non lazy (l.3692, 3802, 3943, 5465, 5498, 7816, 9933, 11769, 11804 = avatars/aperçus dans modales) | §7 | ✅ |
| 7 | Poids déférable par domaine (blocs de fonctions, nom ∋ motif) | admin **78,4 Ko / 20,7 gz** (53 fn) · visio **59,3 / 17,3** (45) · settings 43,6 / 12,7 · ia 35,0 / 12,5 · crypto_e2e 21,1 / 7,8 · map 16,0 / 5,7 · polls/letters/capsules 15,5 / 5,2 · premium 10,8 / 3,8 · stories 5,4 / 2,2 → **admin+visio+map = 153,7 Ko brut / 43,7 Ko gz** (19 % du JS gzip) | §7 | ✅ |
| 7 | 12 plus grosses fonctions | `_handleWsMessage` 18,7 Ko, `_boot` 15,9, `renderAuthStep` 9,1, `renderSettings` 8,2, `renderChat` 8,0, `renderChats` 7,3, `_runDiag` 6,9, `_renderBubble` 6,6, `_openInsightsModal` 6,6, `_submitOnboarding` 6,4, `_handleAuthPseudo` 6,0, `openPrivacyPrefs` 6,0 | §7 | ✅ |
| 7 | CDN tiers | Leaflet **1.9.4** via unpkg, chargé à la volée sur `admin-map` seulement (l.13943/13948) ; `npm view leaflet version` = **1.9.4** (à jour) | grep + npm | ✅ |
| 7 | SW precache | 8 entrées dont 5 pages annexes (cgu 9 426 + privacy 9 118 + mentions 4 092 + aide 6 819 + force-update 9 038 = **38 493 o**) · icon-512 34 446 o | `lib/sw-handlers.js:21` | ✅ |
| 8 | CSP `script-src` | `'self' 'unsafe-inline' https://unpkg.com` · `style-src` idem · **478** attributs `on*=` (453 `onclick`, 9 `oninput`, 9 `onchange`, 4 `onkeydown`, 3 `onload`) · 275 gabarits `onclick="K.x` distincts · **154** passent une donnée dans l'attribut · 62 `.style.x =` · `eval`/`new Function` 0 | §8 + grep | ✅ |
| 8 | Meta `http-equiv` présents | CSP, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, Cache-Control/Pragma/Expires — **`frame-ancestors` ignoré en meta** (console Chromium l'a dit), `X-Content-Type-Options` et `Permissions-Policy` en meta ne sont pas honorés par les navigateurs (seuls CSP et Referrer-Policy le sont) | mesure console + spec HTML | ✅ / 🟡 |
| 8 | Cookies / jeton | `Set-Cookie` 0 ; JWT en `localStorage` clé `apex_chat_token` (`ls('token')` l.1212, 8363, 16308) — lisible par tout script inline · 24 clés `localStorage` distinctes | §8 | ✅ |
| 8 | Rate-limit par route | 11/95 (voir #5) · aucun binding Cloudflare Rate Limiting dans `wrangler.toml` (table `ratelimit_otp` D1 uniquement) | §5 + wrangler.toml | ✅ |
| 9 | WebSocket DO | `server.accept()` **7×**, `acceptWebSocket()` **0**, `webSocketMessage` **0**, `this.sessions` Map en mémoire (11 refs) → **Hibernation API non utilisée** ; coût réel des DO éveillés : 🔴 | grep ConversationDO.js | ✅ / 🔴 |
| 9 | Notifications | `new Notification()` in-page **2** (l.4308 rappels, l.10512 nouveau message si onglet caché) ; Push API en place (`pushManager.subscribe` 3, SW `showNotification` 1) | grep | ✅ |
| 9 | IndexedDB | enveloppe kv brute de **9 lignes** (l.835-843), 1 store ; messages persistés en **localStorage** `messages_<conv>` (7 sites) sans plafond trouvé (seul `slice(-200)` l.6465 pour l'affichage) | grep | ✅ (quota atteint en vrai : 🔴) |
| 9 | QR | **2** usages `api.qrserver.com` (l.5575 lien d'invitation avec code ; l.9955 QR paiement montant + destinataire) → données envoyées à un tiers ; générateur local : absent de `node_modules` ; un chunk `apex-qr-backup-*.js` existe dans `services/kdmc-router/pages-upload/apex-ai-v13/` (réutilisable ? 🔴 non vérifié) | grep | ✅ / 🔴 |
| 9 | Giphy | **0** appel direct côté front ; proxy worker `/api/gif` avec clé serveur ✅ | grep | ✅ |
| 9 | Dépendances | `npm outdated` : **4** (vitest 5.0.0→5.0.1, @vitest/coverage-v8 5.0.0→5.0.1, @vitest/ui 5.0.0→5.0.1, happy-dom 20.14.3→20.14.5) · `npm audit` : **0** vulnérabilité (info/low/moderate/high/critical = 0) | npm (registre joignable) | ✅ |

---

## B. LISTES NOMINATIVES

### B1 — 16 fonctions orphelines (index.html, snapshot) — 14 580 o
| Fonction | Ligne | Octets | Note |
|---|---|---|---|
| `_authSendOtp` | 1028 | 505 | legacy OTP ; aussi `no-unused-vars` ESLint |
| `_authVerifyOtp` | 1053 | 521 | idem |
| `K._markAllConvsRead` | 1501 | 863 | |
| `K._getConvLabels` | 2594 | 139 | |
| `K._recreatePush` | 2872 | 1 366 | citée UNIQUEMENT par `tests/e2e/push-key-heal.spec.js` → test d'une fonction non câblée dans l'UI |
| `K._parseHashtags` | 3650 | 221 | |
| `K._toggleFilterUnread` | 4373 | 508 | |
| `K._outboxCountFor` | 8293 | 211 | |
| `K._toggleRatchet` | 10407 | 487 | |
| `renderAdminUsers` | 12940 | 1 562 | remplacée par `renderAdminLiveUsers` (case `admin-users` l.7638) ; lit `PRECONFIGURED_USERS` |
| `K._adminViewLiveUser` | 13242 | 4 181 | lit `PRECONFIGURED_USERS` (liste figée retirée en v1.1.206) |
| `K._featureEnabledForUser` | 13466 | 304 | |
| `K._removeBiometric` | 14927 | 631 | **retrait Face ID jamais exposé dans l'UI** |
| `K._invitePickContact` | 15862 | 967 | doublon fonctionnel de `_invitePickContactSend` (l.15825, utilisée) |
| `K._sendInvite` | 15936 | 1 826 | |
| `K._startCheckout` | 16218 | 288 | |

Vérification de chaque candidate : 1 seule occurrence du nom dans `index.html` (sa déclaration), `K[…]` dynamique inexistant (0), aucune occurrence dans aide/cgu/diag/force-*/mentions/privacy.html, lib/, sw.js, ni dans les 97 fichiers de tests (sauf `_recreatePush`, voir note).

15 variables mortes ESLint (hors paramètres de `catch`) : l.520 `_authSendOtp`, 545 `_authVerifyOtp`, 2326/2370/2399 `_u`, 2331/2375/2412 `_p`, 2416 `_r`, 4098 `diag`, 6889 `fetchErr`, 7373/7457 `_g`, 12432 `renderAdminUsers`, 13361 `seed` (numéros = fichier concaténé des 3 blocs inline, décalage ≈ +464).

### B4 — 35 `innerHTML` avec donnée interpolée sans `esc()` visible sur la ligne
l.1817, 2522, 3228, 3233, 4546-4548, 4952-4958, 5817, 6370, 6394, 6417, 6432, 6488, 6497, 6729, 7265-7266, 11019, 11572-11575, 11583, 12454-12462, 12522-12527, 12919-12929, 12943-12950, 13021, 13367-13419, 13553, 13581-13625, 13883-13898, 13931, 13937, 13975, 14278-14284, 14347, 14772-14776, 15001, 16207.
Triage 🟡 (lecture) : la majorité interpolent `${r.status}` (entier HTTP), un `.map()` de constantes (`K._QUICK_REACTIONS`) ou une chaîne vide → **pas une faille**, mais 4 gabarits longs (l.13367-13419, 13581-13625, 12919-12929, 13883-13898) mélangent données serveur et HTML sur plusieurs lignes : à relire un par un (le garde `xss-guard` de l'app racine n'existe pas ici — voir backlog).

### B5 — Worker : 42 `catch {}` vides (lignes)
172, 202, 253, 271, 1036, 1286, 1308, 1310, 1328, 1330, 1721, 1838, 1843, 2071, 2175, 2210, 2250, 2252, 2254, 2255, 2259, 2284, 2326, 2470, 2707, 2720, 3085, 3438, 3448, 3533, 4282, 4342, 4886, 4920, 5423, 5462, 5532, 5570, 5602, 5686, 6132, 6247 — par fonction : `consolidateKevinIntoAdmin` ×5, `handleDeleteMe` ×4, `getAuthUser` ×3, `handleCreateConversation` ×2, `handleHealDm` ×2, `handleContacts` ×2, 24 autres ×1.
26 `catch` non vides qui avalent sans logger : `verifyJWT` l.153, `consumeWsTicket` 174, `getAuthUser` 228/243, `captureConnection` 405/409, `_dbTrustedCircleList` 514, `handleTrustedCircle` 530, `handleVerifyOtp` 898, `handleSsoFromKdmc` 1170/1185/1204, `handleListConversations` 1584, `handleUploadPrekeys` 1670, `handleKeyBundle` 1697, `_canonicalId` 2182, `_healOverpopulatedDms` 2506, `handleHealDm` 2520, `handleAdminDiag` 2770/2771, `handleContacts` 3466, `handleGetContact` 3502, `handleAiSummarize` 4701/4725, `handlePremiumRequest` 4838, `performDailyBackup` 6208.

### B6 — Tests : 10 `it()` dont la seule assertion est `resolves.toBeUndefined()`
`api-heal-overpop-dms` « DB en erreur → best-effort, pas de crash » · `api-worker-connections` « est exporté et appelable » · `api-worker-scheduled` « cron */5 sans queues → catch silent » · `api-worker-utils` « sans config Firebase → return silent » et « fetch throw → catch silent » · `conversation-do` « notifyOfflineMembers DB error → catch silencieux », « flushToD1 sans TELEMETRY_QUEUE → fail silencieux », « DB throw → catch silencieux » · `visio-mesh` « peer inconnu → no-op silent », « addIceCandidate throw → catch silent ».
Assertions molles par fichier (top 5) : `conversation-do.test.js` 36, `visio-mesh.test.js` 18, `crypto.test.js` 9, `api-do-two-clients.test.js` 7, `api-worker-fonctions-non-appelees.test.js` 6.
17 vues sans e2e : contacts, calls, settings, admin, admin-diag, admin-users, admin-live-users, admin-connections, admin-toggles, admin-sentinels, admin-audit, admin-invite-book, admin-trusted-circle, admin-search, admin-timeline, admin-map, admin-premium.

---

## C. BACKLOG CLASSÉ (P0 → P3)

Format : `[Px] titre · mesure réelle · action (fichier:ligne) · effort S/M/L · risque de régression`.
Aucun P0 : rien de cassé ni de faille nouvelle n'a été trouvé par cette passe (c'était son périmètre : ce qui marche mais peut être meilleur).

**[P1] Le chiffrement de la clé privée par PIN est livré mais dormant** · `crypto.js:18` commenté, `key-vault.js` (2 918 o, 100 % couvert) jamais chargé, 3 gardes `window.ApexVault &&` (index.html l.6907, 6950, 7095) court-circuitées → `crypto_priv` reste en clair dans `localStorage` · action : décommenter `await import('./lib/key-vault.js')` (crypto.js:18) **après** le test iPhone réel annoncé dans le commentaire, ou retirer les 3 branches mortes · effort S (1 ligne) · risque **M** (migration de clé sur les appareils existants : `planKeyMigration` l.6907 prévu pour ça).

**[P1] `getAuthUser` coûte 2 à 5 requêtes D1 par requête HTTP, sur 83 handlers** · l.240-271 : `SELECT merged_into` + `LIKE '%tail'` (scan sans index possible) + boucle `while (hops < 3)` · action : une seule requête `SELECT id, is_admin, is_banned, status, merged_into FROM users WHERE id=?` puis résolution récursive **uniquement si `merged_into` non nul** ; mettre le résultat en cache mémoire du Worker (Map, TTL 60 s) · effort M · risque M (fusions de comptes : garder les tests `api-worker-kevin-admin`, `api-heal-overpop-dms`).

**[P1] `handleContacts` : N+1 sans LIMIT sur le chemin le plus fréquent** · l.3452 : 1 `SELECT … WHERE id=?` **par contact** ; admin = tous les comptes actifs ; 0 `LIMIT` (mesure #5) · action : `WHERE id IN (?,?,…)` en 1 requête (D1 `batch()` ou `IN` avec 100 paramètres max) + `LIMIT 500` · effort S · risque faible (même sortie, tests `api-worker-contacts.test.js`).

**[P1] `handleAdminAllUsers` / `handleAdminLiveUsers` : 1 COUNT par utilisateur** · l.3615 et l.3872 · action : `SELECT user_id, COUNT(*) c FROM conversation_members WHERE user_id IN (…) GROUP BY user_id` en 1 requête · effort S · risque faible.

**[P1] Le garde ratchet « améliorations » n'existe pas pour messaging-app** · l'outil racine `tools/audit/improvements-audit.cjs` ne lit que `index.html` racine ; ici 0 baseline · action : déposer `audit-messaging.cjs` (ce dossier) en `messaging-app/tools/audit/improvements-audit.cjs` + `improvements-baseline.json` figé sur les compteurs ci-dessus (orphelines 16, doublons 0, innerHTML 35, TODO 1, console.log 10, setInterval sans id 9, vues sans e2e 17) + script `audit:improvements` dans `package.json` · effort S · risque nul.

**[P1] 16 fonctions orphelines + 1 bloc inatteignable = 16,6 Ko de code mort** · liste B1 + l.7378-7431 · action : supprimer `_authSendOtp`, `_authVerifyOtp`, le bloc LEGACY OTP, `renderAdminUsers`, `_adminViewLiveUser` (6,8 Ko à eux cinq, tous liés à des mécanismes retirés en v1.1.170/v1.1.206) ; **câbler** `K._removeBiometric` (bouton « Retirer Face ID » dans `renderSettings`) et décider pour `_recreatePush` (testée en e2e mais jamais offerte à l'utilisateur) ; supprimer ou câbler les 9 autres · effort S · risque faible (0 référence mesurée).

**[P2] `lint` est un no-op** · `package.json:12` ; ESLint réel = 1 erreur + 583 avertissements (415 front + 129 modules + 39 tests) dont 213 blocs vides · action : ajouter `eslint.config.mjs` (annexe, avec `AbortSignal`, `EventTarget`, `WebSocketPair` dans les globaux) + `"lint": "eslint lib workers sw.js crypto.js tests"` + extraction des blocs inline de `index.html` (script de 6 lignes, cf. `eslint-src-concat.js`) ; règle `no-unused-vars` avec `caughtErrors: 'none'` pour ne pas crier sur les 244 `catch(_e)` · effort S · risque nul.

**[P2] Réponses JSON du worker sans `Cache-Control`** · 173 `json()` + 294 `err()` ; 36/37 GET · action : dans `workers/lib/cors.js:makeJson`, ajouter `'Cache-Control': 'no-store'` (les réponses portent des données personnelles et un Bearer) ; garder le `private, max-age=31536000` du média · effort S (1 ligne) · risque nul.

**[P2] En-têtes de sécurité HTTP absents du worker** · HSTS/Referrer-Policy/X-Frame-Options/Permissions-Policy/CSP API = 0 ; point unique `applyCors` l.6266 · action : y ajouter `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (API JSON) — sauf sur la 101 WebSocket déjà exclue · effort S · risque faible (tester le 101 et le média).

**[P2] `frame-ancestors`, `X-Content-Type-Options` et `Permissions-Policy` sont en `<meta>` donc inopérants** · console Chromium mesurée ; GitHub Pages ne pose pas d'en-têtes · action : les poser dans le routeur kd-mc.com (`services/kdmc-router/worker.js`) pour `apex-chat.kd-mc.com` ; garder les meta en défense en profondeur · effort S · risque faible · 🔴 non vérifié si le routeur les pose déjà.

**[P2] `unsafe-inline` : 478 attributs `on*=` dont 154 avec donnée dans l'attribut** · migration vers `data-action` + 1 délégation `document.addEventListener('click')` (275 gabarits distincts) · effort **L** · risque M (chaque bouton = un test e2e « clique tout » à écrire d'abord) ; gain : retrait de `'unsafe-inline'` de `script-src` (nonce impossible sur Pages statique → hash du script inline).

**[P2] Boucle de rendu = `innerHTML` complet de `#app` à chaque `K.render()`** · 19 vues, `renderChats` 7,3 Ko, `renderChat` 8,0 Ko ; 0 rendu au repos (✅ pas de scintillement) mais chaque message entrant reconstruit la vue (préservation du focus faite à la main l.7620) · action : diff léger pour la liste de messages (append du dernier `<div class="msg">` au lieu de reconstruire) · effort M · risque M.

**[P2] 7 écouteurs globaux re-posés à chaque `_postLogin` sans retrait** · l.15077, 15082, 1284, 1287, 1294, 6100, 6101 ; `removeEventListener` = 0 dans tout le fichier · action : garde `if(K._postLoginInstalled) return;` ou `AbortController` + `signal` · effort S · risque faible · empilement réel : 🟡 (dépend d'une reconnexion sans rechargement).

**[P2] 9 `setInterval` inarrêtables** · l.531, 624, 657, 1282, 4293, 4799, 10774, 15073, 16425 (7 actifs mesurés après boot) · action : stocker les ids dans `K._timers[]`, `clearInterval` à la déconnexion et quand `document.hidden` (règle batterie iPhone, leçon #143) · effort S · risque faible.

**[P2] `gif.js` chargé côté navigateur pour un test de présence** · 1 111 o gzip + 1 requête au boot pour `window.ApexGif &&` (l.11578) · action : retirer la balise l.89 et le test ; le worker garde son import · effort S · risque nul.

**[P2] Vues admin/visio/map = 43,7 Ko gzip chargés pour tout le monde** · action : sortir `renderAdmin*` + `_admin*` (78,4 Ko brut) et la visio (59,3 Ko) en `lib/admin.js` / `lib/visio.js` chargés par `import()` dans `K.sv` quand `view.startsWith('admin')` / à l'ouverture d'un appel · effort M · risque M (les fonctions vivent sur `K.`, l'import doit les y attacher avant `render`).

**[P2] 42 `catch {}` vides + 26 `catch` qui avalent sans logger dans le worker** · liste B5 · action : au minimum `console.warn('[fn]', e.message)` (règle « cause exacte » CLAUDE.md) ; les 3 de `getAuthUser` et `consumeWsTicket` méritent une télémétrie · effort S · risque nul.

**[P2] 17 vues sur 19 sans test e2e nommé** · action : un smoke `render-all-views.spec.js` qui fait `K.sv(v)` pour les 19 vues avec l'API mockée et exige 0 `pageerror` (c'est exactement `rendered-measure.cjs` : 19/19 OK aujourd'hui) · effort S · risque nul.

**[P2] 10 tests dont l'unique assertion est `resolves.toBeUndefined()` + 141 assertions molles** · liste B6 · action : remplacer par une assertion sur l'effet (mock appelé / non appelé, `console.warn` reçu) · effort S · risque nul.

**[P3] 1 451 `style="` inline (676 chaînes distinctes)** · `flex:1` ×121, `margin-top:14px` ×64, `margin-top:10px` ×36, couleurs var ×61 · action : 6 classes utilitaires (`.f1`, `.mt14`, `.mt10`, `.mt8`, `.t3`, `.gold`) couvrent 332 occurrences ; le CSS a déjà `.fl/.fc/.fg/.gap*` **jamais utilisés** (mesure #4) : les employer · effort M · risque faible.

**[P3] 12 sélecteurs CSS morts** · `.tabbar`, `.bottomnav`, `.fl`, `.fc`, `.fg`, `.gap`, `.gap2`, `.gap3`, `.pseudo-chip`, `.gallery-tab`, `.gallery-tab.active`, `.mention` · action : supprimer ou utiliser (voir ci-dessus) · effort S · risque nul.

**[P3] happy-dom instancié 71 fois = 67 % des 21 s de la suite** · action : `pool: 'vmThreads'` ou `environment: 'node'` par défaut + `// @vitest-environment happy-dom` sur les 2-3 fichiers qui touchent le DOM · effort S · risque faible · gain : 🔴 non mesuré (à chronométrer).

**[P3] Dossier `e2e/` legacy** · 3 specs / 10 tests sur prod live, `@playwright/test ^1.45` non installé, 2ᵉ config Playwright · action : déplacer `two-clients.spec.js`/`push.spec.js` dans `tests/e2e` derrière `process.env.APEX_CHAT_URL`, supprimer le dossier · effort S · risque faible.

**[P3] 10 `console.log` en prod** · l.477, 484, 594, 597, 641, 1004, 1686, 8365, 8447, 8703 · action : `console.debug` derrière `K.config.debug` · effort S · risque nul.

**[P3] 4 paquets en retard (patch)** · vitest/coverage-v8/ui 5.0.0→5.0.1, happy-dom 20.14.3→20.14.5 · `npm update` · effort S · risque faible (relancer les 1 347 tests).

**[P3] Précache SW : 38,5 Ko de pages annexes à chaque installation** · `lib/sw-handlers.js:21` · action : laisser cgu/privacy/mentions/aide en runtime-cache (SWR) · effort S · risque nul.

**[P3] 9 `<img>` sans `loading=lazy` / 0 `decoding=async`** · lignes en #7 (modales et aperçus) · effort S · risque nul.

---

## D. LES 10 CHANTIERS À PLUS FORT RAPPORT VALEUR / EFFORT

1. **`getAuthUser` en 1 requête + cache 60 s** (P1, M) — touche 83 handlers = presque toute la latence perçue.
2. **`handleContacts` en 1 requête `IN (…)` + LIMIT** (P1, S) — route appelée à chaque ouverture de l'app (mesuré : `GET /api/contacts` au boot).
3. **Activer `key-vault.js` ou retirer ses 3 branches** (P1, S) — 2,9 Ko de sécurité testée qui ne tourne pas.
4. **Baseline + garde `audit:improvements` pour messaging-app** (P1, S) — rend cette passe permanente (ratchet sur 7 compteurs).
5. **`Cache-Control: no-store` dans `makeJson` + en-têtes de sécurité dans `applyCors`** (P2, S, 2 fichiers, ~8 lignes).
6. **Supprimer 16,6 Ko de code mort + câbler `_removeBiometric`** (P1, S) — une fonctionnalité de sécurité (retrait Face ID) attend un bouton.
7. **`lint` réel** (P2, S) — 1 erreur et 213 blocs vides deviennent visibles à chaque push.
8. **Smoke e2e « 19 vues, 0 pageerror »** (P2, S) — le script existe déjà (`rendered-measure.cjs`), 17 vues passent de 0 à 1 test.
9. **Minuteries stockées + arrêt quand l'onglet est caché** (P2, S) — 7 intervalles réveillent l'iPhone toutes les 30-60 s même en arrière-plan.
10. **Retirer la balise `gif.js` du front** (P2, S) — 1 requête et 1,1 Ko gzip de moins au boot, 0 changement fonctionnel.

Chantiers plus lourds à programmer ensuite : délégation d'événements (retrait de `'unsafe-inline'`, L), découpage admin/visio en modules différés (43,7 Ko gzip, M), Hibernation API sur `ConversationDO` (M, gain 🔴 non mesuré).

---

## E. AUTO-CRITIQUE

**Le point le plus faible de mon audit** : la couverture CSS sur DOM rendu. Chromium a marqué `body` et `.bnav-btn` « jamais appliqués » — le résultat (179/231) est donc faux et je l'ai écarté ; seule la mesure statique (12 sélecteurs dont la classe n'existe nulle part) est fiable, et elle est une **borne basse**. Même limite pour la couverture JS (106/781 fonctions exécutées) : mesurée avec des conversations **vides**, donc sans valeur pour dire « ce code ne sert jamais ».

**Ce que je n'ai pas pu vérifier** :
- Le temps de boot sur réseau réel (4G, GitHub Pages derrière le routeur) : mesuré en local seulement (219 ms domInteractive), le transfert de 238 Ko gzip n'est pas chronométré.
- Le coût réel des Durable Objects non hibernés (facturation/temps éveillé) : aucune donnée Cloudflare accessible.
- Si le routeur kd-mc.com pose déjà HSTS/`frame-ancestors` pour `apex-chat.kd-mc.com` (proxy fermé).
- Le quota `localStorage` atteint en vrai avec des conversations longues (`messages_<conv>` sans plafond trouvé).
- Si le chunk `apex-qr-backup-*.js` d'Apex v13 est un générateur QR réutilisable (fichier compilé, non lu).
- L'empilement effectif des 7 écouteurs de `_postLogin` : il dépend d'une reconnexion sans rechargement, non reproduite.

**Ce dont je ne suis pas certain** :
- Le triage des 35 `innerHTML` sans `esc()` est une lecture ligne par ligne (🟡), pas une preuve d'innocuité : 4 gabarits longs restent à relire.
- La détection N+1 par scan d'accolades peut manquer une boucle dont le corps appelle une fonction qui, elle, fait la requête (1 niveau d'indirection non suivi).
- Les 16 orphelines sont sûres au sens « aucun identifiant dans le dépôt » ; un appel par nom depuis Apex/kd-mc.com (`postMessage`) n'est pas exclu — `grep` sur le monorepo hors messaging-app n'a pas été fait.
- Les numéros de ligne valent pour le commit `6138d9612` ; `index.html` a déjà changé depuis (sha `c7dfcf9f…`).

**Ce que le brief supposait et qui s'est révélé faux (mesuré)** : le registre npm est joignable (`npm outdated` : 4 paquets, `npm audit` : 0 vulnérabilité) ; ESLint est installé globalement (10.1.0) ; les fonctions ne sont pas « `K.xxx(){}` » mais `K.xxx = function` (536) + `function x` (48).

---

## ANNEXES

### Config ESLint minimale proposée (`eslint.config.mjs`)
```js
export default [{
  files: ['lib/**/*.js', 'workers/**/*.js', 'sw.js', 'crypto.js', 'tests/**/*.{js,mjs}'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module',
    globals: { /* navigateur + workers */ window:'readonly', document:'readonly', navigator:'readonly', localStorage:'readonly', indexedDB:'readonly', fetch:'readonly', console:'readonly', setTimeout:'readonly', clearTimeout:'readonly', setInterval:'readonly', clearInterval:'readonly', crypto:'readonly', location:'readonly', history:'readonly', Notification:'readonly', WebSocket:'readonly', WebSocketPair:'readonly', URL:'readonly', Blob:'readonly', FormData:'readonly', Headers:'readonly', Request:'readonly', Response:'readonly', TextEncoder:'readonly', TextDecoder:'readonly', atob:'readonly', btoa:'readonly', self:'readonly', caches:'readonly', AbortController:'readonly', AbortSignal:'readonly', EventTarget:'readonly', structuredClone:'readonly', performance:'readonly', process:'readonly', Buffer:'readonly', globalThis:'readonly', K:'writable', ApexCrypto:'readonly', ApexVault:'readonly', ApexVisio:'readonly', L:'readonly', __APEX_CHAT_VERSION__:'readonly' } },
  rules: { 'no-undef':'error', 'no-unused-vars':['warn',{ args:'none', caughtErrors:'none' }], 'no-empty':['warn',{ allowEmptyCatch:false }], 'no-dupe-keys':'error', 'no-duplicate-case':'error', 'no-unreachable':'error', 'no-redeclare':'error', 'no-self-assign':'error', 'no-debugger':'error', 'eqeqeq':['warn','smart'] }
}];
```
Résultat mesuré avec cette config (globaux complets) : **1 erreur** (`no-unreachable` index.html l.7378), **≈ 340 avertissements** (583 − 244 paramètres de `catch` ignorés par `caughtErrors:'none'`).

### Commandes exécutées (sorties dans ce dossier)
`node audit-messaging.cjs` (AUDIT_ROOT=snapshot) · `node worker-catch.cjs` · `node rendered-measure.cjs` (AUDIT_URL=https://localhost:4174, `http-server -S` sur le snapshot) · `eslint --no-config-lookup -c … -f json` ×3 · `npx vitest run --reporter=dot` · `npm outdated --json` · `npm audit --json` · `npm view leaflet version` · `python3` (tailles gzip) · `sha256sum` (snapshot).
