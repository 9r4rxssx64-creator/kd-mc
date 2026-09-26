# CMCteams

**Application de gestion de planning et d'équipes pour le Casino de Monte-Carlo (SBM)**.

SPA monofichier HTML — pas de backend, pas de build, pas de dépendances d'exécution.
Servie sur **[kd-mc.com](https://kd-mc.com)** par un **routeur Cloudflare Worker**
(`services/kdmc-router/`, 26 sous-domaines) qui va chercher les pages sur GitHub.

🎬 **[Voir la vidéo de démonstration](./CMCTeams_Demo.mp4)** — 1:33, Full HD

---

## Caractéristiques

- **~260 employés** (261 entrées au 6.09.2026) · 10 équipes BJ · 13 équipes Roulettes · 13 équipes CMC
- **Firebase Realtime Database** pour synchronisation temps réel multi-appareils
- **PWA mobile-first** (iPhone SE 375px = référence)
- **IA Claude intégrée** avec **87 outils** connectés aux données temps réel (mesuré le 6.09.2026)
- **Convention Collective SBM + Loi monégasque** (Loi 1.103, OS 8.929, AM 88-384) intégrées
- **Sécurité** : CSP restrictive, hash 10K rounds, rate-limiting PIN, journal audit complet
- **Accessibilité** : WCAG AA, focus-visible, prefers-reduced-motion, safe-area iOS

---

## Structure

```
CMCteams/
├── index.html              # Application entière (HTML + CSS + JS)
├── sw.js                   # Service Worker (cache offline)
├── manifest.json           # PWA manifest
├── CMCTeams_Demo.mp4       # Vidéo de démonstration
├── CLAUDE.md               # Guide pour assistants IA (règles, architecture)
├── CHANGELOG.md            # Historique complet des versions
├── MEMO_RESUME.md          # Mémo de reprise de session
├── tools/video/            # Pipeline génération vidéo (Puppeteer + FFmpeg)
└── .github/workflows/      # Déploiement GitHub Pages
```

---

## Documentation

- **`CLAUDE.md`** — architecture, erreurs connues, workflow expert
- **`CHANGELOG.md`** — historique v8.83 → actuel
- **`tools/video/README.md`** — pipeline de génération vidéo
- **`MEMO_RESUME.md`** — état courant, prochaines pistes

---

*Casino de Monte-Carlo — Société des Bains de Mer*
