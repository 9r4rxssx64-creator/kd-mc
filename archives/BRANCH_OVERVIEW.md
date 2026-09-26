# BRANCH_OVERVIEW.md — `claude/automate-social-media-videos-RvjYq`

> Patch unique de toute la branche feature. 52 commits, 130 fichiers, ~43 000 lignes ajoutées.
> Branche basée sur `main` — tout le travail réalisé par Claude Code.

---

## Résumé exécutif

Cette branche transforme le projet CMCteams (SPA de gestion casino) en ajoutant :

1. **Pipeline vidéo automatisé** — génération de vidéos faceless pour réseaux sociaux (YouTube, TikTok, Instagram, Facebook)
2. **Infrastructure cadres casino** — pit boss, superviseurs, 21 cadres, 12 codes
3. **40+ versions app** (v9.86 → v9.121) — features, fixes, accessibilité, performance, sécurité

---

## A. Pipeline Social Media Video (`tools/social/`)

### Architecture — 7 098 lignes de code source

```
tools/social/
├── cli.js                          # CLI principal (486 lignes, 12+ commandes)
├── package.json                    # Node.js 20+, 9 dépendances
│
├── engine/                         # Moteurs de traitement (12 modules)
│   ├── compiler.js        (280 L)  # FFmpeg H.264/VP9 — assemblage frames+audio+musique
│   ├── tts.js             (317 L)  # Text-to-Speech — Edge TTS (300+ voix) + espeak fallback
│   ├── subtitle-engine.js (155 L)  # Sync mot-par-mot — heuristique syllabique
│   ├── frame-generator.js (245 L)  # Génération frames PNG 30fps via node-canvas
│   ├── base-renderer.js   (357 L)  # Primitives dessin — palette, fonts, Ken Burns, karaoke
│   ├── script-generator.js(288 L)  # Génération scripts IA via Gemini API (5 niches)
│   ├── shorts-extractor.js(186 L)  # Extraction clips verticaux 9:16 depuis vidéo longue
│   ├── thumbnail-generator.js(428 L) # ★ NEW — Thumbnails IA (6 layouts × 10 schemes × 5 plateformes)
│   ├── analytics.js       (308 L)  # ★ NEW — Dashboard analytics (RPM, revenue, tendances)
│   ├── ab-testing.js      (208 L)  # ★ NEW — A/B testing statistique (z-test, auto-promote)
│   ├── branding.js        (226 L)  # ★ NEW — Watermark, intro/outro, 10 color schemes
│   └── multi-lang.js      (174 L)  # ★ NEW — 9 langues, traduction Gemini, RTL, CJK
│
├── templates/                      # Templates vidéo (5 styles)
│   ├── narrative-storytelling.js(176 L) # Storytelling faceless (format principal)
│   ├── documentary.js     (559 L)  # ★ NEW — Documentaire, Ken Burns, lower-thirds
│   ├── listicle.js        (615 L)  # ★ NEW — Top-N countdown, numéros animés
│   ├── breaking-news.js   (687 L)  # ★ NEW — Breaking news, ticker, bannière rouge
│   └── tutorial.js        (295 L)  # ★ NEW — Tutoriel éducatif, étapes numérotées
│
├── publishers/                     # Publication multi-plateforme (4 APIs)
│   ├── base-publisher.js  (124 L)  # Retry exponentiel, validation, logging
│   ├── youtube.js         (189 L)  # YouTube Data API v3 + OAuth2
│   ├── facebook.js        (145 L)  # Facebook Graph API + Reels
│   └── instagram.js       (151 L)  # Instagram Reels via Graph API
│
├── scheduler/                      # ★ NEW — Scheduling automatique
│   ├── scheduler.js       (304 L)  # Queue, calendrier, timing optimal par plateforme
│   └── cron-runner.js     (195 L)  # Runner standalone (cron/GitHub Actions/PM2)
│
├── config/
│   ├── platforms.json              # Specs par plateforme (formats, limites, quotas)
│   └── content-library.json        # Pool de scripts prêts à narrer
│
└── docs/
    ├── setup-youtube.md            # Guide OAuth YouTube
    ├── setup-tiktok.md             # Guide API TikTok
    └── setup-twitter.md            # Guide API Twitter/X
```

### Modules ★ NEW (ajoutés dans cette session)

