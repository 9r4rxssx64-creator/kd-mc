// @vitest-environment node
/**
 * F30 — PATCH /api/conversations/:id lisait le corps deux fois (readJson puis
 * request.clone().json() APRÈS l'UPDATE) → TypeError « unusable » → 500 alors
 * que le changement était déjà écrit en base. Ce test exige 200 pour un vrai
 * propriétaire et vérifie ce qui part au journal d'audit.
 *
 * Environnement NODE exprès : le Request de happy-dom laisse relire un corps
 * déjà consommé, ce qui cachait le bug ; celui de Node (undici) applique la
 * règle Fetch comme workerd en production.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

const CTX = { waitUntil() {}, passThroughOnException() {} };

function ownerEnv(calls) {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    _args: [],
    bind(...a) { this._args = a; return this; },
    first: async () => {
      if (sql.includes('FROM users')) return { status: 'active', is_banned: 0 };
      if (sql.includes('FROM conversation_members')) return { role: 'owner' };
      return null;
    },
    all: async () => ({ results: [] }),
    run: async function () { calls.push({ sql, args: this._args }); return {}; },
  }));
  return env;
}

describe('Garde : aucune route ne relit la requête', () => {
  it('api-worker.js ne contient aucun request.clone() (les tests happy-dom ne le verraient pas)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../workers/api-worker.js', import.meta.url), 'utf8');
    expect(src.match(/request\.clone\(\)/g) || []).toEqual([]);
  });
});

describe('PATCH /api/conversations/:id (F30)', () => {
  it('propriétaire → 200, UPDATE fait, champs modifiés journalisés', async () => {
    const calls = [];
    const env = ownerEnv(calls);
    const token = await makeJWT({ sub: 'u-owner', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'PATCH', path: '/api/conversations/c1', token, body: { name: 'Famille', description: 'Nous' } }),
      env,
      CTX,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });

    const upd = calls.find((c) => c.sql.startsWith('UPDATE conversations'));
    expect(upd).toBeTruthy();
    expect(upd.args).toEqual(['Famille', 'Nous', 'c1']);

    const audit = calls.find((c) => /audit/i.test(c.sql));
    expect(audit).toBeTruthy();
    const meta = audit.args.find((a) => typeof a === 'string' && a.includes('fields'));
    expect(JSON.parse(meta)).toEqual({ fields: ['name', 'description'] });
  });

  it('simple membre → 403, rien n\'est écrit', async () => {
    const calls = [];
    const env = ownerEnv(calls);
    const prep = env.APEX_CHAT_DB.prepare;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => {
      const s = prep(sql);
      if (sql.includes('FROM conversation_members')) s.first = async () => ({ role: 'member' });
      return s;
    });
    const token = await makeJWT({ sub: 'u-member', iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'PATCH', path: '/api/conversations/c1', token, body: { name: 'X' } }),
      env,
      CTX,
    );
    expect(r.status).toBe(403);
    expect(calls.find((c) => c.sql.startsWith('UPDATE conversations'))).toBeUndefined();
  });
});
