# 🏗 Apex Chat — Architecture technique

> Version 1.0 — 2026-04-27
> Branche : `claude/private-messaging-app-jpLl1`

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         iPhone / Android                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  PWA Apex Chat (index.html monofichier + sw.js + manifest) │ │
│  │  - Crypto E2E (libsodium + kyber-768) — clés non-extract.  │ │
│  │  - localStorage + IndexedDB (triple persistence)            │ │
│  │  - WebSocket vers ConversationDO                            │ │
│  │  - Push Web Push API                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │ TLS 1.3
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Cloudflare Workers                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  api-worker  │  │ push-worker  │  │  sms-worker  │          │
│  │  (REST + WS) │  │  (Web Push,  │  │   (Vonage)   │          │
│  │              │  │  APNs, FCM)  │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│  ┌──────▼─────────────────▼──────────────────▼────────┐         │
│  │           Durable Objects (1 par conv)              │         │
│  │  - ConversationDO  : WebSocket + ratchet state      │         │
│  │  - BroadcastDO     : sharding channels >5K          │         │
│  │  - PresenceDO      : heartbeat online list          │         │
│  └─────────────────────────────────────────────────────┘         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   ia-worker  │  │  D1 (SQL)    │  │  R2 (médias) │          │
│  │  (failover)  │  │  16 tables   │  │  illimité    │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                        │
│         ▼                                                        │
│  Anthropic / OpenRouter / Gemini / Groq / OpenAI                │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│            Pipeline self-healing cross-app                       │
│                                                                  │
│   Sentinelles → CF Queues → ax_telemetry_in (Firebase Apex)     │
│       ↓ si auto-fix échoue                                      │
│   ax_claude_todo → GitHub Action → Claude Code session suivante │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend (PWA)

### 2.1 Stack
- **Pas de framework** : vanilla JavaScript ES2022, HTML5, CSS3
- **Pas de build** : 1 fichier `index.html` autonome
- **Pas de dépendance NPM** (sauf libs crypto chargées via CDN au runtime)
- Déployé GitHub Pages : push `main` → live sous 30s
- URL : `https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/`

### 2.2 Service Worker (3 caches)
- `apex-chat-v1.0.0-static` : assets HTML/CSS/JS (cache-first, long TTL)
- `apex-chat-v1.0.0-runtime` : ressources dynamiques (stale-while-revalidate)
- `apex-chat-v1.0.0-offline` : page de fallback hors-ligne (HTML inline)

Sentinelle GitHub Action `sw-cache-sync.yml` rattrape automatiquement le drift entre `APP_VER` (`index.html`) et `CACHE_VERSION` (`sw.js`).

### 2.3 Manifest PWA
- `display: standalone` (mode app)
- `scope: /CMCteams/messaging-app/` (strict)
- Icons SVG inline (192×192, 512×512, 180×180 Apple, maskable, monochrome)
- 4 shortcuts : Nouveau message, Contacts, Appels, Inviter
- `share_target` POST multipart (images, vidéos, audio, PDF, vCard)
- `protocol_handlers` : `web+apexchat://`, `sms:`

### 2.4 Triple persistence (cohérent avec Apex)
1. **localStorage** — cache rapide synchrone (whitelist `apex_chat_*`)
2. **IndexedDB** shadow copy — résiste à la purge Safari iOS
3. **Cloudflare D1** — source de vérité serveur via API worker

Au boot : restore `localStorage` → fallback `IndexedDB` (si gap) → fallback `D1` (si gap). **JAMAIS** `localStorage.clear()` sans whitelist.

### 2.5 Crypto côté client
- `libsodium-wrappers` (CDN, lazy load) : Ed25519 + Curve25519 + AES-GCM
- `kyber-crystals-js` (CDN, lazy load) : Kyber-768 KEM post-quantum NIST L1
- `double-ratchet-js` (custom léger inspiré Signal libsignal-protocol-javascript)
- Clés privées stockées via `crypto.subtle.importKey(..., extractable=false)` + chiffrement local par PIN (PBKDF2 100k iterations)

---

## 3. Backend (Cloudflare)

### 3.1 Workers déployés

| Worker | Rôle | Endpoints |
|--------|------|-----------|
| `api-worker` | API REST + WebSocket upgrade | 18 routes (auth, users, convs, invitations, admin, system) |
| `push-worker` | Push notifications cross-platform | `/web-push`, `/apns`, `/fcm`, `/broadcast`, `/register` |
| `sms-worker` | SMS via Vonage | `/sms/invite`, `/sms/otp` |
| `ia-worker` | IA failover + cache LRU | `/ia/chat`, `/ia/translate`, `/ia/summarize`, `/ia/embed` |
| `sentinel-consumer` | Consume CF Queues self-healing (Phase 9) | (interne) |

