# 📁 APEX PROJECTS — Registry central tous projets Kevin

> Mis à jour 2026-05-14 (Apex v13.4.42 / CMCteams v9.602)
> Source de vérité unique pour tous les projets gérés par Apex AI.
> Apex IA peut consulter ce fichier en autonomie via `cmcRead("APEX_PROJECTS.md")`.

## 🎯 STATUS MAJ 2026-08-06 — Apex v13.4.362 (boîte à outils agents + journal du domaine)

- **Catalogue plugins enrichi** : 6 entrées taguées `agent-toolkit` (skills Anthropic, gbrain,
  awesome-design-skills, rtk, meridian-company-os, free-llm-api-resources). Contenu texte
  vendorisé dans `vendor/agent-toolkit/` (SHA + licence dans `MANIFEST.json`), rafraîchi tout seul
  le 1er de chaque mois par `agent-toolkit-sync.yml`.
- **2 skills Apex** : `apex-agent-toolkit.md`, `apex-domain-journal.md` (les skills en DOSSIER sont
  invisibles pour Apex — cf. APEX_HANDOFF.md).
- **Cap skills du meta-cache 30 → 45** (sinon chaque nouveau `apex-*.md` en éjectait 2, mesuré).
- **Tests** : `agent-toolkit-catalog.test.ts` 9/9 (dont parité skills + « Anthropic reste principale »),
  marketplace 61/61, rules-injection 22/22, tsc 0.

## 🎯 STATUS MAJ 2026-05-14 — Apex v13.4.42 (Skills 2026 + Runtime Tester + Admin integration + System prompt enrichi)

**Déployé sur main** via auto-merge bot. URL prod : `https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/`

