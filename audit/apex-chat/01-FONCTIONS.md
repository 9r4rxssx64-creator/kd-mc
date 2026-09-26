# Apex Chat — 01 · Cartographie exhaustive des fonctions (F01…F78)

**Date** : 2026-09-10 · **Version** : `v1.1.288`
**Règle appliquée** : *une fonction non listée est une fonction non testée*. Aucun « etc. ».


> **17/09/2026 — toutes les fonctions testées EN RÉEL.** Le harnais `messaging-app/tools/fonctions-reelles.mjs`
> (`npm run test:fonctions-reelles`) exécute chaque ligne de cette cartographie dans un vrai Chromium (19 vues via
> `K.sv`, 179 boutons cliqués, 0 mort) et contre le vrai `api-worker.js` (103 routes, base D1 simulée), et ajoute
> **F79…F85** (sondes : Face ID virtuel, aller-retour E2E, cliquet, WebRTC, clé push, crons, sauvegarde chiffrée
> re-déchiffrée). Résultat mesuré : **83 ✅ · 2 ❌ · 0 ⚪ / 85** — tableau complet dans `06-FONCTIONS-REELLES.md`.
> Les 2 ❌ : le coffre à clés `lib/key-vault.js` n'est chargé par aucune balise (F36, P1) ; `PATCH /api/conversations/:id`
> → 500 (F30, P2). Une fonction non listée ici reste une fonction non testée — la liste est désormais la même des deux côtés.

**Colonne « Couverture »** :
✅ = un test nommé cible explicitement cette fonction · 🟡 = couverte indirectement (le fichier
est mesuré par la couverture globale, mais aucun test ne porte son nom) · ❌ = aucun test.

> ⚠️ **Correction du 2026-09-10 (deuxième, et celle-ci est mesurée).** Une première note
> affirmait ici que les 19 fichiers de `messaging-app/tests/e2e/` n'étaient lancés par aucun
> workflow. **C'était faux** : `messaging-app-tests.yml` les exécute à chaque push, sur
> 4 navigateurs (iphone-safari, iphone-se, chromium-desktop, pixel-android). Mon grep cherchait
> `test:e2e` ; le workflow appelle `npx playwright test` directement. Ce qui est **vrai et
> mesuré** : ces 19 fichiers (56 tests) passent **56/56** sur Chromium (exécutés ici même), mais
> les deux voies **iPhone (WebKit)** étaient **rouges à chaque run depuis le 6 septembre**
> (19 runs sur 60) — cause : l'exception CORS locale n'acceptait que `http://localhost`, les
> tests se servent en `https://` (finding **P2**, corrigé). Donc : la couverture « e2e » ci-dessous
> est **réelle sur Chromium/Android**, et **réelle sur iPhone seulement à partir du run vert qui
> suit le correctif** (consigné dans `02-RESULTATS.md` § 6.4). Les 3 scénarios de `e2e/`
> (`smoke`, `two-clients`, `push`) sont, eux, joués contre la **production** (20/20 ✅).

**Rappel de couverture mesurée** (`npx vitest run --coverage`, 10/09) : global **89,47 %** des
lignes · `lib/` **100 %** · Durable Objects **100 %** · `ia`/`push`/`sms`-worker **100 %** ·
`api-worker.js` **83,42 %**.

---

## A. Écrans du client (F01–F06)

Le client n'a pas de routeur d'URL : il bascule via `K.sv('<vue>')`. Six vues mesurées.

| ID | Fonction | Où | Couverture |
|---|---|---|---|
| **F01** | Liste des conversations (`chats`) | `renderChats` | 🟡 `message-grouping`, `message-search` |
| **F02** | Fil d'une conversation (`chat`) | `renderChat` | ✅ `e2e-two-phones`, `api-do-two-clients`, e2e `smoke`, `message-grouping` |
| **F03** | Appels (`calls`) | `renderCalls` | 🟡 `visio-mesh.test.js` (maillage WebRTC seulement) |
| **F04** | Contacts (`contacts`) | `renderContacts` | ✅ `api-contact-sheet`, `api-worker-contacts` |
| **F05** | Réglages (`settings`) | `renderSettings` | 🟡 e2e `faceid-app-lock` |
| **F06** | Panneau admin (`admin`) | `renderAdmin` | ✅ `api-worker-admin-routes`, `api-worker-admin-deep` |

