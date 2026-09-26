# 🗺 Apex Chat — Roadmap 9 phases

> Version 1.0 — 2026-04-27
> Branche : `claude/private-messaging-app-jpLl1`

---

## Phase 1 — Foundation (S1) ✅ EN COURS

### Livrables
- ✅ Scaffold PWA (`index.html` monofichier, `sw.js` 3 caches, `manifest.json`)
- ✅ CGU variante A + Charte privée RGPD-compliant
- ✅ Pages utils (force-update, force-logout, diag, robots, sitemap, README)
- ✅ Schéma D1 complet 16 tables (`d1-migrations/0001_init.sql`)
- ✅ Comptes pré-configurés Kevin (`kdmc_admin`) + Laurence (`user_laurence`) + Tardieu × 2
- ✅ Conv DM Kevin↔Laurence pré-créée et opérationnelle Day 1
- ✅ 5 workers Cloudflare (`api`, `push`, `sms`, `ia`, `sentinel-consumer`)
- ✅ 3 Durable Objects (`ConversationDO`, `BroadcastDO`, `PresenceDO`)
- ✅ Documentation complète (ARCHITECTURE, SECURITY, PIVOT_PLAN_B_C, ROADMAP)
- 🔄 `index.html` PWA monofichier (auth + comptes + UI Light/Admin + IA + push)
- ⏳ Audit + vérification finale (syntax, sécurité, regressions)

### Critères de fin
- Un user externe peut s'inscrire avec son tel, recevoir SMS, choisir pseudo, voir écran d'accueil vide
- PWA installable home-screen iOS + Android
- Kevin admin reconnu via tous aliases + login flexible
- Laurence pré-configurée fonctionnelle dès 1ère connexion
- Triple persistence opérationnelle (localStorage + IndexedDB + D1)

### KPI
- Lighthouse Performance > 90
- Lighthouse PWA = 100
- Lighthouse Accessibility > 95
- TTFB < 200ms (Cloudflare edge)

### Risques
- Auth Firebase Phone limite 10K vérifs/mois → migrer Vonage à 50K users (flag prévu)
- Sharding D1 pas activé Day 1 → préparé via colonne `shard_id` virtuelle

---

## Phase 2 — Crypto E2E PQXDH (S1-S2)

### Livrables
- Génération paires identité Ed25519 + Curve25519 + Kyber-768 au signup
- Upload pubkeys + bundle prekeys (X3DH + Kyber prekey) vers `users.identity_key_pub` / `pq_key_pub`
- Endpoint `POST /api/keys/prekeys` (refresh)
- Endpoint `GET /api/keys/:userId/bundle`
- `addRecipientsToRatchet(conv, members)` lit flag `KEVIN_INVISIBLE_ADMIN`
- Fonction `rotateRatchetWithoutMaster(convId)` codée mais non appelée (prête bascule B)
- FaceID/PIN ouverture app via WebAuthn + PBKDF2 100k
- Backup E2E iCloud/Drive auto (mnémonique BIP39 12 mots)
- Tests crypto avec vecteurs Signal officiels
- Anti-screenshot iOS (notification + watermark dynamique)

### Critères de fin
- 2 comptes test échangent messages chiffrés
- Cypress test : interception WebSocket → ciphertext non-déchiffrable
- Kevin (compte admin) lit la conv côté client admin (toggle UI)
- Backup E2E testé : restore après réinstall app fonctionne

### KPI
- Latence chiffrement message < 50ms (p95)
- Échec déchiffrement < 0.01%
- Forward secrecy + post-compromise security validés

---

## Phase 3 — Chat de base (S2)

### Livrables
- DM 1-1 fonctionnel via `ConversationDO`
- Threads (`messages.thread_root`)
- Replies (`messages.reply_to`)
- Réactions emoji (table `reactions` JSON dans `messages.reactions`)
- Last seen + read receipts granulaires (toggle per-contact, `contacts.privacy_flags JSON`)
- Médias : upload chiffré client → presigned R2 PUT → `media` row
- Affichage médias via Cloudflare Images variants (thumbnail + full)
- Notes vocales + transcription via `ia-worker /stt-stream` (Whisper)
- Localisation live carte (Leaflet + OSM tiles)
- Contacts vCard import/export
- **Migration WhatsApp 1-clic** (import historique + contacts)

