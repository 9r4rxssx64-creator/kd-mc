/**
 * APEX v13.4.163 — Sandbox Detection Helper.
 *
 * Détecte si on tourne dans un sandbox restreint (Claude Code, CI sans réseau,
 * Docker isolé) qui bloque les downloads externes (Playwright Chromium,
 * npm registry mirror, etc).
 *
 * Usage Playwright :
 *   import { isSandboxRestricted } from './tests/_sandbox-skip.js';
 *   test.skip(isSandboxRestricted(), 'Browser tests require CI');
 *
 * Usage runtime :
 *   if (isSandboxRestricted()) { return useLocalFallback(); }
 */

/**
 * Détecte si downloads externes sont bloqués par sandbox.
 * Heuristique multi-signal :
 *   1. Env var CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = sandbox actif
 *   2. CI=true sans CHROMIUM_PATH = pas de browser pré-installé
 *   3. Présence Playwright browsers installés (cached)
 */
export function isSandboxRestricted(): boolean {
  /* Signal 1 : Claude Code sandbox (host blocks external) */
  if (process.env['CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST'] === '1') {
    return true;
  }
  /* Signal 2 : variable explicite */
  if (process.env['SANDBOX_NO_DOWNLOAD'] === '1') {
    return true;
  }
  /* Signal 3 : CI mais browsers absents */
  return false;
}

/**
 * Détecte si on est dans un environnement CI qui peut downloads
 * (GitHub Actions, GitLab CI, etc — ils ont accès réseau libre).
 */
export function isCIWithDownloads(): boolean {
  return Boolean(process.env['CI']) && !isSandboxRestricted();
}

/**
 * Skip helper pour tests E2E Playwright.
 * Retourne `true` si le test doit être skippé (browser non dispo).
 */
export function shouldSkipBrowserTests(): boolean {
  if (isSandboxRestricted()) return true;
  /* Pas en CI ET browser pas installé → skip */
  if (!process.env['CI']) {
    /* Heuristique : check if playwright cache exists */
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const path = require('node:path') as typeof import('node:path');
      const cacheBase = process.env['PLAYWRIGHT_BROWSERS_PATH']
        ?? path.join(process.env['HOME'] ?? '/root', '.cache', 'ms-playwright');
      return !fs.existsSync(cacheBase);
    } catch {
      return true; /* skip safe */
    }
  }
  return false;
}
