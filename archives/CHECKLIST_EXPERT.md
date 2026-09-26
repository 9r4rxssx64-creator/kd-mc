# 📋 Checklist Expert — Outils, agents, accès & méthodologie (Claude Code sur CMCteams)

> Mis à jour 2026-05-28. Source unique : ce que j'ai réellement à disposition pour
> un travail d'expert sur ce dépôt. Relire en début de session.

---

## 🛠 Outils natifs Claude Code

- **Read / Edit / Write** — lecture & modification précise
- **Bash** — shell, git, node, npm, tests, scripts (sandbox isolé, container ephemeral)
- **Grep / Glob** — recherche ciblée code/fichiers
- **Agent** — délégation en parallèle (`Explore`, `Plan`, `general-purpose`, `claude-code-guide`)
- **Skill** — invocation des skills installés
- **ToolSearch** — charger schémas des MCP « deferred » à la demande
- **AskUserQuestion** — interroger Kevin avec options
- **SendUserFile** — livrer un fichier en réponse
- **Background mode (`run_in_background: true`)** — tâches longues non bloquantes
- **Isolation worktree** — agent isolé sur copie git

## 🤖 Agents spécialisés (Agent tool)

| Agent | Quand |
|---|---|
| `Explore` | Recherche/audit code en parallèle (lecture seule, rapide) |
| `Plan` | Architecte logiciel pour stratégie d'implémentation |
| `general-purpose` | Investigations complexes multi-étapes |
| `claude-code-guide` | Questions Claude Code / SDK / API Anthropic |
| `statusline-setup` | Configurer la status line |

## ⚙️ Skills (commandes `/xxx` invocables)

| Skill | Usage |
|---|---|
| `/code-review` | Revue diff (low/medium/high/ultra) — `--fix` ou `--comment` |
| `/simplify` | Revue + auto-fix immédiat |
| `/verify` | Vérification réelle qu'un changement marche en runtime |
| `/run` | Lancer & piloter l'app du projet |
| `/init` | Générer un CLAUDE.md d'un nouveau projet |
| `/review` | Reviewer une PR |
| `/security-review` | Audit sécu du diff |
| `/loop` | Tâche récurrente (`/loop 5m /foo`) |
| `/claude-api` | Build/debug Anthropic SDK |
| `/fewer-permission-prompts` | Auto-allowlist Bash courants |
| `/update-config` `/keybindings-help` | Réglages harness |
| `/analyst` `/deepdive` `/critic` `/contrarian` `/optimizer` `/firstprinciples` `/compare` `/proscons` `/eli5` | Modes d'analyse FR |
| `/session-start-hook` | Hooks de démarrage Claude Code on web |

## 🌐 MCP servers connectés

**Code & infra**
- **GitHub MCP** — scopé `9r4rxssx64-creator/cmcteams` (PRs, issues, branches, code search, reviews, releases)
- **Cloudflare** (workers, KV, R2, D1)
- **Supabase** (projets, migrations, edge functions)
- **Vercel** (deploys, logs, projets)
- **Netlify** (projets, services)
- **Sentry** (issues, releases, analyse)

**Productivité**
- **Gmail** (threads, labels, drafts)
- **Google Calendar** (events)
- **Google Drive** (fichiers, métadonnées)
- **Granola** (meetings)
- **Make.com** (scénarios, modules)
- **SurveyMonkey**, **Apollo.io**, **Supermetrics**

**Design & contenu**
- **Figma**, **Adobe Express**, **Webflow**, **Canva**, **Gamma** (slides), **Sora**

**Doc & recherche**
- **Microsoft Learn**, **Context7** (docs libs récentes)
- **Legal Data Hunter** (18M docs juridiques 110 pays)
- **ICD-10** (codes médicaux 2026)
- **Lawvable** (catalogue skills légales)

**Sécurité & finance**
- **Malwarebytes ScamGuard** (reputation URL/email/phone)
- **Era Context** (gestion finances perso)
- **Stripe-like / Shopify**, **Twilio**, **Clerk** (auth)

**Autres**
- **Mermaid validate**, **Three.js learn**, **Synthesize Bio** (gene expression)
- **Thumbtack** (services maison US), **Spotify**, **Apify**, **Motion** (creative analytics Meta)

## 📚 Documents projet à relire (mémoire persistante)

**Priorité 1 — toujours lus au début**
- `CLAUDE.md` (518 KB, 50+ règles Kevin) — source de vérité
- `NOTES_USER.md` (2016 lignes) — infos métier (employés, codes PDF, couleurs Convention)
- `MEMO_RESUME.md` (2971 lignes) — état session par session
- `KEVIN_ACTIONS_TODO.md` (2024 lignes) — actions Kevin pending
- `KEVIN_INVENTORY.md` (1444 lignes) — fichiers créés + liens GitHub directs

**Priorité 2 — selon contexte**
- `APEX_HANDOFF.md`, `APEX_PROJECTS.md`, `MEMORY_PERSISTENT.md`, `MEMO_KILLSWITCH_IA.md`
- `AUDIT_TEMPLATE_PRO.md`, `BILAN_PRO.md`, `BUSINESS_PLAN.md`
- Skills cross-platform : `APPLE_IOS_SKILLS.md`, `ANDROID_SKILLS.md`, `GOOGLE_APIS_INTEGRATION.md`, `AUTOMATION_HUB.md`, `UNIVERSAL_REMOTE.md`, `NETWORK_CONNECTIVITY.md`

