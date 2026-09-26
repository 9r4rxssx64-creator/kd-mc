# tools/social — Pipeline vidéo automatisé expert+++ multi-plateformes

> Système autonome de génération + publication de vidéos faceless pour YouTube, TikTok, Instagram Reels, Facebook, X.
> 23 modules · 5 templates · 15 commandes CLI · 9 langues · 10 color schemes · A/B testing · Analytics · Scheduler

---

## 🎬 Ce que ça fait

1. **Génère un script** depuis la bibliothèque ou via IA (Gemini/Gemma 4)
2. **Synthétise la voix** (TTS) — Edge TTS (300+ voix neural, 9 langues) + espeak-ng fallback
3. **Synchronise les sous-titres** word-by-word style TikTok karaoké
4. **Rend les frames** PNG 30fps avec animations cinéma (gradient, vignette, Ken Burns)
5. **Compile en MP4** H.264 + AAC + musique de fond
6. **Génère des thumbnails** IA (6 layouts × 10 color schemes × 5 tailles plateforme)
7. **Publie** sur YouTube / TikTok / Instagram Reels / Facebook / X
8. **Notifie via Telegram** avec aperçu
9. **Track les analytics** (RPM, revenue, engagement, tendances)
10. **Optimise via A/B testing** statistique (z-test, auto-promote)

---

## 🚀 Quick Start

```bash
# 1. Installer
cd tools/social && npm install

# 2. Installer espeak-ng (TTS local)
sudo apt-get install -y espeak-ng

# 3. Créer le dossier data
mkdir -p data

# 4. Lister les histoires
node cli.js list-stories

# 5. Générer une vidéo
node cli.js generate --story fact-short-001 --format short

# 6. Générer un thumbnail
node cli.js thumbnail --title "He Lost Everything" --layout dramatic

# 7. Voir les analytics
node cli.js analytics --action report
```

---

## 📁 Architecture

```
tools/social/
├── cli.js                              # CLI 15 commandes
├── package.json                        # Node.js 20+, 9 deps
│
├── engine/                             # 12 modules de traitement
│   ├── compiler.js          (280 L)    # FFmpeg H.264/VP9 assemblage
│   ├── tts.js               (317 L)    # Text-to-Speech multi-backend
│   ├── subtitle-engine.js   (155 L)    # Sync mot-par-mot heuristique
│   ├── frame-generator.js   (245 L)    # Frames PNG 30fps canvas
│   ├── base-renderer.js     (357 L)    # Primitives dessin + palette
│   ├── script-generator.js  (288 L)    # Génération scripts IA (Gemini)
│   ├── shorts-extractor.js  (186 L)    # Extraction clips 9:16
│   ├── thumbnail-generator.js(428 L)   # Thumbnails IA multi-layout
│   ├── analytics.js         (308 L)    # Métriques, revenue, recommandations
│   ├── ab-testing.js        (208 L)    # A/B testing statistique
│   ├── branding.js          (226 L)    # Watermark, intro/outro, brand kits
│   └── multi-lang.js        (174 L)    # 9 langues + traduction Gemini
│
├── templates/                          # 5 styles vidéo
│   ├── narrative-storytelling.js(176L) # Faceless storytelling (niche #1)
│   ├── documentary.js      (559 L)    # Documentaire, Ken Burns
│   ├── listicle.js          (615 L)    # Top-N countdown vertical
│   ├── breaking-news.js     (687 L)    # Breaking news, ticker
│   └── tutorial.js          (295 L)    # Tutoriel éducatif
│
├── publishers/                         # 4 APIs de publication
│   ├── base-publisher.js    (124 L)    # Retry, validation, logging
│   ├── youtube.js           (189 L)    # YouTube Data API v3
│   ├── facebook.js          (145 L)    # Facebook Graph API + Reels
│   └── instagram.js         (151 L)    # Instagram Reels
│
├── scheduler/                          # Planification automatique
│   ├── scheduler.js         (304 L)    # Queue, calendrier, timing optimal
│   └── cron-runner.js       (195 L)    # Runner standalone cron/Actions
│
├── config/
│   ├── platforms.json                  # Specs par plateforme
│   └── content-library.json            # Pool de scripts
│
├── data/                               # Données persistantes (auto-créé)
│   ├── metrics.json                    # Métriques par vidéo
│   ├── experiments.json                # Expériences A/B
│   ├── schedules.json                  # Schedules configurés
│   ├── queue.json                      # File d'attente jobs
│   └── brands.json                     # Brand kits
│
└── docs/
    ├── setup-youtube.md                # Guide OAuth YouTube
    ├── setup-tiktok.md                 # Guide API TikTok
    └── setup-twitter.md                # Guide API Twitter/X
```

---

## 🎯 CLI complet — 15 commandes

### Core

| Commande | Description |
|----------|-------------|
| `list-stories` | Liste les histoires de la bibliothèque |
| `list-voices` | Liste les voix TTS (300+ Edge TTS) |
| `test-tts --text "..."` | Test rapide de synthèse vocale |
| `generate --story <id> --format short` | Génère une vidéo |
| `generate --random --template documentary` | Template au choix |
| `generate --ai-script --niche betrayal` | Script IA + vidéo |
| `generate-script --niche mystery --count 5` | Génère scripts via Gemma 4 |
| `extract-shorts --video <path> --count 3` | Extrait Shorts 9:16 |
| `publish --platform youtube --video <path>` | Publie sur plateforme |
| `publish-telegram --video <path>` | Envoie sur Telegram |
| `status` | Liste les vidéos générées |

