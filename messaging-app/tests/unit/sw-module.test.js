// Garde SW (audit 17/09/2026, P0 mesuré en vrai navigateur).
//
// Avant : sw.js (classique) faisait `await import('./lib/sw-handlers.js')` — interdit par la
// spécification dans un Service Worker → repli « minimal » = zéro cache, zéro hors-ligne,
// aucune notification affichée. Les tests unitaires des handlers passaient au vert sur du
// code qui ne tournait jamais en production. Ce garde fige le montage réel :
//   1. sw.js est un module qui importe les handlers STATIQUEMENT (0 import() dynamique) ;
//   2. index.html l'enregistre avec {type:'module'} ;
//   3. CACHE_VERSION des handlers = version de package.json = __APEX_CHAT_VERSION__ (sinon le
//      client verrait un bandeau « mise à jour » permanent à chaque activation).
// Prouvé discriminant : remettre `import(` dans sw.js → 1 échec ; retirer type:'module' → 1 échec ;
// CACHE_VERSION à v1.1.285 → 1 échec.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CACHE_VERSION } from '../../lib/sw-handlers.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// commentaires retirés : le garde juge le CODE, pas la prose qui raconte l'ancien bug
const sw = readFileSync(join(APP, 'sw.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const html = readFileSync(join(APP, 'index.html'), 'utf8');
const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));

describe('Service Worker — montage réel (module, versions alignées)', () => {
  it('sw.js importe les handlers statiquement, sans import() dynamique ni importScripts', () => {
    expect(sw).toMatch(/^import \* as handlers from '\.\/lib\/sw-handlers\.js';/m);
    expect(sw).not.toMatch(/\bimport\s*\(/);
    expect(sw).not.toMatch(/importScripts/);
  });

  it("index.html enregistre le SW en module (sinon l'import statique est refusé)", () => {
    const m = html.match(/serviceWorker\.register\([^)]*\{[^}]*\}\)/);
    expect(m, 'appel register introuvable').toBeTruthy();
    expect(m[0]).toMatch(/type\s*:\s*'module'/);
  });

  it('CACHE_VERSION = apex-chat-v<package.json> = __APEX_CHAT_VERSION__', () => {
    const v = html.match(/__APEX_CHAT_VERSION__\s*=\s*'v([\d.]+)'/)[1];
    expect(CACHE_VERSION).toBe('apex-chat-v' + pkg.version);
    expect(v).toBe(pkg.version);
  });

  it('les 7 événements du SW sont branchés sur les handlers', () => {
    for (const ev of ['install', 'activate', 'fetch', 'push', 'notificationclick', 'message', 'periodicsync']) {
      expect(sw, ev).toContain(`addEventListener('${ev}'`);
    }
    expect(sw).toContain('handlers.handlePush(event, deps)');
  });
});
