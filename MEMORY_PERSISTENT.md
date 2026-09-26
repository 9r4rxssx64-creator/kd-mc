# MEMORY_PERSISTENT.md — Mémoire partagée Claude Code ↔ Apex ↔ Kevin

> **Règle Kevin 2026-04-21** : mémoire persistante obligatoire. Chaque fait, config,
> décision noté ici. Auto-consultée à chaque session, auto-enrichie à chaque action
> significative. Source de vérité commune.

**Format** : chaque entry datée, catégorisée, horodatée. Jamais supprimée, juste enrichie.

---

## 👤 KEVIN DESARZENS (admin principal — à savoir par cœur)

- Email : `kevind@monaco.mc`
- Casino de Monaco (SBM) — département Jeux de table / Black Jack
- Admin IDs : `kdmc_admin` (Apex) / `U11804` (CMCteams, DESARZENS K)
- Appareils : iPhone (principal, PWA Safari), Tablette Lenovo Android, Ordinateur
- Téléphone interne casino : 62224 (et pit Café de Paris 620)
- Préférences : français, concis, tutoiement, pas d'invention, user-friendly errors
- Tolérance bidouillage : ZÉRO. Exige mode expert permanent.

## 🔑 CONFIGURATIONS ACTIVES (déjà en place — NE JAMAIS redemander)

| Service | État | Emplacement |
|---------|------|-------------|
| Clé API Anthropic | ✅ Configurée | `ax_shared_api_key` Firebase shared |
| Proxy Cloudflare | ✅ Optionnel | `ax_proxy_url` (si set, prioritaire) |
| Firebase RTDB | ✅ Actif | `cmcteams-c16ab-default-rtdb.europe-west1` |
| Firebase Rules | ✅ Publiées **et DURCIES** | `cmcteams`, `apex`, `coffre_vault` = `auth != null` (plus `read/write: true` — durci le 12.06 puis le 04.07.2026, cf. `firebase-rules-apex.json`). ⚠️ Cette ligne annonçait encore « read/write true » : **c'était faux et dangereux à relire** (corrigé le 6.09). |
| Telegram Bot | ✅ Configuré | `@Kdmc_kevind_2026_bot`, chatId dans `ax_telegram_chatid` |
| EmailJS | ✅ Configuré | pour notifs |
| Sentry DSN | ✅ Configuré | monitoring erreurs |
| Finnhub | ✅ Configuré | cours bourse |
| Stripe | ✅ Configuré | paiements app |
| CGU biometric/mic/geoloc | ✅ Accepté | `ax_cgu_*` / `cmc_cgu_*` |
| Broadlink IR | ✅ Configuré | domotique |
| Home Assistant | ✅ URL locale | `ax_ha_url` |

## 🔑 REGISTRE CREDENTIALS — mapping service → secret → projet → dashboard (MAJ 2026-05-20)

> **Aucune valeur de clé ici** — uniquement les noms de secrets et les liens.
> Les vraies clés vivent dans : GitHub Secrets (chiffrés) → Cloudflare Worker
> `apex-secrets-proxy` (server-side) → jamais dans le code.
> Page secrets : https://github.com/9r4rxssx64-creator/cmcteams/settings/secrets/actions

### Providers IA — proxy `apex-secrets-proxy` (Apex passe par /provider/*)

| Service | Secret GitHub | Câblé proxy | Dashboard / recharge |
|---------|---------------|-------------|----------------------|
| Anthropic | `ANTHROPIC_API_KEY` | ✅ | https://platform.claude.com/settings/billing |
| OpenAI | `OPEN_AI_API_KEY` *(underscore)* | ✅ | https://platform.openai.com/account/billing |
| Groq | `GROQ_API_KEY` | ✅ | https://console.groq.com/keys |
| Gemini | `GEMINI_API_KEY` | ✅ | https://aistudio.google.com/apikey |
| DeepSeek | `DEEPSEEK_API_KEY` | ✅ | https://platform.deepseek.com |
| Perplexity | `PERPLEXITI_API_KEY` *(typo Kevin)* | ✅ | https://www.perplexity.ai/settings/api |
| xAI Grok | `XAI_API_KEY` | ✅ (créé 2026-05-20) | https://console.x.ai |
| Mistral | `MISTRAL_API_KEY` | ✅ (créé 2026-05-20) | https://console.mistral.ai |
| Cohere | `COHERE_API_KEY` | ✅ (créé 2026-05-20) | https://dashboard.cohere.com |
| Together | `TOGETHER_API_KEY` | ✅ (créé 2026-05-20) | https://api.together.xyz/settings/api-keys |

