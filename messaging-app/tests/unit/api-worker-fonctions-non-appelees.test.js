/**
 * Tests api-worker.js — FONCTIONS JAMAIS APPELÉES (mesure vitest 5 du 10/09/2026).
 *
 * Pourquoi ce fichier : avec vitest 5 (remappage AST `ast-v8-to-istanbul`), la couverture
 * RÉELLE de `workers/api-worker.js` était de 75.71 % instructions / 68.48 % branches /
 * 64.47 % FONCTIONS / 79.20 % lignes — 108 fonctions sur 304 n'étaient jamais exécutées :
 * 16 handlers nommés (check-phone, cercle de confiance, avatar, toggles per-user, cercle
 * privé Kevin↔proche, fiche contact, suppression de conversation, recherche IA, push
 * subscribe/unsubscribe/test, force-update ×3, config TURN) et ~90 rappels anonymes
 * (`.catch` des écritures D1 best-effort, `.map/.filter` sur plusieurs éléments,
 * rappels d'abandon `setTimeout(() => ctrl.abort())`, envois de files rejetés…).
 *
 * Méthode : chaque handler passe par le ROUTEUR (`worker.fetch`) avec la vraie route,
 * méthode et auth ; chaque cas exerce le chemin nominal ET au moins une branche d'erreur en
 * vérifiant status + corps JSON (code d'erreur exact, `detail`/`context` — règle « détailler
 * les erreurs partout »). Les rappels anonymes sont déclenchés par la panne qu'ils
 * absorbent (mock D1 qui rejette, corps JSON invalide, file qui refuse, fetch qui pend
 * jusqu'à l'abandon via minuteries simulées).
 *
 * Aucune donnée personnelle : uniquement les numéros synthétiques de la liste blanche du garde
 * `no-admin-phone-in-page.test.js` (+3360000000x, +33612000000, +33622222222…), aucun secret,
 * jamais le code admin (jeton de test `admin-secret` des helpers partagés).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker, {
  _healLocalConvMembers,
  cleanupEmptyConversations,
  cleanupGhostMembers,
  consolidateKevinIntoAdmin,
  fetchFirebasePublicKeys,
  handleTestCleanup,
} from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

// ---------------------------------------------------------------------------
//  Outils locaux (réutilisent EXACTEMENT les mocks des helpers partagés : ENV,
//  makeRequest, makeJWT ; le D1 est un mock à règles ordonnées pour pouvoir
//  faire ÉCHOUER une requête précise — ce que makeDB ne permet pas).
// ---------------------------------------------------------------------------
const IAT = () => Math.floor(Date.now() / 1000);
const userTok = () => makeJWT({ sub: 'u_test_1', pseudo: 'testeur', iat: IAT() });
const adminTok = () => makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: IAT() });
const admin2Tok = () => makeJWT({ sub: 'u_admin_2', is_admin: true, iat: IAT() });

/**
 * D1 mock à règles ordonnées : `rules = [[motif, { first?, all?, run? }], …]`.
 * Le PREMIER motif (string `includes` ou RegExp) qui matche la SQL gagne ; chaque
 * réponse est une valeur ou une fonction `(args, sql) => valeur` (qui peut `throw`
 * → la promesse est rejetée, exactement comme une vraie panne D1).
 * La ligne d'auth de getAuthUser (`SELECT last_force_logout_at…`) est fournie par
 * défaut (compte actif) sauf `opts.authRow`.
 */
function db(rules = [], opts = {}) {
  const calls = [];
  const all = [...rules, ['SELECT last_force_logout_at', { first: opts.authRow || { status: 'active', is_banned: 0 } }]];
  const find = (sql) => all.find(([p]) => (p instanceof RegExp ? p.test(sql) : sql.includes(p)));
  const exec = async (kind, sql, args, dflt) => {
    const rule = find(sql);
    const h = rule && rule[1] && rule[1][kind];
    if (h === undefined) return dflt;
    return typeof h === 'function' ? h(args, sql) : h;
  };
  return {
    calls,
    prepare: vi.fn((sql) => ({
      _args: [],
      bind(...a) { this._args = a; return this; },
      first() { calls.push({ kind: 'first', sql, args: this._args }); return exec('first', sql, this._args, null); },
      all() { calls.push({ kind: 'all', sql, args: this._args }); return exec('all', sql, this._args, { results: [] }); },
      run() { calls.push({ kind: 'run', sql, args: this._args }); return exec('run', sql, this._args, { success: true, meta: { changes: 1 } }); },
    })),
    batch: vi.fn(async (s) => ({ success: true, count: s.length })),
  };
}
const boom = (msg) => () => { throw new Error(msg); };
const mkEnv = (rules, overrides = {}, dbOpts = {}) => ENV({ APEX_CHAT_DB: db(rules, dbOpts), ...overrides });
const calls = (env, kind, motif) => env.APEX_CHAT_DB.calls.filter((c) => c.kind === kind && c.sql.includes(motif));

/** Requête avec corps BRUT (pour envoyer du JSON invalide) + en-têtes libres. */
function rawReq(method, path, rawBody, token, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), { method, headers: h, body: rawBody });
}
const jreq = (method, path, body, token, extraHeaders) => makeRequest({ method, path, body, token, extraHeaders });

/**
 * fetch qui PEND jusqu'à l'abandon du signal (déclenche les rappels `() => ctrl.abort()`).
 * `fetch.called` se résout dès l'appel : le handler attend d'abord `crypto.subtle` (hors
 * microtâches), il faut donc attendre que le `setTimeout` soit posé AVANT d'avancer les
 * minuteries simulées, sinon elles sont avancées « dans le vide ».
 */
const hangingFetch = () => {
  let markCalled;
  const called = new Promise((r) => { markCalled = r; });
  const fn = vi.fn((url, init) => new Promise((_, reject) => {
    const sig = init && init.signal;
    if (sig) sig.addEventListener('abort', () => reject(new Error('aborted')));
    markCalled();
  }));
  fn.called = called;
  return fn;
};

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});
afterEach(() => { vi.useRealTimers(); });

// ===========================================================================
//  handleCheckPhone — POST /api/auth/check-phone
// ===========================================================================
describe('POST /api/auth/check-phone (handleCheckPhone)', () => {
  it('JSON invalide → 400 bad_json avec la cause', async () => {
    const r = await worker.fetch(rawReq('POST', '/api/auth/check-phone', '{oops'), mkEnv());
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toBe('bad_json');
    expect(j.message).toBe('JSON body invalide');
    expect(typeof j.detail).toBe('string');
  });

  it('numéro invalide → 400 phone_invalid, contexte received/normalized', async () => {
    const r = await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: 'abc' }), mkEnv());
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toBe('phone_invalid');
    expect(j.context).toEqual({ received: 'abc', normalized: '' });
  });

  it('numéro inconnu → exists:false (anti-énumération : rien d\'autre)', async () => {
    const env = mkEnv([['FROM users WHERE phone=?', { first: null }]]);
    const r = await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: '06 00 00 00 10' }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, exists: false });
    // le numéro national 06… est normalisé en E.164 avant la requête
    expect(calls(env, 'first', 'FROM users WHERE phone=?')[0].args).toEqual(['+33600000010']);
  });

  it('compte bloqué → exists:true, blocked:true sans prénom', async () => {
    const env = mkEnv([['FROM users WHERE phone=?', { first: { id: 'u1', status: 'suspended', real_name: 'Marie Test' } }]]);
    const r = await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: '+33600000010' }), env);
    expect(await r.json()).toEqual({ ok: true, exists: true, blocked: true });
  });

  it('compte connu sans first_name → prénom extrait du real_name + admin_authorized', async () => {
    const env = mkEnv([['FROM users WHERE phone=?', { first: { id: 'u1', status: 'active', real_name: '  Marie Test ', first_name: '', admin_authorized: 1 } }]]);
    const r = await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: '+33600000010' }), env);
    // audit 17/09 : admin_authorized n'est plus révélé avant preuve de possession du numéro
    expect(await r.json()).toEqual({ ok: true, exists: true, first_name: 'Marie' });
  });

  it('compte connu sans nom → repli sur le pseudo', async () => {
    const env = mkEnv([['FROM users WHERE phone=?', { first: { id: 'u1', pseudo: 'marie_t', admin_authorized: 0 } }]]);
    const j = await (await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: '+33600000010' }), env)).json();
    expect(j).toEqual({ ok: true, exists: true, first_name: 'marie_t' });
  });

  it('panne D1 → 500 lookup_failed avec le message exact', async () => {
    const env = mkEnv([['FROM users WHERE phone=?', { first: boom('D1_ERROR: no such table users') }]]);
    const r = await worker.fetch(jreq('POST', '/api/auth/check-phone', { phone: '+33600000010' }), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('lookup_failed');
    expect(j.detail).toBe('D1_ERROR: no such table users');
  });
});

// ===========================================================================
//  handleTrustedCircle — GET/POST /api/admin/trusted-circle
// ===========================================================================
describe('/api/admin/trusted-circle (handleTrustedCircle)', () => {
  const cfg = (phones) => ["key='trusted_circle_phones'", { first: { value: JSON.stringify(phones) } }];

  it('sans jeton → 403 forbidden ; user simple → 403', async () => {
    const r1 = await worker.fetch(jreq('GET', '/api/admin/trusted-circle'), mkEnv());
    expect(r1.status).toBe(403);
    expect((await r1.json()).error).toBe('forbidden');
    const r2 = await worker.fetch(jreq('GET', '/api/admin/trusted-circle', undefined, await userTok()), mkEnv());
    expect(r2.status).toBe(403);
  });

  it('GET admin → liste normalisée depuis system_config', async () => {
    const env = mkEnv([cfg(['+33600000010', '0612000000'])]);
    const r = await worker.fetch(jreq('GET', '/api/admin/trusted-circle', undefined, await adminTok()), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, phones: ['+33600000010', '+33612000000'] });
  });

  it('POST ajout (défaut) → numéro ajouté, écrit en JSON avec updated_by = admin', async () => {
    const env = mkEnv([cfg(['+33600000010'])]);
    const r = await worker.fetch(jreq('POST', '/api/admin/trusted-circle', { phone: '0622222222' }, await adminTok()), env);
    expect(await r.json()).toEqual({ ok: true, phones: ['+33600000010', '+33622222222'] });
    const w = calls(env, 'run', "'trusted_circle_phones'")[0];
    expect(JSON.parse(w.args[0])).toEqual(['+33600000010', '+33622222222']);
    expect(w.args[2]).toBe('kdmc_admin');
  });

  it('POST ajout d\'un numéro déjà présent → pas de doublon', async () => {
    const env = mkEnv([cfg(['+33600000010'])]);
    const r = await worker.fetch(jreq('POST', '/api/admin/trusted-circle', { phone: '+33600000010' }, await adminTok()), env);
    expect((await r.json()).phones).toEqual(['+33600000010']);
  });

  it('POST action=remove → retiré de la liste (rappel filter) — admin par flag is_admin', async () => {
    const env = mkEnv([cfg(['+33600000010', '+33622222222'])]);
    const r = await worker.fetch(jreq('POST', '/api/admin/trusted-circle', { phone: '+33622222222', action: 'remove' }, await admin2Tok()), env);
    expect(await r.json()).toEqual({ ok: true, phones: ['+33600000010'] });
    expect(calls(env, 'run', "'trusted_circle_phones'")[0].args[2]).toBe('u_admin_2');
  });

  it('POST numéro invalide → 400 bad_phone ; corps JSON invalide → traité comme vide → 400 bad_phone', async () => {
    const r1 = await worker.fetch(jreq('POST', '/api/admin/trusted-circle', { phone: '12' }, await adminTok()), mkEnv());
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe('bad_phone');
    const r2 = await worker.fetch(rawReq('POST', '/api/admin/trusted-circle', 'pas du json', await adminTok()), mkEnv());
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe('bad_phone');
  });
});

