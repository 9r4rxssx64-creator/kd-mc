# 🧠 BILAN DES COMPÉTENCES APEX — État actuel v13.0.77 (2026-05-04)

**Inventaire exhaustif de ce qu'Apex sait faire aujourd'hui**, agrégé depuis `AX_CAPABILITIES`, `TOOLS_CATALOG`, `AX_EXEC_INTENTS`, `AX_CODE_TOOLS`, services v13, audit subagent indépendant.

---

## 📦 INVENTAIRE GLOBAL v13.0.77

| Famille | Nombre v12 | Nombre v13 | Maturité |
|---------|-----------:|-----------:|----------|
| Tools IA exécutables | 100+ | **105** | ✅ Production |
| Intents auto-exécution | 42+ | 42+ | ✅ Production |
| Studios pro | 15 | **10** | 🟡 5 ajoutés v13.0.76 |
| Modules pro | 8 | **8** | ✅ TOUS portés EXPERT |
| Voix TTS | 50 | **61** | ✅ dépasse v12 |
| Effets WebAudio | — | **12** | ✅ NEW v13 |
| Langues traduction | 30+ | **56** | ✅ boost translator |
| IA providers (failover) | 5 | 5 | ✅ Production |
| Personas chat | 13 | 13 | ✅ Production |
| Sentinelles auto 24/24 | 13 | **22** | ✅ 170% v12 |
| Services TS wirés | 53 | **70+** | ✅ ServiceLifecycle |
| Skills experts (.claude/) | 0 | **15** | ✅ NEW (4712L doc) |
| Liens services recharge | 30+ | **51** | ✅ +21 services |
| Features toggleable ON/OFF | 0 | **109** | ✅ NEW per-user |
| Tests automatisés | 1515 | **4463+** | ✅ +2948 v13.0.25→77 |

## 🔥 NEW v13.0.77 — Apex parité Claude Code 100%

**services/apex-claude-code-parity.ts** (29 méthodes) :
- Read, Edit, Write (parité Claude Code)
- Bash (whitelist npm/git/node/eslint/tsc/vitest)
- Grep, Glob, WebFetch, WebSearch
- SpawnSubagent (tasks parallèles)
- MCPCall (GitHub : create_pr, merge_pr, comment_pr, list_issues, etc.)
- SelfAudit, SelfFix, SelfRelease

**services/apex-execute.ts** (auto-modification) :
- 23 tasks whitelist : modify_file, create_file, modify_skill, modify_hook, modify_workflow, register_sentinel, create_pr, etc.
- 12 forbidden : delete_file (sans confirm), force_push, modify_csp_meta, modify_admin_kevin, etc.

**services/preflight.ts** (94.51% coverage) :
- preflightCheck(toolName) → {ok, ready, missingDeps?, error?, autoFixAvailable?}
- Cache 5min, UI 🟢/🟡/🔴

**services/feature-toggles.ts** (98.23% coverage) :
- 109 features wired
- Resolution priority : per-user > global > default(true)
- Vue admin avec search + désactiver tout / activer tout

**services/links-registry.ts** :
- 51 services
- 7+ champs : dashboard, billing, docs, support, status, api_keys, usage
- Auto-create au paste credential
- Sentinelle link-validation-watch HEAD daily

**services/vault-triple-persist.ts** :
- localStorage + IDB + Firebase FB_FIX (chiffré AES-GCM-256)

---

---

## 🎙 CHAT IA + VOIX

- **Claude Sonnet 4.6** par défaut, Opus 4.7 pour tâches lourdes, Haiku 4.5 pour rapidité
- **Failover transparent** : Anthropic → OpenRouter → OpenAI → Gemini → Groq (5 sources)
- **Streaming** SSE 30fps avec smart-scroll bottom-anchor (préserve position user)
- **Queue messages FIFO** persistante (jamais de réponse perdue)
- **Idempotency keys** + dedup hash 3 derniers msgs
- **Resume partial** : bouton « Continuer » sur réponses interrompues
- **Stop / Regenerate / Edit / Retry / Copy / Favorite / React 👍👎** sur chaque message
- **44+ voix** : Web Speech + ElevenLabs + Google Cloud + Azure + filtres (helium, robot, écho, slow, whisper, drunk, cartoon, oldman, chipmunk, reverse, megaphone, underwater, space, phone)
- **16+ voix thématiques** : Robot, Vieux, Bébé, Fantôme, Super-héros, Sorcier, Chat, Dragon, Clown, Chanteur, Présentateur, Commentateur sport, Endormi, Hyper-content, Triste, Colère
- **Voiceprint MFCC** : reconnaissance par utilisateur (Kevin / Laurence) — seul du marché
- **Wake word** « Dis Apex » avec VAD continu
- **STT dictée** Web Speech FR + post-correction lettre/chiffre

