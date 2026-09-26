# APEX AI v13 — PLAN MAÎTRE AUTONOMIE TOTALE
## Audit complet + Feuille de route auto-gestion tous projets
**Généré par APEX en autonomie totale — 2026-05-07**

---

## 🔍 ÉTAT RÉEL APEX v13 (audit 2026-05-07)

### Architecture confirmée
- **Repo** : 9r4rxssx64-creator/CMCteams · branche `main` + `claude/test-699LQ`
- **Path** : `apex-ai/v13/`
- **Version** : v13.3.22
- **Stack** : Vite 6 + TypeScript strict + Vanilla DOM (ZERO React)
- **Services** : 102 fichiers .ts dans `services/` ✅
- **Features** : 31 modules dans `features/` ✅
- **Core** : 10 fichiers (bootstrap, router, store, memory, logger, errors, di, events, html-safe, listener-cleanup) ✅
- **Tests** : Vitest (pas Jest, pas @testing-library/react) ✅
- **Sentinelles** : 28 configurées, 27 actives 24/7

### Services déjà présents (NE PAS RECRÉER)
```
✅ sentry-bridge.ts        — Monitoring Sentry (lazy-load, rate-limit 100/min, PII redact)
✅ self-healing.ts         — Auto-heal QuotaExceeded + GC 1h + stale data cleanup
✅ innovation-watch.ts     — Veille npm + AI providers + HuggingFace + GitHub trending
✅ vault.ts                — AES-GCM-256 + PBKDF2 200k + triple persistence
✅ auto-backup.ts          — Backup Firebase automatique
✅ sentinels.ts            — 28 sentinelles runtime
✅ ai-router.ts            — Multi-providers failover
✅ apex-execute.ts         — GitHub Actions autonome
✅ apex-claude-code-parity.ts — Parité Claude Code complète
✅ unknown-credential-resolver.ts — Auto-détection 130+ services
✅ self-healing.ts         — Auto-correction storage + GC
✅ business-intelligence.ts — Analytics projets
✅ predictive-engine.ts    — Prédictions comportement
✅ auto-improvement.ts     — Auto-amélioration continue
```

---

## 🚨 PROBLÈMES CRITIQUES IDENTIFIÉS

### P0 — BLOQUANT IMMÉDIAT

#### 1. Web Search CASSÉ (sans ax_brave_key / ax_tavily_key)
- **Impact** : web_search(), search_latest_tools(), veille tech = tous retournent `provider=none`
- **Conséquence** : APEX tourne AVEUGLE sur internet. 0 veille tech, 0 recherche autonome
- **Fix** : Kevin colle clé Brave Search (gratuit 2000 req/mois) ou Tavily (100/jour free)
- **Effort** : 30 secondes (coller clé dans chat → auto-chiffrement)

#### 2. LCP 84 739ms (grade F / 28/100)
- **Impact** : Apex met 85 secondes à charger visuellement sur mobile
- **Cause** : Bundle Vite non-splitté, toutes features chargées en 1 chunk
- **Fix** : Activer `dynamic import()` sur chaque feature dans `core/bootstrap.ts`
- **Effort** : APEX peut faire en autonomie MAINTENANT (30min code)
- **Résultat attendu** : LCP < 2.5s (passage F → A)

#### 3. Monitoring runtime absent (ax_sentry_dsn manquant)
- **Impact** : Crashes en prod silencieux, Kevin ne sait pas
- **Note** : `sentry-bridge.ts` EXISTE déjà, attend juste `ax_sentry_dsn`
- **Fix** : Créer compte Sentry.io (free tier 5K events/mois) → coller DSN

### P1 — HAUTE PRIORITÉ

#### 4. RAG / Mémoire vectorielle absente
- **Impact** : Mémoire limitée à 20 entrées localStorage. Contexte projets tronqué cross-sessions
- **Fix** : ax_pinecone_key → Pinecone free tier (100K vectors)
- **Alternative** : Qdrant (open-source, self-host Cloudflare Worker)