// ===========================================================================
//  handleUploadMyAvatar — POST /api/users/me/avatar
// ===========================================================================
describe('POST /api/users/me/avatar (handleUploadMyAvatar)', () => {
  it('sans jeton → 401', async () => {
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', { data_url: '' }), mkEnv());
    expect(r.status).toBe(401);
    expect((await r.json()).message).toBe('Non authentifié');
  });

  it('JSON invalide → 400 bad_json', async () => {
    const r = await worker.fetch(rawReq('POST', '/api/users/me/avatar', '{', await userTok()), mkEnv());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('bad_json');
  });

  it('data_url qui n\'est pas une image → 400 bad_data_url', async () => {
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', { data_url: 'data:text/plain;base64,QUJD' }, await userTok()), mkEnv());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('bad_data_url');
  });

  it('avatar > 200 Ko → 413 avatar_too_large avec size/max', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024);
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', { data_url: big }, await userTok()), mkEnv());
    expect(r.status).toBe(413);
    const j = await r.json();
    expect(j.error).toBe('avatar_too_large');
    expect(j.context).toEqual({ size: big.length, max: 200 * 1024 });
  });

  it('nominal → UPDATE users.avatar_url pour le user du jeton', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', { data_url: 'data:image/jpeg;base64,QUJD' }, await userTok()), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, avatar_url: 'data:image/jpeg;base64,QUJD' });
    const w = calls(env, 'run', 'UPDATE users SET avatar_url=?')[0];
    expect(w.args[0]).toBe('data:image/jpeg;base64,QUJD');
    expect(w.args[2]).toBe('u_test_1');
  });

  it('data_url vide → efface l\'avatar (NULL)', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', {}, await userTok()), env);
    expect(await r.json()).toEqual({ ok: true, avatar_url: null });
    expect(calls(env, 'run', 'UPDATE users SET avatar_url=?')[0].args[0]).toBeNull();
  });

  it('panne D1 à l\'écriture → 500 db_write_failed avec detail', async () => {
    const env = mkEnv([['UPDATE users SET avatar_url=?', { run: boom('disk full') }]]);
    const r = await worker.fetch(jreq('POST', '/api/users/me/avatar', { data_url: 'data:image/png;base64,QUJD' }, await userTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('db_write_failed');
    expect(j.detail).toBe('disk full');
  });
});

