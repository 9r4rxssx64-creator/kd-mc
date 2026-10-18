// @vitest-environment node
/**
 * Garde — « Yann et Ludo ont un compte au domaine et n'arrivent pas à entrer dans Apex Chat » (Kevin 18.10.2026).
 * Mesuré en réel (robot parcours-invite) : POST /api/auth/sso-from-kdmc → 500 kdmc_create_failed. Cause : `users.phone` est UNIQUE et chaque compte créé par le domaine
 * recevait le même texte « PENDING_SSO » : une seule personne pouvait exister, la 2e échouait. Prouvé sur le VRAI schéma SQLite (toutes les migrations).
 *   1. deux personnes différentes du domaine entrent, chacune avec son compte et son repère de téléphone ;
 *   2. la même personne qui revient retrouve SON compte (pas de doublon) ;
 *   3. le même cas par le circuit Apex (sso-from-apex) pour deux comptes sans numéro ;
 *   4. un compte d'avant (repère historique « PENDING_SSO ») n'empêche plus personne d'entrer.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleSsoFromKdmc, handleSsoFromApex, signJWT } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
function domaine(personnes) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const tok = new Headers(init.headers || {}).get('authorization') || '';
    const p = personnes[tok.replace('Bearer ', '')];
    return new Response(JSON.stringify(p ? { ok: true, verified: false, code: true, admin: false, ...p } : { ok: false }), { status: 200 });
  });
}
const entrer = (env, tok) => handleSsoFromKdmc(new Request('https://api.apex/api/auth/sso-from-kdmc', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ kdmc_token: tok }) }), env);
const PERSONNES = { t1: { uid: 'yann-test', name: 'Yann Test' }, t2: { uid: 'ludo-test', name: 'Ludo Test' }, t3: { uid: 'marie-test', name: 'Marie Test' } };

describe('deux personnes du domaine entrent dans Apex Chat', () => {
  it('chacune a son compte, avec un repère de téléphone qui lui est propre', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); domaine(PERSONNES);
    const a = await entrer(env, 't1'); const b = await entrer(env, 't2'); const c = await entrer(env, 't3');
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    const tels = DB.raw.prepare("SELECT phone FROM users WHERE kdmc_uid IN ('yann-test','ludo-test','marie-test') ORDER BY created_at, id").all().map((r) => r.phone);
    expect(tels).toHaveLength(3);
    expect(new Set(tels).size).toBe(3);
    expect(tels.every((t) => /^PENDING_SSO_/.test(t))).toBe(true);
  });
  it('la même personne qui revient retrouve son compte (aucun doublon)', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); domaine(PERSONNES);
    const a1 = await (await entrer(env, 't1')).json(); const a2 = await (await entrer(env, 't1')).json();
    expect(a1.user.id).toBe(a2.user.id);
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM users WHERE kdmc_uid='yann-test'").get().c).toBe(1);
  });
  it('un compte d\'avant (repère historique « PENDING_SSO ») n\'empêche plus personne d\'entrer', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); domaine(PERSONNES);
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,source,is_admin)
      VALUES ('kdmc_ancien','ancien','Ancien Compte','PENDING_SSO','PENDING_SSO',1,'k','k','k','active','kdmc-sso',0)`).run();
    expect((await entrer(env, 't1')).status).toBe(200);
    expect((await entrer(env, 't2')).status).toBe(200);
  });
  it('circuit Apex (sso-from-apex) : deux comptes sans numéro entrent aussi', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB, APEX_SSO_SIGN_KEY: 'cle-de-test-sso-0123456789abcdef' });
    const now = Math.floor(Date.now() / 1000);
    const via = async (uid, nom) => handleSsoFromApex(new Request('https://x/api/auth/sso-apex', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apex_token: await signJWT({ sub: uid, iat: now, exp: now + 120 }, env.APEX_SSO_SIGN_KEY), apex_uid: uid, name: nom }) }), env);
    expect((await via('apex_a', 'Anne Test')).status).toBe(200);
    expect((await via('apex_b', 'Boris Test')).status).toBe(200);
    const tels = DB.raw.prepare("SELECT phone FROM users WHERE apex_uid IN ('apex_a','apex_b')").all().map((r) => r.phone);
    expect(new Set(tels).size).toBe(2);
  });
});
