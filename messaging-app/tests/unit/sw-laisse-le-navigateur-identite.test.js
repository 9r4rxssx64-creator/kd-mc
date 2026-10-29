/**
 * Tâche 60 (24.10.2026) : le service worker ne relaie PAS les appels d'identité du domaine (/__sso/…) — le navigateur les fait lui-même,
 * sinon un agent différent (SW ≠ page) fait refuser le laissez-passer lié à l'appareil.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as sw from '../../lib/sw-handlers.js';

const racine = join(import.meta.dirname, '..', '..');
const O = 'https://chat.kd-mc.com';

describe('laisserLeNavigateur', () => {
  it('même origine + /__… → oui (GET et POST, whoami, pass, entrer)', () => {
    for (const p of ['/__sso/whoami', '/__sso/pass', '/__sso/entrer', '/__demande/x']) expect(sw.laisserLeNavigateur({ url: O + p + '?a=1' }, O)).toBe(true);
  });
  it('le reste continue de passer par le service worker : pages, API, fichiers, autre origine', () => {
    for (const u of [O + '/', O + '/index.html', O + '/api/health', O + '/lib/x.js', 'https://autre.exemple/__sso/whoami', O + '/a/__sso/whoami', 'pas une url']) expect(sw.laisserLeNavigateur({ url: u }, O)).toBe(false);
  });
});

describe('laisserLeNavigateur : entrée par le domaine (29.10.2026)', () => {
  it('POST /api/auth/sso-from-kdmc (même origine) → oui, mais pas les autres routes /api/auth', () => {
    expect(sw.laisserLeNavigateur({ url: O + '/api/auth/sso-from-kdmc' }, O)).toBe(true);
    for (const p of ['/api/auth/login', '/api/auth/sso-from-kdmc/x', '/api/auth/sso-apex']) expect(sw.laisserLeNavigateur({ url: O + p }, O)).toBe(false);
    expect(sw.laisserLeNavigateur({ url: 'https://autre.exemple/api/auth/sso-from-kdmc' }, O)).toBe(false);
  });
});

describe('sw.js branche la règle AVANT respondWith', () => {
  it('le gestionnaire fetch rend la main d’abord', () => {
    const src = readFileSync(join(racine, 'sw.js'), 'utf8');
    const i = src.indexOf("addEventListener('fetch'");
    const bloc = src.slice(i, src.indexOf('});', i));
    expect(bloc.indexOf('laisserLeNavigateur')).toBeGreaterThan(-1);
    expect(bloc.indexOf('laisserLeNavigateur')).toBeLessThan(bloc.indexOf('respondWith'));
  });
});