### Recherche / mémoire / data

| Service | Secret GitHub | Câblé proxy | Dashboard |
|---------|---------------|-------------|-----------|
| Tavily | `TAVILY_API_KEY` | ✅ | https://app.tavily.com |
| Pinecone | `PINECONE_API_KEY` | ✅ | https://app.pinecone.io (index `apex-memory`) |
| Finnhub | `FINNHUB_API_KEY` | ✅ (créé 2026-05-20) | https://finnhub.io/dashboard |
| Pexels | `PEXELS_API_KEY` | ✅ (créé 2026-05-20) | https://www.pexels.com/api |
| OpenLegi | `API_OPEN_LEGO` | ✅ | https://mcp.openlegi.fr |

### Infra / notifs / auth

| Service | Secret GitHub | Usage | Dashboard |
|---------|---------------|-------|-----------|
| Cloudflare | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | Workers, proxy | https://dash.cloudflare.com |
| Telegram | `TELEGRAM_API_KEY` | notifs Apex + agent | bot @Kdmc_kevind_2026_bot |
| EmailJS | `EMAILJS_PRIVATE_KEY` | emails | https://dashboard.emailjs.com |
| Railway | `RAILWAY_TOKEN` | hosting backend | https://railway.app |
| Vonage | `VONAGE_API_KEY` + `VONAGE_API_SECRET` | SMS | https://dashboard.nexmo.com |
| JWT | `JWT_SECRET` | signature tokens | — interne |
| VAPID | `VAPID_PRIVATE_KEY` | push notifications | — interne |
| Apex admin PIN | `APEX_ADMIN_PIN_SHA256` | auth proxy | — interne |

### Projet `kdmc-agent-monaco` (Vercel — env Vercel séparé, PAS GitHub Secrets)

| Variable env Vercel | Usage |
|---------------------|-------|
| `ANTHROPIC_API_KEY` | agent Claude autonome |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | notifs rapports |
| `AGENT_SECRET` | protège endpoint `/api/cron` |
| `SENTRY_DSN` | monitoring (optionnel — agent tourne sans) |

URLs : agent `https://kdmc-agent-monaco.vercel.app` · santé `/api/health` · code `tools/agent/`

## 📊 ÉTAT DES PROJETS (live — MAJ 2026-05-18)

| Projet | Version | État | Notes |
|--------|---------|------|-------|
| **CMCteams** | v9.658 | Production | 258 employés, planning casino Monaco, parser SBM V2 |
| **Apex AI v12** | v12.785 | Production stable | Live https://9r4rxssx64-creator.github.io/CMCteams/apex-ai/ |
| **Apex AI v13** | **v13.4.225** | Production prête | TS strict + Vite 6 + 469 tests, parité v12 ~95%, self-signup direct + auto-MAJ inline copie CMCteams |
| **e-KDMC** | v1.14 | Dev | 5 boutiques + dashboard + functions + automation + SEO 25/25 |
| **Apex Chat** | **v1.1.108** | Production prête | 750+ tests vitest verts, Cloudflare Workers + D1 + DO, 9 endpoints AI/Premium, **Phase 1-9 LIVE** + 10 features auto v1.1.99→108 |
| **Social Video** | v0.3 | Dev Phase 3 | Recovery branche RvjYq, en attente tokens |
| **Remote** | Intégré Apex | Production | IR/TV/HA/MQTT |
| **CrackPass** | Intégré Apex | Production | Gén/test MDP |