## 🎨 STUDIOS PRO (12 verticaux)

| Studio | Capacités |
|--------|-----------|
| 🎚 **Musique** | Mix Pro 12+ pistes, EQ, reverb, compresseur, BPM detect, export WAV/MP3 |
| 🎬 **Vidéo** | Timeline, cut, fade, captions auto, export MP4 |
| 🏗 **Architecture** | RE2020, calcul surface, mélanges béton/peinture/chaux/carrelage, palette Pantone 2026, Blondel |
| 📒 **Légal** | 18+ codes français + jurisprudence Cassation/CE/CJUE/CEDH + Monaco |
| 💰 **Finance** | IR FR 2026, PFU 30%, plus-values immo, crédit immo, Monaco fiscal, NPV/IRR, SMA/EMA, crypto live (CoinGecko) |
| 🍳 **Cuisine** | 10 recettes FR, 22 cuissons, conversions, 14 allergènes INCO, calories |
| 💊 **Médical** | Vidal, IMC, métabolisme, médicaments OTC, urgences SAMU, vaccins |
| 🌐 **Traducteur** | 30 langues, cache, Claude Haiku, STT/TTS, mode interprète |
| 📷 **Scan** | OCR Tesseract, QR codes, barcodes, cartes visite, documents officiels |
| 📋 **CV** | Templates pro + LinkedIn updater + lettre motivation IA + mock entretien |
| 📄 **Contrat** | NDA, CDI, freelance, cession |
| 🎁 **Logo / Présentation** | Branding Pantone strict / slides pitch |

## 🤖 IA AVANCÉE

