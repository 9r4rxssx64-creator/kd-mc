// @vitest-environment node
// Lot C1 (audit A2-06, A6-18, A6-20, A1 P3 — v1.1.304) — non-régression SERVEUR sur un VRAI SQLite
// bâti avec toutes les migrations (d1Reel), avec le VRAI ConversationDO derrière le VRAI api-worker.
//  1. A2-06 : après la purge d'une conversation ou la suppression d'un compte, le buffer du DO ne
//     réécrit plus rien en D1 (route interne /internal/purge, jeton signé 'dopurge').
//  2. Suppression de compte : stories, vues, capsules, lettres, Memory Lane, quota IA, empreinte
//     vocale, séries, appareils, réglages par compte → effacés.
//  3. Stories expirées effacées par le cron de 03:00.
//  4. /api/system/config réservée aux comptes connectés.
//  5. TURN : identifiants 4 h, réutilisés 30 min par compte, plafond quotidien.
//  6. Quota d'envoi de fichiers par compte sur 24 h.
// Chaque bloc est DISCRIMINANT (prouvé par sabotage : retirer le correctif → le test échoue).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { purgeConvPending, purgeExpiredStories, TURN_TTL_S, TURN_DAY_MAX } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import './_support/do-hibernation.js'; // Lot E1 : API d'hibernation du runtime (acceptWebSocket, attachments, réveil)
import { ENV, makeJWT, makeRequest, makeKV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };

class WS {
  constructor() { this.sent = []; this.l = {}; this.closed = null; }
  accept() {}
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = { code, reason }; }
  addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
  async fire(t, ev = {}) { for (const f of this.l[t] || []) await f(ev); }
  frames(t) { return this.sent.map((m) => JSON.parse(m)).filter((m) => !t || m.type === t); }
  async emit(obj) { await this.fire('message', { data: JSON.stringify(obj) }); }
}
let lastPair = null;
const RealResponse = globalThis.Response;
const RealPair = globalThis.WebSocketPair;

function mkState(store = new Map(), over = {}) {
  return {
    store,
    id: { toString: () => 'do' },
    storage: {
      get: async (k) => store.get(k),
      put: async (k, v) => { store.set(k, structuredClone(v)); },
      delete: async (k) => store.delete(k),
      deleteAll: async () => { store.clear(); },
      list: async ({ prefix = '', limit = 1e9 } = {}) => new Map([...store].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit)),
      setAlarm: vi.fn(async () => {}),
      ...over,
    },
    blockConcurrencyWhile: async (fn) => fn(),
  };
}

function seedUser(DB, id) {
  DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, 'p_' + id, 'Nom ' + id, 'tel_' + id, 'h_' + id);
}
function seedConv(DB, conv, type, members) {
  DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do,member_count,last_msg_ts) VALUES (?,?,?,1,?,?,1)`)
    .run(conv, type, members[0], 'do_' + conv, members.length);
  members.forEach((u, i) => DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,?,?,1)`).run(conv, u, i === 0 ? 'owner' : 'member'));
}

