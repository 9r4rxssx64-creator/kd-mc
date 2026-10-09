// @vitest-environment node
/**
 * Revue 08.10.2026 — F1 (P1) : après « supprimer mon compte », la connexion SSO
 * (kd-mc.com ou Apex) retrouvait / ressuscitait la ligne status='deleted'
 * (ON CONFLICT(id) DO UPDATE) → jeton émis → getAuthUser le refuse → 401 permanent.
 * DELETE /api/users/me ne coupait pas non plus les liens apex_uid / kdmc_uid.
 *
 * Prouvé sur le VRAI schéma : suppression → liens SSO à NULL → nouvelle connexion
 * SSO = compte NEUF utilisable (200 sur /api/users/me), la ligne supprimée reste morte.
 * Sabotage : remettre le SELECT/upsert sans filtre « deleted » → 401 au lieu de 200.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

function seed(db, id, pseudo, phone, extra = {}) {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,last_seen,identity_key_pub,pq_key_pub,prekey_signed,status,apex_uid,kdmc_uid)
    VALUES (?,?,?,?,?,1,1,'k','k','k','active',?,?)`).run(id, pseudo, 'Nom ' + pseudo, phone, 'h_' + id, extra.apex_uid || null, extra.kdmc_uid || null);
}

async function supprimer(env, id) {
  const tok = await makeJWT({ sub: id, iat: Math.floor(Date.now() / 1000) - 5 });
  const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: { confirm: 'SUPPRIMER' }, token: tok }), env, CTX);
  expect(r.status).toBe(200);
}

const me = (env, tok) => worker.fetch(makeRequest({ path: '/api/users/me', token: tok }), env, CTX);

describe('F1 — SSO après suppression de compte', () => {
  it('kd-mc.com : liens coupés à la suppression, puis SSO = compte neuf utilisable', async () => {
    const DB = d1Reel();
    seed(DB, 'kdmc_durand', 'durandm', 'PENDING_SSO', { apex_uid: 'kdmc_durand', kdmc_uid: 'durand' });
    const env = ENV({ APEX_CHAT_DB: DB });
    await supprimer(env, 'kdmc_durand');
    const mort = DB.raw.prepare('SELECT status, apex_uid, kdmc_uid FROM users WHERE id=?').get('kdmc_durand');
    expect(mort.status).toBe('deleted');
    expect(mort.apex_uid).toBeNull();
    expect(mort.kdmc_uid).toBeNull();

    globalThis.fetch = vi.fn(async (url) => String(url).includes('kd-mc.com/__sso/whoami')
      ? new Response(JSON.stringify({ ok: true, verified: true, uid: 'durand', name: 'DURAND M', admin: false }))
      : new Response('{}'));
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 't' } }), env, CTX);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.user.status).toBe('active');
    expect(j.user.id).not.toBe('kdmc_durand');           // la ligne morte n'est pas ressuscitée
    expect((await me(env, j.token)).status).toBe(200);   // et la session OBTENUE marche
    expect(DB.raw.prepare('SELECT status FROM users WHERE id=?').get('kdmc_durand').status).toBe('deleted');
  });

  it('Apex : même garantie (apex_uid libéré, compte neuf, session valable)', async () => {
    const DB = d1Reel();
    seed(DB, 'apx_marie', 'mariet', '+33622222222', { apex_uid: 'apx_marie' });
    const KEY = 'apex-sso-key';
    const env = ENV({ APEX_CHAT_DB: DB, APEX_SSO_SIGN_KEY: KEY });
    await supprimer(env, 'apx_marie');
    const now = Math.floor(Date.now() / 1000);
    const apexTok = await makeJWT({ sub: 'apx_marie', iat: now, exp: now + 200 }, KEY);
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-apex',
      body: { apex_token: apexTok, apex_uid: 'apx_marie', name: 'MARIE T' } }), env, CTX);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.user.status).toBe('active');
    expect(j.user.id).not.toBe('apx_marie');
    expect((await me(env, j.token)).status).toBe(200);
  });
});