- **Tool use** : 55+ tools exécutables (`AX_CODE_TOOLS`)
- **Intent detection** : 42+ patterns FR/EN auto-exec (« ouvre google », « cherche meteo Paris »)
- **Crew mode** : 9 experts parallèles (finance, légal, tech, UX, marketing, product, strategy, security, data + devil's advocate)
- **Multi-IA concertation** `axCrewMultiSession` : 3 modèles parallèles (Sonnet/Haiku/Opus)
- **Persistent memory** per-user (1000 faits max)
- **Knowledge base** custom (`K.kb.facts` + `K.kb.instructions`)
- **Web Search** Anthropic native + Brave + Tavily + DuckDuckGo + Google CSE
- **Vision Claude** : photo, OCR, identifier produit + acheter

## 💻 CODE AGENT GITHUB (100%)

- `axGithubReadFile / SearchCode / ListBranches / ListPRs / ListIssues / TriggerWorkflow / CompareCommits`
- `axProposeCodeChange` : crée branche + PR + auto-merge GitHub Action
- Intégration MCP github (16 tools)

## 🧰 TOOLS BROWSER (55+)

Calcul, web_search, fetch_url, screenshot, scan_qr, identify_image, voice_memo, send_email, calendar_event, weather, news, crypto_price, stock_price, translate, summarize, transcribe, generate_image (DALL-E externe), tts_speak, vad_listen, geolocation, navigation, install_pwa, share, copy_clipboard, paste_clipboard, file_save, file_open, drag_drop_upload, multimodal_input, etc.

## 🔐 SÉCURITÉ + PERSISTENCE

- **Triple persistence** localStorage + IndexedDB + Firebase (zéro perte)
- **SHIELD** module : 19 clés critiques snapshot 5 min + auto-restore 60 s
- **axHardLogoutSession** : whitelist stricte SESSION_KEYS (anti-bug #44 — XP/streak/profil préservés)
- **axTestLoginPersistence** : test régression automatique
- **AES-GCM 256** + PBKDF2 100k pour secrets Coffre
- **CGU universel** `_cguAsk` (consent par feature, persistant)
- **Audit log** `ax_audit` 200 entries
- **Sentinelle SECURITY-CHECK** quotidienne

## 🌐 BROWSER EMBED + EXÉCUTION

- `vBrowserEmbed(url)` iframe sandbox + fullscreen + overlay Apex
- Contournement blocages : Web Archive, Reader mode (r.jina.ai), CORS proxy Cloudflare
- Open in Safari fallback

## 🔄 AUTO-GESTION 24/24

| Sentinelle | Fréquence | Rôle |
|------------|-----------|------|
| `_axDailyCleanup` | 24 h | Caps logs/audit/msgs, purge backups > 7j |
| `_agentDataPersistenceWatch` | 24 h | Test login persistence (anti-bug #44) |
| `_axCheckRemoteVersion` | 10 min | Auto-update version |
| `_axCheckQuota` | 5 min | Cleanup proactif si > 80% |
| `_healthCheck` | 30 s | État général |
| `axShield` snapshot | 5 min | 19 clés critiques restore |
| `_digestTelemetryPeriodic` | 45 s | Telemetry agrégée |
| `_agentErrorDigest` | 3 min | Patterns erreurs |
| Presence heartbeat | 10 s | En ligne |
| Firebase SSE | 30 s | Sync temps réel |
| `axSelfReviewCapabilities` | 6 h | Auto-audit fonctions |
| Service Worker update | 60 s | MAJ silencieuse |

## 🆕 NOUVEAUTÉS v12.330–334

- **v12.330** : Fix scroll chat (jamais remontée top)
- **v12.331** : Ronds verts auto sur format clé valide + XP/streak/profil admin préservés au logout
- **v12.332** : `axTestLoginPersistence` test régression + `_agentDataPersistenceWatch` sentinelle + `axCrewMultiSession` 3 modèles parallèles
- **v12.333** : Schema.org JSON-LD `WebApplication` + cap K.messages 500 + `_axCheckRemoteVersion` 10 min
- **v12.334** : `autocorrect="off" spellcheck="false"` chat input (UX iPhone) + audit chatDelMsg CMC + sort cmc_chat by ts (anti-race FIFO)

---

## 🔮 FONCTIONS À AJOUTER (gap concurrence)

1. **DALL-E 3 inline** (vs ChatGPT vision) — 4 h dev
2. **Sora-like vidéo** ou Veo 3.1 wrapper — externalisé pour l'instant
3. **Advanced Voice Mode conversationnel** (style ChatGPT) — STT continu + TTS interruption
4. **Marketplace studios + voiceprints** uploadables (creator economy) — moyen terme
5. **API Apex publique** (webhooks + LLM-as-service) — moyen terme
6. **Apex Teams entreprise** (sandbox généralisé Laurence-style) — moyen terme

---

## 📈 SCORE / 10 PAR AXE (audit externe pro 2026-04-26)

| Axe | Score | Notes |
|-----|------:|-------|
| Prix / valeur | **10** | 4× moins cher que la concurrence (PWA = 0 % tax) |
| Offline + sync | **10** | Seul du marché à fonctionner sans internet avec queue persistante |
| Failover IA | **10** | 5 providers vs 1 chez la concurrence |
| Studios pro vertical-métier | **10** | 12 modules vs 0 chez ChatGPT/Claude |
| Voiceprint MFCC | **10** | Seul du marché |
| Permissions tiered | **10** | Seul à proposer auto/notify/validate granulaire |
| Triple persistence | **10** | Zéro perte garantie |
| Sentinelles auto-fix 24/24 | **9** | Très complet, manque token-balance-watch dédié |
| Self-healing cross-app | **9** | Pipeline complet, escalades cron 2h à raccourcir |
| Sécurité (admin global + per-user) | **9.7** | Anti-bug #44 fixé, 13 règles permanentes |
| Fonctionnalités globales | **9** | 55+ tools + 42+ intents + 12 studios |
| UX iPhone fluidité | **8** | Smart-scroll OK, throttle 30fps, quelques mini-fixes restants |
| Vision native (DALL-E inline) | **6** | À combler |
| Brand recognition / écosystème | **5** | Démarre — c'est normal en early-stage |
| **Moyenne globale audit externe** | **8.2** | Apex 8.2 vs ChatGPT 8.4 — quasi parité |

**Niches où Apex est 10/10 absolu** : prix, offline, failover, voiceprint, studios pro, permissions tiered, triple persistence.
**Axes pondérés à la baisse** : brand (jeune), génération images native (DALL-E inline manquant), écosystème (early-stage).