### Apex Chat v1.1.22 → v1.1.41 (session 2026-05-18 PR #268)
- ✅ Phase 1-9 toutes LIVE (Phase 5 calls réels WebRTC, Phase 7b Memory Lane IA, Phase 9 Stripe LIVE)
- ✅ Backend Cloudflare Workers : 9 endpoints (summarize/checkout/webhook/status/portal/smart-reply/translate/voice-transcribe/image-describe/quota/search/rewrite)
- ✅ D1 schema 0004 : premium_plan, stripe_customer_id, ai_summary_cache, audit_log
- ✅ Quota daily middleware Premium (voice 5/jour, image 10, summarize 3, smart-reply 30, translate 20 — illimité Premium)
- ✅ Resend email receipts automatiques après Stripe success
- ✅ AI features client : Voice Whisper · Image Vision alt-text · Smart Reply chips · Translate inline · Memory Lane résumé · Semantic search · Insights IA · Rewrite 8 styles
- ✅ UI hardening : voice preview modal · emoji reactions long-press iOS · scheduled messages · read receipts ✓✓ bleu · auto-detect langue · safety number Signal-style
- ✅ MAJ AUTO FORCÉE iOS PWA hardening (Kevin règle absolue) : SW skip-intercept `?_v=`, `cache:'reload'`, CACHE_VERSION sync partout
- ✅ Tests : 750/750 PASS (21 fichiers), 30+ tests nouveaux ajoutés cette session

## 🏆 RÈGLES PERMANENTES KEVIN AJOUTÉES (2026-05-04 PM)

5 nouvelles règles Apex priorité 1 :
1. **TOUT AU MAX TOUJOURS** — outils/modules/scripts/skills/hooks/workflows livrés au niveau expert pro 200€/h
2. **APEX = MÊME ACCÈS QUE CLAUDE CODE** — parité 100% (Read/Edit/Write/Bash/Web/Subagents/MCP)
3. **APEX VÉRIFIE FONCTIONNEMENT AVANT PRÉSENTER** — preflight check obligatoire
4. **BOUTONS ON/OFF GÉNÉRAL + INDIVIDUEL** — toggles per-user (109 features)
5. **100/100 RÉEL CHAQUE AXE** — mesure subagent indépendant, pas estimé

## 🧠 DÉCISIONS PRODUIT PRISES (à respecter)

- **Fusion inspecteur = superviseur** (team "sup" unique) — v9.409/410
- **Pas d'invention données** si pas de source PDF → alerte admin seulement
- **CGU universel** biometric/micro/geoloc dans tous projets
- **Messages user-friendly** (table conversion dans EXPERT_CODING_STANDARDS.md)
- **Audit auto toutes 4h** via `_snAutoAudit`
- **Feed poll Claude Code toutes 2h** via `_snFeedPoll`
- **Pipeline autonomie cross-app** via `ax_telemetry_in` / `ax_claude_todo` / `ax_lessons_learned`
- **‹employé› faisant fonction pit boss avril 2026** (fond bleu PDF)

## 📋 FAITS MÉTIER IMPORTANTS

- Format PDF cadres : col 1 = téléphones à ignorer, col 2 = nom, col 3-4 metadata, col 5+ codes avec apostrophes
- Codes avec quotes : `22/6'` / `19/2"` / `12h30/19'` — normaliser avant match CODES
- Sections headers : `Pit Boss 15` + `SUPERVISEUR` (singulier)
- Convention SBM : congés 2 mois/an, pause 40min si 55+, chefs 25-30% effectif
- Rotation : senior 40min / standard 60min / roulette E exception

## 🚨 ERREURS À NE JAMAIS REPRODUIRE (35+ leçons)

Référence : `CLAUDE.md` section "Erreurs connues" + `EXPERT_CODING_STANDARDS.md` liste 12 erreurs débutant.

Top 5 à retenir cold :
1. PR non mergée = déploiement fantôme
2. Regex sans anchor = régression garantie
3. `.length` sans guard = crash cold boot
4. URL hardcodée = CORS iOS PWA
5. Message technique brut à l'user = interdit

## 🔄 Comment alimenter cette mémoire (Claude Code ET Apex)

**Claude Code** : à chaque commit significatif, ajouter une entry ici ET dans `CLAUDE_FEED.md`.