### Advanced

| Commande | Description |
|----------|-------------|
| `thumbnail --title "..." --variants` | Thumbnails IA + A/B variants |
| `analytics --action report --format html` | Dashboard analytics |
| `experiment --action create --variants "A,B"` | Crée un A/B test |
| `schedule --action calendar --days 30` | Calendrier de contenu |
| `brand --action list` | Gestion brand kits |
| `translate --text "..." --to fr` | Traduction multi-langue |

### Templates disponibles

| Template | Format | Style | Cas d'usage |
|----------|--------|-------|-------------|
| `narrative-storytelling` | 16:9 / 9:16 | Faceless karaoké | YouTube principal |
| `documentary` | 16:9 | Ken Burns, lower-thirds | Documentaires |
| `listicle` | 9:16 | Countdown animé | TikTok, Shorts |
| `breaking-news` | 16:9 | Ticker, bannière rouge | Exposés, actualités |
| `tutorial` | 16:9 | Étapes numérotées | Éducation, how-to |

---

## 📊 Modules avancés

### Thumbnail Generator (6 layouts)

```bash
# Layout dramatique (YouTube)
node cli.js thumbnail --title "She Trusted Her Sister" --layout dramatic

# Variants A/B (3 layouts × 2 color schemes = 6 images)
node cli.js thumbnail --title "The Betrayal" --variants

# Toutes les plateformes (5 tailles)
node cli.js thumbnail --title "Top 10 Scams" --all-platforms
```

Layouts: `dramatic` `split` `numbered` `versus` `question` `minimal`
Schemes: `midnight-gold` `blood-red` `ocean-blue` `neon-pink` `royal-purple` `forest-green` `sunset-orange` `arctic-white` `matrix-green` `monochrome`

### Analytics & Revenue

```bash
# Rapport complet (markdown)
node cli.js analytics --action report --period monthly

# Export HTML dashboard
node cli.js analytics --action report --format html

# Top 10 vidéos par engagement
node cli.js analytics --action top --count 10 --metric engagement

# Recommandations IA
node cli.js analytics --action recommend
```

RPM par niche (données 2026):
| Niche | RPM moyen | Range |
|-------|-----------|-------|
| Finance | $15.30 | $10-20 |
| Betrayal | $12.82 | $8-15 |
| True Crime | $11.00 | $7-14 |
| Mystery | $9.20 | $6-12 |
| Motivation | $5.80 | $4-8 |

### A/B Testing

```bash
# Créer un test de titres
node cli.js experiment --action create --name "Title Test" --variants "Version A,Version B,Version C"

# Voir les résultats
node cli.js experiment --action analyze --id exp_xxx
```

### Multi-langue (9 langues)

```bash
# Traduire un script
node cli.js translate --text "She trusted her sister..." --to fr

# Langues: en, fr, es, it, de, pt, ar (RTL), ja (CJK), hi
node cli.js translate --list
```

### Scheduler automatique

```bash
# Créer un schedule quotidien YouTube
node cli.js schedule --action create --name "Daily YouTube" --platforms youtube

# Voir le calendrier des 30 prochains jours
node cli.js schedule --action calendar --days 30

# Voir les prochaines publications
node cli.js schedule --action next --count 10
```

Timing optimal recherché par plateforme (2026):
- **YouTube**: Mar/Jeu 14-16h, Sam 9-11h
- **TikTok**: Mar/Jeu/Ven 19-21h, Dim 12-15h
- **Instagram**: Lun/Mer/Ven 11-13h, Mar 14h
- **Facebook**: Mer 11h, Ven 10-11h

---

## 🔧 Configuration

### Variables d'environnement

```bash
# Gemini API (scripts IA + traduction) — gratuit via Google AI Studio
GOOGLE_AI_KEY=xxx

# YouTube (OAuth2)
YOUTUBE_CLIENT_ID=xxx
YOUTUBE_CLIENT_SECRET=xxx
YOUTUBE_REFRESH_TOKEN=xxx

# Facebook + Instagram
FB_PAGE_ID=xxx
FB_PAGE_TOKEN=xxx
IG_USER_ID=xxx

# Telegram (notifications)
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
```

---

## 🤖 GitHub Actions (automation)

| Workflow | Déclencheur | Fonction |
|----------|-------------|----------|
| `social-publish.yml` | Quotidien 12h + manual | Génère + publie 1 vidéo |
| `social-scheduler.yml` | Toutes les 6h + lundi 6h | Smart scheduler : queue + calendrier |

---

## 💰 Coût

**Près de zéro** : Edge TTS (gratuit), canvas (gratuit), FFmpeg (gratuit), Gemini Flash (gratuit 60 RPM), GitHub Actions (gratuit 2000 min/mois).

---

## 🔐 Sécurité

- Clés API dans env vars uniquement (jamais dans le repo)
- GitHub Secrets pour CI/CD
- Validation Telegram avant publication publique
- Rate-limiting par plateforme
- Logs dans `output/_publish-log.json`
