/**
 * Tests api-worker.js — Connexion auto via kd-mc.com (POST /api/auth/sso-from-kdmc).
 * Le worker NE FAIT PAS confiance au frontend : il vérifie côté serveur via
 * https://kd-mc.com/__sso/whoami. On n'accepte la session QUE si verified===true.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest } from './api-worker-helpers.js';

const ssoFromKdmc = (body, env = ENV()) =>
  worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body }), env);

/** Mock global fetch pour l'appel worker → kd-mc.com/__sso/whoami */
function mockWhoami(payload, { ok = true } = {}) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('kd-mc.com/__sso/whoami')) {
      return new Response(payload == null ? 'null' : JSON.stringify(payload), { status: ok ? 200 : 500 });
    }
    return new Response(JSON.stringify({ messages: [{ status: '0' }] }));
  });
}

/** DB qui simule un user kdmc absent puis présent après insert (find/insert/find). */
function makeKdmcDB() {
  const store = { byKdmcUid: null, byId: null };
  return ENV({
    APEX_CHAT_DB: {
      _calls: [],
      prepare(sql) {
        this._calls.push(sql);
        const self = store;
        return {
          _args: [],
          bind(...a) { this._args = a; return this; },
          async first() {
            if (sql.includes('WHERE kdmc_uid=?')) return self.byKdmcUid;
            if (sql.includes('WHERE id=?')) return self.byId;
            return null;
          },
          async all() { return { results: [] }; },
          async run() {
            if (sql.startsWith('INSERT INTO users')) {
              // l'insert "crée" le user → les SELECT suivants le trouvent
              const id = this._args[0];
              const created = {
                id, pseudo: this._args[1], real_name: this._args[2],
                is_admin: this._args[3], is_kevin_alias: this._args[4],
                apex_uid: this._args[5], kdmc_uid: this._args[7], status: 'active',
              };
              self.byId = created;
              self.byKdmcUid = created;
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
      batch: vi.fn(async (s) => ({ success: true, count: s.length })),
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '0' }] })));
});

describe('handleSsoFromKdmc — sécurité (vérif serveur whoami)', () => {
  it('token kdmc manquant → 400', async () => {
    const r = await ssoFromKdmc({});
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('kdmc_token_manquant');
  });

  it('whoami verified:true + admin:true → 200 + token + user is_admin', async () => {
    mockWhoami({ ok: true, verified: true, uid: 'kevin-desarzens', name: 'Kevin Desarzens', admin: true });
    const env = makeKdmcDB();
    const r = await ssoFromKdmc({ kdmc_token: 'tok-faceid' }, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(typeof b.token).toBe('string');
    expect(b.token.length).toBeGreaterThan(20);
    expect(b.user).toBeTruthy();
    expect(b.user.is_admin).toBe(1);
    expect(b.user.kdmc_uid).toBe('kevin-desarzens');
    // l'appel whoami a bien eu lieu côté serveur
    const calledWhoami = globalThis.fetch.mock.calls.some(c => String(c[0]).includes('kd-mc.com/__sso/whoami'));
    expect(calledWhoami).toBe(true);
  });

  it('whoami verified:false → 401 face_id_requis (PAS de session)', async () => {
    mockWhoami({ ok: true, verified: false, uid: 'kevin-desarzens', name: 'Kevin Desarzens', admin: true });
    const env = makeKdmcDB();
    const r = await ssoFromKdmc({ kdmc_token: 'tok-no-faceid' }, env);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('face_id_requis');
  });

  it('whoami ok:false → 401 (session invalide)', async () => {
    mockWhoami({ ok: false }, { ok: false });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-bad' });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('kdmc_session_invalide');
  });

  it('whoami null → 401 (session invalide)', async () => {
    mockWhoami(null);
    const r = await ssoFromKdmc({ kdmc_token: 'tok-null' });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('kdmc_session_invalide');
  });

  it('whoami injoignable (throw) → 401 kdmc_session_invalide', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('kd-mc.com')) throw new Error('net err');
      return new Response('{}');
    });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-net' });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('kdmc_session_invalide');
  });

  it('2e appel même uid → réutilise le même user (pas de doublon)', async () => {
    mockWhoami({ ok: true, verified: true, uid: 'kevin-desarzens', name: 'Kevin Desarzens', admin: true });
    const env = makeKdmcDB();
    const r1 = await ssoFromKdmc({ kdmc_token: 'tok1' }, env);
    const b1 = await r1.json();
    expect(r1.status).toBe(200);
    const r2 = await ssoFromKdmc({ kdmc_token: 'tok2' }, env);
    const b2 = await r2.json();
    expect(r2.status).toBe(200);
    // même user.id réutilisé → pas de second INSERT (find trouve l'existant)
    expect(b2.user.id).toBe(b1.user.id);
    const inserts = env.APEX_CHAT_DB._calls.filter(s => s.startsWith('INSERT INTO users')).length;
    expect(inserts).toBe(1);
  });

  it('token via header Authorization Bearer (sans body) → accepté', async () => {
    mockWhoami({ ok: true, verified: true, uid: 'laurence', name: 'Laurence Saint-Polit', admin: false });
    const env = makeKdmcDB();
    // makeRequest n'envoie pas de body pour {} → on force un body vide explicite
    const req = makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { _: 1 }, token: 'tok-bearer' });
    const r = await worker.fetch(req, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.user.is_admin).toBe(0);
  });
});