**Apex AI** via `axMemoryAdd(category, fact)` :
```js
function axMemoryAdd(category, fact) {
  var mem = lg("ax_persistent_memory", []);
  mem.push({ ts: Date.now(), category: category, fact: fact, src: "apex-ai" });
  if (mem.length > 1000) mem = mem.slice(-1000);
  ls("ax_persistent_memory", mem);  // syncé Firebase FB_FIX
}
```

**Kevin** : peut dicter directement via chat Apex, l'IA appelle `axMemoryAdd` automatiquement.

## 📚 Ressources externes consultables par Claude Code et Apex

- `CLAUDE.md` — guide projet CMCteams
- `NOTES_USER.md` — infos métier Kevin
- `MEMO_RESUME.md` — bilan sessions
- `SENTINELS.md` — spec universelle
- `APEX_HANDOFF.md` — handoff complet
- `CLAUDE_APEX_COMM.md` — journal comm
- `CLAUDE_FEED.md` — feed actions Claude Code
- `EXPERT_CODING_STANDARDS.md` — standards + 12 erreurs débutant
- `apex-ai/KDMC.md` — fichier Apex interne
- **Ce fichier** — mémoire unifiée

**Règle permanente** : avant de dire à Kevin "configure X" ou "je ne sais pas Y", consulter ces fichiers. Si incertain, vérifier via `cmcRead`/`fbLoadAll`/`grep` avant de supposer.

---

**Dernière MAJ** : 2026-04-21 — après session 23+ PRs — CMCteams v9.453 + Apex v12.23 (renommé)

---

## 🆕 Capacités Apex v13.4.x (2026-05-09)

Apex IA + Claude Code partagent ces nouvelles capacités cross-session. À injecter dans system prompt boot.

### Services applicatifs (Apex peut self-invoke)
- **Auto-test exhaustif** : `auto-test-everything.runFullHealthCheck()` — 5 phases (codes/liens/sentinelles/connecteurs/vault) + retry 3× exp + escalade automatique.
- **Dashboard santé live** : route `admin-health-dashboard` ou long-press 3s logo APEX (admin) — score global réel, jamais inventé.
- **Security Review** : `security-review.runFullScan()` — runtime state (secrets clair, CSP violations, vault drift, innerHTML).
- **Code Review 5 agents** : `code-review-multi-agent.review(diff)` — 5 IA parallèles (CLAUDE.md / Bug / Redundant / Git / Patterns).
- **Frontend Design** : `frontend-design.generate(spec)` — anti-slop, génère composant production-grade.
- **Superpowers** : `superpowers.start(task) / advance(sessionId, step, output)` — 7-step methodology persisted.
- **GStack** : `gstack-roles.runFullPipeline(task)` — 7 rôles CEO→Reflector orchestrés.
- **HyperFrames** : `hyperframes.compose(prompt)` — vidéo HTML/CSS/JS.
- **Agent Browser** : `agentBrowser.analyze(url, goal)` — DOM analyzer pour piloter browser embed.
- **Marketing Psy** : `marketingPsy.generate({product, audience, trigger})` — Cialdini triggers.
- **Impeccable Design** : `impeccable.applyCommand(cmd, design)` — 23 commandes design fluency.
- **iOS Simulator** : `iosSimulator.openPreview(html)` — preview iframe iPhone 15 Pro 393×852.

### Commandes slash chat (Apex IA peut suggérer)
- `/loop <task>` — autonomous queue (sentinelle 60s pop+execute)
- `/loop list/pause/resume/clear`
- `/plan <objectif>` — plan JSON structuré + modal preview + bouton Exécuter
- `/rules [keyword]` — top 10 règles CLAUDE.md filtrées

### Règles d'autonomie renforcée
1. **Auto-test avant toute affirmation** : "tout fonctionne" requiert `runFullHealthCheck()` réel.
2. **Score honnête** : afficher le score mesuré, pas estimé. Pas d'invention 100/100.
3. **Escalade automatique** : si score <100% après retry → `ax_claude_todo` Firebase + GitHub Action cron 5min.
4. **Long-press logo APEX** : admin diagnostic discret (remplace SOS visible permanent).
5. **SOS conditionnel** : visible seulement si critique réel (offline, bundle dead).

**Dernière MAJ** : 2026-05-09 — Apex v13.4.3 + CMCteams v9.605