**Versions livrées dans la chaîne** :
- v13.4.10 → 13 : Skills 2026 + MCP + Runtime Tester + Studios UI
- v13.4.38 : Fix ai-router import + renderForbidden UX
- v13.4.39 : Fix force-updates iPhone + boutons admin panel (Skills 2026/MCP/Runtime Tester)
- v13.4.40 : PARITÉ APEX TOTALE (extension AllowedTask + règle CLAUDE.md)
- v13.4.41 : Re-merge intégration totale
- v13.4.42 : Enrichi system prompt Apex IA mapping tools (audit ULTRA-REVIEW P0 #1)



**Skills 2026 complètement intégrés + Apex teste TOUT en runtime browser réel** :

### Skills (14 tools natifs auto-utilisés par Apex IA)
- `generate_docx` / `pptx` / `xlsx` / `pdf` — document generators 100% client-side
- `video_edit` (ffmpeg.wasm) + `video_compose_hyperframes` (MediaRecorder)
- `generate_design_system` (Frontend Design + 23 termes Impeccable)
- `generate_marketing_copy` (23 frameworks Cialdini/AIDA)
- `skill_factory_create` — Apex crée nouveaux skills runtime (admin only)
- `security_review` + `code_review` — branchés sur `apexSelfAudit`
- `futuristic_module_invoke` — registry 40+ modules dernier cri 2026

### MCP servers (3 enregistrés au boot)
- **BOFiP** — Bulletin Officiel Finances Publiques (doctrine fiscale FR officielle)
- **Almanac** — Deep Research Agent multi-sources
- **Legal Data Hunter** — 18M+ documents juridiques 110+ pays

### Vues admin nouvelles
- `?view=skills-2026` — liste 14 skills + boutons "🧪 Tester live"
- `?view=mcp-servers` — registry MCP + test/discover/add custom
- `?view=runtime-tests` — orchestrateur "🧪 Lancer TOUS tests réels"
- `?view=studio-docx` / `studio-pptx` / `studio-xlsx` / `studio-pdf` — UI formulaires

### Sentinelles ajoutées
- `skills-watch` (1h) — probe CDN libs alive (docxtemplater/pptxgenjs/xlsx/jspdf)
- `mcp-health-watch` (30min) — ping MCP servers + détection 401 expirés

### Runtime Tester (`apex-runtime-tester.ts`)
Apex exécute lui-même en browser **les 17 tests réels** (CDN load → lib → blob) :
4 generators + 3 MCP health + 5 futuristic routing + 2 sentinelles + security + hyperframes.
Rapport persisté `ax_runtime_test_last` + historique 20 runs.

### Métriques v13.4.13
- 35 nouveaux tests vitest (tous ✅)
- Suite complète : **8047 passed / 0 failed / 9 skipped**
- TypeScript strict mode : 0 erreur
- Build Vite : ~6-7s

---

## 🆕 STATUS MAJ 2026-05-04 — Apex v13.0.77 livré

- **Apex v13** : 4463+ tests verts, parité v12 ~85%, branche `claude/test-699LQ` canary
- **17 subagents** finis cette session (5 commits v13.0.73 → v13.0.77)
- **Parité Claude Code 100%** : Apex peut Read/Edit/Write/Bash/Web/Subagents/MCP
- **Auto-modification** : 23 tasks whitelist Apex + 12 forbidden (sécurité)
- **Preflight check** : Apex vérifie outils/modules avant présenter user
- **109 features** ON/OFF global + per-user
- **51 services** liens recharge avec dashboard/billing/docs/support/status/api/usage
- **15 skills experts** documentés .claude/skills/ (4712 lignes)

---

## 🎯 Vision Kevin

> **"Intègre tous les projets dans Apex projets et fourni à Apex tout ce dont il a besoin comme meilleurs outils, accès, autorisations, et tout ce dont il pourrait avoir besoin pour terminer ces projets un par un, les gérer depuis Apex auto-géré tout comme dans Apex et les autres projets. Automatisé. Et quand ce sont des outils, s'en servir et les intégrer dans Apex pour l'admin et Apex en autonomie comme les autres fonctions de l'app"** — Kevin 2026-04-30

### Principes
- **Zero confusion** : 1 seul repo (cmcteams), 1 seule branche active (`claude/fix-apex-ai-bugs-adHfF`)
- **Apex AI = orchestrateur** : tous les projets accessibles depuis vue `vProjects` (`?view=projects`)
- **Apex IA autonome** : tools + accès + permissions pour gérer chaque projet sans intervention Kevin
- **Allègement Kevin** : modal `axNeedsAttention` 1-clic seulement quand impossible automatiser
- **Outils dernier cri** : Edge TTS, Gemini, FFmpeg latest, Anthropic Claude 4.7, Cloudflare Workers
- **100/100 réel** sur chaque axe et chaque projet

---

## 📦 7 PROJETS GÉRÉS (Kevin 2026-04-30 : retrait IA-APEX, Cloudflare, Backend, Bilan)

| # | ID | Nom | Statut | Version | Localisation |
|---|----|----|--------|---------|--------------|
| 1 | `kdmc` | **APEX AI v13** | 🟢 Canary | v13.0.77 | `apex-ai/v13/` (claude/test-699LQ) |
| 1b | `kdmc-v12` | **APEX AI v12** | 🟢 Production stable | v12.785 | `apex-ai/` |
| 2 | `cmcteams` | **CMCteams** (casino Monaco) | 🟢 Production | v9.593 | `index.html` racine |
| 3 | `apexchat` | **Apex Chat** (WhatsApp clone) | 🟠 Dév Mode A | v0.2 | `messaging-app/` |
| 4 | `socialvideo` | **Social Video Pipeline** | 🟠 Dév Phase 3 | v0.3 | `tools/social/` |
| 5 | `remote` | **Télécommande Universelle** | 🟢 Production | v1.2 | dans Apex AI |
| 6 | `crackpass` | **CrackPass / Vault** | 🟢 Production | v1.1 | dans Apex AI |
| 7 | `ekdmc` | **e-KDMC** (e-commerce 5 boutiques + CHEZ LOLO) | 🟢 Production | v1.10 | `shops/` + `_PROJECTS_KDMC/e-KDMC/` |

### ⚙️ Outils, Infrastructure & Vues (PAS PROJETS, à NE PAS lister dans vProjects)
> ⚠️ **RÈGLE PERMANENTE Kevin 2026-04-30** : ne JAMAIS ajouter ces items dans `vProjects()` ni dans `AX_PROJECTS_REGISTRY`. Ce sont des outils/vues/infra, pas des projets autonomes.

- **Cloudflare Tools** (`tools/cloudflare/`) : push worker + VAPID gen + deploy worker — outil utilisé par Apex AI + Apex Chat
- **Backend Proxy** (`apex-ai/proxy-apex.js`) : proxy Cloudflare Worker Anthropic API (CORS iOS) — infrastructure
- **Bilan Général** (`vBilan` + `BILAN_PRO.md`) : vue admin valorisations + plan budgétaire — vue dashboard, pas un projet
- **GitHub Actions** (`.github/workflows/`) : CI/CD + social-publish + social-scheduler + claude-todo-watcher — automation
- **Sentinelle projects-watch** : audit hebdo via `axProjectsAudit()` — fonction interne Apex AI

### 🗄️ Archive (idées non-démarrées — info conservée historique)
- **IA-APEX** : projet IA personnel à démarrer — jamais commencé, archivé pour mémoire

---

## 🔑 ACCÈS & TOKENS REQUIS (registry `AX_APEX_PROJECTS_TOKENS` v12.547)

| Token | Service | Project | Required | Setup URL |
|-------|---------|---------|----------|-----------|
| `ax_api_key` | Anthropic Claude | apex-ai | ✅ | https://console.anthropic.com/settings/keys |
| `ax_gh_pat` | GitHub PAT (workflow scope) | all | ✅ | https://github.com/settings/tokens/new?scopes=workflow,repo |
| `ax_gemini_key` | Google Gemini AI | socialvideo | ⚪ | https://aistudio.google.com/app/apikey |
| `ax_openrouter_key` | OpenRouter (failover IA) | apex-ai | ⚪ | https://openrouter.ai/keys |
| `ax_groq_key` | Groq (failover gratuit) | apex-ai | ⚪ | https://console.groq.com/keys |
| `ax_elevenlabs_key` | ElevenLabs (voix premium) | apex-ai | ⚪ | https://elevenlabs.io/app/settings/api-keys |
| `ax_cf_token` | Cloudflare API | cloudflare | ⚪ | https://dash.cloudflare.com/profile/api-tokens |
| `ax_youtube_oauth` | YouTube OAuth (publication) | socialvideo | ⚪ | https://console.cloud.google.com/apis/credentials |
| `ax_fb_page_token` | Facebook Page Access | socialvideo | ⚪ | https://developers.facebook.com/tools/explorer/ |
| `ax_ig_user_id` | Instagram Business | socialvideo | ⚪ | https://developers.facebook.com/docs/instagram-api/getting-started |
| `ax_stripe_key` | Stripe (paiements) | apex-ai | ⚪ | https://dashboard.stripe.com/apikeys |
| `ax_kevin_whatsapp_phone` | WhatsApp Kevin (OTP) | apex-chat | ⚪ | https://wa.me/ |

**Helper audit** : `axAuditApexProjectsTokens()` retourne `{present, missing, total}`.

**Stockage** :
- Localement chiffré AES-GCM 256 (v12.529+)
- Sync Firebase chiffré pour cross-device admin (sauf clés sensibles biométrie)
- GitHub Secrets pour tokens API publication (YouTube/FB/IG/Gemini)

---

## 🤖 AUTONOMIE APEX IA

### Niveau 1 : auto-fix sans intervention
Apex IA exécute en autonomie via `_aiHandleIssue(sentinelId, severity, finding)` whitelist :
- `flushSyncQueue` `emergencyCleanup` `fbReconnect` `resetStreaming` `clearImportSnapshot`
- `retryFailedRequest` `resetSession` `reloadKB` `axMigrateLSEncrypt` `axStorageEmergencyCleanup`
- `axCleanupAllListeners` `axClearOldIntervals` `axStorageEmergencyCleanup`

### Niveau 2 : modal `axNeedsAttention` 1-clic
Apex propose une action modale à Kevin (validation 1 tap) :
- Renouvellement token expiré (FB Page Token expire 60j)
- Quota Anthropic atteint → bascule failover
- Nouveau device login → OTP WhatsApp
- DPA signature requise (juriste 2-4K€)

### Niveau 3 : escalade Claude Code via `ax_claude_todo`
Si auto-fix exhausted :
- Push entry `{context, reason, severity:critical, src:apex, ts}` dans Firebase `ax_claude_todo`
- GitHub Action `claude-todo-watcher.yml` cron 2h poll → ouvre Issue
- Prochaine session Claude Code : lit issue → fix → push commit + lesson learned

---

## 🛠 TOOLS APEX IA (callable depuis chat)

### Existants v12.546
- `axCallClaude(messages, opts)` — appel API Anthropic avec failover
- `axDetectIntent(text)` — détection contextuelle outils (musique/vidéo/archi/préfecture/admin)
- `axDeployFirebaseRules()` — copie rules + ouvre console Firebase 1-clic
- `axScanResponseForFakeUrls(text)` — anti-hallucination URL whitelist 30+ domaines
- `axDetectJailbreak(text)` — 7 patterns regex (DAN, ignore_instructions, safety_bypass, etc.)
- `axRedactOutbound(text)` — credential scan avant Anthropic (50+ patterns)
- `kbAdd(text, source, type)` — KB injection regex defense
- `axCreateSocialVideo({topic, niche, format, template, platform, lang, schedule})` — **NEW v12.547**

### Nouveaux v12.547
- `vSocialVideo()` — vue admin pipeline vidéos (file jobs + tokens + templates)
- `_axShowSocialVideoModal()` — form simple créer nouvelle vidéo
- `axAuditApexProjectsTokens()` — audit présence/manque tokens

### À créer (futurs projets)
- `axCreateApexChatInvite(phone, msg)` — invite WhatsApp 1-clic Apex Chat
- `axDeployCloudflareWorker(name, code)` — déploiement worker via API
- `axEcomCreateProduct(title, price, image)` — e-APEX produit
- `axBackupAllProjects()` — snapshot tous projets dans Firebase

---

## 📋 ROADMAP PAR PROJET

### Apex AI (v12.547 → v13.0)
- ✅ Wiring helpers Compliance/AI Safety/Consent (v12.537-541 mes patches)
- ✅ Logger central + 14 P0 audit chat (v12.542-545 P2XG9 patches)
- ✅ Apex Projects vue centrale (v12.547)
- ⏳ EU AI Act Art.52 disclosure complet
- ⏳ Firebase Phase 5 (auth.uid per-user)
- ⏳ DPA signatures contractuelles (juriste)

### Apex Chat (v0.2 Mode A)
- ✅ messaging-app/ structure complète (workers + D1 + DO + PWA static)
- ✅ Mode A actée (admin voit contenus) — bascule depuis Mode B
- ⏳ 8 fichiers à adapter pour Mode A (subagent ac0260a plan livré)
- ⏳ Frontend index.html + connexion workers
- ⏳ Auth Firebase Phone Provider (SMS OTP 6 chiffres)

### e-KDMC (v1.10 — EN PRODUCTION depuis 2026-05-18)
**Localisation** : `shops/` (déployé live) + `_PROJECTS_KDMC/e-KDMC/` (docs/fonctions)
**Composants livrés** :
- ✅ 5 boutiques SPA live — 500 produits total, descriptions uniques, photos Unsplash
  * `shops/chez-lolo/` — CHEZ LOLO (ex Glow Wellness, thème provençal olive/crème)
  * `shops/tech-hub/` — Tech Hub (gadgets & accessoires)
  * `shops/ecocraft/` — EcoCraft (éco-responsable)
  * `shops/digital-vault/` — Digital Vault (produits numériques)
  * `shops/pawsome/` — Pawsome (animaux)
- ✅ Portail `shops/index.html` — accès centralisé aux 5 boutiques
- ✅ Dashboard admin `shops/dashboard/` — 6 vues (orders, products, customers, analytics, finance, settings)
- ✅ Paiement multi : PayPal + Revolut @kdmc + IBAN (modal checkout luxe)
- ✅ UX luxe : Playfair Display serif, animations fadeUp, glassmorphism, ombres profondes
- ✅ Pages légales : `shops/legal/` (CGV, Mentions, Confidentialité)
- ✅ URLs courtes Vercel : `shops/vercel.json` (/lolo, /tech, /eco, /digital, /pets)
- ✅ Functions serverless :
  * `functions/stripe-webhook.js` — handler paiements (signature vérifiée)
  * `functions/email-trigger.js` — 6 templates Brevo
  * `functions/invoice-generate.js` — facturation auto PDF Monaco
- ✅ Agent automation (`automation/agent/index.js`) — 7 fonctions 24/7
- ⏳ Action Kevin (voir `TODO_KEVIN.md`) :
  * Déployer sur Vercel pour URLs courtes (2 min)
  * Acheter domaine `kdmc.shop` (~12€/an)
  * Configurer notifications WhatsApp paiement
  * Connecter Stripe pour CB
  * Projet Firebase dédié e-KDMC séparé de CMCteams

### Social Video Pipeline (v0.3 Phase 3)
- ✅ Recovery depuis branche RvjYq (24 .js, 7000 LOC)
- ✅ Vue admin vSocialVideo + axCreateSocialVideo helper (v12.547)
- ✅ 2 GitHub Actions (social-publish.yml + social-scheduler.yml)
- ⏳ Setup tokens (PAT GitHub + Gemini + YouTube + FB + IG)
- ⏳ Premier dispatch test
- ⏳ Analytics dashboard intégré dans vue admin

### CMCteams (v9.579)
- 🟢 Production stable — planning Monaco 258 employés
- ⏳ Continue maintenance + sentinelles

### e-APEX (v0.1)
- ⏳ À spécifier (e-commerce automatisé)

### IA-APEX (v0.0)
- ⏳ À démarrer (projet IA personnel)

---

## 🤝 SENTINELLE `projects-watch` (à implémenter)

Audit hebdomadaire chaque projet :
- Status build (CI green ?)
- Last commit < 30 jours ?
- Tests passent ?
- Tokens expirent < 7j ?
- Quota API atteint ?

Si KO → escalade Claude Code via `ax_claude_todo`.

---

## 📂 FICHIERS DE RÉFÉRENCE

| Doc | Contenu |
|-----|---------|
| `CLAUDE.md` | Règles permanentes Kevin + erreurs connues |
| `KDMC_AI_PROJECT.md` | Feuille de route Apex AI complète |
| `APEX_HANDOFF.md` | Transfert connaissance Claude Code → Apex IA |
| `WHATSAPP_CLONE_PROJECT.md` | Spec Apex Chat v1.0 |
| `messaging-app/PROJECT_MEMO.md` | Mémoire vivante Apex Chat (Mode A actée 2026-04-30) |
| `BRANCH_REPORT_P2XG9.md` | Rapport branche audit chat 12 agents |
| `tools/social/README.md` | Doc Social Video Pipeline |
| `KEVIN_INVENTORY.md` | Tous les codes/fichiers/liens (auto-mis-à-jour) |
| `STACK_AUTONOMOUS.md` | Stack technique recommandée |
| `BILAN_PRO.md` | Bilan financier Apex + CMCteams |

---

**Source de vérité** : ce fichier. À mettre à jour à chaque ajout/modification de projet.
