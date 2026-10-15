// @vitest-environment node
/**
 * Audit 15.10.2026 — P0 : un compte du domaine dont l'uid vaut « admin » donnait l'id interne 'kdmc_admin'
 * (la ligne admin seedée) ; l'upsert retombait dessus et le jeton sortait is_admin:true. Même classe sur le
 * SSO Apex. Vrai SQLite aux vraies migrations (la ligne kdmc_admin y est seedée is_admin=1).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const ligne = (DB, id) => DB.raw.prepare('SELECT id, kdmc_uid, apex_uid, is_admin FROM users WHERE id=?').get(id);
const domaine = (who) => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, ...who }))); };
const ssoKdmc = (env) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 'jeton' } }), env, CTX);
beforeEach(() => { vi.restoreAllMocks(); });

describe('SSO domaine : une collision d\'identifiant ne donne jamais le compte admin', () => {
  it('uid « admin », Face ID sur SON appareil, domaine NON admin → compte neuf non admin ; la ligne admin intacte', async () => {
    const DB = d1Reel();
    const avant = ligne(DB, 'kdmc_admin');
    expect(avant.is_admin).toBe(1);
    domaine({ uid: 'admin', name: 'Faux Admin', verified: true, code: false, admin: false });
    const env = ENV({ APEX_CHAT_DB: DB });
    const r = await ssoKdmc(env);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.user.id).not.toBe('kdmc_admin');
    expect(j.user.id).toMatch(/^kdmc_admin_[a-z0-9]{6}$/);
    expect(j.user.is_admin).toBe(0);
    expect(ligne(DB, 'kdmc_admin')).toEqual(avant);                       // ni reprise, ni kdmc_uid écrasé
    const adm = await worker.fetch(makeRequest({ path: '/api/admin/all-users', token: j.token }), env, CTX);
    expect(adm.status).toBe(403);
  });

  it('variante « code prouvé » : la ligne admin n\'est pas touchée non plus', async () => {
    const DB = d1Reel();
    const avant = ligne(DB, 'kdmc_admin');
    domaine({ uid: 'admin', name: 'Faux Admin', verified: false, code: true, admin: false });
    await ssoKdmc(ENV({ APEX_CHAT_DB: DB }));
    expect(ligne(DB, 'kdmc_admin')).toEqual(avant);
  });

  it('une ligne admin déjà liée à cet uid, mais domaine NON admin → 403, aucun jeton', async () => {
    const DB = d1Reel();
    DB.raw.prepare("UPDATE users SET kdmc_uid='quelquun' WHERE id='kdmc_admin'").run();
    domaine({ uid: 'quelquun', name: 'X', verified: true, code: false, admin: false });
    const r = await ssoKdmc(ENV({ APEX_CHAT_DB: DB }));
    expect(r.status).toBe(403);
    expect((await r.json()).token).toBeUndefined();
  });

  it('cas légitime : Kevin (domaine admin + Face ID) ouvre bien son compte admin', async () => {
    const DB = d1Reel();
    DB.raw.prepare("UPDATE users SET kdmc_uid='kevin-desarzens' WHERE id='kdmc_admin'").run();
    domaine({ uid: 'kevin-desarzens', name: 'Kevin', verified: true, code: false, admin: true });
    const env = ENV({ APEX_CHAT_DB: DB });
    const r = await ssoKdmc(env);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.user.id).toBe('kdmc_admin');
    const adm = await worker.fetch(makeRequest({ path: '/api/admin/all-users', token: j.token }), env, CTX);
    expect(adm.status).toBe(200);
  });

  it('cas légitime : une personne normale garde son compte d\'une connexion à l\'autre', async () => {
    const DB = d1Reel();
    domaine({ uid: 'marie', name: 'Marie Dupont', verified: false, code: true, admin: false });
    const env = ENV({ APEX_CHAT_DB: DB });
    const a = await (await ssoKdmc(env)).json();
    const b = await (await ssoKdmc(env)).json();
    expect(a.user.id).toBe('kdmc_marie');
    expect(b.user.id).toBe('kdmc_marie');
  });
});

describe('SSO Apex : même verrou', () => {
  const ssoApex = async (env, payload, apex_uid) => {
    const now = Math.floor(Date.now() / 1000);
    const apex_token = await makeJWT({ sub: apex_uid, iat: now, exp: now + 120, ...payload }, env.APEX_SSO_SIGN_KEY);
    return worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-apex', body: { apex_token, apex_uid, name: 'X' } }), env, CTX);
  };

  it('la ligne admin (liée à apex_uid « kdmc_admin ») avec un jeton Apex NON admin → 403, aucun jeton', async () => {
    const DB = d1Reel();
    const avant = ligne(DB, 'kdmc_admin');
    const env = ENV({ APEX_CHAT_DB: DB, APEX_SSO_SIGN_KEY: 'cle-test-apex-sso' });
    const r = await ssoApex(env, {}, 'kdmc_admin');
    expect(r.status).toBe(403);
    expect((await r.json()).token).toBeUndefined();
    expect(ligne(DB, 'kdmc_admin')).toEqual(avant);
  });

  it('apex_uid qui collisionne avec l\'id d\'une AUTRE ligne admin non liée → compte neuf non admin, ligne intacte', async () => {
    const DB = d1Reel();
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,source,is_admin)
      VALUES ('cible_admin','cible','Cible','+33600000009','h_cible',1,'k','k','k','active','otp',1)`).run();
    const avant = ligne(DB, 'cible_admin');
    const env = ENV({ APEX_CHAT_DB: DB, APEX_SSO_SIGN_KEY: 'cle-test-apex-sso' });
    const r = await ssoApex(env, {}, 'cible_admin');
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.user.id).toMatch(/^cible_admin_[a-z0-9]{6}$/);
    expect(j.user.is_admin).toBe(0);
    expect(ligne(DB, 'cible_admin')).toEqual(avant);
  });
});