### Critères de fin
- Kevin et 5 testeurs s'envoient messages, photos, notes vocales, partagent position
- Latence p95 < 300ms en EU
- Migration WhatsApp testée : 1000 messages importés correctement chiffrés

### KPI
- Messages/sec p95 < 200ms delivery
- Médias : upload 5MB < 3s, download < 1s
- Read receipts arrivent < 100ms

---

## Phase 4 — Groupes / communautés / channels (S2-S3)

### Livrables
- Groupes 1024 membres (sender-key crypto, 1 ConversationDO)
- Communautés (collection de groupes hiérarchiques, table `community_groups`)
- Channels broadcast > 5K via `BroadcastDO` (sharding hiérarchique)
- Stories 24h (table `stories`, lifecycle expires_at=24h)
- Polls (composant message MIME `application/apex-poll`, multi-choix, anonymes, deadline)
- Disappearing messages (timer par conv)
- View-once photos (effacement après lecture)
- Scheduled messages (envoi programmé)

### Critères de fin
- Load test k6 → 1024 users dans 1 groupe + 100 messages/min stable
- Channel 5K diffusion p95 < 2s
- Stories vues/non-vues trackées correctement

### KPI
- Groupe 1024 : message broadcast < 500ms p95
- Channel 5K : fan-out hiérarchique < 2s p95
- Stories : 1000 stories simultanées sans dégradation

---

## Phase 5 — Appels (S3)