## 🏗 Accès code & infra

- **Repo cmcteams** complet (CMCteams + Apex v13 + Apex Chat + e-KDMC + tools/)
- **Branche dédiée** : `claude/schedule-import-integration-szasM` (push direct main interdit, auto-merge bot via PR)
- **GitHub Actions** — workflows (`deploy.yml`, `sw-cache-sync.yml`, `branch-coordinator.yml`, `claude-todo-watcher.yml`, `cmc-parser-proxy-deploy.yml`, etc.)
- **Cloudflare Worker `cmc-parser-proxy`** — relay Vision IA (Claude / GPT-4o / Mistral / Gemini)
- **Firebase Realtime DB** `cmcteams-c16ab` — sync temps réel
- **GitHub Pages** — déploiement auto `https://9r4rxssx64-creator.github.io/CMCteams/`

## 🔐 Secrets GitHub (que les workflows/Workers peuvent lire)

`ANTHROPIC_API_KEY`, `OPEN_AI_API_KEY` (underscore), `MISTRAL_API_KEY`, `GEMINI_API_KEY`,
`GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITI_API_KEY` (typo), `XAI_API_KEY`, `COHERE_API_KEY`,
`TOGETHER_API_KEY`, `TAVILY_API_KEY`, `FINNHUB_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`,
`RAILWAY_TOKEN`, `APEX_ADMIN_PIN_SHA`, `VAPID_PRIVATE_KEY`, `PUSH_ADMIN_TOKEN`,
`FIREBASE_PRIVATE_KEY` + `FIREBASE_CLIENT_EMAIL`, `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN`,
`EMAILJS_PRIVATE_KEY`, `VONAGE_API_KEY/SECRET`, `TELEGRAM_API_KEY`.

## 🧪 Tests & validation

- `node --check` — syntax JS (obligatoire pre-commit)
- `npx tsc --noEmit` — TypeScript strict (Apex v13)
- `npx vitest run` — 11 700+ tests Apex, 156+ CMCteams
- `npm run test:fidelity` — reproduction PDF identique (Playwright)
- `npm run test:teamsizes` — anti-fragmentation équipes
- `npm run test:homonyms` — anti-confusion homonymes
- `npm run test:kevin` — scénarios Kevin
- `node tools/planning-parser-tester/test-pipeline.js` — 12 tests régression T1
- `tools/planning-parser-tester/pre-commit-hook.sh` — bloque push avec bugs latents

## ⚠️ Garde-fous absolus

- ❌ Push direct sur `main` (auto-merge bot via PR)
- ❌ Force-push, `reset --hard`, `branch -D` destructifs
- ❌ `--no-verify` skip pre-commit hooks
- ❌ Modifier le compte admin Kevin (`kdmc_admin` protégé)
- ❌ Repo autre que `9r4rxssx64-creator/cmcteams`
- ❌ Stocker en clair seed phrases / CB / mots de passe bancaires
- ❌ Bypass règles CLAUDE.md absolues (50+ règles permanentes Kevin)

## 📡 Communication Apex ↔ Claude Code

- `ax_claude_todo` Firebase — Apex me pousse les tâches non auto-fixables
- `ax_telemetry_in` — remontée erreurs cross-app
- `ax_lessons_learned_struct` — lessons partagées (Apex + CMCteams)
- `CLAUDE_HANDOFF.json` — communication bidirectionnelle
- `.github/workflows-desactives/claude-todo-watcher.yml (**rangé** — plus actif)` cron 6h — escalade auto issues GitHub

## 🎯 Méthodologie expert (obligatoire chaque session)

1. **Lire** CLAUDE.md + NOTES_USER + MEMO_RESUME + KEVIN_ACTIONS_TODO + KEVIN_INVENTORY
2. **Checklist branches** — vérifier qu'il n'y a pas > 3 commits non mergés (sinon merger d'abord)
3. **TodoWrite** dès qu'une nouvelle demande arrive — mémoire externe
4. **Subagents Explore en parallèle** (3-5) sur tâches non-triviales
5. **Test mental avant chaque push** : « Si Kevin teste maintenant, ça marche bout-en-bout ? »
6. **Validation pre-push** : `node --check` + tests + grep XSS + `git diff` complet
7. **Bump `APP_VER` + `sw.js CACHE_VERSION`** si changement code
8. **Mise à jour docs dans le même commit** (`KEVIN_INVENTORY.md`, `MEMO_RESUME.md`, CLAUDE.md "erreurs connues")
9. **Audit POST-FIX systématique** (mesurer écart estimé vs réel — pas d'estimation, mesurer)
10. **Tri liens par priorité** dans réponse Kevin (action immédiate → test → monitoring → code → historique)

---

**Lieu de stockage de cette checklist** : `CHECKLIST_EXPERT.md` à la racine du repo
[Voir sur GitHub](https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CHECKLIST_EXPERT.md).