// ===========================================================================
//  handleAdminSetUserToggle — POST /api/admin/user-toggles
// ===========================================================================
describe('POST /api/admin/user-toggles (handleAdminSetUserToggle)', () => {
  it('sans jeton → 401 ; JSON invalide → 400 bad_json ; feature absente → 400 feature_missing', async () => {
    expect((await worker.fetch(jreq('POST', '/api/admin/user-toggles', {}), mkEnv())).status).toBe(401);
    const r2 = await worker.fetch(rawReq('POST', '/api/admin/user-toggles', 'x', await userTok()), mkEnv());
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe('bad_json');
    const r3 = await worker.fetch(jreq('POST', '/api/admin/user-toggles', { value: true }, await userTok()), mkEnv());
    expect(r3.status).toBe(400);
    expect((await r3.json()).error).toBe('feature_missing');
  });

  it('un user change SON propre toggle → clé user_toggle:<uid>:<feature>, valeur JSON', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/admin/user-toggles', { feature: 'geoloc', value: false }, await userTok()), env);
    expect(await r.json()).toEqual({ ok: true, uid: 'u_test_1', feature: 'geoloc', value: false });
    const w = calls(env, 'run', 'INSERT OR REPLACE INTO system_config')[0];
    expect(w.args[0]).toBe('user_toggle:u_test_1:geoloc');
    expect(w.args[1]).toBe('false');
    expect(w.args[3]).toBe('u_test_1');
    // aucun contrôle admin en base quand on se modifie soi-même
    expect(calls(env, 'first', 'SELECT is_admin FROM users')).toHaveLength(0);
  });

  it('un non-admin vise un AUTRE user → 403 forbidden_other', async () => {
    const env = mkEnv([['SELECT is_admin FROM users WHERE id=?', { first: { is_admin: 0 } }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/user-toggles', { uid: 'u_autre', feature: 'geoloc', value: true }, await userTok()), env);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('forbidden_other');
  });

  it('un admin (vérifié en base) modifie un autre user → ok', async () => {
    const env = mkEnv([['SELECT is_admin FROM users WHERE id=?', { first: { is_admin: 1 } }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/user-toggles', { uid: 'u_autre', feature: 'stories', value: 'on' }, await adminTok()), env);
    expect(await r.json()).toEqual({ ok: true, uid: 'u_autre', feature: 'stories', value: 'on' });
    expect(calls(env, 'run', 'INSERT OR REPLACE INTO system_config')[0].args[0]).toBe('user_toggle:u_autre:stories');
  });

  it('panne D1 (NOT NULL updated_at…) → 500 db_write_failed avec la cause', async () => {
    const env = mkEnv([['INSERT OR REPLACE INTO system_config', { run: boom('NOT NULL constraint failed: system_config.updated_at') }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/user-toggles', { feature: 'x', value: 1 }, await userTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('db_write_failed');
    expect(j.detail).toMatch(/NOT NULL constraint/);
  });
});

// ===========================================================================
//  ensureCorePair + handleConfigureCorePair — POST /api/admin/configure-core-pair
// ===========================================================================
describe('POST /api/admin/configure-core-pair (handleConfigureCorePair → ensureCorePair)', () => {
  const KEVIN = '+33600000001';
  const PEER = '+33600000002';
  const pairEnv = (rules, overrides) => mkEnv(rules, { KEVIN_PHONE_E164: KEVIN, ...overrides });

  it('user simple ou admin non-Kevin → 403 forbidden avec auth_sub', async () => {
    const r1 = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER }, await admin2Tok()), pairEnv());
    expect(r1.status).toBe(403);
    const j = await r1.json();
    expect(j.error).toBe('forbidden');
    expect(j.context).toEqual({ auth_sub: 'u_admin_2' });
    const r2 = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER }), pairEnv());
    expect((await r2.json()).context).toEqual({ auth_sub: null });
  });

  it('JSON invalide → 400 bad_json ; peer_phone absent → 400', async () => {
    const r1 = await worker.fetch(rawReq('POST', '/api/admin/configure-core-pair', '{{', await adminTok()), pairEnv());
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe('bad_json');
    const r2 = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', {}, await adminTok()), pairEnv());
    expect(r2.status).toBe(400);
    expect((await r2.json()).message).toMatch(/peer_phone requis/);
  });

  it('KEVIN_PHONE_E164 absent → 200 mais skipped explicite, aucune écriture', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER }, await adminTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.skipped).toEqual(['KEVIN_PHONE_E164 absent']);
    expect(j.created).toEqual({ kevin: false, peer: false, conv: false });
    // aucun compte ni conversation créés — seule la trace d'audit est écrite
    expect(calls(env, 'run', 'INSERT INTO users')).toHaveLength(0);
    expect(calls(env, 'run', 'INSERT INTO conversation')).toHaveLength(0);
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[1]).toBe('configure_core_pair');
  });

  it('nominal : Kevin absent → créé ; proche absent → créé ; DM absente → créée (created ×3)', async () => {
    const env = pairEnv([
      ['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: null }],
      ['SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?', { first: null }],
      ['SELECT c.id FROM conversations c', { first: null }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', {
      peer_phone: '06 00 00 00 02', peer_name: 'Proche Test', peer_first_name: 'Proche', peer_last_name: 'Test', peer_pseudo: 'proche',
    }, await adminTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.created).toEqual({ kevin: true, peer: true, conv: true });
    expect(j.kevin_user).toEqual({ id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' });
    expect(j.peer_user).toEqual({ id: 'laurence_saint_polit', pseudo: 'proche', real_name: 'Proche Test' });
    expect(typeof j.conv_id).toBe('string');
    // insert Kevin : numéro E.164 + is_admin ; insert proche : numéro normalisé
    expect(calls(env, 'run', "INSERT INTO users (id, pseudo, real_name, phone, phone_hash, source")[0].args[0]).toBe(KEVIN);
    expect(calls(env, 'run', 'INSERT INTO users (id, pseudo, real_name, first_name, last_name')[0].args[5]).toBe(PEER);
    expect(calls(env, 'run', 'INSERT INTO conversation_members')).toHaveLength(2);
    // audit configure_core_pair écrit
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[1]).toBe('configure_core_pair');
  });

  it('proche existant avec autre pseudo → UPDATE ; DM existante → conv_id réutilisé, rien de créé', async () => {
    const env = pairEnv([
      ['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: (args) => (args[0] === 'kdmc_admin'
        ? { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' }
        : { id: 'u_peer', pseudo: 'nouveau', real_name: 'Proche Test' }) }],
      ['SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?', { first: { id: 'u_peer', pseudo: 'ancien', real_name: 'Proche Test' } }],
      ['SELECT c.id FROM conversations c', { first: { id: 'conv_existante' } }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER, peer_pseudo: 'nouveau', peer_name: 'Proche Test' }, await adminTok()), env);
    const j = await r.json();
    expect(j.created).toEqual({ kevin: false, peer: false, conv: false });
    expect(j.updated_peer).toBe(true);
    expect(j.conv_id).toBe('conv_existante');
    const up = calls(env, 'run', 'UPDATE users SET pseudo=?')[0];
    expect(up.args).toEqual(['nouveau', 'Laurence', 'SAINT-POLIT', expect.any(Number), 'u_peer']);
    expect(calls(env, 'run', 'INSERT INTO conversations')).toHaveLength(0);
  });

  it('pseudo déjà pris (UNIQUE) → 2ᵉ UPDATE sans le pseudo (rappel filter) + pseudo_conflict', async () => {
    const env = pairEnv([
      ['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: (args) => (args[0] === 'kdmc_admin'
        ? { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' }
        : { id: 'u_peer', pseudo: 'ancien', real_name: 'Nouveau Nom' }) }],
      ['SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?', { first: { id: 'u_peer', pseudo: 'ancien', real_name: 'Ancien Nom' } }],
      ['UPDATE users SET pseudo=?', { run: boom('UNIQUE constraint failed: users.pseudo') }],
      ['SELECT c.id FROM conversations c', { first: { id: 'conv_1' } }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER, peer_pseudo: 'pris', peer_name: 'Nouveau Nom' }, await adminTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.pseudo_conflict).toBe('pris');
    expect(j.updated_peer).toBeUndefined();
    const retry = calls(env, 'run', 'UPDATE users SET real_name=?')[0];
    expect(retry.sql).not.toContain('pseudo=?');
    expect(retry.args).toEqual(['Nouveau Nom', 'Laurence', 'SAINT-POLIT', expect.any(Number), 'u_peer']);
  });

  it('erreur non-UNIQUE pendant l\'UPDATE du proche → 500 core_pair_failed, step peer_upsert', async () => {
    const env = pairEnv([
      ['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' } }],
      ['SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?', { first: { id: 'u_peer', pseudo: 'ancien', real_name: 'X' } }],
      ['UPDATE users SET pseudo=?', { run: boom('database is locked') }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER, peer_pseudo: 'nouveau' }, await adminTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('core_pair_failed');
    expect(j.detail).toBe('ensure peer failed: database is locked');
    expect(j.step).toBe('peer_upsert');
    expect(j.context.partial.kevin_user.id).toBe('kdmc_admin');
  });

  it('panne à l\'étape Kevin → 500 detail « ensure kevin failed », step « ? »', async () => {
    const env = pairEnv([['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: boom('no such table: users') }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER }, await adminTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.detail).toBe('ensure kevin failed: no such table: users');
    expect(j.step).toBe('?');
  });

  it('panne à la création de la DM → 500 step conv_create', async () => {
    const env = pairEnv([
      ['SELECT id, pseudo, real_name FROM users WHERE id=?', { first: { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' } }],
      ['SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?', { first: null }],
      ['SELECT c.id FROM conversations c', { first: null }],
      ['INSERT INTO conversations', { run: boom('FOREIGN KEY constraint failed') }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/admin/configure-core-pair', { peer_phone: PEER }, await adminTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.step).toBe('conv_create');
    expect(j.detail).toBe('ensure conv failed: FOREIGN KEY constraint failed');
    expect(j.context.partial.created.peer).toBe(true);
  });
});

// ===========================================================================
//  handleUpdateContact — PATCH /api/contact/:id
// ===========================================================================
describe('PATCH /api/contact/:id (handleUpdateContact)', () => {
  it('sans jeton → 401 unauthenticated', async () => {
    const r = await worker.fetch(jreq('PATCH', '/api/contact/u_x', { bio: 'x' }), mkEnv());
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('unauthenticated');
  });

  it('non-admin sur la fiche d\'un autre → 403 forbidden', async () => {
    const r = await worker.fetch(jreq('PATCH', '/api/contact/u_autre', { bio: 'x' }, await userTok()), mkEnv());
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('forbidden');
  });

  it('corps JSON invalide → corps vide (rappel catch) → 400 no_fields', async () => {
    const r = await worker.fetch(rawReq('PATCH', '/api/contact/u_test_1', 'nope', await userTok()), mkEnv());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('no_fields');
  });

  it('pseudo invalide → 400 pseudo_invalid', async () => {
    const r = await worker.fetch(jreq('PATCH', '/api/contact/u_test_1', { pseudo: 'a b' }, await userTok()), mkEnv());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('pseudo_invalid');
  });

  it('nominal (sa propre fiche) → UPDATE des champs autorisés seulement + fiche renvoyée + audit', async () => {
    const env = mkEnv([['SELECT * FROM users WHERE id=?', { first: { id: 'u_test_1', display_name: 'Testeur Un', city: 'Monaco' } }]]);
    const r = await worker.fetch(jreq('PATCH', '/api/contact/u_test_1', { display_name: 'Testeur Un', city: 'Monaco', is_admin: 1 }, await userTok()), env);
    expect(r.status).toBe(200);
    expect((await r.json()).user).toEqual({ id: 'u_test_1', display_name: 'Testeur Un', city: 'Monaco' });
    const up = calls(env, 'run', 'UPDATE users SET')[0];
    expect(up.sql).toBe('UPDATE users SET display_name=?, city=?, updated_at=? WHERE id=?');
    expect(up.sql).not.toContain('is_admin');
    expect(up.args.slice(0, 2)).toEqual(['Testeur Un', 'Monaco']);
    expect(up.args[3]).toBe('u_test_1');
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[1]).toBe('contact_update');
  });

  it('admin modifie un autre id (suivi merged_into vers le compte canonique)', async () => {
    const env = mkEnv([
      ['SELECT merged_into FROM users WHERE id=?', { first: (args) => (args[0] === 'u_doublon' ? { merged_into: 'u_canon' } : null) }],
      ['SELECT * FROM users WHERE id=?', { first: { id: 'u_canon', job: 'croupier' } }],
    ]);
    const r = await worker.fetch(jreq('PATCH', '/api/contact/u_doublon', { job: 'croupier' }, await adminTok()), env);
    expect(r.status).toBe(200);
    expect(calls(env, 'run', 'UPDATE users SET')[0].args[2]).toBe('u_canon');
  });

  it('pseudo déjà pris (UNIQUE) → 409 pseudo_taken ; autre panne → 500 update_failed', async () => {
    const env1 = mkEnv([['UPDATE users SET', { run: boom('UNIQUE constraint failed: users.pseudo') }]]);
    const r1 = await worker.fetch(jreq('PATCH', '/api/contact/u_test_1', { pseudo: 'pris_1' }, await userTok()), env1);
    expect(r1.status).toBe(409);
    const j1 = await r1.json();
    expect(j1.error).toBe('pseudo_taken');
    expect(j1.detail).toMatch(/UNIQUE/);
    const env2 = mkEnv([['UPDATE users SET', { run: boom('database is locked') }]]);
    const r2 = await worker.fetch(jreq('PATCH', '/api/contact/u_test_1', { bio: 'x' }, await userTok()), env2);
    expect(r2.status).toBe(500);
    expect((await r2.json()).error).toBe('update_failed');
  });
});

// ===========================================================================
//  handleDeleteConversation — DELETE /api/conversations/:id
// ===========================================================================
describe('DELETE /api/conversations/:id (handleDeleteConversation)', () => {
  it('sans jeton → 401', async () => {
    expect((await worker.fetch(jreq('DELETE', '/api/conversations/c1'), mkEnv())).status).toBe(401);
  });

  it('dernier membre → purge messages + conv ; audit en panne (rappel catch) n\'empêche pas le 200', async () => {
    const env = mkEnv([
      ['SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?', { first: { c: 0 } }],
      ['INSERT INTO audit_log', { run: boom('audit table missing') }],
    ]);
    const r = await worker.fetch(jreq('DELETE', '/api/conversations/c1', undefined, await userTok()), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, remaining: 0 });
    expect(calls(env, 'run', 'DELETE FROM conversation_members WHERE conv_id=? AND user_id=?')[0].args).toEqual(['c1', 'u_test_1']);
    expect(calls(env, 'run', 'DELETE FROM messages WHERE conv_id=?')).toHaveLength(1);
    expect(calls(env, 'run', 'DELETE FROM conversations WHERE id=?')).toHaveLength(1);
    expect(calls(env, 'run', 'UPDATE conversations SET member_count')).toHaveLength(0);
  });

  it('il reste des membres → member_count recalé, conv conservée', async () => {
    const env = mkEnv([['SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?', { first: { c: 2 } }]]);
    const r = await worker.fetch(jreq('DELETE', '/api/conversations/c1', undefined, await userTok()), env);
    expect(await r.json()).toEqual({ ok: true, remaining: 2 });
    expect(calls(env, 'run', 'UPDATE conversations SET member_count=?')[0].args).toEqual([2, 'c1']);
    expect(calls(env, 'run', 'DELETE FROM conversations')).toHaveLength(0);
  });

  it('panne au recomptage → 500 delete_conv_fail avec l\'étape exacte', async () => {
    const env = mkEnv([['SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?', { first: boom('D1 timeout') }]]);
    const r = await worker.fetch(jreq('DELETE', '/api/conversations/c1', undefined, await userTok()), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('delete_conv_fail');
    expect(j.detail).toBe('D1 timeout');
    expect(j.step).toBe('delete_conv:recount');
  });
});

// ===========================================================================
//  handleAiSemanticSearch — POST /api/ai/search
// ===========================================================================
describe('POST /api/ai/search (handleAiSemanticSearch)', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const anthropicOk = (payload) => vi.fn(async (url) => {
    if (String(url).includes('anthropic.com')) return new Response(JSON.stringify({ content: [{ type: 'text', text: payload }] }));
    return new Response('{}', { status: 500 });
  });
  const MSGS = [{ text: 'On va au restaurant ce soir ?', ts: 1 }, { text: 'ok pour 20h', ts: 2 }, { text: 'sujet sans rapport', ts: 3 }];

  it('sans jeton → 401', async () => {
    expect((await worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: MSGS }), mkEnv())).status).toBe(401);
  });

  it('quota gratuit épuisé (3/jour, partagé avec summarize) → 429 quota_exceeded', async () => {
    const env = mkEnv();
    await env.APEX_CHAT_KV.put(`quota:u_test_1:summarize:${today()}`, '3');
    const r = await worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: MSGS }, await userTok()), env);
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.error).toBe('quota_exceeded');
    expect(j).toMatchObject({ used: 3, limit: 3, feature: 'summarize' });
  });

  it('validation : JSON invalide (rappel catch) / query trop longue / messages vides → 400', async () => {
    const tok = await userTok();
    const r1 = await worker.fetch(rawReq('POST', '/api/ai/search', '???', tok), mkEnv());
    expect(r1.status).toBe(400);
    expect((await r1.json()).message).toBe('query required (min 2 chars)');
    const r2 = await worker.fetch(jreq('POST', '/api/ai/search', { query: 'x'.repeat(501), messages: MSGS }, tok), mkEnv());
    expect((await r2.json()).message).toBe('query too long (max 500)');
    const r3 = await worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: [] }, tok), mkEnv());
    expect((await r3.json()).message).toBe('messages array required');
  });

  it('nominal : index filtrés/bornés, scores clampés, snippet + ts, quota consommé, provider nommé', async () => {
    // Recherche = raisonnement → Anthropic d'abord (ENV : Anthropic + Groq, pas de Workers AI)
    globalThis.fetch = anthropicOk('```json\n{"results":[{"idx":0,"score":95,"reason":"parle du resto"},{"idx":1,"score":250},{"idx":7,"score":10},{"idx":"2","score":1},{"idx":-1}]}\n```');
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/ai/search', { query: 'restaurant', messages: MSGS }, await userTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.provider).toBe('anthropic');
    expect(j.premium).toBe(false);
    expect(j.results).toEqual([
      { idx: 0, score: 95, reason: 'parle du resto', snippet: 'On va au restaurant ce soir ?', ts: 1 },
      { idx: 1, score: 100, reason: '', snippet: 'ok pour 20h', ts: 2 },
    ]);
    // les messages ont été numérotés [i] dans le prompt envoyé
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sent.messages[0].content).toContain('[2] sujet sans rapport');
    expect(await env.APEX_CHAT_KV.get(`quota:u_test_1:summarize:${today()}`)).toBe('1');
  });

  it('user premium → pas de quota consommé, premium:true', async () => {
    globalThis.fetch = anthropicOk('{"results":[{"idx":2,"score":"80","reason":"r"}]}');
    const env = mkEnv([['SELECT premium_until, premium_plan FROM users WHERE id=?', { first: { premium_until: Date.now() + 86400000, premium_plan: 'yearly' } }]]);
    const j = await (await worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: MSGS }, await userTok()), env)).json();
    expect(j.premium).toBe(true);
    expect(j.results[0]).toMatchObject({ idx: 2, score: 80 });
    expect(env.APEX_CHAT_KV.put).not.toHaveBeenCalled();
  });

  it('réponse IA sans JSON puis panne du fournisseur suivant → 503 « Recherche IA indisponible »', async () => {
    globalThis.fetch = vi.fn(async (url) => (String(url).includes('anthropic.com')
      ? new Response(JSON.stringify({ content: [{ type: 'text', text: 'je ne sais pas' }] }))
      : new Response('boom', { status: 500 })));
    const r = await worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: MSGS }, await userTok()), mkEnv());
    expect(r.status).toBe(503);
    expect((await r.json()).message).toBe('Recherche IA indisponible');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // Anthropic puis Groq
  });

  it('fournisseur qui ne répond pas → abandonné à 12 s (rappel setTimeout → abort) → 503', async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch();
    const env = mkEnv([], { GROQ_API_KEY: '' }); // Anthropic seul
    const p = worker.fetch(jreq('POST', '/api/ai/search', { query: 'resto', messages: MSGS }, await userTok()), env);
    await globalThis.fetch.called;
    await vi.advanceTimersByTimeAsync(12_000);
    const r = await p;
    expect(r.status).toBe(503);
    expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

// ===========================================================================
//  handlePushSubscribe / handlePushUnsubscribe / handlePushTest — /api/push/*
// ===========================================================================
describe('/api/push/subscribe + /api/push/unsubscribe', () => {
  const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p256', auth: 'auth' } };

  it('subscribe : 401 sans jeton ; JSON invalide (rappel catch) ou clés absentes → 400', async () => {
    expect((await worker.fetch(jreq('POST', '/api/push/subscribe', { subscription: SUB }), mkEnv())).status).toBe(401);
    const r2 = await worker.fetch(rawReq('POST', '/api/push/subscribe', '<html>', await userTok()), mkEnv());
    expect(r2.status).toBe(400);
    expect((await r2.json()).message).toBe('Subscription incomplète');
    const r3 = await worker.fetch(jreq('POST', '/api/push/subscribe', { subscription: { endpoint: 'x', keys: { p256dh: 'p' } } }, await userTok()), mkEnv());
    expect(r3.status).toBe(400);
  });

  it('subscribe nominal → DELETE même endpoint puis INSERT (PK user_id, device_id = sha256(endpoint)[0..32])', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/push/subscribe', { subscription: SUB }, await userTok(), { 'user-agent': 'iPhone-test' }), env);
    expect(await r.json()).toEqual({ ok: true });
    expect(calls(env, 'run', 'DELETE FROM push_subscriptions WHERE endpoint=?')[0].args).toEqual([SUB.endpoint]);
    const ins = calls(env, 'run', 'INSERT OR REPLACE INTO push_subscriptions')[0].args;
    expect(ins[0]).toBe('u_test_1');
    expect(ins[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(ins.slice(2, 6)).toEqual([SUB.endpoint, 'p256', 'auth', 'iPhone-test']);
  });

  it('subscribe : panne D1 → 500 « DB error: … »', async () => {
    const env = mkEnv([['INSERT OR REPLACE INTO push_subscriptions', { run: boom('no such column: device_id') }]]);
    const r = await worker.fetch(jreq('POST', '/api/push/subscribe', { subscription: SUB }, await userTok()), env);
    expect(r.status).toBe(500);
    expect((await r.json()).message).toBe('DB error: no such column: device_id');
  });

  it('unsubscribe : 401 / endpoint requis (JSON invalide) / nominal scopé au user / panne 500', async () => {
    expect((await worker.fetch(jreq('POST', '/api/push/unsubscribe', { endpoint: 'e' }), mkEnv())).status).toBe(401);
    const r2 = await worker.fetch(rawReq('POST', '/api/push/unsubscribe', '', await userTok()), mkEnv());
    expect(r2.status).toBe(400);
    expect((await r2.json()).message).toBe('Endpoint requis');
    const env = mkEnv();
    const r3 = await worker.fetch(jreq('POST', '/api/push/unsubscribe', { endpoint: SUB.endpoint }, await userTok()), env);
    expect(await r3.json()).toEqual({ ok: true });
    expect(calls(env, 'run', 'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?')[0].args).toEqual([SUB.endpoint, 'u_test_1']);
    const env4 = mkEnv([['DELETE FROM push_subscriptions', { run: boom('locked') }]]);
    const r4 = await worker.fetch(jreq('POST', '/api/push/unsubscribe', { endpoint: 'e' }, await userTok()), env4);
    expect(r4.status).toBe(500);
    expect((await r4.json()).message).toBe('DB error: locked');
  });
});

describe('POST /api/push/test (handlePushTest)', () => {
  const subsRule = (rows) => ['FROM push_subscriptions WHERE user_id=?', { all: { results: rows } }];

  it('sans jeton → 401 unauthorized', async () => {
    const r = await worker.fetch(jreq('POST', '/api/push/test', {}), mkEnv());
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('unauthorized');
  });

  it('aucun abonnement → subs:0, transport fetch, base par défaut, jeton admin détecté', async () => {
    const r = await worker.fetch(jreq('POST', '/api/push/test', {}, await userTok()), mkEnv([subsRule([])]));
    expect(await r.json()).toEqual({
      ok: true, subs: 0, hasAdminToken: true, pushBase: 'https://apex-push-worker.9r4rxssx64.workers.dev', transport: 'fetch', results: [],
    });
  });

  it('via Service Binding : statut réel par abonnement, abonnement sans clés ignoré, erreur détaillée', async () => {
    const PUSH_WORKER = { fetch: vi.fn()
      .mockResolvedValueOnce(new Response('sent', { status: 201 }))
      .mockRejectedValueOnce(new Error('binding down')) };
    const env = mkEnv([subsRule([
      { endpoint: 'https://fcm.googleapis.com/x', vapid_p256dh: 'p', vapid_auth: 'a' },
      { endpoint: 'https://web.push.apple.com/y', vapid_p256dh: '' },
      { endpoint: 'https://push.mozilla.org/z', vapid_p256dh: 'p', vapid_auth: 'a' },
    ])], { PUSH_WORKER, APEX_PUSH_WORKER_URL: 'https://push.interne' });
    const j = await (await worker.fetch(jreq('POST', '/api/push/test', {}, await userTok()), env)).json();
    expect(j.transport).toBe('service-binding');
    expect(j.pushBase).toBe('https://push.interne');
    expect(j.subs).toBe(3);
    expect(j.results).toEqual([
      { status: 201, ok: true, body: 'sent', service: 'fcm.googleapis.com' },
      { skipped: 'no_keys' },
      { error: 'binding down' },
    ]);
    const sent = JSON.parse(PUSH_WORKER.fetch.mock.calls[0][1].body);
    expect(sent.subscription).toEqual({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } });
    expect(sent.payload.payload).toEqual({ type: 'test' });
    expect(PUSH_WORKER.fetch.mock.calls[0][1].headers['X-Apex-Push-Token']).toBe('admin-secret');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sans binding → fetch direct sur <base>/web-push (repli), corps de réponse tronqué à 140', async () => {
    globalThis.fetch = vi.fn(async () => new Response('k'.repeat(300), { status: 401 }));
    const env = mkEnv([subsRule([{ endpoint: 'https://push.example/1', vapid_p256dh: 'p', vapid_auth: 'a' }])]);
    const j = await (await worker.fetch(jreq('POST', '/api/push/test', {}, await userTok()), env)).json();
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://apex-push-worker.9r4rxssx64.workers.dev/web-push');
    expect(j.results[0]).toEqual({ status: 401, ok: false, body: 'k'.repeat(140), service: 'push.example' });
  });
});

// ===========================================================================
//  Force-update — POST /api/admin/force-update, POST …/force-update-via-token,
//  GET …/force-update-ts
// ===========================================================================
describe('force-update (handleAdminForceUpdate / ViaToken / Ts)', () => {
  const isAdmin = (v) => ['SELECT is_admin FROM users WHERE id=?', { first: { is_admin: v } }];

  it('force-update : 401 sans jeton ; non-admin (vérifié en base) → 403 ; panne du contrôle → 500', async () => {
    expect((await worker.fetch(jreq('POST', '/api/admin/force-update', {}), mkEnv())).status).toBe(401);
    const r2 = await worker.fetch(jreq('POST', '/api/admin/force-update', {}, await userTok()), mkEnv([isAdmin(0)]));
    expect(r2.status).toBe(403);
    expect((await r2.json()).message).toBe('Admin requis');
    const r3 = await worker.fetch(jreq('POST', '/api/admin/force-update', {}, await adminTok()), mkEnv([['SELECT is_admin FROM users WHERE id=?', { first: boom('D1 down') }]]));
    expect(r3.status).toBe(500);
    expect((await r3.json()).message).toBe('DB error: D1 down');
  });

  it('force-update admin → ts stocké dans system_config + audit ; audit en panne n\'empêche rien', async () => {
    const env = mkEnv([isAdmin(1), ['INSERT INTO audit_log', { run: boom('audit off') }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/force-update', {}, await adminTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    const w = calls(env, 'run', 'INSERT OR REPLACE INTO system_config')[0].args;
    expect(w[0]).toBe('force_update_ts');
    expect(w[1]).toBe(String(j.ts));
    expect(w[3]).toBe('kdmc_admin');
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[2]).toBe('admin.force_update_all');
  });

  it('force-update : écriture system_config en panne → 500 avec la cause', async () => {
    const env = mkEnv([isAdmin(1), ['INSERT OR REPLACE INTO system_config', { run: boom('readonly') }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/force-update', {}, await adminTok()), env);
    expect(r.status).toBe(500);
    expect((await r.json()).message).toBe('Failed to set force_update_ts: readonly');
  });

  it('via-token : secret non configuré → 503 token_unset avec la marche à suivre', async () => {
    const r = await worker.fetch(jreq('POST', '/api/admin/force-update-via-token', {}), mkEnv([], { APEX_CHAT_ADMIN_TOKEN: '' }));
    expect(r.status).toBe(503);
    const j = await r.json();
    expect(j.error).toBe('token_unset');
    expect(j.detail).toMatch(/wrangler secret put/);
  });

  it('via-token : longueur différente → 401 + hint ; même longueur mais faux → 401 (comparaison constante)', async () => {
    const r1 = await worker.fetch(jreq('POST', '/api/admin/force-update-via-token', {}, undefined, { 'X-Apex-Admin-Token': 'court' }), mkEnv());
    expect(r1.status).toBe(401);
    const j1 = await r1.json();
    expect(j1.error).toBe('bad_token');
    expect(j1.context).toEqual({ hint: 'X-Apex-Admin-Token header requis' });
    const r2 = await worker.fetch(jreq('POST', '/api/admin/force-update-via-token', {}, undefined, { 'X-Apex-Admin-Token': 'admin-secreT' }), mkEnv());
    expect(r2.status).toBe(401);
    expect((await r2.json()).context).toBeUndefined();
  });

  it('via-token nominal → ts posé par cron:deploy, source token, audit github-action', async () => {
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/admin/force-update-via-token', {}, undefined, { 'X-Apex-Admin-Token': 'admin-secret' }), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, source: 'token' });
    expect(calls(env, 'run', 'INSERT OR REPLACE INTO system_config')[0].args).toEqual(['force_update_ts', String(j.ts), j.ts, 'cron:deploy']);
    expect(JSON.parse(calls(env, 'run', 'INSERT INTO audit_log')[0].args[3])).toEqual({ ts: j.ts, source: 'github-action' });
  });

  it('via-token : panne D1 → 500 db_write_failed avec detail', async () => {
    const env = mkEnv([['INSERT OR REPLACE INTO system_config', { run: boom('D1 quota') }]]);
    const r = await worker.fetch(jreq('POST', '/api/admin/force-update-via-token', {}, undefined, { 'X-Apex-Admin-Token': 'admin-secret' }), env);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('db_write_failed');
    expect(j.detail).toBe('D1 quota');
  });

  it('force-update-ts (public) : valeur stockée / absente / non numérique / panne → toujours 200', async () => {
    const at = (rule) => worker.fetch(jreq('GET', '/api/admin/force-update-ts'), mkEnv(rule ? [rule] : [])).then((r) => r.json());
    expect(await at(['SELECT value FROM system_config WHERE key=?', { first: { value: '1757500000000' } }])).toEqual({ ok: true, ts: 1757500000000 });
    expect(await at()).toEqual({ ok: true, ts: 0 });
    expect(await at(['SELECT value FROM system_config WHERE key=?', { first: { value: 'abc' } }])).toEqual({ ok: true, ts: 0 });
    expect(await at(['SELECT value FROM system_config WHERE key=?', { first: boom('down') }])).toEqual({ ok: true, ts: 0 });
  });
});

// ===========================================================================
//  handleSetTurnConfig — POST /api/admin/turn-config (+ GET /api/turn via KV)
// ===========================================================================
describe('POST /api/admin/turn-config (handleSetTurnConfig)', () => {
  const ICE = { iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' } };

  it('non-Kevin → 403 forbidden (auth_sub) ; JSON invalide → 400 ; clé/jeton manquants → 400 missing', async () => {
    const r1 = await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await admin2Tok()), mkEnv());
    expect(r1.status).toBe(403);
    expect((await r1.json()).context).toEqual({ auth_sub: 'u_admin_2' });
    const r2 = await worker.fetch(rawReq('POST', '/api/admin/turn-config', '{', await adminTok()), mkEnv());
    expect((await r2.json()).error).toBe('bad_json');
    const r3 = await worker.fetch(jreq('POST', '/api/admin/turn-config', { keyId: 'k' }, await adminTok()), mkEnv());
    expect(r3.status).toBe(400);
    const j3 = await r3.json();
    expect(j3.error).toBe('missing');
    expect(j3.context).toEqual({ has_key_id: true, has_token: false });
  });

  it('KV absent → 500 no_kv ; KV en panne → 500 kv_put_failed avec detail', async () => {
    const r1 = await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await adminTok()), mkEnv([], { APEX_CHAT_CACHE: null }));
    expect(r1.status).toBe(500);
    expect((await r1.json()).error).toBe('no_kv');
    const env = mkEnv();
    env.APEX_CHAT_CACHE.put = vi.fn(async () => { throw new Error('KV write limit'); });
    const r2 = await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await adminTok()), env);
    expect(r2.status).toBe(500);
    const j2 = await r2.json();
    expect(j2.error).toBe('kv_put_failed');
    expect(j2.detail).toBe('KV write limit');
  });

  it('nominal : stocké en KV (alias keyId/key acceptés) + vérifié immédiatement auprès de Cloudflare', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(ICE)));
    const env = mkEnv();
    const r = await worker.fetch(jreq('POST', '/api/admin/turn-config', { keyId: ' key-1 ', key: 'tok-1' }, await adminTok()), env);
    expect(await r.json()).toEqual({ ok: true, stored: true, verified: true, verifyReason: null });
    const stored = JSON.parse(env.APEX_CHAT_CACHE._store.get('turn_config'));
    expect(stored).toMatchObject({ key_id: 'key-1', token: 'tok-1' });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body)).toEqual({ ttl: 600 });
  });

  it('vérification refusée (HTTP 401) → stocké mais verified:false, verifyReason http_401', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":"bad key"}', { status: 401 }));
    const j = await (await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await adminTok()), mkEnv())).json();
    expect(j).toEqual({ ok: true, stored: true, verified: false, verifyReason: 'http_401' });
  });

  it('réponse Cloudflare non-JSON (rappel r.json().catch) → verified:false ; fetch qui plante → cause dans verifyReason', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>maintenance</html>', { status: 200 }));
    const j1 = await (await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await adminTok()), mkEnv())).json();
    // `verified = r.ok && d && !!d.iceServers` : d=null → null (falsy, pas strictement false)
    expect(j1.stored).toBe(true);
    expect(j1.verified).toBeFalsy();
    expect(j1.verifyReason).toBe('http_200');
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const j2 = await (await worker.fetch(jreq('POST', '/api/admin/turn-config', { key_id: 'k', token: 't' }, await adminTok()), mkEnv())).json();
    expect(j2).toMatchObject({ stored: true, verified: false, verifyReason: 'ECONNRESET' });
  });

  it('GET /api/turn lit ensuite la clé depuis le KV ; réponse CF illisible (rappel catch) → STUN seul avec cause', async () => {
    const env = mkEnv();
    await env.APEX_CHAT_CACHE.put('turn_config', JSON.stringify({ key_id: 'kv-key', token: 'kv-tok' }));
    globalThis.fetch = vi.fn(async () => new Response('pas du json', { status: 200 }));
    const r = await worker.fetch(jreq('GET', '/api/turn', undefined, await userTok()), env);
    const j = await r.json();
    expect(j.turn).toBe(false);
    expect(j.reason).toBe('cf_turn_http_200');
    expect(j.iceServers[0].urls).toContain('stun:stun.cloudflare.com:3478');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/keys/kv-key/');
    // health : la source est bien le KV
    const h = await (await worker.fetch(jreq('GET', '/api/turn/health'), env)).json();
    expect(h).toMatchObject({ configured: true, source: 'kv' });
  });
});

