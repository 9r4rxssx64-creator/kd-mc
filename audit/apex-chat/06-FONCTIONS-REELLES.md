# Apex Chat — 06 · Fonctions testées EN RÉEL (F01…F85)

**Généré par** `messaging-app/tools/fonctions-reelles.mjs` (`npm run test:fonctions-reelles`) · **Date** : 2026-09-17T18:54:44.222Z · **Durée mesurée** : 175.0 s (front 174.4 s · worker 0.5 s) · Node v22.22.2

**Règle** : ✅ = exécuté et résultat attendu observé · ❌ = échec (message exact) · ⚪ = non atteignable en local et pourquoi.

**Bilan** : ✅ 83 · ❌ 2 · ⚪ 0 / 85

**Ce que ça prouve / ne prouve pas** : le volet navigateur (Chromium réel, DOM réel, app montée, API interceptée) prouve le RENDU, le CÂBLAGE et l'absence d'exception ; le volet worker (vrai `api-worker.js` dans Node, base D1 SIMULÉE) prouve le routage, les gardes d'accès et l'absence de 500 — pas le SQL réel ni la logique métier profonde.

| F | Fonction | Volet | Verdict | Preuve / message exact |
|---|---|---|---|---|
| **F01** | Liste des conversations (chats) | vue | ✅ | rendue, 14 boutons cliqués (14 avec effet), requêtes aucune |
| **F02** | Fil d'une conversation (chat) | vue | ✅ | rendue, 21 boutons cliqués (21 avec effet), requêtes POST /api/ai/smart-reply |
| **F03** | Appels (calls) | vue | ✅ | rendue, 4 boutons cliqués (4 avec effet), requêtes aucune |
| **F04** | Contacts | vue | ✅ | rendue, 8 boutons cliqués (8 avec effet), requêtes aucune |
| **F05** | Réglages (settings) | vue | ✅ | rendue, 43 boutons cliqués (43 avec effet), requêtes aucune |
| **F06** | Panneau admin | vue | ✅ | rendue, 17 boutons cliqués (17 avec effet), requêtes aucune |
| **F07** | renderAdminUsers — annuaire | vue | ✅ | rendue, 7 boutons cliqués (7 avec effet), requêtes GET /api/admin/all-users · renderAdminUsers(app) exécutée directement : #user-search=true, #user-list=true — mais le routeur envoie 'admin-users' vers renderAdminLiveUsers (fonction non atteignable par K.sv) |
| **F08** | renderAdminLiveUsers — présence | vue | ✅ | rendue, 7 boutons cliqués (7 avec effet), requêtes GET /api/admin/all-users |
| **F09** | renderAdminMap — carte | vue | ✅ | rendue, 6 boutons cliqués (6 avec effet), requêtes aucune · ⚪ tuiles/CDN Leaflet (unpkg) injoignables hors réseau : seul le repli « Carte indisponible » est prouvé |
| **F10** | renderAdminSearch — recherche | vue | ✅ | rendue, 6 boutons cliqués (6 avec effet), requêtes aucune |
| **F11** | renderAdminConnections — connexions | vue | ✅ | rendue, 2 boutons cliqués (2 avec effet), requêtes GET /api/admin/connections |
| **F12** | renderAdminAudit — audit | vue | ✅ | rendue, 1 boutons cliqués (1 avec effet), requêtes aucune |
| **F13** | renderAdminPremium — premium | vue | ✅ | rendue, 2 boutons cliqués (2 avec effet), requêtes GET /api/admin/premium-requests |
| **F14** | renderAdminToggles — interrupteurs | vue | ✅ | rendue, 23 boutons cliqués (23 avec effet), requêtes aucune |
| **F15** | renderAdminTrustedCircle — cercle | vue | ✅ | rendue, 4 boutons cliqués (4 avec effet), requêtes GET /api/admin/trusted-circle |
| **F16** | renderAdminInviteBook — invitations | vue | ✅ | rendue, 4 boutons cliqués (4 avec effet), requêtes aucune |
| **F17** | renderAdminDiag — diagnostic | vue | ✅ | rendue, 3 boutons cliqués (3 avec effet), requêtes GET /api/conversations, POST /api/auth/ws-ticket, GET /api/admin/diag |
| **F18** | renderAdminSentinels — sentinelles | vue | ✅ | rendue, 2 boutons cliqués (2 avec effet), requêtes aucune |
| **F19** | renderAdminTimeline — chronologie | vue | ✅ | rendue, 5 boutons cliqués (5 avec effet), requêtes GET /api/admin/users/u-laurence/timeline, GET /api/users/u-laurence |
| **F20** | POST /api/auth/send-otp | route | ✅ | POST /api/auth/send-otp → anon 200 / user 200 / admin 200 |
| **F21** | POST /api/auth/verify-otp | route | ✅ | POST /api/auth/verify-otp → anon 200 / user 200 / admin 200 |
| **F22** | POST /api/auth/check-phone | route | ✅ | POST /api/auth/check-phone → anon 200 / user 200 / admin 200 |
| **F23** | POST /api/auth/magic-login | route | ✅ | POST /api/auth/magic-login → anon 401 / user 401 / admin 401 |
| **F24** | POST /api/auth/sso-from-kdmc | route | ✅ | POST /api/auth/sso-from-kdmc → anon 401 / user 401 / admin 401 |
| **F25** | POST /api/auth/sso-from-apex | route | ✅ | POST /api/auth/sso-from-apex → anon 401 / user 401 / admin 401 |
| **F26** | POST /api/auth/ws-ticket | route | ✅ | POST /api/auth/ws-ticket → anon 401 / user 200 / admin 200 |
| **F27** | POST /api/auth/media-ticket | route | ✅ | POST /api/auth/media-ticket → anon 401 / user 200 / admin 200 |
| **F28** | Porte admin X-Apex-Admin-Token (MFA) | sonde | ✅ | drapeau OFF→200 admin ; ON+jeton→200 admin ; ON sans jeton→401 admin_mfa_required ; ON jeton faux→401 |
| **F29** | Verrou Face ID / passkey (client) | client | ✅ | plateforme=true enrôlé avant=false enrôlement=true enrôlé après=true vérification=true (authentificateur virtuel CDP) |
| **F30** | GET/POST /api/conversations (+PATCH/DELETE/members) | route | ❌ | PATCH /api/conversations/u-laurence : user: 500 Erreur interne, réessaie dans un instant {"error":"internal","message":"Erreur interne, réessaie dans un instant","detail":"unusable","where":"    at _Request.cl ; admin: 500 Erreur interne, réessaie dans un instant {"error":"internal","message":"Erreur interne, réessaie dans un instant","detail":"unusable","where":"    at _Request.cl — GET /api/conversations → anon 401 / user 200 / admin 200 · POST /api/conversations → anon 401 / user 400 / admin 400 · GET /api/conversations/u-laurence/ws → anon 426 / user 426 / admin 426 · GET /api/conversations/u-laurence/ws-diag → anon 200 / user 200 / admin 200 · PATCH /api/conversations/u-laurence → anon 401 / user 500 / admin 500 · DELETE /api/conversations/u-laurence → anon 401 / user 200 / admin 200 |
| **F31** | ConversationDO — WebSocket | do | ✅ | ConversationDO.fetch sans en-tête Upgrade → 426 (WebSocket required) (Durable Object instancié avec un état simulé — pas le runtime Cloudflare) |
| **F32** | PresenceDO | do | ✅ | PresenceDO.fetch POST /heartbeat → 200 (Durable Object instancié avec un état simulé — pas le runtime Cloudflare) |
| **F33** | BroadcastDO | do | ✅ | BroadcastDO.fetch POST /broadcast → 200 (Durable Object instancié avec un état simulé — pas le runtime Cloudflare) |
| **F34** | Chiffrement E2E (crypto-core) | client | ✅ | selfTest=true, aller-retour ECDH+AES-GCM entre 2 identités OK (« Coucou Lolo 🔐 »), empreinte 6b3a3 d2c68 … |
| **F35** | Cliquet (ratchet) & désynchronisation | client | ✅ | 3 messages, le 3ᵉ reçu en premier → « trois », puis « un », « deux » ; export/reset/import du cliquet : true/true |
| **F36** | Coffre à clés (key-vault) | client | ❌ | lib : enveloppe v1 déballée avec le bon PIN, refusée avec un faux PIN=true, plan={"action":"noop"} — MAIS window.ApexVault présent dans la page=false, balise <script type=module src=lib/key-vault.js>=false : le coffre n'est PAS chargé par index.html (importé ici manuellement), _ensureCryptoKeys retombe sur « keep-cleartext » |
| **F37** | POST /api/keys/prekeys + GET bundle | route | ✅ | POST /api/keys/prekeys → anon 401 / user 400 / admin 400 · GET /api/keys/u-laurence/bundle → anon 401 / user 200 / admin 200 |
| **F38** | Groupement des messages | client | ✅ | classes réelles : [grp-start \| grp-end \| grp-start grp-end] |
| **F39** | Recherche dans une conversation | client | ✅ | findInMessages('coucou') → 1 résultat (m2) ; barre #find-input ouverte=true, compteur réel « 1/1 », nextMatchIndex(0,3,+1)=1 |
| **F40** | Auto-réparation DM (heal-dm) | route | ✅ | POST /api/admin/configure-core-pair → anon 403 / user 403 / admin 400 · POST /api/admin/heal-dm → anon 401 / user 403 / admin 200 |
| **F41** | Membres locaux (hors-ligne) | route | ✅ | GET /api/conversations/u-laurence/members → anon 401 / user 200 / admin 200 · POST /api/conversations/u-laurence/members → anon 401 / user 400 / admin 400 · DELETE /api/conversations/u-laurence/members/u-laurence → anon 401 / user 400 / admin 200 |
| **F42** | GET /api/media/:id (R2) + POST /api/media | route | ✅ | POST /api/media → anon 401 / user 200 / admin 200 · GET /api/media/u-laurence → anon 401 / user 404 / admin 404 |
| **F43** | Galerie médias | client | ✅ | collectConversationMedia → 5 élément(s), extractLinks → 2 liens, galerie ouverte (modale 0→2) |
| **F44** | Auto-réparation média cassé | client | ✅ | déchiffrement direct échoue (clé du pair tournée)=true → _decryptBytesHeal re-télécharge le bundle et déchiffre [1,2,3,42] |
| **F45** | GET /api/gif + sélecteur GIF | route+client | ✅ | GET /api/gif → anon 401 / user 200 / admin 200 · client : GET /api/gif (mock, via le vrai fetch) → 1 cellule ; clic → _uploadMedia(File image/gif, 6 o) |
| **F46** | POST /api/users/me/avatar + photo | route+client | ✅ | POST /api/users/me/avatar → anon 401 / user 200 / admin 200 · client : _fetchPeerAvatar → data:image/png;base64,BBBBV2… (cache=true) ; _openProfilePhoto → modale/sélecteur (0→6) |
| **F47** | Geste balayer pour répondre | client | ✅ | balayage 85 px sur la vraie bulle m1 → réponse à « m1 » ; balayage 30 px → rien ; ApexGesture.swipeReplyDecision présent |
| **F48** | /api/stories | route | ✅ | POST /api/stories → anon 401 / user 400 / admin 400 · GET /api/stories → anon 401 / user 200 / admin 200 · GET /api/stories/u-laurence → anon 401 / user 404 / admin 404 |
| **F49** | /api/polls | route | ✅ | POST /api/polls → anon 401 / user 400 / admin 400 · POST /api/polls/u-laurence/vote → anon 401 / user 400 / admin 400 |
| **F50** | /api/time-capsules | route | ✅ | POST /api/time-capsules → anon 401 / user 400 / admin 400 · GET /api/time-capsules → anon 401 / user 200 / admin 200 · GET /api/time-capsules/u-laurence → anon 401 / user 404 / admin 404 |
| **F51** | /api/letters | route | ✅ | POST /api/letters → anon 401 / user 400 / admin 400 · GET /api/letters → anon 401 / user 200 / admin 200 · DELETE /api/letters/u-laurence → anon 401 / user 200 / admin 200 |
| **F52** | /api/memory-lane | route | ✅ | GET /api/memory-lane → anon 401 / user 200 / admin 200 |
| **F53** | /api/contacts + /api/contact/:id | route | ✅ | GET /api/contacts → anon 401 / user 200 / admin 200 |
| **F54** | /api/invitations | route | ✅ | POST /api/invitations → anon 401 / user 200 / admin 200 · GET /api/invitations/ABC123 → anon 404 / user 404 / admin 404 |
| **F55** | Réciprocité vie privée | client | ✅ | activé → je vois lecture+saisie=true ; coupé → masqués=true, présence « 🔒 Chiffré (transit) » |
| **F56** | GET /api/turn | route | ✅ | GET /api/turn → anon 401 / user 200 / admin 200 |
| **F57** | GET /api/turn/health | route | ✅ | GET /api/turn/health → anon 200 / user 200 / admin 200 |
| **F58** | POST /api/admin/turn-config | route | ✅ | POST /api/admin/turn-config → anon 403 / user 403 / admin 200 |
| **F59** | Maillage WebRTC (visio-mesh) | client | ✅ | vraie RTCPeerConnection créée pour 1 pair, offre SDP locale=true, 3 signal(aux) envoyés via ws, mute=true, end() → 0 pair |
| **F60** | /api/ia/chat | route | ✅ | POST /api/ia/chat → anon 401 / user 200 / admin 200 · POST /ia/chat → anon 401 / user 200 / admin 200 |
| **F61** | /api/ai/summarize | route | ✅ | POST /api/ai/summarize → anon 401 / user 400 / admin 400 |
| **F62** | /api/ai/translate | route | ✅ | POST /api/ai/translate → anon 401 / user 200 / admin 200 |
| **F63** | /api/ai/rewrite | route | ✅ | POST /api/ai/rewrite → anon 401 / user 200 / admin 200 |
| **F64** | /api/ai/smart-reply | route | ✅ | POST /api/ai/smart-reply → anon 401 / user 400 / admin 400 |
| **F65** | /api/ai/search | route | ✅ | POST /api/ai/search → anon 401 / user 503 / admin 503 |
| **F66** | /api/ai/image-describe | route | ✅ | POST /api/ai/image-describe → anon 401 / user 400 / admin 400 |
| **F67** | /api/ai/voice-transcribe | route | ✅ | POST /api/ai/voice-transcribe → anon 401 / user 400 / admin 400 |
| **F68** | /api/push/subscribe·unsubscribe·test | route | ✅ | POST /api/push/subscribe → anon 401 / user 200 / admin 200 · POST /api/push/unsubscribe → anon 401 / user 200 / admin 200 · POST /api/push/test → anon 401 / user 200 / admin 200 |
| **F69** | Envoi VAPID (workers/lib/push-send.js) | sonde | ✅ | service binding → https://apex-push-worker.internal/web-push (jeton posé, payload transmis) ; repli fetch direct → https://apex-push-worker.9r4rxssx64.workers.dev/web-push |
| **F70** | Clé push client (push-key) + auto-réparation | client | ✅ | décisions {"resub":true,"keep":false,"noSub":true,"failOpen":false,"eff":true} ; _serverVapidKey() lit la clé du push-worker (/health mocké) = true |
| **F71** | Service Worker actif + cache | client | ✅ | SW actif (https://localhost:4177/sw.js?v=v1.1.291), caches ["apex-chat-v1.1.291-static","apex-chat-v1.1.291-offline"], manifest pré-caché=true |
| **F72** | /api/premium/status·quota·request | route | ✅ | POST /api/premium/request → anon 401 / user 200 / admin 200 · GET /api/premium/status → anon 401 / user 200 / admin 200 · GET /api/premium/quota → anon 401 / user 200 / admin 200 |
| **F73** | /api/admin/grant-premium | route | ✅ | POST /api/admin/grant-premium → anon 401 / user 403 / admin 200 · GET /api/admin/premium-requests → anon 401 / user 403 / admin 200 |
| **F74** | /api/system/config + /api/health | route | ✅ | GET /api/system/config → anon 200 / user 200 / admin 200 · GET /health → anon 200 / user 200 / admin 200 · GET /api/health → anon 200 / user 200 / admin 200 |
| **F75** | /api/cgu/accept | route | ✅ | POST /api/cgu/accept → anon 200 / user 200 / admin 200 |
| **F76** | /api/signalements | route | ✅ | POST /api/signalements → anon 401 / user 200 / admin 200 |
| **F77** | Tâches planifiées (scheduled) | sonde | ✅ | 0 */1 * * * → 0 requêtes D1, 2 msg queue · */5 * * * * → 2 requêtes D1, 0 msg queue · 0 9 * * * → 1 requêtes D1, 2 msg queue · 0 3 * * * → 16 requêtes D1, 0 msg queue |
| **F78** | Filtre CORS liste blanche | sonde | ✅ | origine autorisée → https://9r4rxssx64-creator.github.io ; origine inconnue → null |
| **F79** | DELETE /api/users/me | route | ✅ | DELETE /api/users/me → anon 401 / user 400 / admin 403 |
| **F80** | GET /api/users/me/export | route | ✅ | GET /api/users/me/export → anon 401 / user 200 / admin 200 |
| **F81** | e2e_strict appliqué par le DO | do | ✅ | strict ON : clair → e2e_required, E2E1: → ack ; strict OFF : clair → ack (Durable Object instancié avec un état simulé — pas le runtime Cloudflare) |
| **F82** | Renvoi du code SMS (client) | client | ✅ | _resendOtp() → POST /api/auth/send-otp (mock) → code de dev reçu « 000000 », re-rendu de l'étape=true |
| **F83** | Signalement côté utilisateur (client) | client | ✅ | _reportUser() → modale (0→2), bouton « Envoyer le signalement », POST /api/signalements ×1, dialogues aucun |
| **F84** | Sauvegarde chiffrée + rotation | sonde | ✅ | backups/d1-2026-09-17.json.enc : v=1, déchiffré (3 clés), ancienne sauvegarde 2020 purgée=true, aucune donnée en clair dans le blob=true |
| **F85** | Alarme de flush DO | do | ✅ | alarm() : tampon 1→0 message, 1 écriture(s) D1 (Durable Object instancié avec un état simulé — pas le runtime Cloudflare) |

## Boutons cliqués par vue (volet navigateur)

| Vue | Boutons | Avec effet | Morts | Exceptions | Boutons morts (libellé → onclick) |
|---|---:|---:|---:|---:|---|
| F01 `chats` | 14 | 14 | 0 | 0 | — |
| F02 `chat` | 21 | 21 | 0 | 0 | — |
| F03 `calls` | 4 | 4 | 0 | 0 | — |
| F04 `contacts` | 8 | 8 | 0 | 0 | — |
| F05 `settings` | 43 | 43 | 0 | 0 | — |
| F06 `admin` | 17 | 17 | 0 | 0 | — |
| F07 `admin-users` | 7 | 7 | 0 | 0 | — |
| F08 `admin-live-users` | 7 | 7 | 0 | 0 | — |
| F09 `admin-map` | 6 | 6 | 0 | 0 | — |
| F10 `admin-search` | 6 | 6 | 0 | 0 | — |
| F11 `admin-connections` | 2 | 2 | 0 | 0 | — |
| F12 `admin-audit` | 1 | 1 | 0 | 0 | — |
| F13 `admin-premium` | 2 | 2 | 0 | 0 | — |
| F14 `admin-toggles` | 23 | 23 | 0 | 0 | — |
| F15 `admin-trusted-circle` | 4 | 4 | 0 | 0 | — |
| F16 `admin-invite-book` | 4 | 4 | 0 | 0 | — |
| F17 `admin-diag` | 3 | 3 | 0 | 0 | — |
| F18 `admin-sentinels` | 2 | 2 | 0 | 0 | — |
| F19 `admin-timeline` | 5 | 5 | 0 | 0 | — |

Captures : `/home/user/CMCteams/messaging-app/test-results/fonctions-reelles` (une par vue). Exceptions JS totales sur tout le volet : 0. Requêtes API interceptées : 137. Dialogues (refusés automatiquement) : 8.

## Routes du worker (103 couples méthode/chemin, extraits du source)

| Route | F | anon | user | admin | OK | Problème |
|---|---|---:|---:|---:|:-:|---|
| `POST /api/auth/send-otp` | F20 | 200 | 200 | 200 | ✅ |  |
| `POST /api/auth/verify-otp` | F21 | 200 | 200 | 200 | ✅ |  |
| `POST /api/auth/check-phone` | F22 | 200 | 200 | 200 | ✅ |  |
| `POST /api/auth/sso-from-apex` | F25 | 401 | 401 | 401 invalid_apex_token | ✅ |  |
| `POST /api/auth/sso-from-kdmc` | F24 | 401 | 401 | 401 face_id_requis | ✅ |  |
| `GET /api/users/me` | F05 | 401 | 200 | 200 | ✅ |  |
| `PATCH /api/users/me` | F05 | 401 | 200 | 200 | ✅ |  |
| `DELETE /api/users/me` | F79 | 401 | 400 | 403 admin_protected | ✅ |  |
| `GET /api/users/me/export` | F80 | 401 | 200 | 200 | ✅ |  |
| `POST /api/users/me/avatar` | F46 | 401 | 200 | 200 | ✅ |  |
| `POST /api/admin/user-toggles` | F14 | 401 | 403 | 200 | ✅ |  |
| `POST /api/users/heartbeat` | F08 | 401 | 200 | 200 | ✅ |  |
| `POST /api/cgu/accept` | F75 | 200 | 200 | 200 | ✅ |  |
| `GET /api/users/u-laurence` | F05 | 401 | 200 | 200 | ✅ |  |
| `GET /api/admin/users/u-laurence/full` | F07 | 403 | 403 | 200 | ✅ |  |
| `GET /api/location/u-laurence` | F09 | 401 | 200 | 200 | ✅ |  |
| `POST /api/media` | F42 | 401 | 200 | 200 | ✅ |  |
| `GET /api/gif` | F45 | 401 | 200 | 200 | ✅ |  |
| `GET /api/media/u-laurence` | F42 | 401 | 404 | 404 no_media | ✅ |  |
| `GET /api/turn` | F56 | 401 | 200 | 200 | ✅ |  |
| `GET /api/turn/health` | F57 | 200 | 200 | 200 | ✅ |  |
| `POST /api/admin/turn-config` | F58 | 403 | 403 | 200 | ✅ |  |
| `POST /api/keys/prekeys` | F37 | 401 | 400 | 400 bad_pubkey | ✅ |  |
| `GET /api/keys/u-laurence/bundle` | F37 | 401 | 200 | 200 | ✅ |  |
| `GET /api/conversations` | F30 | 401 | 200 | 200 | ✅ |  |
| `POST /api/conversations` | F30 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/admin/configure-core-pair` | F40 | 403 | 403 | 400 error | ✅ |  |
| `POST /api/admin/heal-dm` | F40 | 401 | 403 | 200 | ✅ |  |
| `GET /api/admin/trusted-circle` | F15 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/trusted-circle` | F15 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/diag` | F17 | 403 | 403 | 200 | ✅ |  |
| `POST /api/auth/ws-ticket` | F26 | 401 | 200 | 200 | ✅ |  |
| `POST /api/auth/media-ticket` | F27 | 401 | 200 | 200 | ✅ |  |
| `GET /api/conversations/u-laurence/ws` | F30 | 426 | 426 | 426 error | ✅ |  |
| `GET /api/conversations/u-laurence/ws-diag` | F30 | 200 | 200 | 200 | ✅ |  |
| `GET /api/conversations/u-laurence/members` | F41 | 401 | 200 | 200 | ✅ |  |
| `POST /api/conversations/u-laurence/members` | F41 | 401 | 400 | 400 error | ✅ |  |
| `DELETE /api/conversations/u-laurence/members/u-laurence` | F41 | 401 | 400 | 200 | ✅ |  |
| `PATCH /api/conversations/u-laurence` | F30 | 401 | 500 | 500 internal | ❌ | user: 500 Erreur interne, réessaie dans un instant {"error":"internal","message":"Erreur interne, réessaie dans un instant","detail":"unusable","where":"    at _Request.cl ; admin: 500 Erreur interne, réessaie dans un instant {"error":"internal","message":"Erreur interne, réessaie dans un instant","detail":"unusable","where":"    at _Request.cl |
| `DELETE /api/conversations/u-laurence` | F30 | 401 | 200 | 200 | ✅ |  |
| `POST /api/stories` | F48 | 401 | 400 | 400 error | ✅ |  |
| `GET /api/stories` | F48 | 401 | 200 | 200 | ✅ |  |
| `GET /api/stories/u-laurence` | F48 | 401 | 404 | 404 error | ✅ |  |
| `POST /api/polls` | F49 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/polls/u-laurence/vote` | F49 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/signalements` | F76 | 401 | 200 | 200 | ✅ |  |
| `POST /api/time-capsules` | F50 | 401 | 400 | 400 error | ✅ |  |
| `GET /api/time-capsules` | F50 | 401 | 200 | 200 | ✅ |  |
| `GET /api/time-capsules/u-laurence` | F50 | 401 | 404 | 404 error | ✅ |  |
| `POST /api/letters` | F51 | 401 | 400 | 400 error | ✅ |  |
| `GET /api/letters` | F51 | 401 | 200 | 200 | ✅ |  |
| `DELETE /api/letters/u-laurence` | F51 | 401 | 200 | 200 | ✅ |  |
| `GET /api/memory-lane` | F52 | 401 | 200 | 200 | ✅ |  |
| `POST /api/ia/chat` | F60 | 401 | 200 | 200 | ✅ |  |
| `POST /ia/chat` | F60 | 401 | 200 | 200 | ✅ |  |
| `POST /api/ai/summarize` | F61 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/premium/request` | F72 | 401 | 200 | 200 | ✅ |  |
| `POST /api/admin/grant-premium` | F73 | 401 | 403 | 200 | ✅ |  |
| `GET /api/admin/premium-requests` | F73 | 401 | 403 | 200 | ✅ |  |
| `GET /api/premium/status` | F72 | 401 | 200 | 200 | ✅ |  |
| `GET /api/premium/quota` | F72 | 401 | 200 | 200 | ✅ |  |
| `POST /api/admin/force-update` | F17 | 401 | 403 | 200 | ✅ |  |
| `GET /api/admin/force-update-ts` | F17 | 200 | 200 | 200 | ✅ |  |
| `POST /api/admin/force-update-via-token` | F17 | 401 | 401 | 200 | ✅ |  |
| `POST /api/push/subscribe` | F68 | 401 | 200 | 200 | ✅ |  |
| `POST /api/push/unsubscribe` | F68 | 401 | 200 | 200 | ✅ |  |
| `POST /api/push/test` | F68 | 401 | 200 | 200 | ✅ |  |
| `POST /api/ai/search` | F65 | 401 | 503 | 503 error | ✅ |  |
| `POST /api/ai/rewrite` | F63 | 401 | 200 | 200 | ✅ |  |
| `POST /api/ai/smart-reply` | F64 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/ai/translate` | F62 | 401 | 200 | 200 | ✅ |  |
| `POST /api/ai/voice-transcribe` | F67 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/ai/image-describe` | F66 | 401 | 400 | 400 error | ✅ |  |
| `POST /api/invitations` | F54 | 401 | 200 | 200 B6HTUTJX | ✅ |  |
| `GET /api/invitations/ABC123` | F54 | 404 | 404 | 404 error | ✅ |  |
| `POST /api/admin/commands` | F12 | 403 | 403 | 400 error | ✅ |  |
| `POST /api/admin/invite-magic` | F16 | 403 | 403 | 200 HKDQVRAS | ✅ |  |
| `POST /api/admin/whitelist-bulk` | F16 | 403 | 403 | 200 | ✅ |  |
| `POST /api/auth/magic-login` | F23 | 401 | 401 | 401 error | ✅ |  |
| `GET /api/admin/live-users` | F08 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/map` | F09 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/users/u-laurence/geo-history` | F09 | 403 | 403 | 200 | ✅ |  |
| `POST /api/test/login` | F17 | 403 | 403 | 403 forbidden | ✅ |  |
| `POST /api/test/cleanup` | F17 | 403 | 403 | 403 forbidden | ✅ |  |
| `GET /api/contacts` | F53 | 401 | 200 | 200 | ✅ |  |
| `GET /api/admin/all-users` | F07 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/block` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/unblock` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/ban` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/unban` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/authorize` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/revoke` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/force_logout` | F19 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/users/u-laurence/delete` | F19 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/users/u-laurence/timeline` | F19 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/users/u-laurence/conversations` | F19 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/connections` | F11 | 403 | 403 | 200 | ✅ |  |
| `GET /api/admin/search` | F10 | 403 | 403 | 400 error | ✅ |  |
| `GET /api/admin/toggles` | F14 | 403 | 403 | 200 | ✅ |  |
| `POST /api/admin/toggles` | F14 | 403 | 403 | 400 error | ✅ |  |
| `GET /api/system/config` | F74 | 200 | 200 | 200 | ✅ |  |
| `GET /health` | F74 | 200 | 200 | 200 | ✅ |  |
| `GET /api/health` | F74 | 200 | 200 | 200 | ✅ |  |

## Auto-critique (écrite par le harnais, à compléter à la main)

- **F-ids non atteints (⚪)** : aucun.
- **Ce que le harnais ne prouve pas** : la logique métier du serveur sur une vraie base D1 (colonnes, contraintes, données réelles) ; le contenu exact des vues au-delà de l'élément clé (un texte faux mais rendu passe) ; les WebSockets réels (bloqués hors réseau) ; les tuiles de carte (CDN) ; l'envoi SMS/push réel ; le comportement sur WebKit/iPhone (Chromium seul ici).
- **Temps d'exécution mesuré** : 175.0 s au total (front 174.4 s · worker 0.5 s).

<!-- MANUEL : tout ce qui suit est rédigé à la main et préservé à chaque régénération -->

## Constats trouvés EN EXÉCUTANT (pas à la lecture) — avec preuve, ligne, correctif proposé

> Règle : `index.html` et les workers n'ont **pas** été modifiés par cette passe. Chaque constat porte sa preuve brute (sortie du harnais), la ligne exacte et le correctif proposé. Kevin relit et décide.

### [P1] Le coffre à clés `lib/key-vault.js` n'est chargé par AUCUNE balise de la page → la clé privée E2E reste EN CLAIR dans `localStorage` même avec un PIN
- **Axe** : sécurité · **Fichier** : `messaging-app/index.html` l.85-93 (balises `<script type="module">` : crypto-core, message-search, media-gallery, privacy-reciprocity, gif, visio-mesh, gesture-core, message-grouping, push-key — **pas** key-vault) ; consommateurs l.6909 (`window.ApexVault && ApexVault.planKeyMigration`) et l.6952 (`if(pin && window.ApexVault)`).
- **Preuve (harnais F36)** : `window.ApexVault présent dans la page=false, balise <script type=module src=lib/key-vault.js>=false` ; la lib elle-même, importée à la main, fonctionne (`enveloppe v1 déballée avec le bon PIN, refusée avec un faux PIN=true`).
- **Impact** : `_ensureCryptoKeys` prend la branche `{ action: (storedPub && storedPriv) ? 'keep-cleartext' : 'generate' }` ; à la génération, `ls('crypto_priv', privB64)` (l.6956) écrit la clé privée en clair. Le test unitaire `key-vault.test.js` (100 %) est vert : il teste la lib, pas son câblage — c'est exactement le cas « Declaration ≠ Deployment » (erreur #28).
- **Cause racine** : la lib a été livrée avec sa balise oubliée ; aucune garde ne vérifie que chaque `lib/*.js` exposant `window.Apex*` est chargé par la page.
- **Correctif proposé** : ajouter `<script type="module" src="./lib/key-vault.js"></script>` après la l.85 (crypto-core) ; l'ajouter aussi au pré-cache du SW si la liste est explicite. **Garde** : test vitest qui, pour chaque `lib/*.js` contenant `window.Apex… =`, exige une balise `<script type="module" src="./lib/<nom>.js">` dans `index.html` (sw-handlers exclu). Effort S · régression : aucune (la lib est déjà écrite pour ce chemin, fail-open `catch → clair`).

### [P2] `PATCH /api/conversations/:id` renvoie 500 « unusable » APRÈS avoir fait l'UPDATE (relecture d'un corps déjà consommé)
- **Axe** : fonctionnalités · **Fichier** : `messaging-app/workers/api-worker.js` l.4210 (`await readJson(request)` consomme le corps) puis l.4222 (`Object.keys(await request.clone().json())`).
- **Preuve (harnais, vrai worker dans Node)** : `PATCH /api/conversations/u-laurence → user: 500 {"error":"internal","detail":"unusable","where":"at _Request.clone"}` (admin : idem). Le test unitaire existant (`api-worker-handlers.test.js` l.198) accepte `[200, 403]` et n'atteint jamais cette ligne (son mock ne donne pas le rôle owner).
- **Impact** : renommer / décrire un groupe → l'UPDATE D1 est fait (l.4220) mais le client reçoit 500 → toast d'erreur alors que le changement a eu lieu, audit_log non écrit. 🟡 Statut : le `clone()` d'un corps déjà lu lève un `TypeError` par la spécification Fetch (« unusable ») ; workerd la suit — non exécuté dans workerd ici (honnête : Node/undici).
- **Correctif proposé** : `const body = await readJson(request); const { name, … } = body;` puis `{ fields: Object.keys(body) }` (aucun `clone()`). **Garde** : test vitest avec un membre `owner` qui exige 200 (pas `[200,403]`). Effort S.

### [P2] `renderAdminUsers` (F07, l.12884) n'est atteignable par aucune vue : le routeur envoie `admin-users` vers `renderAdminLiveUsers`
- **Preuve** : `index.html` l.7638 `case 'admin-users': renderAdminLiveUsers(app); break;` ; le harnais a dû appeler `renderAdminUsers(app)` directement pour la rendre (`#user-search=true, #user-list=true`).
- **Impact** : ~95 lignes de vue (annuaire + `K._filterUsers`) sont du code mort ; la cartographie la compte comme une vue. Correctif : soit la supprimer (et retirer `K._filterUsers`, l.12955), soit la router sur une entrée dédiée. Effort S.

### [P3] Trois statuts HTTP trompeurs sur le worker (observés pendant la 1ʳᵉ passe, avant que la base simulée soit corrigée)
- `POST /api/auth/verify-otp` : un conflit de pseudo lors de l'inscription renvoie **500** `create_fail/pseudo_conflict` (l.810) au lieu d'un **409** — le client affiche « Erreur interne » pour une cause utilisateur.
- `POST /api/auth/sso-from-apex` : secret `APEX_SSO_SIGN_KEY` absent → **500** « SSO non configuré (env) » ; le même cas pour `KEVIN_PHONE_E164` renvoie 503 `kevin_phone_unset` (l.855) — harmoniser en 503 avec un code.
- `POST /api/admin/user-toggles` : la validation du corps (`feature requis` → 400) précède la garde admin (l.~3900) ; un compte non-admin apprend le format attendu avant d'être refusé. Inverser l'ordre.

### Observations de conception (pas des bugs, consignées pour que le harnais ne les re-signale pas)
- `POST /api/cgu/accept` accepte sans jeton (acceptation avant connexion, rattachée au téléphone) ; `GET /api/conversations/:id/ws-diag` répond 200 avec la cause (`auth_failed`) sans jeton ; `GET /api/admin/force-update-ts` est publique (les clients l'interrogent). Le harnais les liste `PUBLIC_BY_DESIGN`.
- Les bulles `.msg` portent un `onclick` conditionnel (`if(K._selectedMsgs && K._selectedMsgs.size > 0)`) : sans mode sélection, un clic ne fait rien — c'est voulu (appui long → menu). Consigné « conditionnel », jamais compté mort.
- Carte admin (F09) : Leaflet vient d'`unpkg.com`, injoignable hors réseau → la vue affiche « Carte indisponible : … » (repli prouvé) ; les tuiles et les marqueurs ne sont **pas** prouvés ici.

## Auto-critique (rédigée à la main, complète celle du harnais)

- **F-ids non atteints** : aucun ⚪ au dernier run ; mais trois F-ids sont **partiellement** prouvés et le disent : F09 (carte : repli seulement), F41 (membres locaux : routes `members` exercées, la résolution `local_+numéro` reste couverte par `api-worker-local-members.test.js`, pas rejouée ici), F31-F33/F81/F85 (Durable Objects instanciés avec un état simulé, pas le runtime Cloudflare).
- **Ce que le harnais ne prouve pas** :
  - la **logique métier serveur** sur une vraie D1 : la base est simulée (une ligne par table au plus) — un `SELECT` sur une colonne absente, une contrainte, une fusion de comptes réelle passent inaperçus ; seuls les scénarios `e2e/` contre la production les voient ;
  - le **contenu** des vues au-delà de l'élément clé et des exceptions : une vue qui rend un texte faux mais sans planter passe ✅ ; les captures sont là pour l'œil de Kevin ;
  - « effet d'un bouton » ≠ « bon effet » : le harnais prouve qu'un clic **produit quelque chose** (vue, modale, requête, toast…), pas que c'est la bonne chose — la logique de chaque bouton reste à lire dans le code ou à jouer en scénario e2e ;
  - les **WebSockets réels**, l'envoi **SMS/push réel**, les tuiles de carte, **WebKit/iPhone** (Chromium seul ici, le run CI 4 navigateurs reste la référence) ;
  - le bug `PATCH` est prouvé dans Node (undici) et déduit pour workerd (spécification), pas exécuté dans workerd.
- **Ce dont je ne suis pas certain** : la sévérité réelle de P1 dépend de si un PIN de session existe chez les vraies utilisatrices (sans PIN, le comportement « clair » est celui d'avant, documenté « legacy ») ; la classification « conditionnel » des bulles pourrait masquer un vrai bouton mort dont l'`onclick` commencerait par `if(` — le rapport les liste nommément pour vérification.
- **Fragilités du harnais elles-mêmes (mesurées en l'écrivant)** : (1) un clic souris sur un élément situé sous la barre de navigation fixe atterrit sur la barre → deux faux « morts » avant le centrage systématique (`scrollIntoView block:center`) ; (2) un serveur statique partagé peut mourir en cours de run → serveur dédié au port 4177, relancé ; (3) `pkill -f` avec un motif présent dans sa propre ligne de commande tue le shell appelant ; (4) un `touchend` synthétique sans `changedTouches` fait planter l'écouteur global « retour par balayage » (`index.html` l.~2271, `e.changedTouches[0]`) → deux faux `pageerror` sur F47 au run précédent ; un vrai `touchend` en a toujours — la sonde en fournit désormais.
- **Temps mesuré** : voir la ligne « Durée mesurée » en tête (générée à chaque run) — ordre de grandeur 4-5 min pour le navigateur (179 boutons cliqués un par un avec re-rendu entre chaque), ~1 s pour le worker (103 routes × 3 appels).