| Module | Lignes | Fonction clé |
|--------|--------|-------------|
| `thumbnail-generator.js` | 428 | 6 layouts (dramatic, split, numbered, versus, question, minimal) × 10 color schemes × 5 tailles plateforme. Variants A/B automatiques. |
| `analytics.js` | 308 | Tracking views/likes/revenue par vidéo. RPM par niche (betrayal $12.82, finance $15.30). Export Markdown/CSV/HTML. Recommandations auto. |
| `ab-testing.js` | 208 | Z-test de significativité statistique. Auto-promote du gagnant. Tests titres, thumbnails, horaires, niches. |
| `branding.js` | 226 | Brand kits sauvegardables. Watermark multi-position (opacity, size). Génération intro (3s) + outro (4s) avec animation logo. 10 color schemes. |
| `multi-lang.js` | 174 | 9 langues (EN/FR/ES/IT/DE/PT/AR/JA/HI). Voix Edge TTS par langue + style. Traduction + adaptation culturelle via Gemini. Détection auto de langue. RTL arabe, CJK japonais. |
| `documentary.js` | 559 | Template documentaire — pacing lent, Ken Burns, cards stats, citations sources. |
| `listicle.js` | 615 | Countdown Top-N — numéros animés, barre de progression, item cards. Format vertical TikTok. |
| `breaking-news.js` | 687 | Style journal télévisé — bannière BREAKING pulsante, ticker scrollant, horodatage live, grille bleue. |
| `tutorial.js` | 295 | Template éducatif — indicateur d'étape, highlight boxes (tip/info/warning/code), narration calme. |
| `scheduler.js` | 304 | Timing optimal recherché 2026 (YouTube: Mar/Jeu 14-16h, TikTok: Mar/Jeu/Ven 19-21h). Queue persistante JSON. Calendrier 14j avec rotation niches. |
| `cron-runner.js` | 195 | `--all` / `--calendar` / `--status` / `--clean`. Notifications Telegram. Retry exponentiel. |

### GitHub Actions Workflows

| Fichier | Déclencheur | Fonction |
|---------|-------------|----------|
| `social-publish.yml` | Quotidien 12h Monaco + manual | Génère 1 vidéo + publie YouTube + extrait Shorts + notif Telegram |
| `social-scheduler.yml` | ★ NEW — Toutes les 6h + lundi 6h | Smart scheduler : traite la queue, génère le calendrier hebdo, batch generate |

### Commandes CLI

```bash
node cli.js generate --random --format long    # Génère une vidéo longue
node cli.js generate --ai-script --niche betrayal  # Script IA + vidéo
node cli.js publish --platform youtube --video X.mp4
node cli.js extract-shorts --video X.mp4 --count 3
node cli.js list-stories                       # Pool de contenus
node cli.js status                             # État du système

node scheduler/cron-runner.js --all            # Traite la queue
node scheduler/cron-runner.js --calendar       # Planifie 14 jours
node scheduler/cron-runner.js --status         # Dashboard queue
```

---

## B. Pipeline Vidéo Demo (`tools/video/`)

```
tools/video/
├── config.js          (214 L)  # Palette Casino Monte-Carlo, 14 sections demo
├── capture-app.js     (228 L)  # Puppeteer screenshots de l'app (10 vues)
├── generate-frames.js (717 L)  # Frames animés canvas (glass morphism, particules)
├── compile-video.js   (202 L)  # FFmpeg MP4/WebM/GIF
├── make-demo.js       (129 L)  # Orchestrateur pipeline complet
└── output/                     # Vidéo générée (16 MB MP4)
```

---

## C. App CMCteams — Versions v9.86 → v9.121

