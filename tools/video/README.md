# CMC Teams — Pipeline Vidéo de Démonstration

Outil intégré pour générer des vidéos de présentation professionnelles de l'application CMC Teams.

## Pré-requis

```bash
npm install puppeteer canvas sharp @ffmpeg-installer/ffmpeg fluent-ffmpeg
```

## Usage rapide

```bash
# Vidéo complète (capture + frames + MP4)
node tools/video/make-demo.js

# Mode rapide (durées réduites)
node tools/video/make-demo.js --fast

# Sans recapturer les screenshots
node tools/video/make-demo.js --skip-capture

# Tous les formats (MP4 + WebM + GIF)
node tools/video/make-demo.js --format all

# GIF pour README
node tools/video/make-demo.js --format gif
```

## Scripts individuels

| Script | Rôle |
|--------|------|
| `config.js` | Configuration (résolution, palette, sections, timing) |
| `capture-app.js` | Puppeteer — capture screenshots de chaque vue |
| `generate-frames.js` | node-canvas — génère les frames animées |
| `compile-video.js` | FFmpeg — compile les frames en vidéo |
| `make-demo.js` | Script maître qui orchestre tout |

## Architecture

```
tools/video/
├── config.js           # Configuration centralisée
├── capture-app.js      # Capture Puppeteer
├── generate-frames.js  # Génération frames (node-canvas)
├── compile-video.js    # Compilation FFmpeg
├── make-demo.js        # Orchestrateur
├── README.md           # Ce fichier
├── .gitignore          # Exclut frames/output/assets
├── frames/             # Frames PNG générées (gitignored)
├── assets/             # Screenshots capturés (gitignored)
└── output/             # Vidéos finales (gitignored)
```

## Personnalisation

### Ajouter une section
Éditez `config.js` → `sections[]` :

```javascript
{
  id: 'nouvelle-vue',
  type: 'screenshot',      // 'title' | 'feature-list' | 'screenshot'
  view: 'nomDeLaVue',      // ID de la vue dans l'app
  title: 'Titre affiché',
  subtitle: 'Description',
  highlights: ['Point 1', 'Point 2'],
  duration: 150,           // en frames (÷30 = secondes)
}
```

### Modifier le style visuel
Les couleurs, polices et effets sont dans `config.js` et `generate-frames.js`.

## Outils utilisés

- **Puppeteer** — Automatisation Chrome headless pour les captures
- **node-canvas** — Rendu Canvas 2D côté serveur (Cairo + Pango)
- **Sharp** — Traitement d'images haute performance
- **FFmpeg** — Encodage vidéo professionnel (H.264/VP9)