## B. Sous-vues du panneau admin (F07–F19) — 13 vues

| ID | Vue | Couverture |
|---|---|---|
| **F07** | `renderAdminUsers` — annuaire complet | ✅ `api-worker-admin-routes` |
| **F08** | `renderAdminLiveUsers` — présence temps réel | ✅ `api-worker-admin-deep` |
| **F09** | `renderAdminMap` — carte des positions | ✅ `api-worker-location` |
| **F10** | `renderAdminSearch` — recherche transverse | ✅ `api-worker-admin-routes` |
| **F11** | `renderAdminConnections` — journal de connexions | ✅ `api-worker-connections` |
| **F12** | `renderAdminAudit` — journal d'audit | 🟡 `api-worker-admin-deep` |
| **F13** | `renderAdminPremium` — demandes premium | ✅ `api-worker-premium-ai` |
| **F14** | `renderAdminToggles` — interrupteurs globaux | ✅ `api-worker-features-deep` |
| **F15** | `renderAdminTrustedCircle` — cercle de confiance | ✅ `api-trusted-circle` |
| **F16** | `renderAdminInviteBook` — invitations magiques | 🟡 `api-worker-admin-deep` |
| **F17** | `renderAdminDiag` — diagnostic | 🟡 `api-worker-admin-deep` |
| **F18** | `renderAdminSentinels` — sentinelles | ❌ **aucun test nommé** |
| **F19** | `renderAdminTimeline` — chronologie | ❌ **aucun test nommé** |

## C. Authentification & session (F20–F29)

| ID | Route / fonction | Couverture |
|---|---|---|
| **F20** | `POST /api/auth/send-otp` | ✅ `api-worker-otp`, `sms-worker` |
| **F21** | `POST /api/auth/verify-otp` | ✅ `api-worker-otp-complete`, **`admin-bypass-mfa`** |
| **F22** | `POST /api/auth/check-phone` | ✅ `api-worker-otp` |
| **F23** | `POST /api/auth/magic-login` | ✅ `api-worker-handlers` |
| **F24** | `POST /api/auth/sso-from-kdmc` — **chemin admin normal** | ✅ `api-worker-sso-kdmc` |
| **F25** | `POST /api/auth/sso-from-apex` | ✅ `api-worker-sso-kdmc` |
| **F26** | `POST /api/auth/ws-ticket` — ticket WebSocket usage unique | ✅ **`ws-ticket-usage-unique`** (discriminant prouvé) |
| **F27** | `POST /api/auth/media-ticket` — ticket média à portée limitée | ✅ **`media-ticket-portee-limitee`** (discriminant prouvé) |
| **F28** | Porte admin `X-Apex-Admin-Token` (anti-lock-out) | ✅ **`admin-bypass-mfa`** (discriminant prouvé) |
| **F29** | Verrou Face ID / passkey côté client | 🟡 e2e `faceid-app-lock` |

## D. Conversations & messages (F30–F41)

| ID | Fonction | Couverture |
|---|---|---|
| **F30** | `GET/POST /api/conversations` | ✅ `api-worker-handlers` |
| **F31** | `ConversationDO` — WebSocket temps réel | ✅ `conversation-do`, `api-do-two-clients` (100 % couvert) |
| **F32** | `PresenceDO` — présence | ✅ `conversation-do` (100 %) |
| **F33** | `BroadcastDO` — diffusion | ✅ `conversation-do` (100 %) |
| **F34** | Chiffrement de bout en bout (`lib/crypto-core.js`) | ✅ `crypto`, e2e `crypto-e2e` (100 %) |
| **F35** | Cliquet (ratchet) & désynchronisation | ✅ **`ratchet-bidirectional-desync`** |
| **F36** | Coffre à clés (`lib/key-vault.js`) | ✅ `key-vault` (100 %) |
| **F37** | `GET /api/keys/prekeys` | ✅ `api-worker-handlers` |
| **F38** | Groupement des messages | ✅ `message-grouping` (100 %) |
| **F39** | Recherche dans une conversation | ✅ `message-search` (100 %) |
| **F40** | Membres fantômes / DM surpeuplés — auto-réparation | ✅ `api-worker-ghost-members`, `api-heal-overpop-dms`, `api-worker-heal-dm` |
| **F41** | Membres locaux (hors-ligne) | ✅ `api-worker-local-members` |