| Version | Changements principaux |
|---------|----------------------|
| v9.121 | Infrastructure PIT BOSS — 21 cadres, 12 codes, lieux |
| v9.120 | Fix storage plein — nettoyage auto agressif |
| v9.119 | Fix vDeparts label + auto-purge codes inconnus |
| v9.118 | PAT=Paternité + packaging entreprise |
| v9.117 | Fix 3 crashes récurrents (SW + Firebase + IA) |
| v9.116 | Retrait auto-reassign familles |
| v9.115 | Stats connexion admin (IP/navigateur/lieu) |
| v9.114 | Pause diaporama + visibilité massive |
| v9.113 | Thème CLAIR réellement fonctionnel |
| v9.112 | Fix bouton Continuer masqué au login |
| v9.111 | Fix crash SW + login centré/scroll |
| v9.110 | Visibilité MAX — fond + contraste |
| v9.109 | UX compact + automation + IA survérif |
| v9.108 | Backup admin Firebase + auto-classification import |
| v9.107 | Attribution auto secteurs selon compétences |
| v9.106 | Fix micro chat + TTS chat |
| v9.105 | Fix crash Safari iOS burn-out + contraste AAA |
| v9.104 | Auto-vérif import TOTALE + corrections auto |
| v9.103 | Couleurs codes calibrées sur PDF SBM original |
| v9.102 | Auto-vérification post-import + 5 outils IA |
| v9.101 | Fix SyntaxError crash Safari iOS |
| v9.100 | Audit expert 54/54 E2E PASS |
| v9.99 | MAJ docs + CHANGELOG |
| v9.98 | Tests E2E Playwright + CI/CD |
| v9.97 | Release notes in-app |
| v9.96 | Circuit breaker Firebase |
| v9.95 | Retry jitter exponentiel + UI file sync |
| v9.94 | Accessibilité AAA — ARIA + high contrast + font scaler |
| v9.93 | PWA avancée — Badge + Share + Wake Lock |
| v9.92 | Proxy Anthropic Cloudflare Worker |
| v9.91 | Page Debug admin + QR code |
| v9.90 | Réactions emojis chat |
| v9.89 | Error monitoring + performance tracking |
| v9.88 | UX polish — empty states / skeletons / badges |
| v9.87 | IA +5 outils + générateur mdp sécurisé |
| v9.86 | IndexedDB wrapper + lazy-loader + throttle |

---

## D. Infrastructure & Tooling

| Composant | Fichiers | Description |
|-----------|----------|-------------|
| Agent Vercel | `tools/agent/` | Cron Vercel + endpoints API |
| Intégrations | `tools/integrations/` | 8 services externes |
| MCP Servers | `tools/mcp/` | Model Context Protocol |
| Tests | `tools/tests/` | E2E Playwright |
| GitHub Actions | `.github/workflows/` | 5 workflows (deploy, backup, tests, social-publish, social-scheduler) |

---

## E. Statistiques de la branche

| Métrique | Valeur |
|----------|--------|
| Commits | 52 |
| Fichiers modifiés | 130 |
| Lignes ajoutées | ~43 000 |
| Lignes supprimées | ~1 700 |
| Code source social (JS) | 7 098 lignes |
| Templates vidéo | 5 styles |
| Plateformes supportées | 6 (YouTube, TikTok, Instagram, Facebook, Twitter, Telegram) |
| Langues supportées | 9 (EN, FR, ES, IT, DE, PT, AR, JA, HI) |
| Color schemes | 10 |
| Thumbnail layouts | 6 |
| Voices TTS | 300+ (Edge TTS) |
| Dépendances npm | 9 |

---

## F. Comment appliquer ce patch

```bash
# Depuis un clone frais de CMCteams
git fetch origin claude/automate-social-media-videos-RvjYq
git checkout claude/automate-social-media-videos-RvjYq

# Ou appliquer le patch sur main
git apply --stat BRANCH_PATCH.patch    # Voir les changements
git apply BRANCH_PATCH.patch           # Appliquer
```

---

## G. Prérequis pour utiliser le pipeline social

```bash
# 1. Installation
cd tools/social && npm install

# 2. Variables d'environnement (dans .env ou secrets GitHub)
GOOGLE_AI_KEY=xxx          # Gemini API (gratuit via Google AI Studio)
YOUTUBE_CLIENT_ID=xxx      # OAuth YouTube
YOUTUBE_CLIENT_SECRET=xxx
YOUTUBE_REFRESH_TOKEN=xxx
TELEGRAM_BOT_TOKEN=xxx     # Notifications (optionnel)
TELEGRAM_CHAT_ID=xxx

# 3. Système
espeak-ng                  # TTS offline fallback (apt install espeak-ng)
ffmpeg                     # Assemblage vidéo (inclus via npm @ffmpeg-installer)
```

---

*Généré le 2026-04-30 — Branch `claude/automate-social-media-videos-RvjYq`*
