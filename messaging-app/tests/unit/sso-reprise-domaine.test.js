// @vitest-environment node
/**
 * Une entrée sur trois refusée sans raison (robot « toutes les fonctions », 21.10.2026) : le worker interroge le domaine (/__sso/whoami) ; un raté ponctuel de transport
 * (coupure, 5xx, 429) valait « session invalide ». Une nouvelle tentative, SEULEMENT sur un raté de transport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const ok = () => new Response(JSON.stringify({ ok: true, verified: false, code: true, admin: false, uid: 'marie-dupont', name: 'Marie Dupont' }));
const sso = (env) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 'jeton' } }), env, CTX);
beforeEach(() => { vi.restoreAllMocks(); });

describe('sso-from-kdmc : un raté ponctuel du domaine ne refuse pas la personne', () => {
  it('coupure réseau puis réponse : entrée acceptée (2 appels)', async () => {
    let n = 0; globalThis.fetch = vi.fn(async () => { if (++n === 1) throw new Error('réseau'); return ok(); });
    const r = await sso(ENV({ APEX_CHAT_DB: d1Reel() }));
    expect(r.status).toBe(200); expect(n).toBe(2);
  });
  it('erreur 503 puis réponse : entrée acceptée', async () => {
    let n = 0; globalThis.fetch = vi.fn(async () => (++n === 1 ? new Response('x', { status: 503 }) : ok()));
    expect((await sso(ENV({ APEX_CHAT_DB: d1Reel() }))).status).toBe(200); expect(n).toBe(2);
  });
  it('panne durable : refus après deux essais seulement (pas de boucle)', async () => {
    let n = 0; globalThis.fetch = vi.fn(async () => { n++; throw new Error('réseau'); });
    expect((await sso(ENV({ APEX_CHAT_DB: d1Reel() }))).status).toBe(401); expect(n).toBe(2);
  });
  it('le domaine répond clairement « non » (200, ok:false) : refus tout de suite, sans nouvel essai', async () => {
    let n = 0; globalThis.fetch = vi.fn(async () => { n++; return new Response(JSON.stringify({ ok: false })); });
    const r = await sso(ENV({ APEX_CHAT_DB: d1Reel() }));
    expect(r.status).toBe(401); expect(n).toBe(1);
  });
  it('401 du domaine (pass refusé) : refus tout de suite, sans nouvel essai', async () => {
    let n = 0; globalThis.fetch = vi.fn(async () => { n++; return new Response('{}', { status: 401 }); });
    expect((await sso(ENV({ APEX_CHAT_DB: d1Reel() }))).status).toBe(401); expect(n).toBe(1);
  });
});
