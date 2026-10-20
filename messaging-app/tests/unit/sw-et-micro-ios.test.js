/**
 * Mesuré sur l'iPhone de Kevin (20.10.2026, diagnostic) : « SW actif : Non », aucun cache, push « Erreur », micro « InvalidStateError — AudioSession category is not
 * compatible with audio capture ». Causes : (1) le routeur refusait l'import du module du service worker (garde au routeur : sw-module-libre.test.mjs) ;
 * (2) l'échec d'enregistrement était avalé (`.catch(_=>{})`) ; (3) aucune remise de la session audio en « lecture + enregistrement » avant le micro.
 * Le test exécute le VRAI code extrait d'index.html et de diag.html.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readIndex, extractDef } from './client-extract.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readIndex();
const diag = readFileSync(join(racine, 'diag.html'), 'utf8');

function bloc(source) {
  const i = source.indexOf('(function(){\n  try{\n    var md = navigator.mediaDevices;');
  const j = i >= 0 ? i : source.indexOf('(function(){ try{ var md = navigator.mediaDevices;');
  expect(j).toBeGreaterThanOrEqual(0);
  return source.slice(j, source.indexOf('})();', j) + 5);
}
function monter(source, { audioSession = { type: 'playback' } } = {}) {
  const appels = [];
  const md = { getUserMedia: async (c) => { appels.push({ c, type: audioSession && audioSession.type }); return {}; } };
  const nav = { mediaDevices: md, audioSession };
  // eslint-disable-next-line no-new-func
  new Function('navigator', 'console', bloc(source))(nav, { warn() {} });
  return { md, appels, audioSession };
}

describe.each([['index.html', html], ['diag.html', diag]])('micro iOS — %s', (_n, source) => {
  it('remet la session audio en « play-and-record » AVANT le micro', async () => {
    const { md, appels } = monter(source);
    await md.getUserMedia({ audio: true });
    expect(appels[0].type).toBe('play-and-record');
  });
  it('ne touche pas la session audio pour la caméra seule', async () => {
    const { md, appels } = monter(source);
    await md.getUserMedia({ video: true });
    expect(appels[0].type).toBe('playback');
  });
  it('sans navigator.audioSession (Chrome, anciens iPhone) : la demande passe quand même', async () => {
    const { md, appels } = monter(source, { audioSession: undefined });
    await md.getUserMedia({ audio: true });
    expect(appels.length).toBe(1);
  });
});

describe('service worker — l\'échec n\'est plus avalé', () => {
  it('index.html garde l\'erreur (apex_sw_error) et retente une fois', () => {
    expect(html).toContain("localStorage.setItem('apex_sw_error'");
    expect(html).toMatch(/essai < 2/);
    // l'ancien enregistrement « register(...).then(...).catch(_=>{}) » ne doit plus exister
    expect(html).not.toMatch(/\.register\('\.\/sw\.js[^\n]*\)\.then\(reg=>\{/);
    expect(html).toContain('_apexRegisterSw(1).then(reg=>{');
  });
  it('le diagnostic « mise à jour » donne la raison quand le SW n\'est pas actif', () => {
    expect(html).toMatch(/Raison : \$\{esc\(window\._apexSwError/);
  });
  it('le routeur n\'est pas la seule garde : sw.js n\'importe que lib/sw-handlers.js (rien d\'autre à ouvrir)', () => {
    const sw = readFileSync(join(racine, 'sw.js'), 'utf8');
    const imports = [...sw.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['./lib/sw-handlers.js']);
  });
});