// ===========================================================================
//  Rappels anonymes best-effort (`.catch(() => {})`) des nettoyages D1
// ===========================================================================
describe('rappels `.catch` des nettoyages D1 (handleTestCleanup, heal, cleanup*)', () => {
  it('POST /api/test/cleanup : chaque DELETE en panne est absorbé, conv vide purgée, réponse 200 avec la liste', async () => {
    const env = mkEnv([
      ["WHERE source='e2e-test'", { all: { results: [{ id: 'e2e_alice' }, { id: 'e2e_bob' }] } }],
      ['SELECT conv_id FROM conversation_members WHERE user_id=?', { all: (args) => ({ results: args[0] === 'e2e_alice' ? [{ conv_id: 'cA' }, { conv_id: 'cB' }] : [] }) }],
      ['DELETE FROM messages WHERE sender_id=?', { run: boom('m') }],
      ['DELETE FROM conversation_members WHERE user_id=?', { run: boom('cm') }],
      ['DELETE FROM contacts WHERE user_id=? OR contact_id=?', { run: boom('ct') }],
      ['DELETE FROM users WHERE id=?', { run: boom('u') }],
      ['SELECT COUNT(*) AS n FROM conversation_members WHERE conv_id=?', { first: (args) => { if (args[0] === 'cA') throw new Error('count'); return { n: 0 }; } }],
      ['DELETE FROM messages WHERE conv_id=?', { run: boom('mc') }],
      ['DELETE FROM conversations WHERE id=?', { run: boom('c') }],
    ]);
    const r = await handleTestCleanup(jreq('POST', '/api/test/cleanup', {}, undefined, { 'X-Test-Auth': 'admin-secret' }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, removed_count: 2, removed: ['e2e_alice', 'e2e_bob'] });
    // cA : comptage en panne → traitée comme non vide (rien supprimé) ; cB : vide → purge tentée
    expect(calls(env, 'run', 'DELETE FROM conversations WHERE id=?').map((c) => c.args[0])).toEqual(['cB']);
    // mauvais secret → 403
    expect((await handleTestCleanup(jreq('POST', '/api/test/cleanup', {}, undefined, { 'X-Test-Auth': 'faux' }), env)).status).toBe(403);
  });

  it('_healLocalConvMembers : membre local_+numéro résolu ; UPDATE messages en panne absorbé ; fixed=1', async () => {
    const env = mkEnv([
      ["WHERE user_id LIKE 'local%'", { all: { results: [{ user_id: 'local_+33600000010' }, { user_id: 'local_+33699999999' }] } }],
      ['phone LIKE ?', { first: (args) => (args[0] === '%00000010' ? { id: 'u_real' } : null) }],
      ['UPDATE messages SET sender_id=?', { run: boom('messages locked') }],
    ]);
    expect(await _healLocalConvMembers(env.APEX_CHAT_DB)).toBe(1);
    expect(calls(env, 'run', 'INSERT OR IGNORE INTO conversation_members')[0].args).toEqual(['u_real', 'local_+33600000010']);
    expect(calls(env, 'run', 'DELETE FROM conversation_members WHERE user_id=?')[0].args).toEqual(['local_+33600000010']);
  });

  it('consolidateKevinIntoAdmin : doublon libéré même si le re-pointage messages/membres échoue', async () => {
    const env = mkEnv([
      ["SELECT * FROM users WHERE id='kdmc_admin'", { first: { id: 'kdmc_admin', phone: '+33600000001' } }],
      ["SELECT * FROM users WHERE phone=? AND id!='kdmc_admin'", { first: { id: 'u_dup' } }],
      ['UPDATE messages SET sender_id=?', { run: boom('m') }],
      ['INSERT OR IGNORE INTO conversation_members', { run: boom('cm') }],
      ['DELETE FROM conversation_members WHERE user_id=?', { run: boom('d') }],
    ]);
    const admin = await consolidateKevinIntoAdmin(env, '+33600000001', 'hash', 1000);
    expect(admin.id).toBe('kdmc_admin');
    expect(calls(env, 'run', "status='deleted', merged_into='kdmc_admin'")[0].args).toEqual(['moved_u_dup', 1000, 'u_dup']);
    // numéro déjà porté par l'admin → pas de changement de phone
    expect(calls(env, 'run', "is_kevin_alias=1")).toHaveLength(0);
    expect(JSON.parse(calls(env, 'run', 'INSERT INTO audit_log')[0].args[4])).toEqual({ merged: 'u_dup', phone_set: false });
  });

  it('cleanupEmptyConversations : DM vide orpheline comptée même si les DELETE échouent ; DM active/avec messages gardées', async () => {
    const env = mkEnv([
      ["FROM conversations c WHERE c.type='dm'", { all: { results: [
        { id: 'c_vide_solo', msgs: 0, mem: 1, archived_at: null },
        { id: 'c_active', msgs: 0, mem: 2, archived_at: null },
        { id: 'c_avec_msgs', msgs: 3, mem: 1, archived_at: null },
      ] } }],
      ['DELETE FROM conversation_members WHERE conv_id=?', { run: boom('x') }],
      ['DELETE FROM conversations WHERE id=?', { run: boom('y') }],
    ]);
    expect(await cleanupEmptyConversations(env.APEX_CHAT_DB)).toBe(1);
    expect(calls(env, 'run', 'DELETE FROM conversations WHERE id=?').map((c) => c.args[0])).toEqual(['c_vide_solo']);
  });

  it('cleanupGhostMembers : fantôme retiré (DELETE + recalage member_count en panne absorbés)', async () => {
    const env = mkEnv([
      ["u.status = 'deleted' OR u.merged_into IS NOT NULL", { all: { results: [{ conv_id: 'c1', user_id: 'ghost' }, { conv_id: 'c2', user_id: 'ghost2' }] } }],
      ['SELECT COUNT(*) AS c FROM conversation_members cm', { first: (args) => ({ c: args[0] === 'c1' ? 1 : 0 }) }],
      ['DELETE FROM conversation_members WHERE conv_id=? AND user_id=?', { run: boom('d') }],
      ['SELECT COUNT(*) AS c FROM conversation_members WHERE conv_id=?', { first: { c: 1 } }],
      ['UPDATE conversations SET member_count=?', { run: boom('u') }],
    ]);
    expect(await cleanupGhostMembers(env.APEX_CHAT_DB)).toBe(1); // c2 sans membre réel → jamais touché
    expect(calls(env, 'run', 'UPDATE conversations SET member_count=?')[0].args).toEqual([1, 'c1']);
  });
});

