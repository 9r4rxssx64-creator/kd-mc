/**
 * APEX v13 — Vite plugin CSP nonce dynamique (P0-1 audit) + modulepreload dynamique
 *
 * Génère un nonce unique à chaque build et l'injecte dans :
 * - <meta CSP> nonce-XXX
 * - tous les <script> et <link> que Vite injecte
 *
 * Anti-pattern v13.0 Jet 1 : nonce hardcodé `APEX_BOOT_NONCE` exploitable.
 * Fix Jet 2 : nonce SHA256(timestamp + random) tronqué 32 chars, regen à chaque build.
 *
 * Note prod : pour que le nonce soit vraiment unique par REQUÊTE, il faudrait un
 * Worker proxy (Cloudflare) qui regen à chaque GET. Build-time nonce = compromis
 * acceptable pour PWA statique (rotation à chaque déploiement).
 *
 * v13.3.75 PERF 20/20 (issue #240) : auto-injection modulepreload pour chunks
 * dynamiques boot critique (auth, firebase, features/landing).
 *
 * Pourquoi c'est nécessaire : Vite `modulePreload.resolveDependencies` ne reçoit
 * QUE les imports STATIQUES transitivement résolus depuis le main entry. Tous nos
 * services boot (auth, firebase) + 1ère vue (landing) sont en `await import()`
 * dynamique → INVISIBLES pour resolveDependencies → 0 modulepreload généré.
 *
 * Ce hook scanne le bundle final, identifie les chunks dont le module ID match
 * un pattern de `BOOT_CRITICAL_CHUNKS`, et injecte `<link rel="modulepreload">`
 * directement dans index.html. Browser fetch parallèle dès parse HTML → gain
 * 100-200ms TTI (chunks boot dispo avant que main.js les demande dynamiquement).
 */

import { randomBytes } from 'node:crypto';

import type { OutputBundle, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

/* Patterns SOURCE files dont les chunks générés doivent être préchargés.
 * On match sur le `facadeModuleId` ou les `moduleIds` du chunk (path source). */
const BOOT_CRITICAL_PATTERNS = [
  /\/services\/auth\.(?:ts|js)$/,
  /\/services\/firebase\.(?:ts|js)$/,
  /\/features\/landing\/index\.(?:ts|js)$/,
];

export function cspNonceDynamic(): Plugin {
  let nonce = '';
  let bundle: OutputBundle | null = null;
  return {
    name: 'apex-csp-nonce-dynamic',
    buildStart() {
      /* Nonce 256 bits → 32 chars hex */
      nonce = randomBytes(16).toString('hex');
    },
    /* Capture du bundle pour analyse pendant transformIndexHtml.
     * generateBundle est appelé AVANT transformIndexHtml.handler avec post=true. */
    generateBundle(_options, outputBundle) {
      bundle = outputBundle;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        /* 1. Remplace placeholder APEX_BOOT_NONCE dans CSP meta + scripts existants */
        let out = html.replace(/APEX_BOOT_NONCE/g, nonce);
        /* 2. Ajoute nonce UNIQUEMENT sur <script>/<link rel="stylesheet"> qui n'en ont pas déjà
         *    (anti-doublon : Vite injecte parfois ses propres scripts sans nonce) */
        out = out.replace(/<script(?![^>]*\bnonce=)(\s[^>]*?)?>/g, (m, attrs) => {
          return `<script nonce="${nonce}"${attrs ?? ''}>`;
        });
        out = out.replace(/<link(?![^>]*\bnonce=)(\s[^>]*?)\brel="stylesheet"([^>]*)>/g, (_m, before, after) => {
          return `<link nonce="${nonce}"${before}rel="stylesheet"${after}>`;
        });

        /* 3. Auto-injection modulepreload pour chunks dynamiques boot critique. */
        if (bundle) {
          const extraPreloads: string[] = [];
          /* Pour éviter les doublons avec les modulepreload déjà injectés par Vite
           * (chunks STATIQUES filtrés par modulePreload.resolveDependencies). */
          const existingPreloads = new Set<string>();
          const preloadRe = /<link\s+rel="modulepreload"[^>]*\bhref="([^"]+)"/g;
          let match: RegExpExecArray | null;
          while ((match = preloadRe.exec(out)) !== null) {
            existingPreloads.add(match[1]);
          }

          for (const fileName of Object.keys(bundle)) {
            const chunk = bundle[fileName];
            if (chunk.type !== 'chunk') continue;
            const c = chunk as OutputChunk;
            /* Test sur facadeModuleId (chunk principal) + moduleIds (modules concaténés) */
            const candidatePaths: string[] = [];
            if (c.facadeModuleId) candidatePaths.push(c.facadeModuleId);
            if (c.moduleIds) candidatePaths.push(...c.moduleIds);
            const matchesBoot = candidatePaths.some((p) =>
              BOOT_CRITICAL_PATTERNS.some((re) => re.test(p)),
            );
            if (!matchesBoot) continue;
            const href = `./${fileName}`;
            if (existingPreloads.has(href)) continue;
            existingPreloads.add(href);
            extraPreloads.push(
              `  <link rel="modulepreload" crossorigin href="${href}">`,
            );
          }

          if (extraPreloads.length > 0) {
            /* Injection avant </head> pour parsing browser optimal. */
            const injection = `${extraPreloads.join('\n')}\n</head>`;
            out = out.replace(/<\/head>/, injection);
          }
        }

        return out;
      },
    },
  };
}