/** api-worker + VRAI ConversationDO (un par conversation), même clé de signature. */
function setup({ withDO = true } = {}) {
  const DB = d1Reel();
  for (const u of ['alice', 'bob', 'carol']) seedUser(DB, u);
  seedConv(DB, 'dm1', 'dm', ['alice', 'bob']);
  seedConv(DB, 'g1', 'group', ['alice', 'bob', 'carol']);
  const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: { delete: vi.fn(async () => {}), put: vi.fn(async () => {}) } });
  const instances = new Map();
  const calls = [];
  if (withDO) {
    env.CONVERSATION_DO = {
      idFromName: (name) => ({ name }),
      get: (id) => {
        if (!instances.has(id.name)) {
          const d = new ConversationDO(mkState(), { APEX_CHAT_DB: DB, JWT_SIGN_KEY: env.JWT_SIGN_KEY });
          const real = ConversationDO.prototype.verifyJWT.bind(d);
          // Connexion WS du test : jeton = id utilisateur ; un VRAI JWT (purge interne) est vérifié pour de vrai.
          vi.spyOn(d, 'verifyJWT').mockImplementation(async (t) => (String(t).includes('.') ? real(t)
            : { sub: t, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }));
          d.lastFlush = Date.now();   // le message reste dans le buffer (flush ≤ 5 s plus tard)
          instances.set(id.name, d);
        }
        const d = instances.get(id.name);
        return { fetch: (req) => { calls.push(new URL(req.url).pathname); return d.fetch(req); } };
      },
    };
  }
  const doOf = (conv) => { env.CONVERSATION_DO.get({ name: 'do_' + conv }); return instances.get('do_' + conv); };
  const connect = async (conv, uid) => {
    const d = doOf(conv);
    // Node refuse le statut 101 : réponse minimale le temps de l'ouverture de la socket.
    globalThis.Response = class { constructor(b, init = {}) { this.status = init.status ?? 200; this.webSocket = init.webSocket; } };
    let r;
    try { r = await d.fetch({ url: `https://do/ws?token=${uid}&uid=${uid}&conv=${conv}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } }); }
    finally { globalThis.Response = RealResponse; }
    expect(r.status).toBe(101);
    return lastPair[1];
  };
  return { DB, env, doOf, connect, calls };
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body) => worker.fetch(makeRequest({ method, path, body, token: sub ? await tok(sub) : undefined }), env, CTX);
const count = (DB, sql, ...a) => DB.raw.prepare(sql).get(...a).c;

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new RealResponse('{}'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.WebSocketPair = class { constructor() { this[0] = new WS(); this[1] = new WS(); lastPair = this; } };
});
afterEach(() => { globalThis.WebSocketPair = RealPair; vi.useRealTimers(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-06 — le buffer du DO ne ressuscite plus rien après une purge', () => {
  it('conversation purgée (dernier membre parti) : le message encore en attente n\'est PAS réécrit en D1', async () => {
    const { DB, env, doOf, connect, calls } = setup();
    const ws = await connect('dm1', 'alice');
    await ws.emit({ type: 'message', ciphertext: 'E2E1:aaaa', mime: 'text/plain', id: 'c1' });
    expect(doOf('dm1').pendingMessages).toHaveLength(1);              // acquitté, pas encore en D1
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE conv_id='dm1'")).toBe(0);
    expect((await call(env, 'DELETE', '/api/conversations/dm1', 'bob')).status).toBe(200);
    expect((await call(env, 'DELETE', '/api/conversations/dm1', 'alice')).status).toBe(200);
    expect(count(DB, "SELECT COUNT(*) c FROM conversations WHERE id='dm1'")).toBe(0);
    expect(calls).toContain('/internal/purge');
    await doOf('dm1').flushToD1();                                      // le flush qui ressuscitait
    await doOf('dm1').alarm();
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE conv_id='dm1'")).toBe(0);   // aucune ligne orpheline
    expect([...doOf('dm1').state.store.keys()]).toEqual([]);                             // stockage du DO vidé
    expect(ws.closed).toMatchObject({ code: 1008 });
  });

  it('compte supprimé : son message en attente n\'est jamais écrit en clair ; les messages des autres le sont', async () => {
    const { DB, env, doOf, connect } = setup();
    const bob = await connect('g1', 'bob');
    const carol = await connect('g1', 'carol');
    await bob.emit({ type: 'message', ciphertext: 'mon adresse : 3 rue X', mime: 'text/plain', id: 'b1' });
    await carol.emit({ type: 'message', ciphertext: 'salut', mime: 'text/plain', id: 'k1' });
    expect(doOf('g1').pendingMessages).toHaveLength(2);
    const r = await call(env, 'DELETE', '/api/users/me', 'bob', { confirm: 'SUPPRIMER' });
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.details.do_pending).toBe(1);
    await doOf('g1').flushToD1();
    const rows = DB.raw.prepare("SELECT sender_id, ciphertext, deleted_at FROM messages WHERE conv_id='g1'").all();
    expect(rows.filter((x) => x.ciphertext.includes('3 rue X'))).toEqual([]);
    expect(rows.filter((x) => x.sender_id === 'bob' && x.deleted_at == null)).toEqual([]);
    expect(rows.map((x) => x.ciphertext)).toEqual(['salut']);         // carol n'est pas touchée
    expect([...doOf('g1').state.store.values()].filter((v) => v && v.sender_id === 'bob')).toEqual([]);   // rien de bob dans le stockage du DO
  });

  it('un lot déjà parti vers D1 pendant la suppression est quand même vidé (tombstone rejoué)', async () => {
    const { DB, env, doOf, connect } = setup();
    const bob = await connect('g1', 'bob');
    await bob.emit({ type: 'message', ciphertext: 'secret en vol', mime: 'text/plain', id: 'b2' });
    // Le flush part pendant la suppression : la purge du DO l'attend, puis le tombstone est rejoué.
    const d = doOf('g1');
    const origPurge = d._purgePending.bind(d);
    vi.spyOn(d, '_purgePending').mockImplementation(async (c, s) => { const f = d.flushToD1(); const n = await origPurge(c, s); await f; return n; });
    expect((await call(env, 'DELETE', '/api/users/me', 'bob', { confirm: 'SUPPRIMER' })).status).toBe(200);
    const row = DB.raw.prepare("SELECT ciphertext, deleted_at FROM messages WHERE sender_id='bob'").get();
    expect(row.ciphertext).toBe('');
    expect(row.deleted_at).toBeGreaterThan(0);
  });
});

describe('A2-06 — route interne /internal/purge du DO', () => {
  const rec = (id, sender, seq) => ({ id, conv_id: 'g1', sender_id: sender, ciphertext: 'x' + id, mime: 'text/plain', ts: seq, seq });
  async function doWith(store, over) {
    const DB = d1Reel();
    const d = new ConversationDO(mkState(store, over), { APEX_CHAT_DB: DB, JWT_SIGN_KEY: 'k' });
    await new Promise((r) => setTimeout(r, 0));   // reprise du stockage (constructeur) terminée
    for (const [id, s, q] of [['a1', 'alice', 1], ['b1', 'bob', 2], ['b2', 'bob', 3]]) { const r = rec(id, s, q); await d._persistPending(r); d.pendingMessages.push(r); }
    await d.state.storage.put('quar:000000000009:bq', { rec: rec('bq', 'bob', 9), error: 'x', at: 1 });
    await d.state.storage.put('quar:000000000010:aq', { rec: rec('aq', 'alice', 10), error: 'x', at: 1 });
    await d.state.storage.put('quar:000000000011:zz', { error: 'sans rec', at: 1 });
    return d;
  }
  const purgeReq = async (claims, method = 'POST', key = 'k') => {
    const now = Math.floor(Date.now() / 1000);
    const { signJWT } = await import('../../workers/api-worker.js');
    const t = claims ? await signJWT({ iat: now, exp: now + 60, ...claims }, key) : '';
    return { url: 'https://internal/internal/purge', method, headers: { get: (n) => (n === 'Authorization' ? 'Bearer ' + t : null) } };
  };

  it('refus : sans jeton, mauvais type de jeton, GET, mauvaise clé, sans conv → 403 et rien n\'est retiré', async () => {
    const d = await doWith(new Map());
    for (const r of [await purgeReq(null), await purgeReq({ typ: 'dorevoke', conv: 'g1', sub: 'x' }), await purgeReq({ typ: 'dopurge', conv: 'g1' }, 'GET'),
      await purgeReq({ typ: 'dopurge', conv: 'g1' }, 'POST', 'autre'), await purgeReq({ typ: 'dopurge' })]) {
      expect((await d.fetch(r)).status).toBe(403);
    }
    expect(d.pendingMessages).toHaveLength(3);
  });

  it('par expéditeur : ses messages (RAM, pend:, quar:) retirés, ceux des autres gardés, sockets laissées ouvertes', async () => {
    const store = new Map();
    const d = await doWith(store);
    const ws = new WS(); d.sessions.set(ws, { userId: 'alice', convId: 'g1' });
    d._recent.set('b1', { seq: 2 });
    const r = await d.fetch(await purgeReq({ typ: 'dopurge', conv: 'g1', sender: 'bob' }));
    expect(await r.json()).toEqual({ ok: true, dropped: 2 });
    expect(d.pendingMessages.map((m) => m.id)).toEqual(['a1']);
    expect([...store.keys()].sort()).toEqual(['pend:000000000001:a1', 'quar:000000000010:aq', 'quar:000000000011:zz']);
    expect(d._recent.has('b1')).toBe(false);
    expect(ws.closed).toBeNull();
  });

  it('conversation entière : buffer et stockage vidés, toutes les sockets fermées', async () => {
    const store = new Map();
    const d = await doWith(store);
    const ws = new WS(); d.sessions.set(ws, { userId: 'alice', convId: 'g1' });
    const r = await d.fetch(await purgeReq({ typ: 'dopurge', conv: 'g1' }));
    expect(await r.json()).toEqual({ ok: true, dropped: 3 });
    expect(d.pendingMessages).toEqual([]);
    expect(store.size).toBe(0);
    expect(ws.closed).toEqual({ code: 1008, reason: 'Conversation supprimée' });
  });

  it('stockage sans deleteAll / sans list : repli clé par clé, jamais d\'exception', async () => {
    const store = new Map();
    const d = await doWith(store, { deleteAll: undefined });
    await d.fetch(await purgeReq({ typ: 'dopurge', conv: 'g1' }));
    expect([...store.keys()]).toEqual(['quar:000000000011:zz']);       // pend: et quar: de la conv retirés
    const store2 = new Map();
    const d2 = await doWith(store2, { list: undefined });
    const r2 = await d2.fetch(await purgeReq({ typ: 'dopurge', conv: 'g1', sender: 'alice' }));
    expect((await r2.json()).dropped).toBe(1);
  });

  it('attend le flush en cours avant de purger (un lot parti n\'est pas écrit APRÈS)', async () => {
    const d = await doWith(new Map());
    let release;
    d._flushing = new Promise((res, rej) => { release = rej; });
    const p = d._purgePending('g1', 'bob');
    let done = false; p.then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(done).toBe(false);
    release(new Error('panne'));   // un flush en échec n'empêche pas la purge
    expect(await p).toBe(2);
  });

  it('purgeConvPending : sans DO, DO en refus, réponse illisible ou exception → -1 (best-effort)', async () => {
    expect(await purgeConvPending({}, 'g1', null)).toBe(-1);
    const ns = (fetch) => ({ JWT_SIGN_KEY: 'k', CONVERSATION_DO: { idFromName: (n) => n, get: () => ({ fetch }) } });
    expect(await purgeConvPending(ns(async () => ({ ok: false })), 'g1', 'bob')).toBe(-1);
    expect(await purgeConvPending(ns(async () => ({ ok: true, json: async () => { throw new Error('x'); } })), 'g1', 'bob')).toBe(-1);
    expect(await purgeConvPending(ns(async () => { throw new Error('réseau'); }), 'g1', null)).toBe(-1);
    expect(await purgeConvPending(ns(async () => ({ ok: true, json: async () => ({ dropped: 4 }) })), 'g1', null)).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A6-20 §7 — effacement du compte : les modules oubliés sont effacés', () => {
  it('stories, vues, capsules, lettres, Memory Lane, quota IA, empreinte vocale, séries, appareils, réglages', async () => {
    const { DB, env } = setup({ withDO: false });
    const q = (sql, ...a) => DB.raw.prepare(sql).run(...a);
    const now = Date.now();
    q("INSERT INTO stories (id,author_id,ciphertext,ts,expires_at,views) VALUES ('s1','bob','x',1,?,'[]')", now + 9e6);
    q("INSERT INTO stories (id,author_id,ciphertext,ts,expires_at,views) VALUES ('s2','alice','x',1,?,?)", now + 9e6,
      JSON.stringify([{ user_id: 'bob', viewed_at: 1 }, { user_id: 'carol', viewed_at: 2 }]));
    q("INSERT INTO time_capsules (id,sender_id,recipient_id,ciphertext,open_at,created_at) VALUES ('t1','bob','alice','x',9,1),('t2','alice','bob','x',9,1),('t3','alice','carol','x',9,1)");
    q("INSERT INTO letters_queue (id,sender_id,conv_id,ciphertext,deliver_at,created_at) VALUES ('l1','bob','g1','x',9,1),('l2','alice','g1','x',9,1)");
    q("INSERT INTO memory_lane_index (user_id,date_key,msg_ids,generated_at) VALUES ('bob','2026-01-01','[]',1),('alice','2026-01-01','[]',1)");
    q("INSERT INTO ai_quota (user_id,feature,day,used) VALUES ('bob','summary','2026-10-15',3),('alice','summary','2026-10-15',1)");
    q("INSERT INTO voice_prints (user_id,mfcc_avg_enc,last_updated) VALUES ('bob','x',1)");
    q("INSERT INTO streaks (user_id,contact_id) VALUES ('bob','alice'),('alice','bob'),('alice','carol')");
    q("INSERT INTO device_trust (user_id,device_fingerprint) VALUES ('bob','f1')");
    q("INSERT INTO user_feature_overrides (user_id,feature,enabled,updated_at) VALUES ('bob','x',1,1)");
    const r = await call(env, 'DELETE', '/api/users/me', 'bob', { confirm: 'SUPPRIMER' });
    expect(r.status).toBe(200);
    const c = (t, w) => count(DB, `SELECT COUNT(*) c FROM ${t} WHERE ${w}`);
    expect(c('stories', "author_id='bob'")).toBe(0);
    expect(JSON.parse(DB.raw.prepare("SELECT views FROM stories WHERE id='s2'").get().views)).toEqual([{ user_id: 'carol', viewed_at: 2 }]);
    expect(c('time_capsules', "sender_id='bob' OR recipient_id='bob'")).toBe(0);
    expect(c('time_capsules', "id='t3'")).toBe(1);
    expect(c('letters_queue', "sender_id='bob'")).toBe(0);
    expect(c('letters_queue', "sender_id='alice'")).toBe(1);
    expect(c('memory_lane_index', "user_id='bob'")).toBe(0);
    expect(c('ai_quota', "user_id='bob'")).toBe(0);
    expect(c('ai_quota', "user_id='alice'")).toBe(1);
    expect(c('voice_prints', "user_id='bob'")).toBe(0);
    expect(c('streaks', "user_id='bob' OR contact_id='bob'")).toBe(0);
    expect(c('streaks', "user_id='alice'")).toBe(1);
    expect(c('device_trust', "user_id='bob'")).toBe(0);
    expect(c('user_feature_overrides', "user_id='bob'")).toBe(0);
    const j = await r.json();
    for (const k of ['stories', 'story_views', 'time_capsules', 'letters_queue', 'memory_lane_index', 'ai_quota']) expect(typeof j.details.rows[k]).toBe('number');
  });

  it('cron 03:00 : les stories expirées sont effacées, les autres gardées ; une panne est rapportée sans bloquer', async () => {
    const { DB, env } = setup({ withDO: false });
    const now = Date.now();
    DB.raw.prepare("INSERT INTO stories (id,author_id,ciphertext,ts,expires_at) VALUES ('old','alice','x',1,?),('new','alice','x',1,?)").run(now - 1000, now + 3600000);
    await worker.scheduled({ cron: '0 3 * * *' }, env, CTX);
    expect(DB.raw.prepare('SELECT id FROM stories').all().map((x) => x.id)).toEqual(['new']);
    expect(await purgeExpiredStories({ APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('KO'); } }) }) } })).toBe('erreur: KO');
    expect(await purgeExpiredStories({ APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run: async () => null }) }) } })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A1 P3 — /api/system/config réservée aux comptes connectés', () => {
  it('sans jeton → 401 ; connecté → la liste blanche des réglages publics', async () => {
    const { env } = setup({ withDO: false });
    expect((await call(env, 'GET', '/api/system/config')).status).toBe(401);
    const r = await call(env, 'GET', '/api/system/config', 'alice');
    expect(r.status).toBe(200);
    expect(Object.keys((await r.json()).config).sort()).toEqual(['ADMIN_MODE', 'AUTH_PROVIDER', 'MAX_GROUP_SIZE', 'PREMIUM_PRICE_EUR', 'TURN_PROVIDER']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A6-18 — identifiants TURN : 4 h, réutilisés par compte, plafond quotidien', () => {
  const turnEnv = () => {
    const { env } = setup({ withDO: false });
    env.CF_TURN_KEY_ID = 'KID'; env.CF_TURN_TOKEN = 'TOK';
    const bodies = [];
    globalThis.fetch = vi.fn(async (url, init) => { bodies.push(JSON.parse(init.body)); return new RealResponse(JSON.stringify({ iceServers: { urls: ['turn:t'], username: 'u', credential: 'c' } }), { status: 200 }); });
    return { env, bodies };
  };
  it('30 demandes du même compte → UNE génération en amont, durée de vie 4 h (avant : 30 générations, 24 h)', async () => {
    const { env, bodies } = turnEnv();
    for (let i = 0; i < 30; i++) {
      const d = await (await call(env, 'GET', '/api/turn', 'alice')).json();
      expect(d.turn).toBe(true);
    }
    expect(bodies).toEqual([{ ttl: TURN_TTL_S }]);
    expect(TURN_TTL_S).toBe(14400);
    await call(env, 'GET', '/api/turn', 'bob');                       // un autre compte : sa propre génération
    expect(bodies).toHaveLength(2);
  });
  it('plafond quotidien atteint → STUN seul (raison exacte), aucune génération', async () => {
    const { env, bodies } = turnEnv();
    await env.APEX_CHAT_KV.put('turnday:alice:' + new Date().toISOString().slice(0, 10), String(TURN_DAY_MAX));
    const d = await (await call(env, 'GET', '/api/turn', 'alice')).json();
    expect(d).toMatchObject({ turn: false, reason: 'turn_daily_limit' });
    expect(bodies).toHaveLength(0);
  });
  it('KV en panne ou absent → fail-open (l\'appel garde son relais)', async () => {
    const { env, bodies } = turnEnv();
    env.APEX_CHAT_KV = { get: async () => { throw new Error('kv'); }, put: async () => { throw new Error('kv'); } };
    expect((await (await call(env, 'GET', '/api/turn', 'alice')).json()).turn).toBe(true);
    delete env.APEX_CHAT_KV;
    expect((await (await call(env, 'GET', '/api/turn', 'alice')).json()).turn).toBe(true);
    env.APEX_CHAT_KV = makeKV({ 'turn:alice': JSON.stringify({ ice: [] }) });   // cache vide → nouvelle génération
    expect((await (await call(env, 'GET', '/api/turn', 'alice')).json()).turn).toBe(true);
    expect(bodies).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A6-20 §6 — quota d\'envoi de fichiers par compte sur 24 h', () => {
  // Tout envoi nomme sa conversation (audit 16.10.2026) : alice et bob sont membres de « cq ».
  const seedQ = (DB) => {
    DB.raw.prepare("INSERT OR IGNORE INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('cq','group','alice',1,0)").run();
    for (const u of ['alice', 'bob']) DB.raw.prepare("INSERT OR IGNORE INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('cq',?, 'member', 1)").run(u);
  };
  const up = async (env, sub, bytes = 10) => worker.fetch(new Request('https://api.apex/api/media?conv_id=cq', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await tok(sub), 'Content-Type': 'image/png', 'x-file-name': 'a.png' }, body: new Uint8Array(bytes),
  }), env, CTX);
  it('300 fichiers en 24 h → le 301e est refusé (429) ; un autre compte passe ; hier ne compte plus', async () => {
    const { DB, env } = setup({ withDO: false });
    seedQ(DB);
    const ins = DB.raw.prepare('INSERT INTO media (id,owner_id,r2_key,size,mime,uploaded_at) VALUES (?,?,?,?,?,?)');
    for (let i = 0; i < 300; i++) ins.run('m' + i, 'alice', 'k' + i, 10, 'image/png', Date.now() - 1000);
    ins.run('old', 'bob', 'kold', 10, 'image/png', Date.now() - 2 * 86400000);
    const r = await up(env, 'alice');
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe('upload_quota');
    expect((await up(env, 'bob')).status).toBe(200);
  });
  it('volume : 1 Go déjà envoyé → refusé ; lecture du quota en panne → fail-open', async () => {
    const { DB, env } = setup({ withDO: false });
    seedQ(DB);
    DB.raw.prepare('INSERT INTO media (id,owner_id,r2_key,size,mime,uploaded_at) VALUES (?,?,?,?,?,?)').run('big', 'alice', 'kb', 1024 * 1024 * 1024, 'video/mp4', Date.now());
    expect((await up(env, 'alice')).status).toBe(429);
    const prep = DB.prepare;
    DB.prepare = (sql) => (sql.includes('COALESCE(SUM(size)') ? { bind: () => ({ first: async () => { throw new Error('D1'); } }) } : prep(sql));
    expect((await up(env, 'alice')).status).toBe(200);
  });
});