### 3.2 Durable Objects (3 classes)

#### `ConversationDO` (1 par conv)
- WebSocket multi-clients
- État ratchet PQXDH persisté dans `storage`
- Séquencement messages strict
- Fan-out broadcast aux clients connectés
- Persistence D1 batch toutes les 5s ou 10 messages
- Push notifs aux membres déconnectés (best-effort)
- Hibernation : restore `seq` au réveil

#### `BroadcastDO` (channels >5K)
- Sharding hiérarchique : root DO → N worker DOs (~5K subs chacun)
- Fan-out cascadé via Durable Objects nested fetch

#### `PresenceDO` (1 par tenant région)
- Heartbeat 30s
- Map `userId → { lastHeartbeat, deviceId }`
- Cleanup auto users inactifs >90s
- Endpoints : `/heartbeat`, `/list`, `/check`

### 3.3 D1 Database (`apex-chat-main.db`)

16 tables (voir `d1-migrations/0001_init.sql`) :

**Identité & relations** : `users`, `contacts`, `device_trust`, `voice_prints`
**Conversations** : `conversations`, `conversation_members`, `messages`, `media`, `polls`
**Features** : `time_capsules`, `letters_queue`, `stories`, `memory_lane_index`, `streaks`
**Système** : `invitations`, `audit_log`, `signalements`, `push_subscriptions`, `ratelimit_otp`, `telemetry_buffer`, `system_config`

**Sharding préparé Day 1** : colonne `users.shard_id` virtuelle (mod 16). Activation = remplacer `apex-chat-main.db` par 16 D1s + router selon `shard_id` (refactor minimal côté workers, déjà prévu dans queries).

### 3.4 R2 Bucket (`apex-chat-media`)
- Stockage médias chiffrés client-side avant upload
- Lifecycle 30j free / 90j premium (lit `MEDIA_LIFECYCLE_*_DAYS` de `system_config`)
- Presigned URLs PUT 5min TTL
- Coût : 0.015$/GB stockage, **0$ egress** (vs 0.09$/GB S3)

### 3.5 KV Namespace (`APEX_CHAT_CACHE`)
- Cache LRU IA worker (clé = SHA256(prompt+context))
- TTL 24h chat, 30j traductions
- Hit rate cible 60-70% → divise coûts API par 7

### 3.6 Cloudflare Queues (5)
- `apex-chat-telemetry` — sentinelles → push vers Apex
- `apex-chat-pipeline-fix` — auto-fix retry
- `apex-chat-letters-deliver` — Letters mode 24h delay cron
- `apex-chat-timecapsule-open` — Time Capsule cron 5min
- `apex-chat-memory-lane` — Memory Lane daily cron 09:00

---

## 4. Authentification

### 4.1 Flow signup user
```
1. User saisit nom + prénom + tel + pseudo
2. Front appelle Firebase Auth Phone (web SDK)
3. Firebase envoie SMS OTP
4. User saisit OTP
5. Front reçoit Firebase ID token
6. Front POST /api/auth/verify-otp avec idToken
7. Worker vérifie (Phase 2 : Firebase Admin SDK ou public keys)
8. Worker crée user dans D1
9. Worker retourne JWT HS256 (30j TTL) + user
10. Front stocke JWT dans localStorage chiffré (PIN-derived key)
```

### 4.2 SSO cross-app (Apex → Apex Chat)
```
1. User dans Apex clique bouton "💬 Apex Chat"
2. Apex génère JWT court (5min) signé par clé partagée
3. Open https://...messaging-app/?from=apex&token=<jwt>&uid=<apex_uid>&name=<name>
4. Apex Chat extrait params → POST /api/auth/sso-from-apex
5. Worker valide JWT Apex, crée/récupère user lié à apex_uid
6. Retourne JWT Apex Chat (30j) → user authentifié
```