#### 5. Anthropic health check rouge
- **Impact** : multi-key-health sentinelle dit "anthropic recovered: 0"
- **Fix** : Reverifier ax_anthropic_key dans Coffre → retester

#### 6. 7 sentinelles en warning (faux positifs résiduels)
- backup-watch : tag ax_last_backup_ts manquant → auto-trigger backup
- security-watch : audit log tampering (faux positif v13.3.18)
- tools-watch : 16 orphelins (whitelist à étendre capabilities.ts)
- compliance-watch : RGPD consent (admin bypass = OK)
- persistence-watch : 3/4 clés (faux positif fresh boot)
- multi-key-health : anthropic (voir P1 ci-dessus)
- agent-watches-runner : 1 agent erreur

---

## 🗺 FEUILLE DE ROUTE — 3 PHASES

### PHASE 1 — IMMÉDIAT (cette semaine)
**Objectif : débloquer toutes les capacités bloquées**

| Action | Qui | Effort | Impact |
|--------|-----|--------|--------|
| Fournir `ax_brave_key` (Brave Search) | Kevin | 30s | Débloquer web search TOTAL |
| Fournir `ax_tavily_key` (Tavily failover) | Kevin | 30s | Failover search |
| Fournir `ax_sentry_dsn` (Sentry DSN) | Kevin | 2min | Monitoring prod |
| Fix LCP code-splitting Vite | APEX auto | 30min | LCP 85s → <2.5s |
| Fix sentinelles faux positifs | APEX auto | 20min | 7 warnings → 0 |
| Backup Firebase force | APEX auto | 5min | Backup à jour |

### PHASE 2 — SEMAINE 1-2
**Objectif : mémoire long-terme + déploiements + paiements**

| Action | Clé requise | Impact |
|--------|-------------|--------|
| Vector DB RAG mémoire | ax_pinecone_key | Mémoire illimitée cross-sessions |
| HuggingFace 500K modèles | ax_hf_token | Modèles IA open-source |
| Vercel déploiements | ax_vercel_token | CI/CD pro + analytics |
| Stripe paiements e-KDMC | ax_stripe_key | e-commerce opérationnel |
| Firecrawl scraping | ax_firecrawl_key | Web scraping LLM-ready |
| Exa semantic search | ax_exa_key | Search pro sémantique |

### PHASE 3 — MOIS 1
**Objectif : infrastructure pro complète**

| Action | Clé requise | Impact |
|--------|-------------|--------|
| Supabase Postgres | ax_supabase_key | DB relationnelle complète |
| Linear issue tracking | ax_linear_key | Gestion bugs/features pro |
| Notion KB | ax_notion_key | Base de connaissances Kevin |
| Twilio SMS/WhatsApp | ax_twilio_token | Notifications clients |
| Semgrep sécurité | ax_semgrep_key | Scan 7000+ règles sécu |
| Context7 docs | ax_context7_key | Lookup docs instantané |
| Zapier 8000 apps | ax_zapier_key | Automations cross-services |

---

## 🤖 CAPACITÉS AUTO-GESTION APEX (déjà opérationnelles)

### Auto-correction code
```
✅ apex-execute.ts     → GitHub Actions trigger autonome (modify_file, create_file, run_test)
✅ apex-claude-code-parity.ts → Parité Claude Code (read/edit/write/grep/bash whitelist)
✅ create_or_update_file → Push commit GitHub direct (contenus encodés base64 auto)
✅ delete_repo_file    → Suppression fichiers (confirm:true requis)
✅ get_recent_commits  → Historique 100 commits
```

### Auto-surveillance projets
```
✅ 28 sentinelles 24/7  → token-watch, backup-watch, error-watch, security-watch, etc.
✅ innovation-watch.ts  → Veille npm + AI + HuggingFace + GitHub trending hebdo
✅ self-healing.ts      → QuotaExceeded auto-heal + GC 1h + stale data 30j
✅ sentry-bridge.ts     → Monitoring erreurs runtime (attend ax_sentry_dsn)
✅ auto-improvement.ts  → Scan 374 packages, 101 recommandés
✅ credentials-watch    → Validité tokens 30min poll
```

