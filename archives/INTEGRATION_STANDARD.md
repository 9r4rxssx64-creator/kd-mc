# INTEGRATION_STANDARD.md — Stack universelle à intégrer dans TOUS les projets Kevin

> **À propager dans :** IA Apex, kdmc-agent-monaco, CMCteams, commerce, vidéo, et **tous les futurs projets** de Kevin DESARZENS.
> **Dernière mise à jour :** 18 avril 2026.
> **Source de vérité :** `~/.claude/CLAUDE.md` global.

## 🎯 Comment utiliser ce document

Copie **ce fichier entier** dans le contexte de ton assistant Claude Code pour chaque nouveau projet. L'assistant aura les règles + le code prêt à coller.

---

## 📌 Les 12 règles permanentes de travail

Toute IA (Claude Code, agents autonomes, IA dans l'app) doit appliquer ces règles :

1. **Anti-coupure** : ne jamais s'arrêter, utiliser `run_in_background` pour commandes longues, paralléliser les tool calls, subagents pour recherches lourdes.
2. **Travail complet** : aller au bout, pas de commit "fix" successifs, vérifier avant de dire "c'est fait".
3. **Minimum d'investissement, qualité pro** : gratuit d'abord (GitHub Pages, GitHub Actions, Vercel Hobby, Firebase free, Sentry dev, Cloudflare free).
4. **Autonomie maximale** : chercher, décider, installer, TESTER soi-même (Playwright, curl, MCP) avant de demander à l'utilisateur.
5. **Évolutivité** : chaque session améliore l'existant, factoriser, centraliser, bumper APP_VER, CHANGELOG.
6. **Vérifier l'existant** avant d'agir : `claude mcp list`, lire `.env`, `vercel.json`, `package.json`.
7. **Ne jamais abîmer** : cartographier l'impact, `Edit` (pas `Write`) sur gros fichiers, post-rebase grep vérif.
8. **Communication honnête** : pas de "j'ai tout fait" sans vérif, point d'étape bref, signaler blocages immédiatement.
9. **TodoWrite systématique** à chaque nouvelle demande utilisateur.
10. **URLs directes + vue iPhone** : fournir les liens cliquables, voir avant de dicter (Playwright simulate iPhone), mémos pas à pas.
11. **Minimum d'intervention utilisateur** : l'IA se débrouille seule, demande uniquement OAuth/captcha/2FA personnels.
12. **Propagation** : inclure ces 12 règles dans le système prompt de toute IA créée.

---

## 🧬 Stack universelle (gratuit au max)

### 1. 📊 Monitoring erreurs — Sentry (gratuit 5k events/mois)

**Organisation Sentry :** `kdmc` → https://kdmc.sentry.io

#### A) Browser JS / HTML — Loader Script

À placer dans `<head>` avant les autres scripts inline :

```html
<!-- Sentry monitoring (Loader Script, lazy-loaded, 0 impact perf) -->
<link rel="preconnect" href="https://js-de.sentry-cdn.com" crossorigin>
<link rel="dns-prefetch" href="https://o0.ingest.sentry.io">
<script src="https://js-de.sentry-cdn.com/<LOADER_ID>.min.js" crossorigin="anonymous"></script>
```

**CSP à élargir** :
```
script-src ... https://*.sentry-cdn.com https://*.sentry.io;
connect-src ... https://*.sentry.io https://*.ingest.sentry.io https://*.sentry-cdn.com
```

**Où récupérer `<LOADER_ID>` :** https://kdmc.sentry.io/settings/projects/<PROJET>/keys/

#### B) Node.js / Vercel agents — SDK Node

**`package.json`** :
```json
"dependencies": {
  "@sentry/node": "^8.43.0"
}
```

**`lib/sentry.js`** (helper centralisé) :
```javascript
import * as Sentry from "@sentry/node";
let _initialized = false;

export function initSentry(cfg) {
  if (_initialized) return Sentry;
  if (!cfg?.SENTRY_DSN) return Sentry;

  Sentry.init({
    dsn: cfg.SENTRY_DSN,
    environment: cfg.SENTRY_ENVIRONMENT || "production",
    release: cfg.SENTRY_RELEASE || "unknown",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.consoleIntegration(),
    ],
    initialScope: {
      tags: { component: "<PROJECT_NAME>", admin: cfg.AGENT_ADMIN_ID || "U11804" },
    },
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err?.name === "AbortError" || err?.code === "ECONNRESET") return null;
      return event;
    },
  });

  _initialized = true;
  return Sentry;
}

export { Sentry };
```

**`index.js`** (init AVANT tout autre import applicatif) :
```javascript
import { loadConfig } from "./lib/config.js";
import { initSentry } from "./lib/sentry.js";

const cfg = loadConfig();
const Sentry = initSentry(cfg);

// ⬇ Autres imports APRÈS init Sentry
import Anthropic from "@anthropic-ai/sdk";
// ...
```

**Capture avec contexte** dans les catches :
```javascript
try {
  // code
} catch (err) {
  Sentry.withScope((scope) => {
    scope.setTag("trigger", trigger);
    scope.setLevel("fatal");
    scope.setContext("report", { ... });
    Sentry.captureException(err);
  });
}
// Pour Vercel serverless :
await Sentry.flush(2000);
```

**`config.js`** (env vars requises) :
```javascript
SENTRY_DSN: process.env.SENTRY_DSN || "",
SENTRY_ENVIRONMENT: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
```

**Skill officiel suivi :** https://github.com/getsentry/sentry-for-ai/blob/main/skills/sentry-sdk-setup/SKILL.md

#### C) Endpoint de test `/api/sentry-test`

Ajouter cet endpoint pour vérifier que Sentry capture bien :
```javascript
// GET /api/sentry-test?secret=<AGENT_SECRET>&type=sync|async|message
// Retourne { ok:true, sent:true, eventId, sentryDashboard }
// Voir tools/agent/api/sentry-test.js dans CMCteams pour le code complet
```

#### D) Vérification dans `/api/health`

Inclure `SENTRY_DSN` dans le `env_check` pour vérifier d'un coup d'œil :
```javascript
env_check: {
  SENTRY_DSN: process.env.SENTRY_DSN ? "set (monitoring active)" : "MISSING",
  SENTRY_ENVIRONMENT: process.env.VERCEL_ENV || "unknown",
}
```

---

### 2. 🎨 Génération d'images — Pollinations.ai (100 % gratuit, zéro clé)

**API publique** (aucun compte requis) :
```
https://image.pollinations.ai/prompt/<texte_url_encoded>?width=1024&height=1024
```

**Usage typique** (avatars, bannières, splash, illustrations) :
```javascript
const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
```

**Fallback** : Hugging Face MCP (installé globalement) pour modèles spécifiques (Flux, SDXL, LTX-Video).

---

### 3. 📚 Docs à jour pour LLMs — Context7 (MCP installé)

```bash
claude mcp add context7 --transport http https://mcp.context7.com/mcp
```

Utiliser pour toute question sur frameworks récents (anti-hallucination).

---

### 4. ⏰ Cron > 1×/jour — GitHub Actions (gratuit, illimité)

Pattern : `.github/workflows-desactives/agent-cron.yml (**rangé** — plus actif)`

```yaml
name: Agent Cron 24/7

on:
  schedule:
    - cron: '0 3 * * *'   # 3h UTC
    - cron: '0 8 * * *'   # 8h UTC
    - cron: '0 9 * * 1'   # lundi 9h UTC
  workflow_dispatch:  # manuel

jobs:
  trigger-agent:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Call agent endpoint
        env:
          AGENT_URL: https://<PROJECT>.vercel.app
          AGENT_SECRET: ${{ secrets.AGENT_SECRET }}
        run: |
          curl -sS -o response.json -w "%{http_code}" \
            "$AGENT_URL/api/cron?trigger=cron:$(date -u +'%H:%M')&secret=$AGENT_SECRET"
          cat response.json | head -80
```

**Secret GitHub requis** : `AGENT_SECRET` (même valeur que côté Vercel).

---

### 5. 🔗 CDN / preconnect — pour perf optimale

Dans `<head>` de toute page web :
```html
<link rel="preconnect" href="https://..." crossorigin>
<link rel="dns-prefetch" href="https://...">
```

Pour chaque service externe : Firebase, Sentry, Anthropic, fonts, etc.

---

### 6. 🤖 IA custom dans l'app — règles à inclure dans le system prompt

```javascript
function buildIASystemPrompt() {
  let prompt = "Tu es l'assistant IA de <PROJECT>...\n";
  // ... contexte métier ...

  // Règles permanentes (à la fin)
  prompt += "\n━━━ RÈGLES PERMANENTES DE TRAVAIL ━━━\n";
  prompt += "1. Travail complet : aller au bout, pas de réponse à moitié.\n";
  prompt += "2. Minimum d'investissement : privilégier le gratuit.\n";
  prompt += "3. Qualité professionnelle : réponses claires, structurées, mobile-friendly.\n";
  prompt += "4. Évolutivité : suggérer des améliorations, pas de gadgets.\n";
  prompt += "5. Vérifier l'existant : utiliser les outils avant de deviner.\n";
  prompt += "6. Ne pas abîmer : confirmer actions destructrices.\n";
  prompt += "7. Communication honnête : dire 'je ne sais pas' si besoin.\n";
  prompt += "8. Continuité : terminer la tâche avant de changer.\n";
  prompt += "9. Mémoire contexte : rappeler rôle admin et préférences.\n";
  prompt += "10. URLs directes : fournir les liens cliquables.\n";
  prompt += "11. Minimum d'intervention : l'IA se débrouille, l'user ne fait que l'OAuth.\n";
  prompt += "12. Propagation : ces règles s'appliquent partout, tout le temps.\n";
  return prompt;
}
```

---

## 📁 Fichiers mémoire standards par projet

Chaque projet doit avoir à la racine :
- `CLAUDE.md` — guide projet spécifique
- `NOTES_USER.md` — infos métier données par Kevin (couleurs, numéros, règles internes)
- `CHANGELOG.md` — historique versions détaillé
- `MEMO_RESUME.md` — où j'en suis en fin de session
- `MCP_INSTALL.md` — MCP recommandés + installés
- `GUIDE_IPHONE.md` — mémo pas à pas iOS Safari avec URLs directes
- `INTEGRATION_STANDARD.md` — ce fichier (copié/référencé)

---

## 🚀 Workflow de propagation à un nouveau projet

1. **Créer un nouveau projet Sentry** sur https://kdmc.sentry.io/projects/new
   - Platform : Browser JavaScript (web) OU Node.js (agent)
   - Slug : `<project-name>`
2. **Récupérer** Loader Script (browser) + DSN classique (Node) sur `/settings/projects/<slug>/keys/`
3. **Intégrer le code** de la section 1 (A, B, C, D) selon le type de projet
4. **Ajouter `SENTRY_DSN`** dans les env vars Vercel
5. **Redeploy** Vercel
6. **Tester** via `/api/sentry-test?secret=...` (Node) ou provoquer une erreur (browser)
7. **Vérifier** dans Sentry dashboard

---

## 📞 Contact et coordination inter-projets

- **Admin** : Kevin DESARZENS (U11804)
- **Organisation Sentry** : `kdmc`
- **Organisation Vercel** : `g7vrdynktn-5574's projects`
- **Compte GitHub** : `9r4rxssx64-creator`
- **Firebase** : `cmcteams-c16ab` (pour CMCteams)
- **Telegram bot** : `@Kdmc_kevind_2026_bot` (chat_id : `5458942048`)
- **Anthropic API key** : stockée comme `ANTHROPIC_API_KEY` env var