// ===========================================================================
//  Rappels anonymes des routes admin / contacts / invitations / magic-login
// ===========================================================================
describe('rappels anonymes — admin diag, invitations, magic-login, contacts', () => {
  it('GET /api/admin/diag : 2 DM actives pour la même paire → tri par last_msg_ts + alerte « Conversations dupliquées »', async () => {
    const env = mkEnv([
      ['SELECT COUNT(*) c FROM messages WHERE sender_id=?', { first: { c: 0 } }],
      ['SELECT COUNT(*) c FROM messages WHERE conv_id=?', { first: { c: 1 } }],
      [/SELECT COUNT\(\*\) c FROM (users|conversations|messages)/, { first: { c: 2 } }],
      ['FROM users ORDER BY COALESCE(last_seen,0) DESC LIMIT 40', { all: { results: [
        { id: 'u1', pseudo: 'a', real_name: 'Alice Test', status: 'active' },
        { id: 'u2', pseudo: 'b', real_name: 'Bob Test', status: 'active' },
      ] } }],
      ['SELECT conv_id, role FROM conversation_members WHERE user_id=?', { all: { results: [{ conv_id: 'c_old', role: 'owner' }, { conv_id: 'c_new', role: 'member' }] } }],
      ['FROM conversations WHERE id=?', { first: (args) => ({ id: args[0], type: 'dm', last_msg_ts: args[0] === 'c_new' ? 200 : 100, member_count: 2, archived_at: null }) }],
      ['SELECT user_id, role FROM conversation_members WHERE conv_id=?', { all: { results: [{ user_id: 'u1', role: 'owner' }, { user_id: 'u2', role: 'member' }] } }],
      ['SELECT pseudo, real_name, status, merged_into FROM users WHERE id=?', { first: { pseudo: 'p', real_name: 'N', status: 'active', merged_into: null } }],
    ]);
    const r = await worker.fetch(jreq('GET', '/api/admin/diag', undefined, await adminTok()), env);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.conversations.map((c) => c.id)).toEqual(['c_new', 'c_old']);
    expect(j.checks.map((c) => c.label)).toContain('Conversations dupliquées');
    expect(j.checks.find((c) => c.label === 'Conversations dupliquées').detail).toMatch(/^2 conversations actives/);
    expect(j.users[0].phone).toBeNull();
  });

  it('POST /api/invitations : nouvel invité créé (code 8 car., id u_hex) ; nom de l\'inviteur en panne → repli pseudo du jeton', async () => {
    const env = mkEnv([
      ['SELECT COUNT(*) as c FROM invitations WHERE inviter_id=?', { first: { c: 0 } }],
      ['FROM users WHERE phone_hash=?', { first: null }],
      ['SELECT 1 FROM users WHERE pseudo=?', { first: { 1: 1 } }],
      ['SELECT real_name, pseudo FROM users WHERE id=?', { first: boom('lecture inviteur KO') }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/invitations', { phone: '0600000020', name: 'Marie Test' }, await userTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/); // audit 17/09 : 30⁸ ≈ 6,6·10¹¹ combinaisons (avant 30⁴ ≈ 810 000)
    expect(j.invited_user_id).toMatch(/^u_[0-9a-f]{16}$/);
    expect(j.sms_template).toMatch(/^Salut Marie Test ! testeur t'invite/);
    const ins = calls(env, 'run', 'INSERT INTO users')[0].args;
    expect(ins[1]).toMatch(/^marietest_[0-9a-z]{4}$/); // pseudo déjà pris → suffixe
    expect(ins[3]).toBe('+33600000020');
    expect(calls(env, 'run', 'INSERT INTO invitations')[0].args[1]).toBe('u_test_1');
  });

  it('POST /api/invitations : invité déjà connu → UPDATE admin_authorized (panne absorbée) + push tenté, id existant renvoyé', async () => {
    const env = mkEnv([
      ['SELECT COUNT(*) as c FROM invitations WHERE inviter_id=?', { first: { c: 0 } }],
      ['FROM users WHERE phone_hash=?', { first: { id: 'u_exist', pseudo: 'ami' } }],
      ['UPDATE users SET admin_authorized=1, updated_at=? WHERE id=?', { run: boom('readonly') }],
      ['SELECT real_name, pseudo FROM users WHERE id=?', { first: { real_name: 'Testeur Un', pseudo: 'testeur' } }],
      ['FROM push_subscriptions WHERE user_id=?', { all: { results: [] } }],
    ]);
    const j = await (await worker.fetch(jreq('POST', '/api/invitations', { phone: '+33600000020' }, await userTok()), env)).json();
    expect(j.invited_user_id).toBe('u_exist');
    expect(j.sms_template).toMatch(/Testeur Un t'invite/);
    expect(calls(env, 'all', 'FROM push_subscriptions WHERE user_id=?')[0].args[0]).toBe('u_exist');
    expect(calls(env, 'run', 'INSERT INTO users')).toHaveLength(0);
  });

  it('POST /api/auth/magic-login : invitation valide, marquage accepted_at en panne absorbé → session émise', async () => {
    const magic = await makeJWT({ typ: 'magic_invite', uid: 'u_inv', pseudo: 'inv', invited_by: 'kdmc_admin', iat: IAT(), exp: IAT() + 3600 });
    const env = mkEnv([
      ['FROM users WHERE id=?', { first: { id: 'u_inv', pseudo: 'inv', display_name: 'Invité Test', admin_authorized: 1 } }],
      ['UPDATE invitations SET accepted_at=?', { run: boom('invitations locked') }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/auth/magic-login', { magic_token: magic }), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.user).toEqual({ id: 'u_inv', pseudo: 'inv', display_name: 'Invité Test', avatar_url: undefined });
    expect(j.jwt.split('.')).toHaveLength(3);
    expect(calls(env, 'run', 'UPDATE invitations SET accepted_at=?')[0].args[1]).toBe(magic);
  });

  it('GET /api/contacts : profil d\'un pair illisible (rappel catch) → ignoré, Kevin toujours présent', async () => {
    const env = mkEnv([
      ['SELECT DISTINCT m2.user_id AS uid', { all: { results: [{ uid: 'u_peer' }] } }],
      ['avatar_url, last_seen, status, merged_into, source', { first: (args) => { if (args[0] === 'u_peer') throw new Error('row KO'); return { id: args[0], pseudo: 'kevin', last_seen: 5 }; } }],
    ]);
    const j = await (await worker.fetch(jreq('GET', '/api/contacts', undefined, await userTok()), env)).json();
    expect(j.count).toBe(1);
    expect(j.users[0].id).toBe('kdmc_admin');
  });

  it('GET /api/contact/:id : contrôle de conv partagée en panne → 403 ; admin avec fiche illisible → 404 not_found', async () => {
    const env1 = mkEnv([['SELECT 1 FROM conversation_members a JOIN conversation_members b', { first: boom('join KO') }]]);
    const r1 = await worker.fetch(jreq('GET', '/api/contact/u_autre', undefined, await userTok()), env1);
    expect(r1.status).toBe(403);
    expect((await r1.json()).message).toBe('Accès refusé à cette fiche');
    const env2 = mkEnv([['language, timezone, last_seen', { first: boom('select KO') }]]);
    const r2 = await worker.fetch(jreq('GET', '/api/contact/u_autre', undefined, await adminTok()), env2);
    expect(r2.status).toBe(404);
    const j2 = await r2.json();
    expect(j2.error).toBe('not_found');
    expect(j2.context).toEqual({ id: 'u_autre', canonical: 'u_autre' });
  });

  it('DELETE /api/contact/:id : lecture en panne → 404 ; suppression des appartenances en panne absorbée → 200', async () => {
    const env1 = mkEnv([['SELECT id, phone, pseudo FROM users WHERE id=?', { first: boom('KO') }]]);
    const r1 = await worker.fetch(jreq('DELETE', '/api/contact/u_x', undefined, await adminTok()), env1);
    expect(r1.status).toBe(404);
    const env2 = mkEnv([
      ['SELECT id, phone, pseudo FROM users WHERE id=?', { first: { id: 'u_x', pseudo: 'x', phone: '+33633333333' } }],
      ['DELETE FROM conversation_members WHERE user_id=?', { run: boom('cm KO') }],
    ]);
    const r2 = await worker.fetch(jreq('DELETE', '/api/contact/u_x', undefined, await adminTok()), env2);
    expect(await r2.json()).toEqual({ ok: true, deleted: 'u_x' });
    expect(calls(env2, 'run', "UPDATE users SET status='deleted'")[0].args[0]).toBe('deleted_u_x');
  });

  it('PUT /api/contact/:id/nickname : JSON invalide → alias effacé (NULL)', async () => {
    const env = mkEnv();
    const r = await worker.fetch(rawReq('PUT', '/api/contact/u_x/nickname', '{', await userTok()), env);
    expect(await r.json()).toEqual({ ok: true, nickname: '' });
    expect(calls(env, 'run', 'UPDATE contacts SET nickname=NULL')[0].args).toEqual(['u_test_1', 'u_x']);
  });

  it('GET /api/admin/all-users et /api/admin/live-users : comptage de conversations en panne → conv_count 0', async () => {
    const env = mkEnv([
      ['FROM users WHERE 1=1', { all: { results: [{ id: 'u1', phone: '+33600000010' }] } }],
      ['WHERE u.last_seen > ?', { all: { results: [{ id: 'u1' }] } }],
      ['SELECT COUNT(*) as c FROM conversation_members WHERE user_id=?', { first: boom('count KO') }],
    ]);
    const j1 = await (await worker.fetch(jreq('GET', '/api/admin/all-users', undefined, await adminTok()), env)).json();
    expect(j1.users[0]).toMatchObject({ id: 'u1', conv_count: 0, phone_last4: '0010' });
    const j2 = await (await worker.fetch(jreq('GET', '/api/admin/live-users', undefined, await adminTok()), env)).json();
    expect(j2.users[0]).toMatchObject({ id: 'u1', conv_count: 0 });
  });

  it('POST /api/admin/users/:id/force_logout : écriture en panne absorbée → « Déconnexion forcée »', async () => {
    const env = mkEnv([['last_force_logout_at=? WHERE id=?', { run: boom('KO') }]]);
    const j = await (await worker.fetch(jreq('POST', '/api/admin/users/u_x/force_logout', {}, await adminTok()), env)).json();
    expect(j).toEqual({ ok: true, message: 'Déconnexion forcée' });
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[1]).toBe('admin_user_force_logout');
  });

  it('timeline / conversations / search / map / geo-history admin : chaque `all()` en panne → listes vides, jamais 500', async () => {
    const env = mkEnv([
      ['admin_authorized, last_geo_label, last_device_label', { first: { id: 'u_x', pseudo: 'x' } }],
      [/FROM (audit_log|user_activity|invitations|signalements|conversations c)/, { all: boom('all KO') }],
      ['WHERE last_lat IS NOT NULL AND last_lng IS NOT NULL', { all: boom('map KO') }],
      ['WHERE LOWER(pseudo) LIKE ? OR LOWER(real_name) LIKE ? OR phone LIKE ?', { all: boom('users KO') }],
    ]);
    const tok = await adminTok();
    const tl = await (await worker.fetch(jreq('GET', '/api/admin/users/u_x/timeline?limit=10', undefined, tok), env)).json();
    expect(tl.user).toEqual({ id: 'u_x', pseudo: 'x' });
    expect(tl.timeline).toEqual({ audit: [], activity: [], invitations: [], signalements: [], conversations: [] });
    const cv = await (await worker.fetch(jreq('GET', '/api/admin/users/u_x/conversations', undefined, tok), env)).json();
    expect(cv).toEqual({ ok: true, conversations: [] });
    const se = await (await worker.fetch(jreq('GET', '/api/admin/search?q=marie', undefined, tok), env)).json();
    expect(se.results).toEqual({ users: [], audit: [], invitations: [], signalements: [] });
    const map = await (await worker.fetch(jreq('GET', '/api/admin/map', undefined, tok), env)).json();
    expect(map).toMatchObject({ ok: true, count: 0, users: [] });
    const geo = await (await worker.fetch(jreq('GET', '/api/admin/users/u_x/geo-history?days=99', undefined, tok), env)).json();
    expect(geo).toEqual({ ok: true, points: [], days: 30 });
  });
});

// ===========================================================================
//  Rappels anonymes des routes user (stories, polls, memory-lane, heartbeat…)
// ===========================================================================
describe('rappels anonymes — stories, sondages, memory lane, heartbeat, CGU, prekeys, profil', () => {
  it('GET /api/stories/:id : déjà vue par ce user (rappel some) → pas de ré-écriture, views_count inchangé', async () => {
    const env = mkEnv([['FROM stories WHERE id=?', { first: { id: 's1', ciphertext: 'c', mime: 'image/jpeg', ts: 1, expires_at: 9e12, views: JSON.stringify([{ user_id: 'u_test_1', viewed_at: 1 }, { user_id: 'u_autre', viewed_at: 2 }]) } }]]);
    const j = await (await worker.fetch(jreq('GET', '/api/stories/s1', undefined, await userTok()), env)).json();
    expect(j.story.views_count).toBe(2);
    expect(calls(env, 'run', 'UPDATE stories')).toHaveLength(0);
  });

  it('POST /api/polls/:id/vote : sondage à choix unique → l\'ancien vote du user est retiré (rappel filter)', async () => {
    const env = mkEnv([
      ['SELECT * FROM polls WHERE id=?', { first: { id: 'p1', conv_id: 'c1', multi_choice: 0, anonymous: 0, votes: JSON.stringify({ 0: ['u_test_1', 'u_autre'], 1: [] }) } }],
      ['SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id=?', { first: { user_id: 'u_test_1' } }],
    ]);
    const j = await (await worker.fetch(jreq('POST', '/api/polls/p1/vote', { option_indexes: [1] }, await userTok()), env)).json();
    expect(j.votes).toEqual({ 0: ['u_autre'], 1: ['u_test_1'] });
    expect(j.counts).toEqual({ 0: 1, 1: 1 });
    expect(JSON.parse(calls(env, 'run', 'UPDATE polls SET votes=?')[0].args[0])).toEqual({ 0: ['u_autre'], 1: ['u_test_1'] });
  });

  it('GET /api/memory-lane : sans cache → ids des messages d\'il y a 1 an (rappel map) indexés', async () => {
    const env = mkEnv([['SELECT id FROM messages WHERE sender_id=? AND ts BETWEEN', { all: { results: [{ id: 'm1' }, { id: 'm2' }] } }]]);
    const j = await (await worker.fetch(jreq('GET', '/api/memory-lane', undefined, await userTok()), env)).json();
    expect(j.memory.msg_ids).toEqual(['m1', 'm2']);
    expect(j.memory.count).toBe(2);
    expect(calls(env, 'run', 'INSERT OR REPLACE INTO memory_lane_index')[0].args[2]).toBe('["m1","m2"]');
  });

  it('POST /api/users/heartbeat : JSON invalide toléré, UPDATE + INSERT en panne absorbés → 200', async () => {
    const env = mkEnv([
      ['UPDATE users SET last_seen=?', { run: boom('u KO') }],
      ['INSERT INTO user_activity', { run: boom('a KO') }],
    ]);
    const r = await worker.fetch(rawReq('POST', '/api/users/heartbeat', 'pas json', await userTok(), { 'user-agent': 'iPhone', 'cf-ipcity': 'Monaco', 'cf-ipcountry': 'MC' }), env);
    expect(await r.json()).toEqual({ ok: true });
    expect(calls(env, 'run', 'UPDATE users SET last_seen=?')[0].args[3]).toBe('iOS');
    expect(calls(env, 'run', 'INSERT INTO user_activity')[0].args[6]).toBe('Monaco, MC');
  });

  it('POST /api/cgu/accept : insertion en panne absorbée → 200', async () => {
    const env = mkEnv([['INSERT INTO cgu_acceptances', { run: boom('cgu KO') }]]);
    const r = await worker.fetch(jreq('POST', '/api/cgu/accept', { version: 'v1' }), env);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('PATCH /api/users/me et POST /api/keys/prekeys : JSON invalide → 400 explicite (rappel catch)', async () => {
    const r1 = await worker.fetch(rawReq('PATCH', '/api/users/me', '{', await userTok()), mkEnv());
    expect(r1.status).toBe(400);
    expect((await r1.json()).message).toBe('Aucun champ à mettre à jour');
    const r2 = await worker.fetch(rawReq('POST', '/api/keys/prekeys', '{', await userTok()), mkEnv());
    expect(r2.status).toBe(400);
    const j2 = await r2.json();
    expect(j2.error).toBe('bad_pubkey');
    expect(j2.context).toEqual({ len: 0 });
  });

  it('POST /api/auth/verify-otp : JSON invalide → 400 bad_json avec la cause exacte', async () => {
    const r = await worker.fetch(rawReq('POST', '/api/auth/verify-otp', '{bad'), mkEnv());
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toBe('bad_json');
    expect(j.detail).toMatch(/JSON/);
  });

  it('POST /api/auth/verify-otp : signup direct (cercle privé) sur compte existant, audit en panne absorbé → session émise', async () => {
    const env = mkEnv([
      ['SELECT * FROM users WHERE phone=?', { first: { id: 'u_exist', pseudo: 'marie_t', real_name: 'Marie Test', phone: '+33600000020', is_admin: 0 } }],
      ['INSERT INTO audit_log', { run: boom('audit KO') }],
    ]);
    const r = await worker.fetch(jreq('POST', '/api/auth/verify-otp', { phone: '0600000020', pseudo: 'marie_t', name: 'Marie Test', otp: '000000' }), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.token.split('.')).toHaveLength(3);
    expect(j.user).toEqual({ id: 'u_exist', pseudo: 'marie_t', real_name: 'Marie Test', phone: '+33600000020', is_admin: false });
    expect(calls(env, 'run', 'INSERT INTO users')).toHaveLength(0); // compte existant → pas de création
    expect(calls(env, 'run', 'INSERT INTO audit_log')[0].args[1]).toBe('direct_signup');
  });

  it('POST /api/auth/sso-from-kdmc : whoami répond 200 mais illisible (rappel catch) → 401 session invalide', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>', { status: 200 }));
    const r = await worker.fetch(jreq('POST', '/api/auth/sso-from-kdmc', { kdmc_token: 'tok' }), mkEnv());
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('kdmc_session_invalide');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://kd-mc.com/__sso/whoami');
  });

  it('fetchFirebasePublicKeys : mise en cache KV en panne absorbée → clés quand même renvoyées', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ kid1: '-----BEGIN CERTIFICATE-----x' })));
    const env = { APEX_CHAT_CACHE: { get: vi.fn(async () => null), put: vi.fn(async () => { throw new Error('KV KO'); }) } };
    expect(await fetchFirebasePublicKeys(env)).toEqual({ kid1: '-----BEGIN CERTIFICATE-----x' });
    expect(env.APEX_CHAT_CACHE.put).toHaveBeenCalled();
  });
});

// ===========================================================================
//  Routes IA : corps invalide (rappel `json().catch`) + abandon après délai
// ===========================================================================
describe('routes IA — corps JSON invalide → 400 explicite, jamais 500', () => {
  const cases = [
    ['/api/ai/summarize', 'prompt required (min 10 chars)'],
    ['/api/ai/smart-reply', 'last_message required'],
    ['/api/ai/translate', 'text required'],
    ['/api/ai/image-describe', 'image_base64 required'],
    ['/api/ai/rewrite', 'text required (min 3 chars)'],
  ];
  for (const [path, message] of cases) {
    it(`POST ${path}`, async () => {
      const r = await worker.fetch(rawReq('POST', path, '{{', await userTok()), mkEnv());
      expect(r.status).toBe(400);
      expect((await r.json()).message).toBe(message);
    });
  }

  it('POST /api/premium/request : JSON invalide → plan mensuel par défaut, demande enregistrée en KV', async () => {
    const env = mkEnv([['FROM push_subscriptions WHERE user_id=?', { all: { results: [] } }]]);
    const r = await worker.fetch(rawReq('POST', '/api/premium/request', '{{', await userTok()), env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, pending: true, plan: 'monthly', price_eur: 6.99 });
    expect(JSON.parse(await env.APEX_CHAT_KV.get('premium_req:u_test_1'))).toMatchObject({ user_id: 'u_test_1', plan: 'monthly', status: 'pending' });
  });

  it('POST /api/admin/grant-premium : JSON invalide → 400 « user_id requis »', async () => {
    const r = await worker.fetch(rawReq('POST', '/api/admin/grant-premium', '{{', await adminTok()), mkEnv());
    expect(r.status).toBe(400);
    expect((await r.json()).message).toBe('user_id requis');
  });
});

describe('routes IA — fournisseur muet → abandon par minuterie (rappels `() => ctrl.abort()`)', () => {
  const run = async (path, body, ms, extraHeaders) => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch();
    const env = mkEnv([], { GROQ_API_KEY: '' }); // Anthropic seul → un seul essai
    const req = extraHeaders ? rawReq('POST', path, body, await userTok(), extraHeaders) : jreq('POST', path, body, await userTok());
    const p = worker.fetch(req, env);
    await globalThis.fetch.called;
    await vi.advanceTimersByTimeAsync(ms);
    const r = await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    return r;
  };

  it('/api/ia/chat → 503 avec la cause « aborted » par fournisseur (8 s)', async () => {
    const r = await run('/api/ia/chat', { messages: [{ role: 'user', content: 'bonjour' }] }, 8_000);
    expect(r.status).toBe(503);
    expect((await r.json()).tried).toEqual([{ provider: 'anthropic', error: 'aborted' }]);
  });
  it('/api/ai/summarize → 503 (15 s)', async () => {
    const r = await run('/api/ai/summarize', { prompt: 'résume cette longue discussion entre amis' }, 15_000);
    expect(r.status).toBe(503);
    expect((await r.json()).message).toBe('Tous providers IA indisponibles');
  });
  it('/api/ai/smart-reply → 503 (6 s)', async () => {
    const r = await run('/api/ai/smart-reply', { last_message: 'Tu viens ce soir ?' }, 6_000);
    expect(r.status).toBe(503);
    expect((await r.json()).message).toBe('IA indisponible');
  });
  it('/api/ai/translate → 503 (8 s)', async () => {
    const r = await run('/api/ai/translate', { text: 'Bonjour', target_lang: 'en' }, 8_000);
    expect(r.status).toBe(503);
    expect((await r.json()).message).toBe('Traduction IA indisponible');
  });
  it('/api/ai/rewrite → 503 (10 s)', async () => {
    const r = await run('/api/ai/rewrite', { text: 'salut ça va', style: 'formal' }, 10_000);
    expect(r.status).toBe(503);
    expect((await r.json()).message).toBe('Reformulation IA indisponible');
  });
  it('/api/ai/image-describe → 502 « Vision error: aborted » (20 s)', async () => {
    const r = await run('/api/ai/image-describe', { image_base64: 'data:image/png;base64,' + 'A'.repeat(200) }, 20_000);
    expect(r.status).toBe(502);
    expect((await r.json()).message).toBe('Vision error: aborted');
  });
  it('/api/ai/voice-transcribe (audio brut) → 502 « Whisper error: aborted » (30 s)', async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch();
    const p = worker.fetch(rawReq('POST', '/api/ai/voice-transcribe?lang=fr', 'RIFFxxxx', await userTok(), { 'Content-Type': 'audio/webm' }), mkEnv());
    await globalThis.fetch.called;
    await vi.advanceTimersByTimeAsync(30_000);
    const r = await p;
    expect(r.status).toBe(502);
    expect((await r.json()).message).toBe('Whisper error: aborted');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
  });

  it('réponse HTTP en erreur dont le corps est illisible (rappel r.text().catch) → 502 avec le statut', async () => {
    const badBody = () => ({ ok: false, status: 500, text: () => Promise.reject(new Error('stream closed')) });
    globalThis.fetch = vi.fn(async () => badBody());
    const r1 = await worker.fetch(rawReq('POST', '/api/ai/voice-transcribe', 'RIFF', await userTok(), { 'Content-Type': 'audio/webm' }), mkEnv());
    expect(r1.status).toBe(502);
    expect((await r1.json()).message).toBe('Whisper HTTP 500');
    const r2 = await worker.fetch(jreq('POST', '/api/ai/image-describe', { image_base64: 'A'.repeat(200) }, await userTok()), mkEnv());
    expect(r2.status).toBe(502);
    expect((await r2.json()).message).toBe('Anthropic Vision HTTP 500');
  });
});