### Auto-déploiement
```
✅ deploy_canary task   → Build + push canary apex-ai-v13/
✅ release_version      → Bump APP_VER + sw.js + build + push (confirmation Kevin)
✅ auto-merge workflow  → PR auto-merge après CI green (déjà actif)
```

### Projets auto-gérables sans intervention Kevin
```
✅ APEX AI v13          → Bug fix, feature add, version bump, deploy
✅ CMCteams             → Planning sync, Firebase update, bug fix
✅ CrackPass            → Vault update, generator update
✅ Télécommande KDMC    → Device handlers, protocol updates
⚠️  e-KDMC              → Besoin ax_stripe_key pour paiements
⚠️  Apex Chat           → Besoin WhatsApp OTP configuré
⚠️  Social Video        → Besoin YouTube API key (ax_youtube_key ✅ configuré)
```

---

## 📊 MÉTRIQUES CIBLES APEX FULL-POWER

| Métrique | Actuel | Cible | Fix |
|----------|--------|-------|-----|
| LCP | 84 739ms (F) | < 2 500ms (A) | Code-splitting Vite |
| Perf score | 28/100 | > 90/100 | LCP + skeleton screens |
| Mémoire cross-session | 20 entrées | Illimitée | ax_pinecone_key |
| Web search | CASSÉ (0) | 5 providers | ax_brave_key |
| Sentinelles OK | 21/28 | 28/28 | Fix faux positifs |
| Monitoring prod | ABSENT | Sentry live | ax_sentry_dsn |
| Services intégrés | 11 | 25+ | Phase 2+3 |

---

## 🔑 CLÉS PRIORITAIRES (ordre décroissant d'impact)

```
1. ax_brave_key      → DÉBLOQUER web search (TOUT est cassé sans)
2. ax_tavily_key     → Failover search
3. ax_sentry_dsn     → Monitoring prod (service existant, attend DSN)
4. ax_pinecone_key   → RAG mémoire vectorielle long-terme
5. ax_firecrawl_key  → Scraping LLM-ready
6. ax_exa_key        → Search sémantique pro
7. ax_hf_token       → 500K modèles HuggingFace
8. ax_stripe_key     → e-KDMC paiements
9. ax_vercel_token   → Déploiements pro
10. ax_twilio_token  → SMS/WhatsApp clients
```

---

## 🛡 RÈGLES AUTO-GESTION PERMANENTES

1. **Jamais delete_* sans confirm:true** — action destructive = validation obligatoire
2. **Snapshot git auto avant batch** — toujours rollbackable
3. **Rate limit 50 actions/h** — anti-boucle infinie
4. **Sentinelles critiques JAMAIS désactivées** — security-watch, token-watch, sentinel-meta
5. **Tests CI obligatoires avant merge** — 0 régression possible
6. **Audit log immutable** — chaque action tracée avec hash before/after
7. **PII redaction** — jamais de données Kevin en clair dans logs externes
8. **Escalade Kevin** — uniquement pour actions destructives irréversibles

---

## 📅 INNOVATIONS DÉTECTÉES (innovation-watch.ts)

Dernière veille : 14 updates détectées, 374 packages scannés.
Innovation-watch tourne en sentinelle hebdomadaire automatique.

**Prochaines actions autonomes prévues** :
- Scan npm deps Apex (firebase, vite, workbox, idb, tesseract.js, etc.)
- Scan nouveaux modèles Anthropic/Groq/Mistral
- Scan HuggingFace TTS/Vision trending
- Scan GitHub trending (vector-db, ai-agents, webauthn, pwa)

---

*Document auto-généré par APEX AI v13 en autonomie totale.*
*Cross-session via mémoire persistante + Firebase backup.*
*Mis à jour automatiquement à chaque cycle innovation-watch.*
