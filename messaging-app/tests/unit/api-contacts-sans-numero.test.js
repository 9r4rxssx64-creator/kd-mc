// @vitest-environment node
/**
 * Revue 08.10.2026 — GET /api/contacts renvoyait le numéro de téléphone de
 * chaque pair (et celui de Kevin) à n'importe quel membre. Le numéro n'est
 * plus montré qu'à l'admin, comme sur la fiche /api/contact/:id.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

const PROFILS = {
  kdmc_admin: { id: 'kdmc_admin', pseudo: 'kevin', phone: '+33600000001', status: 'active', last_seen: 9 },
  u_peer: { id: 'u_peer', pseudo: 'peer', phone: '+33600000002', status: 'active', last_seen: 5 },
};

function env(adminIds) {
  const E = ENV();
  E.APEX_CHAT_DB = {
    prepare(sql) {
      return {
        _a: [], bind(...a) { this._a = a; return this; },
        async first() {
          if (sql.includes('SELECT last_force_logout_at')) return { status: 'active', is_banned: 0, is_admin: adminIds.includes(this._a[0]) ? 1 : 0 };
          if (sql.includes('avatar_url, last_seen, status, merged_into, source')) return { ...PROFILS[this._a[0]] };
          return null;
        },
        async all() {
          if (sql.includes('SELECT DISTINCT m2.user_id')) return { results: [{ uid: 'u_peer' }] };
          if (sql.includes('SELECT id FROM users WHERE')) return { results: [{ id: 'u_peer' }, { id: 'kdmc_admin' }] };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
  return E;
}

const IAT = () => Math.floor(Date.now() / 1000);

describe('GET /api/contacts — numéros de téléphone', () => {
  it('membre ordinaire : AUCUN numéro (ni du pair, ni de Kevin)', async () => {
    const tok = await makeJWT({ sub: 'u_me', iat: IAT() });
    const j = await (await worker.fetch(makeRequest({ path: '/api/contacts', token: tok }), env([]), { waitUntil() {} })).json();
    expect(j.users.length).toBeGreaterThan(0);
    for (const u of j.users) expect(u.phone).toBeUndefined();
  });

  it('admin : voit les numéros', async () => {
    const tok = await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: IAT() });
    const j = await (await worker.fetch(makeRequest({ path: '/api/contacts', token: tok }), env(['kdmc_admin']), { waitUntil() {} })).json();
    expect(j.users.some((u) => u.phone)).toBe(true);
  });

  it('un jeton qui SE DIT admin, mais pas admin en base, ne voit rien', async () => {
    const tok = await makeJWT({ sub: 'u_me', is_admin: true, iat: IAT() });
    const j = await (await worker.fetch(makeRequest({ path: '/api/contacts', token: tok }), env([]), { waitUntil() {} })).json();
    for (const u of j.users) expect(u.phone).toBeUndefined();
  });
});
