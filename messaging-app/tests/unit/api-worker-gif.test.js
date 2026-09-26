/**
 * Tests api-worker.js — /api/gif (proxy Giphy).
 * Garanties : auth requise ; la clé GIPHY_KEY reste SERVEUR (jamais renvoyée) ;
 * FAIL-OPEN (sans clé → disabled ; erreur réseau/HTTP → results:[] en 200) ;
 * mapping correct des résultats Giphy → forme app.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); });

function dbActive() {
  return {
    prepare: vi.fn((sql) => ({
      bind() { return this; },
      async first() {
        if (sql.includes('last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active' };
        return null;
      },
      async run() { return { success: true }; },
      async all() { return { results: [] }; },
    })),
  };
}
async function tok() { return makeJWT({ sub: 'kevin', iat: Math.floor(Date.now() / 1000) }); }
function gifReq(token, q) {
  const url = 'https://api.apex/api/gif' + (q !== undefined ? '?q=' + encodeURIComponent(q) : '');
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  return new Request(url, { method: 'GET', headers });
}

describe('/api/gif — proxy Giphy', () => {
  it('401 sans authentification', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive(), GIPHY_KEY: 'K' });
    const r = await worker.fetch(gifReq(null), env, {});
    expect(r.status).toBe(401);
  });

  it('sans clé → disabled (fail-open), pas de fetch', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive() }); // pas de GIPHY_KEY
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await worker.fetch(gifReq(await tok()), env, {});
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled(); // aucune requête sortante sans clé
  });

  it('recherche : mappe les résultats Giphy + n’expose jamais la clé', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive(), GIPHY_KEY: 'SECRET_KEY' });
    let calledUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      calledUrl = String(u);
      return new Response(JSON.stringify({ data: [
        { id: 'g1', title: 'Bonjour', images: { fixed_width_small: { url: 'https://g/s.gif' }, downsized_medium: { url: 'https://g/m.gif' } } },
        { id: 'g2', images: {} }, // ignoré (pas d’URL)
      ] }), { status: 200 });
    });
    const r = await worker.fetch(gifReq(await tok(), 'bonjour'), env, {});
    const body = await r.json();
    expect(calledUrl).toContain('/search?');
    expect(calledUrl).toContain('q=bonjour');
    expect(calledUrl).toContain('SECRET_KEY'); // clé dans l’appel SERVEUR…
    expect(JSON.stringify(body)).not.toContain('SECRET_KEY'); // …jamais dans la réponse client
    expect(body.results).toEqual([
      { id: 'g1', title: 'Bonjour', preview: 'https://g/s.gif', full: 'https://g/m.gif', mime: 'image/gif' },
    ]);
    expect(body.disabled).toBe(false);
  });

  it('sans q → trending', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive(), GIPHY_KEY: 'K' });
    let calledUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      calledUrl = String(u);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const r = await worker.fetch(gifReq(await tok()), env, {});
    expect(calledUrl).toContain('/trending?');
    expect((await r.json()).results).toEqual([]);
  });

  it('Giphy répond non-ok → results:[] en 200 (fail-open)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive(), GIPHY_KEY: 'K' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 502 }));
    const r = await worker.fetch(gifReq(await tok(), 'x'), env, {});
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.error).toBe('giphy_http_502');
  });

  it('fetch jette → results:[] + diagnostic (fail-open)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive(), GIPHY_KEY: 'K' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau KO'));
    const r = await worker.fetch(gifReq(await tok(), 'x'), env, {});
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.error).toBe('giphy_fetch_failed');
    expect(body.detail).toContain('réseau KO');
  });
});
