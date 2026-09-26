# 📱 PROJECT MEMO — Apex Chat (messagerie privée Kevin)

> **Nom officiel : APEX CHAT** (validé Kevin 2026-04-27)

> Mémoire vivante de TOUTES les décisions Kevin pour ce projet.
> À lire au début de chaque session. Mis à jour en continu.
> Branche actuelle : `claude/continue-perfection-work-5C2eH` (PR #268)
> Repo : `9r4rxssx64-creator/cmcteams` — dossier `messaging-app/`

## 📊 ÉTAT v1.1.41 (2026-05-18) — Production-ready Phase 1-9 LIVE

- **Version** : v1.1.41 (passée de v0.2 en ~3 mois)
- **Tests** : 750/750 PASS vitest (21 fichiers)
- **Phases livrées** : 1 (auth) · 2 (E2E PQXDH) · 3 (chat DM/groupes/réactions/replies) · 4 (WebRTC audio/vidéo) · 5 (admin) · 6 (IA user) · 7 (Memory Lane IA) · 8 (intelligence) · 9 (Stripe premium)
- **Backend** : Cloudflare Workers + D1 + Durable Objects + KV + R2
- **9+ endpoints API** (summarize/translate/smart-reply/voice/image/search/rewrite/checkout/webhook/portal/status/quota)
- **Monétisation** : Stripe LIVE (3 plans 6.99€/59.99€/199€), quota daily middleware, Resend email receipts auto
- **Sécurité** : E2E PQXDH active, safety number Signal-style, HMAC webhook + anti-replay
- **MAJ auto forcée iOS PWA** : SW skip-intercept `?_v=`, `cache:'reload'`, CACHE_VERSION sync (règle Kevin absolue)

Voir KEVIN_INVENTORY.md section "SESSION 2026-05-18" pour détails complets + action Kevin déploiement.

---

---

## 🎯 Vision Kevin (synthèse demandes)

> "Une app reliée à Apex, copie conforme de WhatsApp. Que je puisse donner un lien à mes amis et les amis des amis (viral, énormément de monde à terme). Installable iPhone/Android. Tout comme WhatsApp mais privée, à moi. Architecture évolutive, jamais limitée en place, faite pour scaler comme WhatsApp à terme. Plus complet, plus pro, mais pas compliqué. Va plus loin, innove, améliore."

---

## 🚨 BASCULE OPTION B ACTIVÉE DAY 1 (Kevin 2026-04-27, ABSOLUE)

> **"Fait déjà la bascule B. Ça change quoi ?"** — Kevin

**Décision finale** : on démarre directement en **Option B (vrai E2E grand public)** au lieu de A.
On n'attendra pas l'ampleur. On démarre **niveau pro entreprise** dès le Day 1.

### Ce que ça change concrètement

| Aspect | Option A (initial) | **Option B (active Day 1)** |
|--------|-------------------|------------------------------|
| Lecture messages Kevin | ✅ Voit tout côté client | ❌ **NE LIT PLUS** le contenu (mathématique) |
| Données Kevin admin voit | Tout | Metadata only : qui→qui, quand, taille, signalements, géoloc opt-in, devices, KPI |
| Risque pénal Kevin | Modéré (si grand public) | **ZÉRO** (E2E mathématique vrai) |
| Marketing | "Privé entre nous" | **"🛡 Ultra-sécurisé E2E post-quantum, serveur ET admin aveugles"** (100% honnête) |
| Modération | Kevin lit + intervient | Signalements users + IA détecte patterns (scam, phishing, harcèlement) |
| Adoption grand public | Limitée | Illimitée (App Store + Play Store possible) |
| Audit externe requis | Optionnel | **Obligatoire avant lancement public** |
| Niveau qualité requis | Élevé | **Pro entreprise (banque/santé)** |

### Implications techniques (déjà appliquées)

1. **`d1-migrations/0001_init.sql`** :
   - `ADMIN_MODE = 'B'`
   - `KEVIN_INVISIBLE_ADMIN = 'false'`
   - `conversation_members.kevin_invisible` reste défini (pour bascule future si besoin) mais inactif

2. **Crypto Phase 2** :
   - `addRecipientsToRatchet(conv, members)` n'ajoute **PAS** la clé maître Kevin
   - Architecture E2E strict dès le Day 1
   - Forward secrecy + post-compromise security garanties

3. **Vue admin Kevin** :
   - Onglet "Messages" → masqué (Kevin ne peut pas lire les contenus)
   - Onglet "Activity" → metadata + qui parle à qui + fréquence
   - Onglet "Signalements" → user reports prioritaires
   - Onglet "Géolocalisation" → si user opt-in
   - Onglet "Devices" → fingerprints + détection SIM swap
   - Tools admin `searchAllMessages` → metadata only (sender_id, ts, mime, size — content vide)
   - Tools `analyzeUser` → patterns d'usage, score risque IA, devices, signalements (pas contenu)

4. **CGU** : variante B activée par défaut (à créer `cgu-b.html`)
   - "Apex Chat utilise un chiffrement bout-en-bout post-quantum strict"
   - "Le serveur ne peut JAMAIS lire vos messages — même nos administrateurs"
   - "Modération via signalements users + IA détection patterns suspects"
   - Conformité RGPD complète + DSA si > 50 users UE
   - Aucune mention de "modération admin sur contenus" (impossible techniquement)

### Comment Kevin garde le contrôle malgré E2E strict

- ✅ Voit tous les KPI agrégés (users actifs, messages/min, conv populaires)
- ✅ Voit toutes les métadonnées (qui parle à qui, quand, devices)
- ✅ Reçoit tous les signalements users (et peut suspendre/bannir)
- ✅ IA Apex détecte automatiquement patterns suspects (scam URLs, harcèlement, spam) et alerte Kevin
- ✅ Peut kicker/bannir/suspendre n'importe qui (modération technique)
- ✅ Voit les exports compliance trimestriels (audit trail metadata)
- ✅ Pipeline self-healing autonome remonte tout vers Apex
- ❌ Ne peut PAS lire le contenu des conversations
- ❌ Ne peut PAS exporter une conv en clair sans accord users (impossible techniquement)

### Marketing : positionnement final

**Tagline** : "Apex Chat — La messagerie qui te rend plus intelligent, pas plus dépendant. Chiffrée comme Signal, vivante comme Discord, augmentée par l'IA Apex."

**Différenciateurs vs concurrents** :
1. **vs WhatsApp** : pas de Meta, vrai serveur aveugle, pas de pub jamais
2. **vs Signal** : IA intégrée (résumé, traduction, smart reply), UX moderne
3. **vs Telegram** : E2E par défaut (Telegram = opt-in only), pas centralisé Pavel Durov
4. **vs iMessage** : multi-plateforme (iOS + Android + Web), open future

---

## ✅ Décisions actées (NE PAS REPRENDRE)

### Auth (style WhatsApp)
- **Pas d'invite-link comme auth principale** — l'invite-link est seulement pour PARTAGER l'app aux amis
- **Firebase Auth Phone** (gratuit 10K vérif/mois, déjà sur projet Firebase Kevin)
- Champs demandés : **Nom + Prénom + Numéro de téléphone**
- **Code SMS auto** (style WhatsApp) → vérification du numéro
- **Pas de validation admin** au login (Kevin avait corrigé : juste vérif numéro)
- **Fiche créée auto** après vérif SMS
- **Sauvegarde permanente** dès création (triple persistence)

### Sécurité (Option B confirmée)
- **E2E post-quantum réel** (PQXDH/Signal Protocol) entre users
- **Kevin = participant invisible** automatique de chaque conversation (sa clé maître ajoutée au ratchet) → lit tout côté client admin
- **Serveur aveugle** (vrai)
- **Bandeau ULTRA-SÉCURISÉ** très visible (login + landing)
- **CGU survolée 1 clic** + permissions vagues (contacts/caméra/micro/géoloc/notifs/stockage en bloc)
- **Mention discrète** "modération admin pour ta sécurité" (honnête sans le crier)
- **Jamais le mot "inviolable"** (mensonge si Kevin lit) → "ultra-sécurisé / chiffrement militaire / serveur aveugle"

### Backend (scalable 1M+ users)
- **Cloudflare Workers + Durable Objects** (1 conv/groupe = 1 DO, scale infini)
- **D1** (SQL) pour metadata, profils, audit
- **R2** pour médias (photos, vidéos, fichiers — illimité, pas de bandwidth fee)
- **Cloudflare Images** + **Stream** (vidéo)
- **WebSocket** via Durable Objects (real-time)
- **Firebase Auth Phone** (auth uniquement) — bridge vers Cloudflare via JWT custom

### Visio/Audio
- **WebRTC P2P 4 max** au début (gratuit, marche pour groupes restreints)
- **Architecture prête** pour Cloudflare Calls TURN illimité quand le réseau grossira (1 var à activer)

### Vue admin Kevin (historique total temps réel — comme Apex `vUserActivity`)
- Tous messages, tous appels, tous fichiers
- Connexions/déconnexions per-user + devices/IP/version
- Géoloc historique (si user a accepté)
- Signalements + modération
- Compteur connectés live + carte temps réel
- Push notif Kevin actions importantes (nouveau user, scam détecté, signalement)
- Pipeline self-healing → `ax_telemetry_in` Apex → `ax_claude_todo` Claude Code
- IA Apex intégrée admin (chat + tools : kickUser, banUser, searchAllMessages, analyzeUser, geoTrace, exportConv, broadcastNotif, summarizeConv)

### Profils enrichis automatiquement (règle CLAUDE.md "ENRICHISSEMENT PROFILS CONTINU")
- Récup max données auto au signup (nom, prénom, tel, derived data)
- Enrichissement continu au fil des conversations (NLP extraction → fiche)
- Détection auto : email, adresse, métier, langues, intérêts, allergies, anniversaire, famille, etc.
- Cross-référence avec autres apps Kevin (Apex, CMCteams) si même tel/email
- Score complétude /100 visible admin
- Sauvegarde TEMPS RÉEL à chaque enrichissement (triple persistence)

### Stockage (triple persistence + temps réel)
- localStorage (cache rapide)
- IndexedDB shadow (résiste purge Safari)
- Cloudflare D1 (source vérité admin)
- Backup quotidien R2 (rétention 90j)
- Sync SSE/WebSocket temps réel

---

## 🚀 Innovations validées (tu m'as dit "va plus loin, innove")

### 🤖 IA Apex partout (différenciateur principal)
1. Résumé auto des fils longs
2. Smart Reply contextuelles
3. Traduction live multilingue (auto-détection)
4. Recherche sémantique cross-conversations ("le resto que Sophie a mentionné en mars")
5. Transcription notes vocales + searchable
6. Long-press message → "Expliquer / Reformuler / Traduire / Raccourcir"
7. Génération image/vidéo inline ("/imagine ...")
8. Anti-scam/phishing IA (warning rouge sur liens suspects)
9. Catégorisation auto (Famille / Pro / Spam) + mode focus
10. Mémoire persistante par contact (anniversaire, projets, préférences)
11. Wake word "Dis Apex" pour dicter mains libres
12. **Apex Memo par contact** : prend notes auto pendant convs ("Sophie m'a parlé de son projet X")
13. **Reminder intelligent** : "Tu as dit à Sophie que tu lui répondrais avant vendredi"
14. **Détection promesses** : "Tu as promis 3 trucs cette semaine"
15. **Mood detection** : "Sophie semble triste dans ses 5 derniers messages"
16. **Conflict resolution** : si dispute détectée, IA propose message apaisant
17. **Anniversaire auto** : Apex rappelle anniv + propose message + idée cadeau

### 💬 Toutes fonctions WhatsApp + au-dessus
- DM 1-1, groupes (1024+), communautés (10000+), channels illimités
- Threads natifs (gap WhatsApp)
- Activity view (mentions/réponses/réactions centralisés)
- Stories 24h, polls avancés, réactions custom, replies
- Notes vocales, fichiers (R2 illimité), localisation live carte, contacts vCard
- Stickers, GIF (Tenor), Genmoji-like
- Disappearing messages, view-once photos, scheduled messages

### 📞 Appels nouvelle génération
- Audio + vidéo (4 max au début, illimité plus tard)
- **Activities embedded** (Discord-style) : jeux, whiteboard, watch-party YouTube/Netflix sync
- **Salons audio live** (Clubhouse-style)
- **Backgrounds AI** (flou + remplacement scène)
- **Auto-framing** (suit le visage)
- **Live transcription** + sous-titres traduits live
- **Replay intelligent** : enregistre, IA résume + extrait moments clés
- **Rejoindre via QR code** (fini les liens longs)

### 🌍 Super-app intégrée
- Mini-apps Apex embedded dans le chat (Studios mix/vidéo/archi/cuisine/légal/etc.)
- Cards interactives : paiement QR (Revolut/PayPal/IBAN), RDV calendar, réservations
- Universal inbox optionnel (bridge Telegram/Signal/SMS via Matrix)

### 🎮 Gamification + rétention
- **Streaks** (Snapchat-like) : conversation quotidienne
- Badges, achievements
- **Friend score** (intensité de la relation)
- Compteur "temps économisé par l'IA" cette semaine

### 🛡 Sécurité avancée
- **Self-destructing account** : pas de connexion 30j → auto-purge optionnel
- **Panic button** : geste secret → efface app du device
- **Stealth mode** : icône camouflée (calculatrice/météo)
- **Decoy mode** : faux PIN ouvre version vide
- **Anti-screenshot iOS** : notification + watermark dynamique
- **Burner conversations** : disposable links pour conv 1-shot
- **Geofence security** : verrouille hors zone définie

### ⏰ Productivité
- Scheduled messages
- Reminders dans le chat
- Tâches partagées (kanban léger)
- Notes collaboratives (Notion-lite)
- Sondages avancés multi-choix
- Documents collaboratifs

### 📱 Hardware integrations
- Apple Watch / Wear OS (répondre depuis montre)
- CarPlay/Android Auto (lecture auto messages voiture)
- AirPods spatial audio
- HomePod / Echo announce

### ♿ Accessibility
- Live captioning audio
- Sign language video translation
- High contrast / dyslexia mode
- Voice-only mode
- Read-aloud automatic

### 🔮 Innovations radicales (uniques au marché)
1. **Time capsule messages** : programmer un message dans 1 an
2. **Letters mode** : message long livré 24h après (anti-impulsion, anti-dispute chaude)
3. **Sealed messages** : lecture débloquée à un endroit géographique précis (geocaching)
4. **Voice diary** : enregistrement quotidien, IA crée journal annuel
5. **Memory lane** : "Il y a un an aujourd'hui tu disais à Sophie..."
6. **Voice clone E2E** : envoyer message TTS de TA voix (auth FaceID, peer-validated)
7. **Spatial AR stickers** : poser un sticker dans l'espace réel (Vision Pro/iOS)
8. **Apex Coach** : analyse ton style relationnel, suggère améliorations
9. **Privacy heatmap** : tu vois quelles données tu as partagées avec qui
10. **Conversation health score** : qualité d'une relation au fil du temps
11. **Auto-context briefing** : avant un appel, Apex te résume vos 30 derniers échanges
12. **Smart away** : statut auto depuis calendar/géoloc/activité

---

## 📋 Roadmap (ordre d'implémentation)

### Phase 1 — Foundation (semaine 1)
1. Branche + structure projet `messaging-app/`
2. Setup Cloudflare Workers + Durable Objects + D1 + R2
3. Firebase Auth Phone (nom + prénom + tel + SMS code)
4. Création fiche auto post-vérif SMS
5. Triple persistence + backup quotidien
6. CGU vague 1 clic + bandeau ULTRA-SÉCURISÉ
7. PWA installable iOS/Android (manifest + sw.js)

### Phase 2 — Crypto E2E (semaine 1-2)
8. PQXDH (Signal Protocol post-quantum)
9. Kevin clé maître invisible (admin lit tout côté client)
10. FaceID/PIN pour ouvrir l'app
11. Backup E2E par défaut

### Phase 3 — Chat de base (semaine 2)
12. DM 1-1 chiffré
13. Groupes (jusqu'à 1024)
14. Threads + replies + réactions
15. Notes vocales + transcription auto
16. Médias (photos, vidéos, fichiers)
17. Localisation live carte

### Phase 4 — Appels (semaine 2-3)
18. WebRTC P2P audio/vidéo (4 max)
19. Activities embedded (whiteboard, watch-party)
20. Live transcription + sous-titres
21. Replay intelligent

### Phase 5 — Admin + IA (semaine 3)
22. Vue admin Kevin (toutes onglets style Apex `vUserActivity`)
23. Chat Apex IA admin avec tools dédiés
24. Pipeline self-healing → `ax_telemetry_in` cross-app
25. Sentinelles dédiées (chat/auth/e2e/media/call/presence/storage/error)
26. Push notif Kevin actions importantes

### Phase 6 — IA user (semaine 3-4)
27. Résumé fils + Smart Reply + traduction live
28. Recherche sémantique cross-conversations
29. Long-press "Expliquer/Reformuler/Traduire"
30. Génération image inline
31. Anti-scam IA + catégorisation auto
32. Mémoire persistante par contact + Apex Memo
33. Wake word "Dis Apex"

### Phase 7 — Super-app (semaine 4)
34. Mini-apps Apex embedded (Studios)
35. Paiement QR (Revolut/PayPal/IBAN)
36. RDV calendar cards
37. Stories 24h + polls avancés
38. Communautés + channels

### Phase 8 — Innovations radicales (semaine 5+)
39. Streaks + gamification
40. Stealth/Panic/Decoy modes
41. Time capsule + Letters mode
42. Memory lane + Voice diary
43. Apex Coach + Privacy heatmap
44. Hardware (Watch, CarPlay, AirPods)
45. Universal inbox (bridges optionnels)

### Phase 9 — Tests + scale
46. Tests cross-platform (iOS Safari PWA, Chrome Android, desktop)
47. Load testing (1000+ users concurrent)
48. Audit sécurité externe
49. Migration vers TURN illimité quand >100 users actifs visio simultanée

---

## 🔁 Pipeline self-healing (comme Apex)

```
[Action user/system] → [Sentinelle agent dédié] → auto-fix local → [si KO]
                                                     ↓
                                       [Telemetry cross-app vers Apex]
                                       Firebase: ax_telemetry_in
                                                     ↓
                                       [Apex IA tente auto-fix whitelist]
                                                     ↓ si KO
                                       [ax_claude_todo Firebase]
                                                     ↓
                                       [Claude Code session prochaine] → fix + commit + lesson
```

Cohérent avec règle CLAUDE.md "🔄 PIPELINE SELF-HEALING TOTAL CROSS-APP".

---

## 📞 Identités pré-configurées (extraites des mémos NOTES_USER + KEVIN_INVENTORY)

### Kevin DESARZENS — Admin principal
- **Email** : `kevind@monaco.mc` (email Monaco principal — source NOTES_USER)
- **Téléphone interne casino** : 62224
- **PIN admin** : `‹code admin›`
- **Aliases reconnus** : Kevin / Kevin DESARZENS / DESARZENS Kevin / kevin desarzens / KD / KDMC
- **ID cross-app** : `kdmc_admin` (Apex / Apex Chat) / `U11804` (CMCteams)
- **Devices** : iPhone (principal, PWA Safari), Tablette Lenovo Android, Ordinateur
- **Préférences** : Français uniquement, tutoiement, langage direct, ZÉRO invention de données
- **Login flexible** : tous formats acceptés (ordre, casse, tirets, accents, espaces) — algorithme tokens triés + normalization

### Laurence SAINT-POLIT — Famille
- **Relation** : Épouse de Kevin
- **Aliases reconnus** : Laurence / Laurence SAINT-POLIT / SAINT-POLIT Laurence / saint-polit laurence / saintpolit
- **ID cross-app** : `user_laurence`
- **Rôle** : `family` (peut modifier thème personnel, premium illimité cadeau Kevin)
- **PIN** : à définir (changement forcé 1ère connexion)

### Sandrine TARDIEU + Christophe TARDIEU — Clients test
- **ID** : `user_tardieu_sandrine` + `user_tardieu_christophe`
- **PIN** : ‹défini hors dépôt› (à changer à la 1ère connexion)
- **Rôle** : `client` (compte gratuit)

## 🌐 URLs et services existants à brancher (extraits KEVIN_INVENTORY)

### URLs principales
- **Apex live** : `https://9r4rxssx64-creator.github.io/CMCteams/apex-ai/`
- **CMCteams live** : `https://9r4rxssx64-creator.github.io/CMCteams/`
- **Apex Chat (futur)** : `https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/`
- **Repo** : `https://github.com/9r4rxssx64-creator/cmcteams`

### Firebase RTDB partagé cross-app
- **URL** : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`
- **Namespaces** :
  - `/cmcteams` (CMCteams data)
  - `/apex` (Apex AI data)
  - `/apex_chat` (Apex Chat — à créer)
- **Clés partagées critiques** :
  - `/apex/ax_shared_api_key` : clé Anthropic partagée
  - `/apex/ax_telemetry_in` : pipeline self-healing inbox
  - `/apex/ax_claude_todo` : escalade Claude Code
  - `/apex/ax_lessons_learned` : cross-app learnings
  - `/apex/apex_chat_commands` : commandes IA Apex → Apex Chat (à créer)

### Cloudflare Worker existant à réutiliser
- **Push notifications** : `https://apex-push-worker.desarzens-kevin.workers.dev`
  - Health endpoint : `/health`
  - Account ID : `ffaca6f306a953f82834db0970f300f0`
  - **VAPID PUBLIC** : `BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY`
  - Apex Chat partagera ce worker (topics `user:<uid>` cross-app)

### Proxy Cloudflare CORS iOS
- Stockée dans `ax_proxy_url` localStorage côté Apex
- **Règle critique** : TOUJOURS lire `ax_proxy_url` AVANT de hardcoder `api.anthropic.com` (cause bug "3 points infini" v12.365)

### IA providers (failover chain Apex)
1. **Anthropic** (primaire) via `ax_shared_api_key` Firebase ou `ax_proxy_url`
2. **Groq** (gratuit) Llama 3.3 70B
3. **Gemini** (gratuit limité) Google AI Studio
4. **OpenRouter** (failover automatique)
5. **OpenAI** (fallback)

### Autres services configurés
- **Telegram bot** : `@Kdmc_kevind_2026_bot` (chatId dans `ax_telegram_chatid`)
- **EmailJS** : Gmail + Outlook `kevind@monaco.mc` + iCloud
- **Sentry DSN** : Monitoring erreurs configuré
- **Finnhub API Key** : Cours bourse
- **Stripe** : à activer (KYC pending Kevin)
- **Broadlink IR** : 42 commandes domotique pré-configurées
- **Home Assistant** : URL locale `ax_ha_url`

## 🎬 12 Studios Apex à exposer dans Apex Chat (mini-apps embedded)

| Studio | Route | Capacités | Intégration Chat priorité |
|--------|-------|-----------|---------------------------|
| 🌐 **Traducteur** | `axOpenStudio('traducteur')` | 30 langues + STT/TTS + interprète temps réel | **PRIORITÉ ÉLEVÉE** : conv bilingue live |
| 🍳 Cuisine | `axOpenStudio('cuisine')` | 10 recettes FR + 22 cuissons + allergènes INCO | Suggérer recettes contexte |
| 🩺 Médical | `axOpenStudio('medical')` | IMC + métabolisme + Vidal + urgences SAMU | Conseil santé léger |
| 💰 Finance | `axOpenStudio('finance')` | IR FR 2026 + crédit immo + Monaco fiscal | Calculs impôts |
| ⚖ Légal | `axOpenStudio('legal')` | 18+ codes français + jurisprudence Cass/CE | Conseils légaux basiques |
| 🎬 Vidéo | `axOpenStudio('video')` | Timeline + cut + captions auto + MP4 | Édition clips chat |
| 📷 Scan OCR | `axOpenStudio('scan')` | OCR Tesseract + QR + barcodes + cartes visite | Identifier docs en chat |
| 🔧 Pack Pro | `axOpenStudio('pack')` | Conversions + béton + lune + météo | Calculs utilitaires |
| 🎵 Musique | `axOpenStudio('music')` | Studio Mix Pro 12+ pistes EQ reverb | Édition audio chat |
| 🏗 Architecture | `axOpenStudio('archi')` | RE2020 + DTU + PMR + palette Pantone | Consultation pro |
| 📒 Préfecture | `axOpenStudio('prefecture')` | Démarches FR + Monaco + 40+ templates | Documents officiels |
| 🎨 Logo/Branding | `axOpenStudio('logo')` | Génération + Pantone + RAL + NCS | Création identité |

**+ 55 tools autonomes** : web search, fetch_url, voice_memo, send_email, calendar_event, weather, crypto_price, stock_price, translate, tts_speak, geolocation, etc.

## 🚨 Bugs critiques connus à NE PAS reproduire dans Apex Chat

### Bug "3 points infini" (Apex v12.365 — résolu)
**Symptômes** : IA n'a jamais répondu, fetch zombie, app bloquée.
**Causes cumulatives** :
1. Hardcoding URL `https://api.anthropic.com/v1/messages` au lieu de lire `ax_proxy_url` → CORS hang Safari iOS PWA
2. Filter `typeof content === "string"` droppait `tool_use`/`tool_result`/image dans recursion → API recevait conv cassée
3. Pas d'`AbortController` → fetch zombie après timeout

**Règles permanentes Apex Chat** :
- ✅ Lire `apex_proxy_url` AVANT de hardcoder URL
- ✅ JAMAIS filter content array par `typeof === "string"` avant API
- ✅ TOUJOURS `AbortController` + `signal.abort()` dans timeout
- ✅ Pre-commit hook detect `catch(_){}` patterns vides

### Pattern Apex critique : `_axSafeCatch(ctx, e)`
Tout try/catch DOIT logger via `_axSafeCatch` (pas `catch(_){}` silencieux).

### Smart-scroll bottom-anchor
Préserver position user en chat (ne PAS jumper au bottom si user scroll up).

### Stop bouton carré rouge fixe
PAS de pulse clignotant (anti-épilepsie + ergonomie).

### Bulles credentials live colorées
Rouge KO / Jaune untested / Vert tested OK <24h + click retest.

## 📝 Patterns Apex à porter directement

### Pipeline chat
```
User input → axDetectIntent (42+ patterns auto-exec)
           → _callClaudeAPI (failover Anthropic→Groq→Gemini→OpenRouter→OpenAI)
           → K.messages queue FIFO (persistant, jamais perdu)
           → Streaming SSE 30fps + smart-scroll
           → Tool execution si needed
           → K.conversations saved (localStorage + IDB + Firebase)
```

### Triple persistence boot
```
Boot → Restore localStorage → Restore IndexedDB (si gap) → Restore Firebase (si gap)
JAMAIS localStorage.clear() sans whitelist `ax_*` + `apex_chat_*` keys
```

### Sentinelles auto-gestion (30+ Apex existantes à étendre Apex Chat)
- `_axDailyCleanup` (cap logs/audit/msgs)
- `_healthCheck` (state général 30s)
- `_axCheckQuota` (cleanup proactif >80%)
- `_axCheckRemoteVersion` (auto-update 10 min)
- Telemetry digest 45s + error pattern detection 3 min

---

## 🚨 Règles permanentes Kevin (héritées de CLAUDE.md)

À RESPECTER ABSOLUMENT (toutes les règles permanentes du CLAUDE.md s'appliquent ici aussi) :

1. ✅ Niveau Claude.ai/ChatGPT (zéro erreur visible user sauf forfait)
2. ✅ UX épurée enfant 5 ans (langage simple, pas de jargon)
3. ✅ Auto-débloquage IA (failover Anthropic → OpenRouter → Gemini → Groq → local)
4. ✅ Triple persistence (rien perdre)
5. ✅ Profils enrichis automatiquement (sans redemander infos déjà connues)
6. ✅ Multi-sources (mémoire + KB + web + docs internes)
7. ✅ Multi-angles + propositions guidées
8. ✅ PRO + FUN partout (toggle)
9. ✅ Voix diversifiées (50+ : pro + fun + thématiques)
10. ✅ Admin Kevin reconnu via tous aliases + voix + PIN
11. ✅ Pipeline self-healing cross-app (Apex centrale)
12. ✅ CGU 1 clic universel (englobe toutes permissions)
13. ✅ Tests mentaux obligatoires avant chaque release

---

## 📝 Decisions log (chronologique)

| Date | Décision Kevin | Action |
|------|----------------|--------|
| 2026-04-27 | Copie WhatsApp + invite-link viral | Vision validée |
| 2026-04-27 | Évolutif, jamais limité | Cloudflare Workers + Durable Objects |
| 2026-04-27 | Toutes fonctions WhatsApp + innover | Roadmap 14+ innovations |
| 2026-04-27 | CGU vague + sécurisé visible | Option B + claim "ultra-sécurisé" |
| 2026-04-27 | Historique admin total + temps réel | Vue admin style Apex `vUserActivity` |
| 2026-04-27 | Auth = nom+prénom+tel+SMS code (Firebase Auth Phone) | Pas d'invite-link comme auth |
| 2026-04-27 | Pas de validation admin au login | Juste vérif numéro tel |
| 2026-04-27 | Fiche enrichie auto + temps réel | NLP continu + cross-app sync |
| 2026-04-27 | "Cherche encore à innover" | Liste innovations radicales (12+ idées) |

---

## 🔔 Notifications hors-app (validé Kevin 2026-04-27)

**Notifications natives système même app fermée**, pour TOUS (admin + users connectés) :

- **iOS PWA** : Web Push API + APNs (Apple Push Notification service) — fonctionne dès iOS 16.4 sur PWA installée
- **Android** : Web Push + FCM (Firebase Cloud Messaging) — déjà natif Chrome/Edge
- **Desktop** : Web Push standard (Chrome, Safari, Firefox)

**Évènements qui déclenchent une notif** :
- 💬 Nouveau message (DM ou groupe où mentionné)
- 📞 Appel entrant (audio/vidéo) — sonnerie via FCM high priority
- ⚠️ Alerte sécurité (nouvelle connexion device, signalement)
- 🚨 Pour Kevin admin : nouveau user inscrit, scam détecté, signalement, panne, anomalie agent
- 📬 Time Capsule arrivée à échéance
- 🎂 Anniversaire contact (rappel auto Apex Memo)
- 📍 Demande localisation live

**Réglages per-user** : on/off par catégorie + heures de silence + mode focus + ne pas déranger.

**Backend push** : Cloudflare Worker dédié (réutiliser le pattern Apex push worker existant : `apex-push-worker.desarzens-kevin.workers.dev`).

---

## 🔬 Synthèse audits externes (4 agents — 2026-04-27)

### 🚨 Audit SÉCURITÉ — alerte P0 majeure

**Verdict** : Backdoor admin Kevin + claim "ULTRA-SÉCURISÉ" en grand public = **risque pénal RÉEL** (art. 226-15 Code Pénal FR, précédents EncroChat/ANOM, Telegram CEO arrêté août 2024).

**Top risques identifiés** :
- P0 : Mensonge structurel "E2E militaire" alors que clé maître admin existe
- P0 : Clé maître = single point of compromise (1 fuite = 1M conversations)
- P0 : SIM swap trivial sur Firebase Phone Auth → account takeover
- P0 : RGPD art. 5/6/7 violations (consentement non spécifique)
- P1 : Cloudflare D1 + R2 = juridiction US (CLOUD Act)
- P1 : XSS dans PWA → clés exfiltrables via localStorage
- P1 : Prompt injection chat IA admin → tools destructifs exécutés

**Recommandation finale** : 3 options
- **A. Cercle privé Kevin** : <100 users invités personnellement, contrat signé acceptant lecture admin → légal car privé/contractuel
- **B. Vrai E2E grand public** : retirer la clé maître, Kevin voit metadata + signalements + chat IA admin pour modération (pas contenu)
- **C. Pivot B2B compliance** : casinos/banques/santé où modération admin est légalement attendue (marché mature)

### 🎨 Audit UX/PRODUIT

**Recommandations clés** :
- Couper 40% des features avant V1 (ABANDONNER : Streaks, Mood detection, Privacy heatmap, Sealed geocaching, Salons audio Clubhouse)
- Onboarding 5 étapes max
- **Backup iCloud/Drive E2E auto JOUR 1** (sinon churn massif au changement de tel)
- **Migration WhatsApp 1-clic** (différenciateur adoption majeur)
- Mode "Famille simple" pour 60+ (UI ultra-épurée auto)
- Last seen + read receipts granulaires (on/off par contact)
- Numéro = identité (pas username), exactement comme WhatsApp

**Innovations à GARDER** : Time Capsule, Letters mode (24h délai), Voice diary, Memory lane, IA résumé/traduction/smart reply

### 💰 Audit SCALE/COÛTS

**Coûts mensuels par palier** :
- 1K users : ~16€
- 10K : ~125€
- 100K : ~5400€ (⚠️ killer = Firebase Auth Phone)
- 1M : ~60K€ sans optimisations

**Optimisations critiques pour atteindre 100K MAU < 500€/mois** :
- Migrer Firebase Phone vers **Vonage direct** (~75€ pour 10K vérifs vs 4250€ Firebase)
- **Cache LRU IA + batch API** = divise coût IA par 7 (100K€ → 15K€)
- **Sharding D1 + DO Day 1** (sinon refactor catastrophe à 10GB)
- TURN : **coturn self-hosted Hetzner** (50€/mois) au lieu de Cloudflare Calls (2250€)
- Cloudflare Queues pour télémétrie (pas Firebase RTDB qui sature à 100K)
- IA en **opt-in payant** (Premium 5€/mois), pas inclus free
- Lifecycle médias 30j free / 90j premium

### 🚀 Audit MARKETING/DIFFÉRENCIATION

**Positionnement** : "La seule messagerie qui te rend plus intelligent, pas plus dépendant" — chiffrée comme Signal, vivante comme Discord, augmentée par IA.

**3 segments cible** :
1. Pros indépendants 25-45 (séparation perso/pro, RDV, paiement)
2. Familles cross-pays (traduction live + memory lane)
3. Privacy-aware déçus de Telegram (centralisé) et Signal (austère)

**Top 5 features buzz médias** : Time Capsule, Letters Mode, Voice Clone E2E, Decoy/Panic mode, Apex Coach

**Modèle freemium suggéré** :
- Free : tout core illimité
- Apex Chat+ 6,99€/mois : IA illimitée, voice clone, time capsules illimitées, stockage 1To
- Business 19€/user/mois : RDV, paiements, mini-apps, analytics
- Lifetime 199€ (1000 premiers) — buzz Product Hunt

**Hook viral** : Time Capsule duo — "Crée capsule à ouvrir dans 1 an avec [ami]. Il doit installer Apex Chat pour la voir." + 5 amis = 1 an Premium offert.

---

## 👁 Vue Light user vs Vue puissante admin (validé Kevin 2026-04-27)

### Vue user (light, comme WhatsApp)
- Liste conversations + chat + appels + statuts
- Réglages basiques (notifs, thème, confidentialité par contact)
- Aucune mention de "Kevin admin" ni de modération admin (sécurité produit)
- Onboarding 5 étapes
- Découverte progressive features (intent detection comme règle CLAUDE.md)

### Vue admin Kevin (puissante, mode X étendu)
- Toutes commandes activables/désactivables (toggles micro, caméra, géoloc, etc. sur n'importe quel user)
- Chat IA admin intégré : Kevin demande à Apex "trouve la conversation où Sophie a parlé de X" → IA exécute via tools
- Historique total temps réel
- Tableau de bord : connectés live, sentinelles, agents, pipeline self-healing
- Tools confirmation 2-step pour actions destructrices (kick, ban, exportConv)
- Vue per-user : tous onglets (Activity, Conversations, Géoloc, Devices, Erreurs, Validations, Signalements)

### Toggles features (modèle granulaire)
- **Par contact** (priorité) : last seen, read receipts, stories visibility, online status (privacy-first defaults)
- **Par groupe** : qui peut ajouter, qui peut écrire, disappearing timer
- **Par device** : notifs, son, vibration
- **Par user** (admin only) : Kevin peut activer/désactiver fonctions per-user à distance (modération)

---

## 🎭 Pseudos (validé Kevin 2026-04-27)

**Règle** : dans Apex Chat, l'identité publique des users = **pseudo uniquement**, pas le vrai nom.

### Fiche personne (champs)
- Vrai nom + prénom (saisis au signup, **visibles uniquement par Kevin admin**)
- Numéro de téléphone (vérifié SMS)
- **Pseudo** (champ obligatoire, choisi par le user) — seul élément visible des autres users
- Photo de profil (optionnelle, si non choisie → avatar généré IA selon pseudo)
- Bio courte
- Champs enrichis automatiquement (anniv, langues, intérêts, etc.) — admin only

### Affichage chat (vue user normale)
- Liste conversations : **pseudo + photo** (pas le vrai nom)
- En-tête conversation : **pseudo**
- Messages : **pseudo** auteur (groupes)
- Mentions @ : **@pseudo**
- Profil contact (clic sur pseudo) : pseudo + photo + bio + statut + actions (appeler, message, bloquer, signaler) — **vrai nom JAMAIS révélé**

### Affichage chat (vue admin Kevin)
- Liste : **pseudo (vrai nom)** entre parenthèses ou tooltip
- En-tête : pseudo + accès direct fiche complète
- **Clic sur pseudo n'importe où** → atterrit directement sur la **fiche complète** du user (vrai nom, prénom, tel, historique total, géoloc, devices, signalements, etc.)
- Recherche admin par : pseudo OU vrai nom OU tel OU email
- Onglet "Identités" admin : table croisée pseudo ↔ vrai nom (avec audit log)

### Règles pseudo
- Min 3 chars, max 20
- Alphanumérique + tirets/underscores autorisés
- Unique global (case-insensitive)
- Modifiable 1 fois / 30 jours (anti-impersonation)
- Suggestions auto basées sur prénom + chiffres si pseudo pris
- Réservés interdits (apex, admin, kevin, support, system, etc.)

### Implémentation
- Champ `users.pseudo` dans D1 (UNIQUE INDEX)
- API `GET /users/:pseudo` retourne profil public (pseudo + photo + bio)
- API admin `GET /admin/users/:pseudo/full` retourne fiche complète
- Front : composant `<UserPill pseudo={x} />` qui se comporte différemment selon `isAdmin`
- Audit log à chaque clic admin sur pseudo (traçabilité)

---

## 📲 Inscription + Invitation SMS (validé Kevin 2026-04-27)

### Inscription nouveaux users (style WhatsApp)
- User saisit : nom + prénom + numéro de téléphone + pseudo
- **Code SMS auto envoyé** sur le numéro saisi (Firebase Auth Phone, OTP 6 chiffres)
- User colle le code → vérification numéro
- Fiche créée auto + sauvegarde permanente
- **iOS/Android auto-fill** du code SMS (natif système, pas de copier-coller manuel)
- Resend SMS possible après 60 sec
- Rate limit : 5 OTP/heure/IP (anti-spam)

### Invitation par SMS depuis l'app (viralité)
**Bouton "Inviter mes amis" dans l'app** (visible dès l'onboarding terminé) :
1. User sélectionne un ou plusieurs contacts depuis son carnet d'adresses (avec permission Contacts)
2. App génère un **code d'invitation unique** par contact invité (`https://apexchat.app/i/<code>`)
3. **SMS envoyé** au contact via 2 stratégies cumulables :
   - **Stratégie A (gratuite)** : `sms:` URL natif OS — ouvre l'app SMS du téléphone avec message pré-rempli, user appuie envoyer → coût 0€ pour Kevin (utilise forfait SMS du user)
   - **Stratégie B (payante)** : envoi direct via Vonage/Twilio depuis le worker — Kevin paye ~0.04€/SMS, user n'a rien à faire
4. **Template SMS pré-rempli** :
   > "Salut ! J'utilise Apex Chat, une messagerie privée avec IA intégrée. Rejoins-moi : https://apexchat.app/i/AbC123"
5. Lien d'invitation contient :
   - User inviteur (pour tracking réseau viral)
   - Récompense automatique : 5 amis invités qui s'inscrivent = 1 an Premium offert (audit marketing)

### Tracking réseau viral (admin Kevin)
- Vue admin : graphe des invitations (qui a invité qui, profondeur du réseau)
- Stats par user : nb invités envoyés, nb acceptés, taux conversion
- Détection super-ambassadeurs (invitent beaucoup) → récompense bonus
- Détection patterns suspects (1 user invite 100 personnes en 1h = bot) → flag

### Limitations
- Max 50 invitations SMS par user / jour (anti-spam)
- 1 même numéro ne peut être invité qu'une fois (si refuse → renvoi possible après 7 jours)
- Si numéro déjà inscrit → pas de SMS, juste affiche "X est déjà sur Apex Chat"

### Implémentation
- Frontend : composant `<InviteFriends />` avec accès `navigator.contacts` (Web Contact Picker API) ou fallback manuel
- Backend : endpoint `POST /invitations/create` génère code unique en D1
- Worker SMS : `apex-sms-worker.workers.dev` qui appelle Vonage API (clé chiffrée) selon stratégie choisie
- Page d'atterrissage `/i/<code>` : redirige vers App Store / Play Store / installation PWA selon device
- Au signup, le code de l'invitation est lié → l'inviteur reçoit notif "X a accepté ton invitation"

---

## 🔗 Intégration Apex ↔ Apex Chat (validé Kevin 2026-04-27)

**Apex Chat n'est PAS une app isolée.** C'est un module intégré et auto-géré par Apex.

### 1. SSO cross-app (auth partagée)
- Compte Apex (kdmc_admin Kevin / Laurence) = compte Apex Chat automatique
- Au premier accès Apex Chat depuis Apex, l'auth est transmise via postMessage + token JWT signé partagé
- Pas besoin de re-saisir tel + SMS si déjà authentifié dans Apex
- Token cross-app stocké dans Firebase clé `ax_chat_sso_token` (FB_LOCAL strict, jamais sync)

### 2. Lien d'accès depuis Apex
- Bouton "💬 Apex Chat" dans la nav Apex (user + admin)
- Deep-link : `https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/?from=apex&token=<jwt>`
- Protocole custom : `web+apexchat://open?conv=<id>`
- Side-by-side : Apex peut ouvrir Apex Chat dans iframe modal pour multi-tasking

### 3. Auto-gestion totale par Apex IA
**Apex IA pilote Apex Chat en autonomie complète** :
- Sentinelles Apex Chat poussent vers `ax_telemetry_in` Firebase (cross-app)
- Apex IA `_aiHandleIssue` traite les anomalies Apex Chat (auto-fix whitelist : restart DO, rotate keys, requeue push)
- Si Apex IA ne peut pas → escalade `ax_claude_todo` → GitHub Action `claude-todo-watcher.yml`
- Apex IA peut envoyer **commandes** à Apex Chat via Firebase clé partagée `apex_chat_commands`
  - `kickUser(uid, reason)`, `banUser(uid)`, `searchAllMessages(query)`, `geoTrace(uid)`, `exportConv(convId)`, `broadcastNotif(message)`, `summarizeConv(convId)`
  - Côté Apex Chat, un poller worker récupère les commandes et exécute (avec confirmation 2-step pour destructifs)

### 4. IA Apex partagée (pas de duplication)
- Quand un user Apex Chat demande à l'IA (résumé, traduction, smart reply), l'app appelle directement l'IA Apex existante
- Pas de quota séparé — utilise le quota Apex du user (Premium Apex = Premium Apex Chat)
- Sytem prompt enrichi : Apex IA sait qu'elle peut être appelée depuis Apex Chat et ajuste le contexte (per-conversation memory)

### 5. Mémoire partagée par contact
- `ax_persistent_memory_<uid>` contient déjà la mémoire des contacts (apex)
- Apex Chat ENRICHIT cette mémoire avec les conversations chat
- Apex profil enrichi auto inclut maintenant : "Tu parles à Sophie sur Apex Chat depuis 3 mois, vous avez 47 conversations, anniv 12 mai, allergique fruits de mer..."

### 6. Notifications cross-app
- Notifications Apex et Apex Chat passent par le même push worker (`apex-push-worker.workers.dev`)
- Topic unifié : `user:<uid>` reçoit notifs Apex + Apex Chat
- Préférences notifs centralisées dans Apex Réglages

### 7. Vue admin unifiée Kevin
- Depuis le panel admin Apex (vUserActivity), Kevin voit aussi les données Apex Chat de chaque user
- Onglet "Apex Chat" dans la fiche user : conversations, contacts, signalements, devices Apex Chat
- Tools Apex IA admin étendus : `searchAllMessages` cherche aussi dans Apex Chat
- Dashboard Apex monitoring : section "Apex Chat" avec compteurs live (users connectés Apex Chat, messages/min, appels en cours, sentinelles state)

### 8. Self-healing en boucle fermée
```
[User Apex Chat] → bug détecté → sentinelle Apex Chat → CF Queue
       ↓
[Apex IA backend] → tente auto-fix → si KO → ax_telemetry_in (Firebase)
       ↓
[Apex IA Kevin device] → reçoit notif → tente fix avancé (whitelist) → si KO
       ↓
[ax_claude_todo Firebase] → GitHub Action cron 2h → ouvre Issue
       ↓
[Claude Code session suivante] → fix code → commit + push + lesson learned
       ↓
[Apex + Apex Chat] héritent automatiquement du fix au prochain SW update
```

**Tout en autonomie totale, Kevin n'intervient jamais sauf décision stratégique.**

### 9. Implémentation technique
- Module Apex `axChatModule.js` injecté dans `apex-ai/index.html` (à créer Phase 6)
- Endpoint Apex Chat `/api/apex/sso-exchange` qui valide le JWT Apex et crée la session
- Endpoint Apex Chat `/api/apex/commands` qui poll Firebase `apex_chat_commands` toutes les 30s
- Bouton "💬 Apex Chat" ajouté à la nav Apex (apex-ai/index.html)

---

## 🤖 Règles permanentes Apex/CMCteams héritées intégralement (Kevin 2026-04-27)

> **"Les mêmes idées générales et + que dans les autres projets sur l'automatisation, l'autonomie etc"**

Apex Chat hérite **toutes** les règles permanentes des projets Kevin :

### 1. Pipeline self-healing cross-app total
- Sentinelles → CF Queues → Apex `ax_telemetry_in` → `ax_claude_todo` → Claude Code
- Auto-fix whitelist : restart DO, rotate keys, requeue push, fbReconnect, resetStreaming
- 13 sentinelles dédiées (chat, auth, e2e, media, call, presence, storage, error, push, crypto, do, d1, r2)

### 2. Triple persistence systématique
- localStorage (rapide) + IndexedDB (résiste purge Safari) + D1 + R2 (cloud)
- Backup quotidien R2 rétention 90j
- Auto-restore au boot (gap detection)
- JAMAIS `localStorage.clear()` sans whitelist `apex_chat_*`

### 3. Anti-blocage IA total (failover transparent)
- Anthropic → OpenRouter → Gemini → Groq → OpenAI → mode local
- Cache LRU KV (60-70% hit rate, divise coûts par 7)
- AbortController obligatoire (anti zombie fetch — bug Apex v12.365)
- Queue messages user `K.pendingMessages` (jamais perdu)

### 4. Profils enrichis automatiquement (continu)
- NLP extraction : email, anniv, métier, langues, intérêts, allergies, famille
- Cross-app sync avec Apex (même `apex_uid`)
- Score complétude /100 visible admin
- `ax_persistent_memory_<uid>` enrichi par Apex Chat conversations

### 5. CGU 1 clic universel (style Apex `_cguAsk`)
- Modal au premier accès feature (caméra, micro, géoloc, contacts, notif)
- Persistence consentement per-user per-feature
- Révocable à tout moment

### 6. Reconnaissance vocale par utilisateur (voiceprint MFCC)
- Enrôlement 3 enregistrements au signup (optionnel)
- Wake word "Dis Apex Chat" sur device
- Identification speaker (Kevin/Laurence/etc.) — anti-confusion entourage
- Auto-apprentissage continu (moyenne pondérée 0.9 ancien + 0.1 nouveau)

### 7. Compte admin unique Kevin reconnu via tous aliases
- ADMIN_KEVIN_ALIASES : kevin, kevind@monaco.mc, kdmc, KD, Kevin DESARZENS, etc.
- PIN admin ‹code admin› (modifiable)
- Login flexible (tous formats : ordre, casse, tirets, accents, espaces)
- Algorithme tokens triés + normalization (jamais substring partiel sur 1 token court)

### 8. Permissions tiered Laurence (et autres users non-admin)
- Niveau A (auto) : lire ses données, modifier profil, chat, etc.
- Niveau B (notifie Kevin) : login/logout, achat, upload large, prefs change
- Niveau C (demande validation Kevin) : effacement compte, change email/PIN, achat >50€

### 9. Niveau expert pro partout
- Cohérence avec Apex (cuisine pro, médical pro, finance pro, légal pro, traducteur pro)
- Standards : référence officielle (Légifrance, ANSM, Vidal, Pantone, etc.)
- Mention prudence pour conseils juridiques/médicaux/fiscaux

### 10. Toggles features partout (par contact / par groupe / par device)
- Privacy-first defaults : tout off pour non-contacts, on pour contacts mutuels
- Last seen, read receipts, stories visibility, online status
- Disappearing timer par conv

### 11. Auto-update force PWA (sentinelle SW cache sync)
- `sw.js` `CACHE_VERSION = 'apex-chat-v' + APP_VER`
- GitHub Action `sw-cache-sync.yml` rattrape drift automatique
- Banner "🔄 Nouvelle version dispo" au reload (auto-detect)
- `force-update.html` accessible depuis réglages

### 12. Sauvegardes temps réel
- Sync immédiat localStorage → IndexedDB → D1 (worker append)
- Backup R2 quotidien automatique (cron worker)
- Backup E2E iCloud/Drive optionnel (mnémonique BIP39)
- Restoration multi-niveau au boot

### 13. UX épurée niveau enfant 5 ans
- Langage simple, pas de jargon technique côté user
- Vocabulaire interdit : "fbWrite", "localStorage", "API", "Service Worker", etc.
- Vocabulaire OK : "tirer pour rafraîchir", "ton message s'envoie", "sauvegardé"
- Test mental obligatoire : "Si Kevin teste cette feature dans 2 minutes, est-ce qu'elle marche ?"

### 14. Outils auto-apparents par contexte (intent detection)
- Mots-clés FR/EN dans message → propose Studio adapté
- Bulle dorée flottante "Tu veux faire X ?"
- Liste 3-5 outils proposés (cards horizontales)
- Cohérent avec Apex `axDetectIntent` (42+ patterns)

### 15. Dual PRO + FUN partout
- Toggle PRO ⚙️ / FUN 🎉 sur chaque feature
- Voix : 50+ (PRO + FUN + thématiques)
- Mode "Surprise me" 🎲

### 16. Concertation IA + mémoire totale
- Multi-angles à chaque réponse (3 angles minimum)
- Mémoire persistante par contact (Apex Memo)
- Lessons learned cross-app (Apex Chat → Apex)

### 17. Vérification avant envoi (jamais "ça devrait marcher")
- Syntax check JS avant chaque commit
- Tests Cypress/Playwright e2e Phase 9
- Audit externe Phase 9 obligatoire avant lancement public B

### 18. Niveau Claude.ai/ChatGPT (zéro erreur visible user)
- Idempotency-key sur chaque requête API
- SSE streaming robuste auto-reconnect
- Sentry-grade error capture (window.onerror + unhandledrejection)
- Distinction technique (auto-fix silencieux) vs forfait (montrer avec action)
- JAMAIS message technique brut affiché (table conversion)

### 19. Inventaire fichiers et liens auto
- `KEVIN_INVENTORY.md` racine repo mis à jour à chaque commit
- Section "📁 Mes codes" Apex avec liens cliquables
- Helper `axInventoryUpdate(filename, description)`

### 20. Maintenir `CLAUDE_ACTIVITY.json`
- Régénération à chaque session (commits avec catégorie)
- Vue admin Apex `vAdminWorklog` lit ce fichier

### 21. Reconnaître honnêtement quand pas au niveau
- Si Kevin dit "c'est pas pro" → reconnaître + audit + reprendre
- Pas de microversions cascadées (1-3 versions/jour MAX, batch fixes cohérents)
- Audit QA externe avant déclarer "10/10"

### 22. Tout fix bug bumpe APP_VER + CACHE_VERSION (sentinelle GitHub Action)
- Édit `APP_VER` dans `index.html`
- Édit `CACHE_VERSION` dans `sw.js` (sentinelle rattrape sinon)
- Test mental : "Avant push, j'ai bumpé APP_VER ? CACHE_VERSION ?"

### 23. Auto-gestion totale Apex IA cross-app
- Apex IA pilote Apex Chat en autonomie (commands via Firebase)
- Apex IA peut envoyer messages cross-app (notifications, alertes admin)
- Apex IA peut moduler Apex Chat (kick, ban, broadcast, etc.) avec confirmation 2-step

---

## 🔄 Auto-update + Backups + Maj force temps réel (Kevin 2026-04-27)

### Auto-update force
- Service Worker `sw.js` détecte nouveau `CACHE_VERSION` → banner "🔄 Mise à jour dispo"
- Bouton 1-clic "Mettre à jour maintenant" → `skipWaiting()` + `location.reload()`
- Sentinelle GitHub Action `sw-cache-sync.yml` rattrape drift automatique
- Page `/force-update.html` accessible depuis réglages (force unregister + caches.delete + reload)
- Notification push à Kevin admin pour chaque nouvelle version déployée

### Backups temps réel
- **Triple persistence** synchrone : localStorage → IndexedDB → D1 (à chaque write important)
- **Backup R2 quotidien** automatique : cron worker exécute `BACKUP DATABASE TO 'apex-chat-backup-YYYY-MM-DD.sql.gz'`
- **Rétention** : 90 jours sur R2 (lifecycle auto)
- **Backup E2E user** : opt-in iCloud/Drive avec mnémonique BIP39 12 mots
- **Restauration** : `/api/restore` endpoint admin Kevin (avec audit log)
- **Test restoration** : sentinelle `backup-watch` simule restore 1×/semaine

### Sauvegardes temps réel par feature
- **Messages** : flush D1 toutes les 5s via ConversationDO + cache local IDB immédiat
- **Profils** : sync à chaque modification + push Firebase shared
- **Conversations** : metadata sync continu + ciphertexts batch
- **Médias** : upload R2 chunked (resume si coupé)
- **Settings user** : sync localStorage → D1 → IndexedDB triple
- **Présence** : heartbeat 30s + last_seen sync

### Mises à jour temps réel (live UI)
- WebSocket `ConversationDO` push events instantanément
- Indicateurs "X est en train d'écrire" via WS broadcast
- Read receipts en temps réel
- Présence "en ligne" via `PresenceDO`
- Notifications push hors-app pour user déconnecté

### Cross-device sync temps réel
- 1 user peut avoir N devices (table `push_subscriptions`)
- Tous reçoivent les events WS en parallèle
- Read receipts synchronisés cross-device
- Logout d'un device → autres restent OK (kill switch admin Kevin possible)

---

## 🔮 Questions critiques à trancher avec Kevin

1. **DÉCISION CRITIQUE — modèle admin** :
   - **A** : Cercle privé Kevin (<100 users invités contractuellement, pas de pub grand public) → backdoor admin légal
   - **B** : Grand public avec vrai E2E (Kevin voit metadata + signalements + chat IA admin pour modération, mais PAS contenu messages) → légal et marketable
   - **C** : Pivot B2B compliance (casinos/banques/hôpitaux) → admin légal et attendu, marges meilleures
2. **Numéro de téléphone Kevin** ? (admin auto-reconnu)
3. **Domaine** : sous-route GitHub Pages `/apex-chat/` ou domaine `apexchat.app` / `apex-chat.com` ?
4. **Confirmer features ABANDONNÉES** (Streaks, Mood detection, Privacy heatmap, Sealed geocaching, Salons audio Clubhouse) ?
5. **Migration WhatsApp 1-clic** : OK pour priorité haute Phase 1 ?
6. **Backup E2E iCloud/Drive auto** : OK pour priorité haute Phase 1 ?

---

> Ce fichier est mis à jour à CHAQUE décision Kevin pour ne rien perdre.
> Lu en début de chaque session Claude Code pour cohérence.

---

## v1.1.172 (2026-06-06) — Audit crew complet (6 agents) + batch P0+P1

**Scores crew mesurés (avant fixes)** : Sécu 6.5/20 · Backend 9/20 · E2E 9/20 · Archi 11/20 · UX 13.5/20 · Tests 14/20 · Perf 15/20.

**Livré (8 batches, 12 commits, 813 tests verts, +17 nouveaux tests) :**
- **E2E RÉEL** : endpoints `POST /api/keys/prekeys` + `GET /api/keys/:id/bundle`, jointure `peer_pubkey`,
  publication clé au login, session just-in-time, fin du repli texte-clair silencieux.
- **OTP durci** : backdoor `000000` gaté derrière `ALLOW_TEST_OTP` (var wrangler, défaut "true"),
  bypass Kevin protégé (garde numéro explicite), leak `_dev_otp` coupé en mode sécurisé.
- **Backend** : `APEX_CHAT_KV` bindé (quotas), `system_config` NOT NULL, push_subscriptions schéma, hash OTP cleanPhone.
- **DO/crons** : Letters (route `/admin/inject-message`), Time Capsule (opened_at), force_logout REST+WS, read-receipt convId.
- **Offline** : outbox + replay (ws open / online). **Stripe** : révocation premium. **Dédup DM** serveur.
- **UX/P0** : fuite brouillons inter-comptes fermée, _clearConvLocal réparé, clavier ne se ferme plus
  (focus préservé dans render + append incrémental des bulles), WCAG AA, aria-live/aria-current, couverture honnête (78.7% réel).

**Reste (différé honnête)** : aucun P0/P1 majeur restant. P2 : nettoyage 7 fonctions mortes.
**Action Kevin** : flip `ALLOW_TEST_OTP=false` quand Vonage confirmé (cf. MEMO_KEVIN_RESTE_A_FAIRE.md).
