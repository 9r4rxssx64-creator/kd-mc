// @vitest-environment node
/**
 * Lot B — A6-11 : chaque consultation admin de positions / utilisateurs laisse une trace dans audit_log.
 *         A6-12 : « traiter un signalement » (bannir / ignorer / avertir) fonctionne réellement (schéma réel).
 *         A6-13 : sondage anonyme — la case se décoche, et l'identité du votant n'est plus diffusée aux membres.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';
import { loadDefs } from './client-extract.js';

const now = () => Math.floor(Date.now() / 1000) - 5;
const ctx = { waitUntil() {} };

function mockDb({ admins = [] } = {}) {
  const calls = [];
  return {
    _calls: calls,
    prepare: vi.fn((sql) => {
      const st = { _a: [], bind(...a) { this._a = a; calls.push({ sql, args: a }); return this; },
        async first() {
          if (sql.includes('SELECT last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active', is_admin: admins.includes(this._a[0]) ? 1 : 0 };
          if (sql.includes('SELECT merged_into')) return { merged_into: null };
          if (/COUNT\(/i.test(sql)) return { c: 0 };
          return null;
        },
        async all() { return { results: [{ id: 'x', lat: 1, lng: 2, ts: 1 }] }; },
        async run() { return { success: true, meta: { changes: 1 } }; } };
      return st;
    }),
  };
}

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('Lot B — A6-11 : consultations admin journalisées', () => {
  const ROUTES = [
    ['/api/admin/users/laurence/geo-history?days=30', 'admin_view_geo_history', 'laurence'],
    ['/api/admin/map', 'admin_view_map', null],
    ['/api/location/laurence?limit=1000', 'admin_view_location_history', 'laurence'],
    ['/api/admin/live-users', 'admin_view_live_users', null],
    ['/api/admin/all-users', 'admin_view_all_users', null],
    ['/api/admin/users/laurence/conversations', 'admin_view_user_conversations', 'laurence'],
  ];
  for (const [path, action, target] of ROUTES) {
    it(path + ' → 1 ligne audit_log « ' + action + ' »', async () => {
      const d = mockDb({ admins: ['kdmc_admin'] });
      const tok = await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: now() });
      const res = await worker.fetch(makeRequest({ path, token: tok }), ENV({ APEX_CHAT_DB: d }), ctx);
      expect(res.status).toBe(200);
      const audit = d._calls.filter((c) => /INSERT INTO audit_log/.test(c.sql));
      expect(audit).toHaveLength(1);
      expect(audit[0].args.slice(0, 4)).toEqual(['kdmc_admin', action, target ? 'user' : 'users', target]);
      expect(JSON.parse(audit[0].args[4]).path).toBe(path.split('?')[0]);
    });
  }
  it('un compte qui consulte SA propre position → pas de ligne (rien à tracer) ; refus 403 → pas de ligne', async () => {
    const d = mockDb();
    const tok = await makeJWT({ sub: 'alice', iat: now() });
    const own = await worker.fetch(makeRequest({ path: '/api/location/alice', token: tok }), ENV({ APEX_CHAT_DB: d }), ctx);
    expect(own.status).toBe(200);
    const other = await worker.fetch(makeRequest({ path: '/api/location/bob', token: tok }), ENV({ APEX_CHAT_DB: d }), ctx);
    expect(other.status).toBe(403);
    expect(d._calls.filter((c) => /INSERT INTO audit_log/.test(c.sql))).toHaveLength(0);
  });
  it('journal en panne → la consultation est quand même servie', async () => {
    const d = mockDb({ admins: ['kdmc_admin'] });
    const orig = d.prepare;
    d.prepare = vi.fn((sql) => { if (/INSERT INTO audit_log/.test(sql)) throw new Error('audit KO'); return orig(sql); });
    const tok = await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: now() });
    const res = await worker.fetch(makeRequest({ path: '/api/admin/map', token: tok }), ENV({ APEX_CHAT_DB: d }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('Lot B — A6-12 : traiter un signalement (schéma réel)', () => {
  function setup() {
    const DB = d1Reel();
    for (const [id, p, ph] of [['alice', 'alice', '+33611111111'], ['bob', 'bob', '+33622222222']]) {
      DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
        VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, p, 'Nom ' + p, ph, 'h_' + id);
    }
    const ins = DB.raw.prepare("INSERT INTO signalements (id, reporter_id, target_user_id, reason, ts) VALUES (?, 'alice', ?, 'spam', 1)");
    ins.run('s1', 'bob'); ins.run('s2', 'bob'); ins.run('s3', 'bob'); ins.run('s4', 'kdmc_admin');
    return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
  }
  const cmd = async (env, params) => worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/commands', token: await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: now() }), body: { command: 'resolveSignalement', params } }), env, ctx);

  it('ignorer → 200 et status=dismissed en base (avant : 400 « Commande inconnue »)', async () => {
    const { DB, env } = setup();
    const r = await cmd(env, { id: 's1', action: 'dismiss' });
    expect(r.status).toBe(200);
    expect(DB.raw.prepare("SELECT status, resolution, resolved_by FROM signalements WHERE id='s1'").get()).toEqual({ status: 'dismissed', resolution: 'dismiss', resolved_by: 'kdmc_admin' });
    expect(DB.raw.prepare("SELECT is_banned FROM users WHERE id='bob'").get().is_banned).toBe(0);
  });
  it('bannir → signalement résolu ET compte visé banni (is_banned=1, suspended) ; journal admin écrit', async () => {
    const { DB, env } = setup();
    const r = await cmd(env, { id: 's2', action: 'ban' });
    expect((await r.json()).result).toMatchObject({ status: 'resolved', action: 'ban', target_user_id: 'bob' });
    expect(DB.raw.prepare("SELECT is_banned, status FROM users WHERE id='bob'").get()).toEqual({ is_banned: 1, status: 'suspended' });
    expect(DB.raw.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='admin_command' AND details LIKE '%resolveSignalement%'").get().n).toBe(1);
  });
  it('avertir → résolu, compte pas banni, notifications tentées (visé + signalant)', async () => {
    const { DB, env } = setup();
    const r = await cmd(env, { id: 's3', action: 'warn' });
    const j = await r.json();
    expect(j.result.status).toBe('resolved');
    expect(j.result.notified.target).toMatchObject({ total: 0 });
    expect(j.result.notified.reporter).toMatchObject({ total: 0 });
    expect(DB.raw.prepare("SELECT is_banned FROM users WHERE id='bob'").get().is_banned).toBe(0);
  });
  it('paramètres invalides → 400 ; inconnu → 404 ; bannir son propre compte admin → 400', async () => {
    const { env } = setup();
    expect((await cmd(env, { id: 's1', action: 'supprimer' })).status).toBe(400);
    expect((await cmd(env, {})).status).toBe(400);
    expect((await cmd(env, { id: 'nope', action: 'dismiss' })).status).toBe(404);
    expect((await cmd(env, { id: 's4', action: 'ban' })).status).toBe(400);
  });
});

describe('Lot B — A6-13 : sondage anonyme (client)', () => {
  const run = async (anonChecked) => {
    const el = { 'poll-question': { value: 'Resto ?' }, 'poll-multi': { checked: false }, 'poll-anon': { checked: anonChecked } };
    const K = { viewData: { id: 'c1' }, user: { id: 'u1' }, messages: {}, _closeModal() {}, render() {}, _pendingToastText: () => '' };
    let marker = null;
    K._sendSecure = vi.fn(async (_c, m) => { marker = m; return 'sent'; });
    loadDefs(['K._sendPoll = function'], { K, ls: () => {}, toast: () => {}, _safeCatch: () => {},
      document: { getElementById: (id) => el[id], querySelectorAll: () => [{ value: 'Pizza' }, { value: 'Sushi' }] } });
    await K._sendPoll();
    return JSON.parse(marker.slice('APXPOLL1:'.length)).anon;
  };
  it('case décochée → anon:false ; cochée → anon:true', async () => {
    expect(await run(false)).toBe(false);
    expect(await run(true)).toBe(true);
  });
  it('vote sur un sondage anonyme → la trame ne porte PAS l\'identité du votant', () => {
    for (const anon of [true, false]) {
      const sent = [];
      const K = { viewData: { id: 'c1' }, user: { id: 'u1' }, render() {}, ws: { readyState: 1, send: (d) => sent.push(JSON.parse(d)) },
        messages: { c1: [{ id: 'p1', poll: { options: ['a', 'b'], multi: false, anon, votes: {} } }] } };
      loadDefs(['K._votePoll = function'], { K, ls: () => {}, _safeCatch: () => {} });
      K._votePoll('p1', 1);
      if (anon) { expect(sent[0]).toEqual({ type: 'poll_vote', poll_id: 'p1', votes: [1], anon: true }); }
      else { expect(sent[0]).toMatchObject({ voter: 'u1', votes: [1] }); expect(sent[0].anon).toBeUndefined(); }
    }
  });
});

class WS extends EventTarget { constructor() { super(); this.sent = []; } accept() {} send(d) { this.sent.push(JSON.parse(d)); } close() {} }
function makeState() {
  const data = new Map();
  return { id: { toString: () => 'conv-do' }, _data: data,
    storage: { get: vi.fn(async (k) => data.get(k)), put: vi.fn(async (k, v) => { data.set(k, v); }),
      list: vi.fn(async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)))), setAlarm: vi.fn(async () => {}) },
    blockConcurrencyWhile: vi.fn(async (fn) => { await fn(); }) };
}
const sess = (u, dev = 'd-' + u) => ({ userId: u, deviceId: dev, convId: 'conv1', lastSeq: 0, connectedAt: Date.now(), lastMemberCheck: Date.now(), messageCount: 0, lastReset: Date.now() });

describe('Lot B — A6-13 : sondage anonyme (serveur temps réel)', () => {
  let d, state;
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state = makeState();
    d = new ConversationDO(state, { JWT_SIGN_KEY: 's', APEX_CHAT_DB: { prepare: () => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }, TELEMETRY_QUEUE: { send: vi.fn() } });
    await new Promise((r) => setTimeout(r, 5));
  });
  afterEach(() => vi.restoreAllMocks());

  it('vote anonyme → les autres membres reçoivent un pseudonyme stable, jamais « u1 » ; l\'autre appareil de u1 reçoit son id', async () => {
    const a = new WS(); d.sessions.set(a, sess('u1'));
    const a2 = new WS(); d.sessions.set(a2, sess('u1', 'd-u1-tablette'));
    const b = new WS(); d.sessions.set(b, sess('u2'));
    const dead = { send() { throw new Error('mort'); } }; d.sessions.set(dead, sess('u3'));
    await d.handleMessage(a, { type: 'poll_vote', poll_id: 'p1', votes: [1], anon: true });
    const vb = b.sent.find((m) => m.type === 'poll_vote');
    expect(vb.voter).toMatch(/^anon_[0-9a-f]{24}$/);
    expect(JSON.stringify(b.sent)).not.toContain('u1');
    expect(a2.sent.find((m) => m.type === 'poll_vote').voter).toBe('u1');
    expect(a.sent.find((m) => m.type === 'poll_vote')).toBeUndefined();
    // même votant, même sondage → même pseudonyme (le changement de vote remplace, ne double pas)
    await d.handleMessage(a, { type: 'poll_vote', poll_id: 'p1', votes: [0], anon: true });
    const votes = b.sent.filter((m) => m.type === 'poll_vote');
    expect(votes[1].voter).toBe(votes[0].voter);
    expect(Object.keys(state._data.get('pollvotes:p1'))).toEqual([votes[0].voter]);
    // un autre sondage → un autre pseudonyme (pas de recoupement entre sondages)
    await d.handleMessage(a, { type: 'poll_vote', poll_id: 'p2', votes: [0], anon: true });
    expect(b.sent.filter((m) => m.type === 'poll_vote')[2].voter).not.toBe(votes[0].voter);
  });

  it('sondage NON anonyme → inchangé (voter = id réel)', async () => {
    const a = new WS(); d.sessions.set(a, sess('u1'));
    const b = new WS(); d.sessions.set(b, sess('u2'));
    await d.handleMessage(a, { type: 'poll_vote', poll_id: 'p3', votes: [1] });
    expect(b.sent.find((m) => m.type === 'poll_vote').voter).toBe('u1');
  });

  it('rejeu à la reconnexion : mon vote anonyme me revient sous mon id, celui des autres reste un pseudonyme', async () => {
    const a = new WS(); d.sessions.set(a, sess('u1'));
    const b = new WS(); d.sessions.set(b, sess('u2'));
    await d.handleMessage(a, { type: 'poll_vote', poll_id: 'p1', votes: [1], anon: true });
    await d.handleMessage(b, { type: 'poll_vote', poll_id: 'p1', votes: [0], anon: true });
    const p1 = await d._pollPseudonym('p1', 'u1');
    const p2 = await d._pollPseudonym('p1', 'u2');
    expect(Object.keys(state._data.get('pollvotes:p1')).sort()).toEqual([p1, p2].sort());
    expect(p1).not.toBe(p2);
  });
});
