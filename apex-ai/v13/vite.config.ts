import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { cspNonceDynamic } from './vite-csp-nonce-plugin.js';

/* Audit Kevin v13.1.0 production-grade : bundle optimization
 * Cible : main + initial chunks < 50 KB gzip total, aucun chunk > 80 KB.
 * Stratégie : manualChunks splits par domaine + esbuild minify rapide.
 * NB : terser disponible via Vite (peer optional) si on veut compression +5%
 * mais esbuild suffit largement pour atteindre les budgets et est 20-40× plus rapide. */
export default defineConfig({
  plugins: [cspNonceDynamic()],
  base: './',
  root: '.',
  publicDir: 'assets',
  /* v13.3.71 : Web Workers off-main-thread (crypto.worker, search-index.worker, ocr.worker).
   * format 'es' = ESM workers (supporté Chrome 80+, Firefox 114+, Safari 16.4+).
   * Tous nos targets (es2022) couvrent ce périmètre. */
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: true,
    /* v13.3.28 perf 100/100 (Kevin 2026-05-07) : sourcemaps 'hidden' = générés mais
     * non référencés dans le bundle prod → 5 MB économisés sur télécharg. user réel.
     * Maps disponibles côté serveur pour déboguer Sentry stack-traces (sentry-cli upload). */
    sourcemap: 'hidden',
    minify: 'esbuild',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 50 /* warn si chunk > 50 KB raw — proxy gzip ~16-20 KB */,
    /* v13.3.74 PERF 20/20 (audit Apex Opus issue #240 — finalisation TTI <3s) :
     * modulePreload AVANT était purement filtreur (HEAVY_LAZY noir liste, retournait
     * deps - lazy = vide → 0 preload links générés dans dist/index.html).
     *
     * Résultat dist/index.html v13.3.73 : aucun <link rel="modulepreload"> →
     * navigateur découvre les imports JS au runtime → cascade waterfall coûteuse →
     * TTI ~4.4s (Lighthouse 99 mais TTI hors budget).
     *
     * Stratégie 20/20 : whitelist EXPLICITE des chunks chemin critique :
     * 1. STATIC imports du main entry (apex-kb, monitoring, multi-source-analyze,
     *    credential-patterns) → preload <link> = fetch parallèle dès HTML parsé
     *    (browser ne découvre pas via JS execution, gain ~100-200ms TTI).
     * 2. Premiers chunks dynamiques boot (auth, firebase) → fetch anticipé.
     * 3. Render initial (landing) → user voit page sans waterfall.
     *
     * Tout le reste (sentinelles, voice, vision, marketplaces, studios admin…)
     * = on-demand naturel via dynamic import quand user navigue. */
    modulePreload: {
      resolveDependencies: (filename, deps): string[] => {
        const CRITICAL_PRELOAD = [
          /* Static imports du main entry (concat immédiat dans entry — preload
           * <link> = fetch parallèle dès HTML, sans attendre exec main.js) */
          'apex-kb-',
          'monitoring-',
          'multi-source-analyze-',
          'credential-patterns-',
          /* Boot order critique : auth check → firebase init → landing render */
          'auth-',          /* services/auth.js — vérifie isAdmin pré-render */
          'firebase-',      /* services/firebase.js — init connexion DB temps réel */
          'landing-',       /* features/landing/index.js — 1ère vue user */
        ];
        return deps.filter((d) => CRITICAL_PRELOAD.some((c) => d.includes(c)));
      },
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'core/[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash][extname]',
        manualChunks: (id: string): string | undefined => {
          /* Audit Kevin v13.1.0 : split par domaine pour cap chaque chunk < 30 KB gzip */
          /* v13.3.57 PUSH-100 : fine-grain split + isolation chunks lazy */
          /* v13.4.127 (Kevin "qualité pro 18/20" — audit Perf gap 1) :
           * apex-tools-dispatch était monolithique 118 KB. Split par sous-modules :
           * skills-dispatch (PDF/DOCX/XLSX generators), utils-finance (calculs),
           * utils-data (JSON/CSV), utils-misc (autres). Réduit chunk principal <50KB. */
          if (id.includes('apex-tools-dispatch/skills-dispatch')) return 'apex-tools-dispatch-skills';
          if (id.includes('apex-tools-dispatch/utils-finance')) return 'apex-tools-dispatch-finance';
          if (id.includes('apex-tools-dispatch/utils-data')) return 'apex-tools-dispatch-data';
          if (id.includes('apex-tools-dispatch/utils-misc')) return 'apex-tools-dispatch-misc';
          if (id.includes('apex-tools-dispatch')) return 'apex-tools-dispatch-core';
          /* v13.4.195 (audit subagent gap #2 vers 100/100) : split apex-tools-registry
           * en sous-domaines pour passer sous 100KB par chunk. */
          if (id.includes('apex-tools-registry/finance')) return 'apex-tools-registry-finance';
          if (id.includes('apex-tools-registry/skills')) return 'apex-tools-registry-skills';
          if (id.includes('apex-tools-registry/voice')) return 'apex-tools-registry-voice';
          if (id.includes('apex-tools-registry/data')) return 'apex-tools-registry-data';
          if (id.includes('apex-tools-registry')) return 'apex-tools-registry-core';
          if (id.includes('apex-tools') && !id.includes('apex-tools-dispatch') && !id.includes('apex-tools-registry')) return 'apex-tools-misc';
          if (id.includes('credential-patterns')) return 'credential-patterns';
          if (id.includes('voices-registry') || id.includes('services/voice')) return 'voice';
          if (id.includes('apex-knowledge-base')) return 'apex-kb';
          if (id.includes('sentry-bridge') || id.includes('observability')) return 'monitoring';
          /* v13.3.57 PUSH-100 : split auto-improvement en bloc lazy à la demande */
          /* v13.4.195 (audit gap #2) : split auto-improvement par sous-domaine */
          if (id.includes('auto-improvement/innovation')) return 'auto-improvement-innovation';
          if (id.includes('auto-improvement/audit')) return 'auto-improvement-audit';
          if (id.includes('auto-improvement/rules')) return 'auto-improvement-rules';
          if (id.includes('auto-improvement')) return 'auto-improvement-core';
          if (id.includes('innovation-watch')) return 'innovation-watch';
          if (id.includes('apex-plugins-marketplace')) return 'apex-plugins-marketplace';
          /* OCR offline lazy chunk (tesseract.js fallback) */
          if (id.includes('services/ocr-offline')) return 'ocr-offline';
          /* Multi-source-analyze isole : code dense (vision + OCR + extraction patterns) */
          if (id.includes('multi-source-analyze')) return 'multi-source-analyze';
          if (id.includes('node_modules')) {
            if (id.includes('dompurify')) return 'vendor-dompurify';
            if (id.includes('fuse.js')) return 'vendor-fuse';
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@services': resolve(__dirname, 'services'),
      '@modules': resolve(__dirname, 'modules'),
      '@features': resolve(__dirname, 'features'),
      '@ui': resolve(__dirname, 'ui'),
      '@workers': resolve(__dirname, 'workers'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