// Règle de Kevin (13.10) : une personne inscrite au domaine, sur son appareil connu, est reconnue
// automatiquement — session « code prouvé » (whoami : ok:true, code:true, verified:false). Seul l'admin
// garde l'obligation du Face ID. (Pendant node : tests/verify-reconnu-domaine-apps.mjs.)
describe('handleSsoFromKdmc — utilisateur normal reconnu par son code (sans Face ID)', () => {
  it('code prouvé, pas admin → 200 + session, compte non admin', async () => {
    mockWhoami({ ok: true, verified: false, code: true, uid: 'lea-martin', name: 'Léa Martin', admin: false });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-code' }, makeKdmcDB());
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.user.kdmc_uid).toBe('lea-martin');
    expect(b.user.is_admin).toBe(0);
  });

  it('code NON prouvé (nom seulement tapé) → 401 face_id_requis', async () => {
    mockWhoami({ ok: true, verified: false, code: false, uid: 'paul-durand', name: 'Paul Durand', admin: false });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-nom' }, makeKdmcDB());
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('face_id_requis');
  });

  it('ADMIN avec un code seul (sans Face ID) → 401 face_id_requis', async () => {
    mockWhoami({ ok: true, verified: false, code: true, uid: 'compte-admin', name: 'Nina Fictive', admin: true });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-admin-code' }, makeKdmcDB());
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('face_id_requis');
  });

  it('compte déjà admin en base + code seul → 401 (aucun jeton admin sorti d\'un code)', async () => {
    const env = makeKdmcDB();
    mockWhoami({ ok: true, verified: true, code: false, uid: 'compte-admin', name: 'Nina Fictive', admin: true });
    expect((await ssoFromKdmc({ kdmc_token: 'tok-1' }, env)).status).toBe(200);   // Face ID : le compte admin est créé
    mockWhoami({ ok: true, verified: false, code: true, uid: 'compte-admin', name: 'Nina Fictive', admin: false });
    const r = await ssoFromKdmc({ kdmc_token: 'tok-2' }, env);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('face_id_requis');
  });
});

describe('SSO kd-mc.com : une exception non prévue dit sa cause (25.10.2026)', () => {
  it('base en panne après whoami OK → 500 JSON kdmc_sso_exception avec détail, jamais un corps vide', async () => {
    mockWhoami({ ok: true, uid: 'parcours-robotabc', name: 'Parcours Robot A', verified: false, code: true, admin: false });
    const env = ENV({ APEX_CHAT_DB: { prepare() { throw new Error('D1_ERROR: panne simulée'); } } });
    const r = await ssoFromKdmc({ kdmc_token: 'jeton.signe' }, env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.code || j.error).toBe('kdmc_sso_exception');
    expect(JSON.stringify(j)).toContain('panne simulée');
  });
});