### 4.3 Migration Vonage prévue
- Flag `AUTH_PROVIDER` dans `system_config` : `firebase` (Day 1) | `vonage` (à ~50K users)
- Front lit `/api/system/config` au boot, route OTP via le bon provider
- Aucun changement front nécessaire (l'API reste identique)

### 4.4 JWT format
```json
{
  "sub": "user_id",
  "pseudo": "kevin",
  "is_admin": true,
  "iat": 1700000000,
  "exp": 1702592000
}
```
- Algorithm : HS256 (clé secrète Cloudflare Secret `JWT_SIGN_KEY`)
- Vérification systématique sur chaque endpoint authentifié

---

## 5. Real-time (WebSocket)

### 5.1 Connexion
```
GET wss://apex-chat-api.workers.dev/api/conversations/<convId>/ws?token=<jwt>&uid=<userId>&did=<deviceId>
→ Worker upgrade WebSocket
→ Vérifie membership conv
→ Route vers ConversationDO via env.CONVERSATION_DO.idFromName(sharded_to_do)
→ DO accept WebSocket
```

### 5.2 Messages WS (formats)
```json
// Hello (server → client)
{"type":"hello","seq":42,"connected":3,"ts":1700000000000}

// Nouveau message (client → server)
{"type":"message","ciphertext":"<base64>","mime":"text/plain","reply_to":null,"thread_root":null}

// Ack (server → client)
{"type":"ack","id":"<msg_uuid>","seq":43,"ts":1700000000000}

// Fan-out (server → tous clients connectés)
{"type":"message","id":"...","conv_id":"...","sender_id":"...","ciphertext":"...","ts":...}

// Typing (broadcast sauf émetteur)
{"type":"typing","userId":"...","ts":...}

// Read receipt
{"type":"read","userId":"...","message_id":"...","ts":...}

// Reaction
{"type":"reaction","message_id":"...","emoji":"👍","reactions":{...}}

// Présence
{"type":"presence","userId":"...","action":"join|leave","ts":...}

// Ping/pong (keep-alive 25s)
{"type":"ping"} / {"type":"pong","ts":...}
```

### 5.3 Reconnect
- Heartbeat client toutes les 25s
- Reconnect avec backoff exponentiel (2s, 4s, 8s, max 60s)
- Reprise via `Last-Event-ID`-style (`?since_seq=<lastSeq>`)

---

## 6. Visio (WebRTC)

### 6.1 Phase 5 — P2P 4 max
- Signaling SDP/ICE relayé par `ConversationDO` (messages WS type `webrtc-offer/answer/candidate`)
- 4 participants max (pas de SFU server)
- Pas de TURN (P2P direct via STUN Cloudflare)
- ~70% des connexions OK sans TURN (NAT non-symétrique)

### 6.2 Bascule TURN illimité (futur)
- Flag `TURN_PROVIDER` :
  - `p2p-only` (Day 1)
  - `local-coturn` : self-hosted Hetzner CX22 (50€/mois, 5K users actifs)
  - `cloudflare-calls` : 0.05$/GB transit (~2250€/mois à 1000 visios)
- Switch = 1 var d'env, lib JS identique côté front

---

## 7. Push notifications

### 7.1 Web Push (PWA iOS 16.4+ + Chrome Android)
- VAPID public key existante (réutilisée d'Apex) : `BJ5XN-ZzchRPP...`
- VAPID private en Cloudflare Secret
- Subscription stockée dans D1 `push_subscriptions`
- Encryption AES-128-GCM (RFC 8291)
- TTL 24h sur les notifs

### 7.2 APNs (iOS app native — futur)
- JWT ES256 avec .p8 file
- Certificate Apple Developer requis
- Phase ultérieure (PWA suffit pour Day 1)

### 7.3 FCM (Android app native — futur)
- HTTP v1 endpoint
- Server key Firebase

### 7.4 Cross-app topic `user:<uid>`
- 1 user reçoit notifs Apex + Apex Chat dans le même topic
- Évite double-notification
- Topic-based fan-out via push-worker

---

## 8. IA (failover + cache)

### 8.1 Chain failover
1. **Anthropic** Claude Haiku 4.5 (primaire, low-cost rapide)
2. **OpenRouter** (secondaire, route Anthropic/Gemini/Llama)
3. **Gemini** 2.0 Flash (gratuit limité Google AI Studio)
4. **Groq** Llama 3.3 70B (gratuit rapide)
5. **OpenAI** GPT-4o-mini (fallback)

Chaque appel : `AbortController` 30s timeout obligatoire.

### 8.2 Cache LRU
- Clé : `SHA256(messages.slice(-3) + systemPrompt)`
- Stockage : KV `APEX_CHAT_CACHE`
- TTL : 24h (chat), 30j (traductions communes)
- Hit rate cible : 60-70%

### 8.3 System prompt Apex Chat
- Contexte : pseudo, is_admin, conv_type, lang
- Règles : français, tutoiement, max 200 mots, pas d'erreur technique brute
- Scope strict : résumé / traduction / smart reply / explain / anti-scam (PAS modification compte / PAS lecture messages chiffrés sans clé)

---

## 9. Self-healing cross-app

### 9.1 Pipeline
```
[Sentinelle Apex Chat] → CF Queue apex-chat-telemetry
                              ↓
                     [sentinel-consumer worker]
                     → tentative auto-fix whitelist
                              ↓ si échec
                     POST /apex/ax_telemetry_in.json (Firebase shared)
                              ↓
                     [Apex IA backend] _aiHandleIssue
                     → tentative auto-fix avancée
                              ↓ si échec
                     [Apex IA Kevin device] notif → tools
                              ↓ si échec
                     POST ax_claude_todo (Firebase)
                              ↓
                     GitHub Action claude-todo-watcher.yml (cron 2h)
                              ↓
                     Issue ouverte → session Claude Code
                     → fix code → commit → lesson learned
```

### 9.2 13 sentinelles (Phase 9)
- `chat-watch` (latence message p95)
- `auth-watch` (échecs OTP)
- `e2e-watch` (failed decrypt rate)
- `media-watch` (R2 errors)
- `call-watch` (ICE failures)
- `presence-watch` (heartbeat lost)
- `storage-watch` (D1 query slow)
- `error-watch` (worker exceptions)
- `push-watch` (delivery rate)
- `crypto-watch` (ratchet desync)
- `do-watch` (DO storage cap)
- `d1-watch` (DB size)
- `r2-watch` (bucket growth)

---

## 10. Cross-app Apex ↔ Apex Chat

### 10.1 Shared Firebase
- URL : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`
- Namespaces : `/apex` (Apex), `/apex_chat` (Apex Chat — à créer), `/cmcteams` (CMCteams)
- Clés partagées : `ax_telemetry_in`, `ax_claude_todo`, `ax_lessons_learned`

### 10.2 IA Apex auto-gestion
- Apex IA peut envoyer commandes admin Apex Chat via Firebase `/apex/apex_chat_commands`
- `kickUser`, `banUser`, `searchAllMessages`, `analyzeUser`, `geoTrace`, `exportConv`, `broadcastNotif`, `summarizeConv`
- Confirmation 2-step pour destructifs

### 10.3 Push unifié
- 1 seul worker push (`apex-push-worker.workers.dev`)
- Topic `user:<uid>` cross-app
- Préférences notifs centralisées dans Apex Réglages

### 10.4 Mémoire partagée
- `ax_persistent_memory_<uid>` enrichi par Apex Chat conversations
- Apex IA peut citer historique Apex Chat dans ses réponses
- Profil enrichi auto cross-app

---

## 11. Coûts infra estimés

| Palier users | Workers+DO+D1 | R2+Images | Auth (Firebase ou Vonage) | IA (cache 70%) | Total/mois |
|--------------|---------------|-----------|---------------------------|----------------|------------|
| 1K | 5€ | 3€ | 0€ (free 10K) | 8€ | **~16€** |
| 10K | 25€ | 20€ | 0€ | 80€ | **~125€** |
| 100K | 180€ | 150€ | **75€ Vonage** (vs 4250€ Firebase) | 800€ | **~1200€** |
| 1M | 1800€ | 1500€ | 750€ | 8000€ | **~12K€** |

---

## 12. Migration B/C sans refactor

Voir [PIVOT_PLAN_B_C.md](./PIVOT_PLAN_B_C.md) pour détails complets.

Principe : tous les flags critiques (`KEVIN_INVISIBLE_ADMIN`, `ADMIN_MODE`, `AUTH_PROVIDER`, `TURN_PROVIDER`, etc.) sont lus depuis `D1.system_config`. Bascule = 1 UPDATE SQL + déclenchement job (rotation ratchets en B). Aucun refactor de schéma ni de code.

---

## 13. Liens

- [SECURITY.md](./SECURITY.md) — modèle sécurité + crypto
- [PIVOT_PLAN_B_C.md](./PIVOT_PLAN_B_C.md) — bascule A→B→C
- [ROADMAP.md](./ROADMAP.md) — 9 phases développement
- [PROJECT_MEMO.md](../PROJECT_MEMO.md) — mémoire vivante décisions Kevin