### Livrables
- WebRTC P2P 4 max audio/vidéo via signaling DO
- Activities embedded : iframe sandbox postMessage (whiteboard, watch-party YouTube/Netflix sync)
- Live transcription via `ia-worker /stt-stream`
- Replay intelligent (Cloudflare Stream upload + résumé IA fin d'appel)
- TURN coturn Hetzner config (50€/mois, déclenché flag `TURN_PROVIDER`)
- Sonneries personnalisées + screen sharing
- Recording opt-in (chiffré côté client, stocké R2)

### Critères de fin
- Appel à 4 stable 30 minutes
- Bascule TURN testée en condition NAT symétrique
- Activities embedded fonctionnelles (jeu, watch-party)

### KPI
- Démarrage appel WebRTC < 2s p95
- Qualité audio HD (Opus 32-48 kbps)
- Qualité vidéo 720p stable

---

## Phase 6 — Vue admin Light/Puissante (S3)

### Livrables
- **Vue user** : 100% nettoyée, aucun signe Kevin admin
- **Vue admin** Kevin (déclenchée par `_isKevinAdmin(name) && axCheckPin(‹code admin›)`) :
  - Onglets : Activity, Conversations, Géoloc, Devices, Erreurs, Validations, Signalements, Identités
  - Toggles per-user (mute mic, kill camera, force-logout, ban) — 2-step pour destructifs
  - Chat IA admin avec tools : `kickUser`, `banUser`, `searchAllMessages`, `analyzeUser`, `geoTrace`, `exportConv`, `broadcastNotif`, `summarizeConv`
  - Click pseudo n'importe où → fiche complète user (audit log écriture systématique)
- **Key Transparency log** initial (Phase 6) : Kevin signe ses propres clés publiquement

### Critères de fin
- Kevin teste tous les tools avec confirmation 2-step
- Audit log enregistre 100% des actions admin
- Vue user testée par 3 testeurs externes, aucun ne devine la backdoor
- Toggles per-user fonctionnels (force-logout, mute, etc.)

### KPI
- Vue admin chargée < 500ms
- Recherche cross-users < 1s
- Tools admin exécution < 2s

---

## Phase 7 — IA + Innovations validées (S3-S4)

### Livrables
- `ia-worker.js` cache LRU + failover (déjà créé Phase 1)
- IA user :
  - Résumé fil long (long press fil → bouton "Résumer")
  - Smart Reply 3 suggestions
  - Traduction live (auto-détection langue)
  - Recherche sémantique cross-conv (embeddings via Cloudflare Vectorize ou Workers AI bge-small)
  - Anti-scam (URL classifier + warning rouge sur liens suspects)
- Long-press message → menu "Expliquer / Reformuler / Traduire / Raccourcir"
- Wake word "Dis Apex" (réutilise `_axWakeRecognition` Apex)
- **Time Capsule** : message chiffré → `time_capsules` row → cron worker 5min → push notif
- **Letters mode** : ciphertext dans `letters_queue` avec `deliver_at = now() + 24h` → cron Queue
- **Memory Lane** : cron quotidien 09:00 user-tz → "Il y a 1 an avec X..."
- **Apex Memo** par contact : NLP extraction continue (`_enrichProfileFromMessage` Apex porté)
- Génération images inline (`/imagine ...` via `ia-worker /image`)
- Catégorisation auto (Famille/Pro/Spam) + mode focus

### Critères de fin
- Time Capsule programmée à +5min livre correctement
- Letter à +24h livrée (annulable avant)
- Memory Lane affiche message d'il y a 1 an
- Cache LRU réduit appels API ≥80%
- Anti-scam détecte 95% des liens phishing

### KPI
- Résumé fil 100 messages < 3s
- Traduction live < 500ms
- Recherche sémantique 10K msgs < 1s
- Génération image < 5s

---

## Phase 8 — Mini-apps + Hardware (S4)

### Livrables
- Studios Apex embedded (iframe postMessage, sandbox strict) :
  - Traducteur (priorité — conv bilingue live)
  - Cuisine, Médical, Finance, Légal, Vidéo, Scan OCR
  - Pack Pro, Musique, Architecture, Préfecture, Logo
- Paiement QR (Revolut / PayPal.me / IBAN — pas de PSP intégré)
- Cards interactives RDV calendar
- Réservations (Google Maps deeplink)
- Apple Watch companion (WatchKit minimal — répondre dictée)
- CarPlay / Android Auto (lecture auto via SiriKit/MediaSession)
- AirPods spatial audio messages
- HomePod / Echo announce

### Critères de fin
- Payment QR scanné fonctionne (Revolut + PayPal + IBAN)
- Watch envoie message dicté
- CarPlay lit auto les messages reçus
- Studios Apex chargent embedded sans problème CSP

### KPI
- Embed studio < 1s charge
- QR scan + paiement < 30s end-to-end
- Watch latency < 500ms

---

## Phase 9 — Pipeline self-healing complet + Tests + Monétisation (S4-S5)

### Livrables
- 13 sentinelles dédiées (`sentinel-consumer.js` worker)
- Pipeline complet : Sentinelles → CF Queues → ax_telemetry_in (Apex) → ax_claude_todo → Claude Code
- Tests Playwright e2e : signup, chat, appel, admin tools, time-capsule
- Tests crypto avec vecteurs Signal officiels
- k6 load test 1000 users concurrent
- **Audit sécurité externe** (Synacktiv / Quarkslab / Lexfo, budget 8-15K€)
- **Monétisation freemium Stripe** :
  - Free : tout core illimité
  - Apex Chat+ 6.99€/mois (IA illimitée, voice clone, time capsules illimitées, stockage 1To, thèmes premium)
  - Business 19€/user/mois (RDV, paiements, mini-apps custom, analytics)
  - Lifetime 199€ (1000 premiers, buzz Product Hunt)
- Premium gating via `users.premium_until`
- Pre-commit hook detect `catch(_){}` patterns
- Documentation utilisateur (FAQ + tutoriels vidéo)

### Critères de fin
- Load test 1000 users passé sans erreur
- Audit externe sans P0 ouvert
- Premier paiement Stripe encaissé
- 13 sentinelles loggent dans CF Queues + escaladent Apex
- Tests Playwright passent à 100%

### KPI
- Disponibilité 99.9% (uptime monitoring sentinelle)
- Latence p99 < 1s
- Taux d'erreur < 0.1%
- Cache hit rate IA > 60%
- Coût infra 100K MAU < 1500€/mois

---

## 📈 Métriques de succès (KPI globaux)

| Métrique | Cible 3 mois | Cible 6 mois | Cible 12 mois |
|----------|--------------|--------------|---------------|
| Users actifs (MAU) | 100 (Kevin + amis) | 1 000 (option A étendu) | 10 000 (option B grand public) |
| Messages/jour | 500 | 5 000 | 50 000 |
| Appels/jour | 20 | 200 | 2 000 |
| Disponibilité | 99% | 99.5% | 99.9% |
| NPS | 50+ | 60+ | 70+ |
| Conversion Premium | — | 2% | 5% |
| Coût infra | 30€/mois | 200€/mois | 1500€/mois |

---

## 💰 Coûts infra estimés (cumulés)

| Palier users | Workers + DO + D1 | R2 + Images | Auth (Firebase ou Vonage) | IA (cache 70%) | Total/mois |
|--------------|-------------------|-------------|---------------------------|----------------|------------|
| 1K (Phase 1-3) | 5€ | 3€ | 0€ (free 10K) | 8€ | **~16€** |
| 10K (Phase 4-6) | 25€ | 20€ | 0€ | 80€ | **~125€** |
| 100K (Phase 7-9) | 180€ | 150€ | 75€ Vonage | 800€ | **~1200€** |
| 1M (post-launch) | 1800€ | 1500€ | 750€ | 8000€ | **~12K€** |

---

## ⚠ Risques majeurs par phase

### Phase 1
- Auth Firebase quotas dépassés → flag bascule Vonage prêt
- D1 schema incomplet → migration ALTER TABLE sans downtime

### Phase 2
- Bug crypto compromet sécurité → audit externe avant lancement public obligatoire
- Backup E2E perdu → mnémonique 12 mots imprimable + tutoriel récupération

### Phase 3
- Migration WhatsApp casse → fallback import manuel CSV
- Latence DO > 500ms → optimization batch persistence + cache

### Phase 4
- Sharding broadcast complexe → simulation 5K users avant production
- Stories abusées (spam) → rate limit + signalements

### Phase 5
- TURN coûteux → coturn Hetzner d'abord, Cloudflare Calls plus tard
- Recording légal RGPD → consentement explicite tous participants

### Phase 6
- Backdoor admin découverte → bascule B prête
- Audit log corruption → backup horaire R2 + checksum

### Phase 7
- IA hallucinations → modération humaine sur outputs sensibles + warnings
- Coûts API IA explosent → cache LRU + rate limit Premium

### Phase 8
- App Store rejet (PWA only Day 1) → bascule TestFlight si nécessaire
- Hardware integrations cassent (Watch, CarPlay) → fallback web

### Phase 9
- Audit externe trouve P0 → délai lancement + budget fix
- Stripe KYC long → pivot crypto temporaire + Lifetime 199€ via Revolut

---

## 🚀 Innovations gardées (audit-validated)

✅ **Time Capsule** — message programmé dans 1 an (viral hook duo)
✅ **Letters mode 24h delay** — anti-impulsion, qualité conversation
✅ **Memory Lane** — "Il y a 1 an aujourd'hui avec X..."
✅ **Apex Memo** par contact (NLP continu)
✅ **Voice diary** — enregistrement quotidien, journal annuel IA
✅ **IA Apex partout** (résumé, traduction, smart reply, recherche sémantique)
✅ **Apex Coach** (Phase 7+) — coach relationnel optionnel

## ❌ Innovations abandonnées (gadgets selon audit UX)

❌ **Streaks** (toxique, anxiogène — Snapchat-style abandonné)
❌ **Mood detection** (intrusif, RGPD-toxique)
❌ **Privacy heatmap + Conversation health score** (KPI émotionnel anxiogène)
❌ **Sealed messages / geocaching** (gadget niche, complexifie UI)
❌ **Salons audio Clubhouse-like** (mort en 2022, complexité énorme)

---

## 🔗 Liens

- [ARCHITECTURE.md](./ARCHITECTURE.md) — vue technique
- [SECURITY.md](./SECURITY.md) — modèle sécurité
- [PIVOT_PLAN_B_C.md](./PIVOT_PLAN_B_C.md) — bascule modèle admin
- [PROJECT_MEMO.md](../PROJECT_MEMO.md) — mémoire vivante décisions Kevin
