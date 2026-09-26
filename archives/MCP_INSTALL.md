# MCP_INSTALL.md — Guide d'installation des MCP Claude Code

> Synthèse cumulative de l'analyse des MCP Claude Code par rapport à CMCteams et projets futurs.
> Dernière mise à jour : v9.104 (17 avril 2026).
> Source : [code.claude.com](https://code.claude.com) — documentation officielle des MCP.

---

## ✅ MCP déjà installés dans le sandbox (état actuel)

| MCP | Commande | Gratuit | OAuth |
|-----|----------|---------|-------|
| **context7** | `claude mcp add context7 --transport http https://mcp.context7.com/mcp` | ✅ | Non |
| **vercel** | `claude mcp add vercel --transport http https://mcp.vercel.com` | ✅ | OAuth au 1er usage |
| **sentry** | `claude mcp add sentry --transport http https://mcp.sentry.dev/mcp` | ✅ 5k events/mois | OAuth au 1er usage |
| **hf** (Hugging Face) | `claude mcp add hf --transport http https://huggingface.co/mcp` | ✅ | Token optionnel |

**Vérifier :** `claude mcp list`

---

## 🎯 Comment utiliser ce fichier

1. Tous les MCP ci-dessous s'installent avec `claude mcp add <nom> --transport http <url>` dans **ton terminal**.
2. Au premier usage, un MCP peut demander une authentification OAuth dans ton navigateur (une seule fois).
3. À la session suivante, les MCP apparaissent automatiquement dans mes outils sous la forme `mcp__<nom>__*`.
4. Tu peux alors me dire *« utilise Notion pour X »*, *« déploie sur Vercel »*, etc.

### Commandes utiles

```bash
claude mcp list                     # lister les MCP installés
claude mcp remove <nom>             # désinstaller
```

---

## 🎯 Priorité 1 — À installer maintenant (6 MCP)

Ces MCP m'aident **directement dans nos sessions** et couvrent des besoins réels que tu as aujourd'hui.

```bash
# Notion — lecture/écriture de tes notes, specs, doc
claude mcp add notion --transport http https://mcp.notion.com/mcp

# Figma — pour que je lise tes maquettes UI directement
claude mcp add figma-remote-mcp --transport http https://mcp.figma.com/mcp

# Exa — Web search + code docs search (meilleur que WebSearch par défaut)
claude mcp add exa --transport http https://mcp.exa.ai/mcp

# Context7 — docs à jour pour LLMs et AI code editors (évite les hallucinations)
claude mcp add context7 --transport http https://mcp.context7.com/mcp

# Sentry — monitoring erreurs production (essentiel pour CMCteams en ligne)
claude mcp add sentry --transport http https://mcp.sentry.dev/mcp

# Vercel — tu as déjà `cmc-teams` et `kdmc-agent-monaco` déployés
claude mcp add vercel --transport http https://mcp.vercel.com
```

---

## 🚀 Priorité 2 — Projets futurs (7 MCP)

À installer **quand tu démarres un projet avec vrai backend moderne** ou pour enrichir CMCteams.

```bash
# Supabase — alternative moderne à Firebase (Postgres + auth + storage)
claude mcp add supabase --transport http https://mcp.supabase.com/mcp

# Cloudflare — si tu migres depuis GitHub Pages vers Cloudflare Pages/Workers
claude mcp add cloudflare --transport http https://bindings.mcp.cloudflare.com/mcp

# Gamma — créer présentations/docs/sites avec IA
claude mcp add gamma --transport http https://mcp.gamma.app/mcp

# Mem — mémoire IA persistante (alternative à MEMO_RESUME.md)
claude mcp add mem --transport http https://mcp.mem.ai/mcp

# Cloudinary — gestion images/vidéos (utile pour photos employés, salons)
claude mcp add cloudinary --transport http https://asset-management.mcp.cloudinary.com/sse

# Zapier — automations entre 8000+ apps
claude mcp add zapier --transport http https://mcp.zapier.com/api/v1/connect

# PostHog — product analytics (sessions, funnels utilisateurs)
claude mcp add posthog --transport http https://mcp.posthog.com/mcp
```

---

## 🎨 MCP pour génération d'images/vidéo (gratuit max)

```bash
# Hugging Face — DÉJÀ INSTALLÉ ✅ (Flux, SDXL, LTX-Video via Spaces)
# claude mcp add hf --transport http https://huggingface.co/mcp

# Pollinations.ai — 100% gratuit, PAS DE CLÉ ni compte (API directe fetch)
# Usage : https://image.pollinations.ai/prompt/<texte>?width=1024&height=1024
# Pas de MCP officiel, mais l'app peut appeler directement l'API publique.

# Replicate — crédits gratuits limités puis payant
# claude mcp add replicate --transport http https://mcp.replicate.com/ -H "Authorization: Bearer $REPLICATE_TOKEN"

# Fal.ai — ~$1-5 offerts à l'inscription
# claude mcp add fal --transport http https://mcp.fal.ai/ -H "Authorization: Key $FAL_KEY"
```

**Recommandation CMCteams :** utiliser **Pollinations.ai** en direct (sans MCP, zéro friction) pour avatars, bannières, illustrations. Hugging Face en backup si besoin de modèles spécifiques.

---

## 💡 Priorité 3 — Optionnel / cas spécifiques (9 MCP)

À installer **uniquement si tu as un besoin ponctuel** qui correspond.

```bash
# Stripe — paiements et abonnements (SaaS futur)
claude mcp add stripe --transport http https://mcp.stripe.com

# Lucid — diagrammes et schémas d'architecture
claude mcp add lucid --transport http https://mcp.lucid.app/mcp

# Granola — AI notepad pour réunions
claude mcp add granola --transport http https://mcp.granola.ai/mcp

# Canva — créer/exporter designs graphiques
claude mcp add canva --transport http https://mcp.canva.com/mcp

# Lumin — Markdown → PDF + signatures électroniques
claude mcp add lumin --transport http https://mcp.luminpdf.com/mcp

# Clerk — auth + organisations + billing (SaaS)
claude mcp add clerk --transport http https://mcp.clerk.com/mcp

# Postman — contexte API pour coding agents
claude mcp add postman --transport http https://mcp.postman.com/minimal

# Sanity — CMS headless (si tu externalises le contenu)
claude mcp add sanity --transport http https://mcp.sanity.io

# PlanetScale — DB MySQL/Postgres managée
claude mcp add planetscale --transport http https://mcp.pscale.dev/mcp/planetscale
```

---

## ⚠️ Limitations importantes

1. **Je ne peux pas installer les MCP à ta place** — les commandes `claude mcp add` doivent être lancées dans **ton** terminal (local ou cloud) avec **ton** authentification OAuth.
2. **Pas de mémoire inter-sessions** — chaque nouvelle conversation, je vois uniquement les MCP **déjà installés et OAuth validés** au niveau de l'environnement.
3. **Chevrons `< >`** — si tu copies-colles depuis un markdown rendu, retire les chevrons autour des URLs. Les commandes ci-dessus sont déjà propres.

---

## ❌ MCP écartés (et pourquoi)

Plus de 110 MCP ont été analysés et écartés pour CMCteams. Récapitulatif par catégorie :

### Santé & recherche médicale (non pertinent casino Monaco)
`ChEMBL`, `Clinical Trials`, `CMS Coverage`, `ICD-10 Codes`, `NPI Registry`, `Benchling`, `BioRender`, `Consensus`, `pubmed`, `Medidata`, `Open Targets`, `Synapse.org`, `AdisInsight`, `bioRxiv`

### Finance / crypto / equity (non pertinent)
`MT Newswires`, `Crypto.com`, `CB Insights`, `Fiscal.ai`, `Quartr`, `Ramp`, `Clarity AI`, `Aiwyn Tax`

### CRM / Sales / Recruiting (pas de besoin commercial)
`Attio`, `Aura`, `Clay`, `Clarify`, `Day AI`, `Harmonic`, `DevRev`, `Lorikeet`, `Metaview`, `Sybill`, `Vibe Prospecting`, `Gainsight`, `Sprouts`, `Outreach`, `Pendo`, `Crossbeam`, `Enterpret Wisdom`, `Glean`

### Marketing / Analytics entreprise (redondant avec PostHog)
`Windsor.ai`, `LunarCrush`, `Customer.io`, `Amplitude`, `Similarweb`

### Project management (tu utilises GitHub issues directement)
`Linear`, `monday.com`, `Jotform`, `Atlassian Rovo`, `ClickUp`, `Unthread`

### Écosystème entreprise / entreprise spécifique
`Zoho Books/CRM/Desk`, `Guru`, `Egnyte`, `Amplitude`, `Databricks`, `DataGrail`, `Workato`, `WordPress.com`, `Wix`, `Box`, `Airtable`, `GraphOS MCP Tools`, `Honeycomb`, `incident.io`, `Pylon`, `Intercom`, `MailerLite`, `Google Cloud BigQuery`

### Hôtellerie / tourisme / événementiel
`Trivago`, `Wyndham Hotels`, `Fever Event Discovery`, `Udemy Business`

### Autres
`Blockscout` (blockchain), `Bitly` (QR déjà en interne), `PayPal` (casino interne), `GoCardless` (SEPA récurrent), `GoDaddy` (domaines), `Granted` (grants), `Square` (POS), `Zocks`, `Candid`, `Midpage Legal Research`, `Scholar Gateway`, `pg-aiguide` (si pas Postgres), `Coupler.io`, `CData Connect AI`, `IFTTT`, `Tavily` (redondant Exa), `Magic Patterns` (redondant Figma), `Chronograph`, `Starburst`, `MoSPI`, `Craft` (redondant Notion), `Hugging Face`

---

## 🔧 LSP plugins (langages) — **IGNORER pour CMCteams**

Les LSP (Language Server Protocol) `clangd-lsp`, `csharp-lsp`, `gopls-lsp`, `jdtls-lsp`, `kotlin-lsp`, `lua-lsp`, `php-lsp`, `pyright-lsp`, `rust-analyzer-lsp`, `swift-lsp`, `typescript-lsp` sont **inutiles** pour ce projet :

- CMCteams = **JS vanilla monofichier** (index.html), pas de compilation
- Pas de `tsconfig.json`, pas de `package.json`, pas de build
- À considérer uniquement si tu démarres un projet TypeScript/Python/Rust avec vraie config

---

## 📊 Récapitulatif

| Catégorie | Nombre |
|-----------|--------|
| Priorité 1 (à installer) | **6** |
| Priorité 2 (projets futurs) | **7** |
| Priorité 3 (optionnel) | **9** |
| Total recommandés | **22** |
| Écartés (non pertinents) | ~110 |
| LSP plugins (inutiles ici) | 11 |

---

## 🚨 Rappel — Agent Vercel `kdmc-agent-monaco`

Tu as déployé sur Vercel :
- **Projet :** `kdmc-bot-2026` (domaine : `kdmc-agent-monaco.vercel.app`)
- **Source :** repo `9r4rxssx64-creator/CMCteams`, dossier `tools/agent`, branche `main`
- **Env vars :** `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AGENT_SECRET`
- **Endpoints testés :**
  - `/api/health` → ✅ retourne `{"ok":true, ...}`
  - `/api/cron?secret=...&trigger=manual` → ✅ exécute les 5 tâches (health-check, conflicts-check, burnout-detect, daily-backup, weekly-report)
  - Sans secret → `{"error":"Unauthorized"}` (correct)

### ⚠️ Problème cron Vercel Hobby

Ton cron `*/15 * * * *` (toutes les 15 min) est **bloqué par Vercel Hobby** (limité à 1 fois/jour).

### Solutions (dans l'ordre)

1. **GitHub Actions** (gratuit, recommandé) — créer `.github/workflows-desactives/agent-cron.yml (**rangé** — plus actif)` avec `schedule: cron: '*/15 * * * *'` qui appelle l'endpoint `/api/cron` avec le secret.
2. **Railway / Fly.io** (~5 €/mois) — service continu avec `setInterval`, déjà prévu dans le code de l'agent.
3. **Cloudflare Workers + Cron Triggers** (gratuit jusqu'à 100k invocations/jour) — MCP Cloudflare utile ici.
4. **Vercel Pro** (20 €/mois) — overkill pour juste un cron.

> Quand tu veux passer à GitHub Actions, demande-moi : je crée le workflow, configure les secrets GitHub, et commit.

---

## 📝 Historique des décisions

- **16/04/2026** : analyse initiale, 22 MCP recommandés sur ~140 analysés
- Promotion Vercel P2 → P1 (projet déjà déployé)
- Ajout Sentry en P1 (monitoring essentiel)
- Ajout Context7 en P1 (anti-hallucination docs)