// ===========================================================================
//  Routeur (catch global), consumer de file et cron : envois de file refusés
// ===========================================================================
describe('routeur / queue / scheduled — files qui refusent (rappels `.catch(() => {})`)', () => {
  it('exception dans un handler + TELEMETRY_QUEUE.send qui rejette → 500 detail exact, waitUntil résolu', async () => {
    const env = mkEnv([['FROM system_config', { all: boom('D1 down') }]]);
    env.TELEMETRY_QUEUE = { send: vi.fn(async () => { throw new Error('queue full'); }) };
    const ctx = { waitUntil: vi.fn() };
    const r = await worker.fetch(jreq('GET', '/api/system/config'), env, ctx);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('internal');
    expect(j.detail).toBe('D1 down');
    expect(env.TELEMETRY_QUEUE.send.mock.calls[0][0]).toMatchObject({ sentinel: 'api-error', path: '/api/system/config', method: 'GET', msg: 'D1 down' });
    await expect(ctx.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('queue lifecycle-r2 : suppression R2 en panne absorbée → ligne media purgée, message acquitté', async () => {
    const env = mkEnv([['SELECT id, r2_key FROM media WHERE expires_at < ?', { all: { results: [{ id: 'm1', r2_key: 'k1' }, { id: 'm2', r2_key: 'k2' }] } }]]);
    env.APEX_CHAT_MEDIA = { delete: vi.fn(async () => { throw new Error('R2 KO'); }) };
    const msg = { body: { queue_type: 'lifecycle-r2' }, ack: vi.fn(), retry: vi.fn() };
    await worker.queue({ messages: [msg] }, env);
    expect(env.APEX_CHAT_MEDIA.delete).toHaveBeenCalledTimes(2);
    expect(calls(env, 'run', 'DELETE FROM media WHERE id=?').map((c) => c.args[0])).toEqual(['m1', 'm2']);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('scheduled : chaque envoi de file refusé est absorbé (horaire, 5 min, 9 h) — aucune promesse rejetée', async () => {
    const refuse = () => ({ send: vi.fn(async () => { throw new Error('refusé'); }) });
    const env = mkEnv([
      ['FROM letters_queue WHERE deliver_at <= ?', { all: { results: [{ id: 'l1' }] } }],
      ['FROM time_capsules WHERE open_at <= ?', { all: { results: [{ id: 'cap1' }] } }],
      ['SELECT id FROM users WHERE last_seen > ?', { all: { results: [{ id: 'u1' }, { id: 'u2' }] } }],
    ], { LETTERS_QUEUE: refuse(), TIMECAPSULE_QUEUE: refuse(), MEMORY_LANE_QUEUE: refuse() });
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    await worker.scheduled({ cron: '0 */1 * * *' }, env, ctx);
    await worker.scheduled({ cron: '*/5 * * * *' }, env, ctx);
    await worker.scheduled({ cron: '0 9 * * *' }, env, ctx);
    expect(pending).toHaveLength(2 + 2 + 2);
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(env.LETTERS_QUEUE.send.mock.calls.map((c) => c[0].queue_type)).toEqual(['purge-expired-messages', 'lifecycle-r2', 'letters-deliver']);
    expect(env.TIMECAPSULE_QUEUE.send.mock.calls[0][0]).toEqual({ queue_type: 'timecapsule-open', capsule_id: 'cap1' });
    expect(env.MEMORY_LANE_QUEUE.send.mock.calls.map((c) => c[0].user_id)).toEqual(['u1', 'u2']);
  });
});
