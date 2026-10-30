/**
 * 30.10.2026 (pont 1481) : la télémétrie vers Firebase reçoit 401 (règles `auth != null`) à chaque ouverture.
 * Au premier 401/403, on se tait 24 h et on le mémorise : plus de ligne rouge, plus de requêtes pour rien.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
const i = src.indexOf('K._telemetryGate = {');
const j = src.indexOf('function _runSentinels');
const bloc = src.slice(i, j);

function banc(statut, memo = {}) {
  let appels = 0;
  const fn = new Function('K', 'lg', 'ls', 'fetch', 'FIREBASE_URL', '__APEX_CHAT_VERSION__', 'navigator',
    bloc + '; return { gate: K._telemetryGate, envoyer: _escalateToApex };');
  const K = { user: { id: 'u1' } };
  const r = fn(K, (k, d) => (k in memo ? memo[k] : d), (k, v) => { memo[k] = v; }, async () => { appels++; return { ok: statut < 400, status: statut }; },
    'https://x.example', 'v-test', { onLine: true });
  return { ...r, memo, appels: () => appels };
}

describe('télémétrie : silence après 401/403', () => {
  it('un 401 → pause de 24 h mémorisée, le 2e envoi ne part pas', async () => {
    const b = banc(401);
    await b.envoyer('err', 's', {});
    expect(b.appels()).toBe(1);
    expect(b.memo.telemetry_off_until).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    await b.envoyer('err', 's', {});
    expect(b.appels()).toBe(1);
  });
  it('une pause mémorisée à l\'ouverture suivante → aucun envoi', async () => {
    const b = banc(401, { telemetry_off_until: Date.now() + 3600 * 1000 });
    await b.envoyer('err', 's', {});
    expect(b.appels()).toBe(0);
  });
  it('un succès (200) n\'active aucune pause', async () => {
    const b = banc(200);
    await b.envoyer('err', 's', {});
    expect(b.memo.telemetry_off_until).toBeUndefined();
    await b.envoyer('err', 's', {});
    expect(b.appels()).toBe(2);
  });
});
