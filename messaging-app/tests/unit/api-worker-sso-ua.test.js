// @vitest-environment node
/**
 * Garde — « Yann et Ludo ont un compte au domaine et n'arrivent pas à entrer dans Apex Chat » (Kevin 18.10.2026).
 * Mesuré en réel (robot parcours-invite, téléphone neuf) : POST /api/auth/sso-from-kdmc → 401 kdmc_session_invalide pour toute personne du domaine.
 * Cause : le routeur lie le pass à la famille d'appareil (8.10) ; l'appel du worker vers /__sso/whoami n'avait pas le User-Agent de la personne → refus.
 * Ici, avec le VRAI worker et un whoami qui REPRODUIT la règle du routeur (le pass n'est valable que pour la famille « iphone »), on prouve que :
 *   1. le User-Agent de la personne est transmis à whoami (et lui seul : pas de cookie, pas d'IP) ;
 *   2. sans lui (ancien comportement), l'entrée est refusée — le test discrimine ;
 *   3. une autre famille (PC Windows) avec le même pass reste refusée (la liaison à l'appareil n'est pas affaiblie).
 */
import { describe, it, expect, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const famille = (ua) => (/iPhone|iPod/.test(ua || '') ? 'iphone' : /Windows/.test(ua || '') ? 'windows' : 'autre');

/** whoami « du routeur » : le pass n'est lisible que depuis la famille qui l'a reçu (ici : iphone). */
function routeurWhoami(vus) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    if (!String(url).includes('kd-mc.com/__sso/whoami')) return new Response('{}', { status: 200 });
    const h = new Headers(init.headers || {});
    vus.push({ ua: h.get('user-agent'), cookie: h.get('cookie'), auth: !!h.get('authorization') });
    if (famille(h.get('user-agent')) !== 'iphone') return new Response(JSON.stringify({ ok: false }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, verified: false, code: true, admin: false, uid: 'invite-test', name: 'Invite Test' }), { status: 200 });
  });
}
function db() {
  const store = { u: null };
  return ENV({
    APEX_CHAT_DB: {
      prepare(sql) {
        return {
          _a: [], bind(...a) { this._a = a; return this; },
          async first() { if (/FROM users WHERE (kdmc_uid|id)=\?/.test(sql)) return store.u; return null; },
          async all() { return { results: [] }; },
          async run() { if (sql.startsWith('INSERT INTO users')) store.u = { id: this._a[0], pseudo: this._a[1], real_name: this._a[2], is_admin: 0, is_kevin_alias: 0, kdmc_uid: this._a[7], status: 'active' }; return { success: true, meta: { changes: 1 } }; },
        };
      },
      batch: vi.fn(async () => ({ success: true })),
    },
  });
}
const appel = (ua, env = db()) => worker.fetch(new Request('https://api.apex/api/auth/sso-from-kdmc', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(ua ? { 'User-Agent': ua } : {}), Cookie: 'x=1' }, body: JSON.stringify({ kdmc_token: 'pass-iphone' }) }), env);

describe('Apex Chat : l\'entrée automatique par le domaine transmet l\'appareil de la personne', () => {
  it('iPhone : le User-Agent part vers whoami, la session est ouverte (200)', async () => {
    const vus = []; routeurWhoami(vus);
    const r = await appel(UA_IPHONE);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
    expect(vus).toHaveLength(1);
    expect(vus[0].ua).toBe(UA_IPHONE);
    expect(vus[0].auth).toBe(true);
  });
  it('seul le User-Agent est transmis : ni cookie ni autre en-tête de la personne', async () => {
    const vus = []; routeurWhoami(vus);
    await appel(UA_IPHONE);
    expect(vus[0].cookie).toBeNull();
  });
  it('sans User-Agent (ancien comportement) → refus 401 : le test discrimine', async () => {
    const vus = []; routeurWhoami(vus);
    const r = await appel(null);
    expect(r.status).toBe(401);
  });
  it('le même pass présenté depuis un PC Windows reste refusé (liaison à l\'appareil intacte)', async () => {
    const vus = []; routeurWhoami(vus);
    const r = await appel(UA_WINDOWS);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('kdmc_session_invalide');
  });
});