## E. Médias & fichiers (F42–F47)

| ID | Fonction | Couverture |
|---|---|---|
| **F42** | `GET /api/media/:id` (R2) | ✅ `api-worker-media` |
| **F43** | Galerie médias (`lib/media-gallery.js`) | ✅ `media-gallery` (100 %), e2e `media-gallery` |
| **F44** | Auto-réparation d'un média cassé | 🟡 e2e `media-bigger-heal` |
| **F45** | `GET /api/gif` (recherche GIF) | ✅ `gif`, `api-worker-gif` (100 %) |
| **F46** | `POST /api/users/me/avatar` | 🟡 e2e `avatar-refresh` |
| **F47** | Gestes (balayer pour répondre, `lib/gesture-core.js`) | ✅ `gesture-core` (100 %), e2e `swipe-reply` |

## F. Fonctions sociales (F48–F55)

| ID | Fonction | Couverture |
|---|---|---|
| **F48** | `/api/stories` | 🟡 `api-worker-features-deep` |
| **F49** | `/api/polls` (sondages) | 🟡 `api-worker-features-deep` |
| **F50** | `/api/time-capsules` (capsules temporelles) | 🟡 `api-worker-features-deep` |
| **F51** | `/api/letters` (lettres différées) | 🟡 `api-worker-queue` |
| **F52** | `/api/memory-lane` (souvenirs) | 🟡 `api-worker-features-deep` |
| **F53** | `/api/contacts` | ✅ `api-worker-contacts`, `api-contact-sheet` |
| **F54** | `/api/invitations` | 🟡 `api-worker-handlers` |
| **F55** | Réciprocité de la vie privée | ✅ `privacy-reciprocity` (100 %), e2e |

## G. Appels (F56–F59)

| ID | Fonction | Couverture |
|---|---|---|
| **F56** | `GET /api/turn` — identifiants TURN | ✅ `api-turn` |
| **F57** | `GET /api/turn/health` | ✅ `api-turn` |
| **F58** | `POST /api/admin/turn-config` | ✅ `api-turn` |
| **F59** | Maillage WebRTC (`lib/visio-mesh.js`) | ✅ `visio-mesh` (100 %) |

## H. IA (F60–F67)

| ID | Route | Couverture |
|---|---|---|
| **F60** | `/api/ia/chat` — routage multi-fournisseurs | ✅ **`api-worker-ia-qwen`** (Qwen gratuit en tête, 8 contrôles) |
| **F61** | `/api/ai/summarize` | ✅ `ia-worker` (100 %) |
| **F62** | `/api/ai/translate` | ✅ `ia-worker` |
| **F63** | `/api/ai/rewrite` | ✅ `ia-worker` |
| **F64** | `/api/ai/smart-reply` | ✅ `ia-worker` |
| **F65** | `/api/ai/search` | ✅ `ia-worker` |
| **F66** | `/api/ai/image-describe` | ✅ `ia-worker` |
| **F67** | `/api/ai/voice-transcribe` | 🟡 `ia-worker` |

## I. Notifications (F68–F71)

| ID | Fonction | Couverture |
|---|---|---|
| **F68** | `/api/push/subscribe` · `/unsubscribe` · `/test` | ✅ `push-worker` (100 %) |
| **F69** | Envoi VAPID (`workers/lib/push-send.js`) | ✅ `push-send` (100 %) |
| **F70** | Clé push côté client (`lib/push-key.js`) + auto-réparation | ✅ `push-key` (100 %), e2e `push-key-heal`, `push-recreate-gesture` |
| **F71** | Service Worker (`lib/sw-handlers.js`) | ✅ `sw-handlers` (100 %) |

