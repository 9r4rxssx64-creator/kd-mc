# Apex v13 — Services Inventory

> **v13.4.214** — Documentation infra Apex (Kevin "100/100 réel", gap audit subagent #5 Architecture).
>
> Source de vérité unique pour audits futurs : recense les 38 sentinelles + 75 routes + safeInit chain bootstrap.
> Mis à jour à chaque release nouvelle sentinelle / route / service core.

---

## 🛡 Sentinelles auto-poll (38 actives)

Liste tirée de `services/sentinels.ts` (registrée via `sentinels.register({id, name, desc, intervalMs, check, autoFix?})`).
Toutes admin-only par défaut (vérif via `auth.isAdminSync()` dans `check()`).

| # | ID | Interval | Rôle | Auto-fix |
|---|----|----------|------|----------|
| 1 | `agent-watches-runner` | 5min | Méta-runner agent-watches.ts | ✓ disconnect+init Firebase si fb-health fail |
| 2 | `token-balance-watch` | 60min | Solde Anthropic/OpenAI | failover key-level si <5€ |
| 3 | `error-watch` | 5min | window.onerror + unhandledrejection | escalade Firebase si recurring |
| 4 | `backup-watch` | 60min | Backup quotidien vault | ✓ trigger snapshotNow si stale |
| 5 | `credentials-watch` | 6h | Registre 130+ patterns API | ✓ syncFromVault si registry incomplet |
| 6 | `decrypt-watch` | 30min | Vault decrypt health (2/2 OK) | ✓ vault.flushDecryptCache retry |
| 7 | `link-validation-watch` | 24h | HEAD request liens dashboards | mark dead, alerte si critical |
| 8 | `credentials-rotation-watch` | 7d | Rotation 90j tokens | proposition rotation Kevin |
| 9 | `auto-restore-watch` | 30min | 103 clés vault présentes | restore depuis Firebase backup |
| 10 | `storage-watch` | 30min | localStorage <80% quota | ✓ aggressiveCleanup si saturé |
| 11 | `network-watch` | 5min | navigator.onLine + ping 1.1.1.1 | reconnect Firebase |
| 12 | `performance-watch` | 30min | LCP/FCP/INP/CLS measure | log warn si dégradation |
| 13 | `security-watch` | 1h | Chain hash audit log + PIN fails | ✓ rebuildChainFrom si tamper |
| 14 | `presence-watch` | 30min | Heartbeat 2min user actif | ✓ heartbeat() si stale |
| 15 | `compliance-watch` | 24h | Consent CGU + RGPD | ✓ auto-fix essential consent |
| 16 | `conflict-watch` | 15min | Changements simultanés multi-device | ✓ force fb pull + merge |
| 17 | `anti-regression-watch` | 24h | Subset tests vitest critical sur prod | alerte si fail |
| 18 | `self-test` | 1h | Health checks complets | escalade si fail |
| 19 | `memory-leak-watch` | 1h | Intervals/listeners tracked count | warn si runaway |
| 20 | `memory-bridge-watch` | 30min | Sync notion + gist + firebase | escalade si désync |
| 21 | `wake-watch` | 5min | "Dis Apex" recognition active | ✓ restart si crashed |
| 22 | `voice-quality-watch` | 7d | Voiceprint precision per-user | propose réenrôlement si <0.85 |
| 23 | `memory-watch` | 24h | Top 1000 facts persistent_memory | ✓ compress si > 1000/user |
| 24 | `csp-violation-watch` | 30min | securitypolicyviolation count <5/h | log + enrichir whitelist |
| 25 | `smart-router-watch` | 30min | Top 3 providers IA (latency × cost × success) | mask provider si KO >24h |
| 26 | `service-knowledge-watch` | 7d | Refresh services connus | re-fetch pricing/capabilities |
| 27 | `ai-unblock-watch` | 5min | Providers IA bloqués | failover next provider |
| 28 | `reconsult-kevin-watch` | 30min | 7 docs Kevin via GitHub raw | refresh cache 6h |
| 29 | `realtime-backup-watch` | 1h | Backup boot récent | ✓ snapshotNow si jamais |
| 30 | `vault-resilience-watch` | 24h | Drift vault local vs Firebase backup | sync silent |
| 31 | `auto-improvement-watch` | 7d | Innovation scan npm + GitHub | proposition update si gain ≥20% |
| 32 | `innovation-watch` | 7d | Nouveaux modèles IA dispos | notif Kevin si Opus 5.0 etc |
| 33 | `capabilities-watch` | 24h | APIs Web disponibles (BLE/NFC/etc) | log capacités actuelles |
| 34 | `persistence-watch` | 1h | 2/2 clés critiques présentes | restore IDB shadow |
| 35 | `memory-augmented-watch` | 24h | 94 lessons + 8/8 docs frais | refresh si stale |
| 36 | `multi-key-health` | 30min | N clés OK par provider failover | mask key invalide |
| 37 | `apex-self-correct-watch` | 5min | Cascade auto-correct si panne IA | escalade Claude Code via ax_claude_todo |
| 38 | `auto-ultra-reset-watch` | 15min | Auto ULTRA-RESET si conditions critiques | reload + restore backup |

**Sentinelles ajoutées récemment** :
- v13.4.203 : `github-notifications-clean-watch` (6h) — auto-clean notifs GitHub
- v13.4.204 : `auto-test-runner-watch` (12h) — 13 tests + auto-fix + escalade
- v13.4.205 : `multi-branch-coordinator-watch` (10min) — poll branches claude/*

---

## 🛣 Routes registrées (75 routes via router.register)

Source : `core/bootstrap.ts` ligne ~480-560.

**Routes publiques** : landing, login

**Routes auth user** (requiresAuth: true) : chat, onboarding, dashboard, studios, pro, laurence, settings, browser, crypto, domotique, workflow, remote, notes, calendar, billing, vault, projects, **+ 30 autres**

**Routes admin only** (requiresAdmin: true) :
- `admin` : panneau admin principal
- `credentials` : registre 130+ patterns
- `sentinels` : monitoring sentinelles
- `runtime-tests` : v13.4.13 — Apex teste TOUT en réel browser
- `apex-audits-live` : v13.4.183 — audits historique
- `audit-log-viewer` : **v13.4.211 NOUVEAU** — audit log chain hash viewer
- `rgpd-admin`, `consumption-dashboard`, `financial-bilan`, `health-dashboard`, etc.

---

## 🚀 Bootstrap safeInit chain (90+ services)

Source : `core/bootstrap.ts` ~ligne 50-400.

**Order critique** :
1. `errors.installGlobalHandlers` (window.onerror)
2. `logger.setLevel`
3. `store.init` (Proxy reactive)
4. `auth.init` (PIN PBKDF2 200k + session restore)
5. `vault.init` (AES-GCM-256 + auto-restore Firebase)
6. `firebase.init` (SSE listener + reconnect backoff)
7. `memory.syncDocsAtBoot` (CLAUDE.md + 7 docs racine)
8. `router.register` (75 routes)
9. `services-bootstrap.initAll` (sentinelles + bridges)
10. `version-badge.installVersionBadge` (UI)
11. **v13.4.197+ ajouts** : voice-overlay preload (deferred idle), functional-tester window, autoTestRunner window, multi-branch-coordinator window, cloudflare-status banner, auto-test on first-boot post-MAJ

---

## 🔧 Services orphelins audit (Erreur #28 Declaration vs Deployment)

Vérification systématique chaque release : tout service `services/*.ts` créé doit être :
1. Importé dans `services-bootstrap.ts` OU
2. Lazy-loaded via dynamic `import()` dans un handler / dispatcher / sentinelle

**Audit v13.4.219 cross-vérifié (CLAUDE.md règle Erreur #59 "vérifier claims subagent")** :

Subagent v13.4.217 avait flaggé `search-index-worker.ts` et `ocr-worker.ts` comme orphelins. **FAUX POSITIF mesuré** :

```bash
$ grep -rn "workers/search-index" services/
services/search.ts: 5+ usages (instantiation new Worker + types import)

$ grep -rn "workers/ocr" services/
services/ocr-offline.ts: import workers/ocr.worker
```

Les 2 workers sont **WIRED via dynamic import** depuis leurs services wrappers. Aucun gap réel.

**Workers actifs (vérifiés v13.4.219)** :
- `workers/search-index.worker.ts` → `services/search.ts` (full-text Fuse.js, lazy via `new Worker(new URL(...))`)
- `workers/ocr.worker.ts` → `services/ocr-offline.ts` (Tesseract.js OCR off-main-thread)
- `workers/crypto.worker.ts` → `services/vault.ts` (PBKDF2/AES-GCM hors UI)

**Zéro service orphelin confirmé** ✅ (cross-référencé v13.4.219).


---

## 📊 Métriques v13.4.213 (mesurées)

- **Services TypeScript** : 251 fichiers `services/*.ts`
- **Routes router** : 75 (router.register dans bootstrap.ts)
- **Sentinelles** : 38 actives + 3 ajoutées récemment = 41 total
- **safeInit chain** : ~90 services bootstrap
- **Tests régression** : 71+ unit + 2 E2E runtime
- **Documentation racine** : 49 fichiers `.md` (CLAUDE.md = règles absolues, NOTES_USER.md = métier)
- **Workflows GitHub Actions** : 56 (réduits en cycles 6h pour anti-spam v9.617)

---

## 🔄 Mise à jour de ce fichier

À chaque release qui ajoute une nouvelle sentinelle / route / service core :
1. Ajouter ligne dans la bonne section
2. Bump APP_VER + commit avec ce fichier inclus
3. CLAUDE.md règle "PIPELINE SELF-HEALING CROSS-APP" garantit visibilité

Helper script (non encore créé) : `tools/services-inventory-sync.js` qui scrappe services/sentinels.ts + bootstrap.ts et regénère ce fichier auto.