## J. Premium, système, administration (F72–F78)

| ID | Fonction | Couverture |
|---|---|---|
| **F72** | `/api/premium/status` · `/quota` · `/request` | ✅ `api-worker-premium-ai` |
| **F73** | `/api/admin/grant-premium` | ✅ `api-worker-premium-ai` |
| **F74** | `/api/system/config` + `/api/health` | ✅ `api-worker-routing` |
| **F75** | `/api/cgu/accept` | 🟡 `api-worker-handlers` |
| **F76** | `/api/signalements` | 🟡 `api-worker-features-deep` |
| **F77** | Tâches planifiées (`scheduled`) + nettoyage | ✅ `api-worker-scheduled`, `api-worker-cleanup` |
| **F78** | Filtre CORS par liste blanche | ✅ **`cors-origines-autorisees`** (100 %, discriminant prouvé) |

---

## Gardes de non-régression (pas des fonctions — des serrures)

Quatre tests ne testent pas une fonctionnalité mais **empêchent une faute de revenir**. Ils
valent d'être nommés à part, parce que c'est eux qui font tenir l'audit dans le temps :

| Garde | Ce qu'elle empêche |
|---|---|
| `no-admin-phone-in-page.test.js` | Que le numéro admin revienne dans le fichier public (P0) |
| `no-client-side-admin-by-name.test.js` | Que « taper son nom » redonne l'admin (P1) |
| `admin-bypass-mfa.test.js` | Que la porte admin se rouvre sans preuve (P0) |
| `no-false-security-claims.test.js` | Que l'app se remette à promettre du « post-quantique » qu'elle n'a pas |

---

## Bilan de couverture par fonction

| | Nb | Part |
|---|---:|---:|
| ✅ testée nommément | **56** | 72 % |
| 🟡 couverte indirectement | **20** | 26 % |
| ❌ **aucun test** | **2** | 3 % |
| **Total** | **78** | |

**Les deux trous, nommés** : **F18** (sentinelles admin) et **F19** (chronologie admin). Ce
sont deux vues d'affichage réservées à l'admin, en lecture seule — le risque est un écran vide,
pas une fuite. Elles sont consignées comme telles au `05-JOURNAL.md` plutôt que noyées dans un
« etc. ».


---

## Corrections du 2026-09-17

- **F61–F67** (`/api/ai/*`) : couverts par `tests/unit/api-worker-premium-ai.test.js` (summarize 11, translate 11, smart-reply 10,
  search 9, rewrite 7, image 12, voice 10), **pas** par `ia-worker.test.js` (autre worker) — attribution corrigée.
- **F46** (avatar) : 7 tests unitaires, pas seulement e2e → ✅.
- Le routeur expose **96** couples méthode/chemin (pas 64) ; non listés ici : 8 actions admin `/api/admin/users/:id/{block,…}`
  (`ban`/`unban` : 0 test par la route), `heartbeat`, `location/:id`, `admin/commands`, `whitelist-bulk`, `heal-dm`,
  `configure-core-pair`, fiche `contact/:id` ×4, `members` ×3, conv `PATCH/DELETE`, `ws-diag`, `force-update` ×3, `test/*`.
- **Nouvelles fonctions (v1.1.290)** : **F79** `DELETE /api/users/me` (suppression de compte, cascade D1/R2/KV) ✅ 3 tests ·
  **F80** `GET /api/users/me/export` (export RGPD) ✅ 2 tests · **F81** `e2e_strict` appliqué par le DO ✅ 2 tests ·
  **F82** renvoi du code SMS (client) 🟡 sans test · **F83** signalement côté utilisateur (client) 🟡 sans test ·
  **F84** sauvegarde chiffrée + rotation ✅ 5 tests · **F85** alarme de flush DO ✅ 5 tests.
- **Bilan mesuré** (passe tests) : 53 fonctions fixées par un test de comportement, 12 partielles (e2e seul, assertion
  multi-statut, Chromium seul, stub), 13 vues client jamais exécutées par un test (F07–F19) — reste P2.
