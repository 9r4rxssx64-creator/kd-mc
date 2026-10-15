// @vitest-environment node
// Lot A (audit A2 « temps réel et intégrité des données », 15.10.2026) — non-régression du
// ConversationDO sur un VRAI SQLite bâti avec toutes les migrations (d1Reel).
// Chaque bloc reprend une preuve jetable de l'audit (…/audit2/tests-do/zz-a2-temps-reel-tmp.test.js)
// avec l'assertion INVERSÉE : le test échoue si le correctif est retiré (prouvé par sabotage).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { signJWT } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

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
globalThis.Response = class { constructor(b, init = {}) { this._b = b; this.status = init.status ?? 200; this.ok = this.status >= 200 && this.status < 300; this.webSocket = init.webSocket; this.headers = new Map(); } async text() { return String(this._b ?? ''); } async json() { return JSON.parse(this._b); } };
globalThis.WebSocketPair = class { constructor() { this[0] = new WS(); this[1] = new WS(); lastPair = this; } };

const CONV = 'g_lota';
const KEY = 'k';
function mkState(store = new Map(), over = {}) {
  return {
    store,
    id: { toString: () => 'do_' + CONV },
    storage: {
      get: async (k) => store.get(k),
      put: async (k, v) => { store.set(k, structuredClone(v)); },
      delete: async (k) => store.delete(k),
      list: async ({ prefix = '', limit = 1e9 } = {}) => new Map([...store].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit)),
      setAlarm: vi.fn(async () => {}),
      ...over,
    },
    blockConcurrencyWhile: async (fn) => fn(),
  };
}
function addUser(DB, u, joined = 1) {
  DB.raw.prepare(`INSERT OR IGNORE INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(u, u, u, 'tel_' + u, 'h_' + u, 1, 'k', 'k', 'k', 'active');
  DB.raw.prepare(`INSERT OR IGNORE INTO conversation_members (conv_id,user_id,joined_at) VALUES (?,?,?)`).run(CONV, u, joined);
}
function seed({ type = 'group', users = ['alice', 'bob'], DB = d1Reel() } = {}) {
  DB.raw.prepare(`INSERT INTO conversations (id,type,name,created_by,created_at,sharded_to_do,last_msg_ts) VALUES (?,?,?,?,?,?,?)`).run(CONV, type, 'g', users[0], 1, 'do_' + CONV, 1);
  for (const u of users) addUser(DB, u);
  return DB;
}
function mkDO(DB, state = mkState(), extraEnv = {}) {
  const env = { APEX_CHAT_DB: DB, JWT_SIGN_KEY: KEY, APEX_CHAT_ADMIN_TOKEN: 'adm', TELEMETRY_QUEUE: { send: vi.fn(async () => {}) }, ...extraEnv };
  const d = new ConversationDO(state, env);
  const real = ConversationDO.prototype.verifyJWT.bind(d);
  // Connexion WS des tests : jeton = id utilisateur. Un vrai JWT (révocation interne) est vérifié pour de vrai.
  vi.spyOn(d, 'verifyJWT').mockImplementation(async (t) => (String(t).includes('.') ? real(t)
    : { sub: t, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }));
  return d;
}
async function connect(d, uid, extra = '') {
  const r = await d.fetch({ url: `https://do/ws?token=${uid}&uid=${uid}&conv=${CONV}${extra}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } });
  expect(r.status).toBe(101);
  return lastPair[1];
}
const count = (DB, sql, ...a) => DB.raw.prepare(sql).get(...a).c;
const tick = () => new Promise((r) => setTimeout(r, 0));
const ins = (DB, id, ts, extra = {}) => {
  const row = { conv_id: CONV, sender_id: 'alice', ciphertext: 'x' + id, mime: 'text/plain', ts, ...extra };
  const cols = ['id', ...Object.keys(row)];
  DB.raw.prepare(`INSERT INTO messages (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(id, ...Object.values(row));
};
/** Pagine `history_since` comme le client, jusqu'à more:false. */
async function catchUp(ws, first) {
  let req = { type: 'history_since', ...first };
  const all = []; const pages = [];
  for (let guard = 0; guard < 50; guard++) {
    const before = ws.frames('history_page').length;
    await ws.emit(req);
    const p = ws.frames('history_page')[before];
    pages.push(p); all.push(...p.messages);
    if (!p.more) break;
    req = { type: 'history_since', after_ts: p.cursor.ts, after_id: p.cursor.id, limit: first.limit };
  }
  return { all, pages };
}
function downDB(DB = seed()) {
  const real = { batch: DB.batch, prepare: DB.prepare };
  const state = { down: true, batchCalls: 0, attempts: 0 };
  DB.batch = async (s) => { state.batchCalls++; state.attempts++; if (state.down) throw new Error('D1_ERROR: overloaded'); return real.batch(s); };
  DB.prepare = (sql) => {
    const st = real.prepare(sql);
    if (!/INSERT INTO messages/.test(sql)) return st;
    const bind = st.bind;
    st.bind = (...a) => { const b = bind(...a); const run = b.run; b.run = async () => { state.attempts++; if (state.down) throw new Error('D1_ERROR: overloaded'); return run(); }; return b; };
    return st;
  };
  return { DB, state };
}
const pendKeys = (state) => [...state.store.keys()].filter((k) => k.startsWith('pend:'));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-03 (P0) rattrapage paginé : plus aucun message perdu au-delà de 50', () => {
  it('120 messages pendant l’absence de bob → history_since les rend TOUS, dans l’ordre, sans trou ni doublon', async () => {
    const DB = seed();
    for (let i = 0; i < 120; i++) ins(DB, 'm' + String(i).padStart(3, '0'), 1000 + i);
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    expect(bob.frames('history')[0].messages).toHaveLength(50);              // l'historique « récent » reste borné
    const { all, pages } = await catchUp(bob, { after_ts: 999, after_id: '' });
    expect(all.map((m) => m.id)).toEqual(Array.from({ length: 120 }, (_, i) => 'm' + String(i).padStart(3, '0')));
    expect(pages.map((p) => p.messages.length)).toEqual([100, 20]);           // page bornée (défaut 100)
    expect(pages.map((p) => p.more)).toEqual([true, false]);
    expect(pages[1].cursor).toEqual({ ts: 1119, id: 'm119' });
  });

  it('joined_at respecté, tombstone sans contenu, expiré filtré (mais le curseur avance), champs publics', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed({ users: ['alice'] });
    addUser(DB, 'bob', 1050);
    for (let i = 0; i < 60; i++) ins(DB, 'm' + String(i).padStart(3, '0'), 1000 + i);
    ins(DB, 'riche', 2000, { reply_to: 'm055', view_once: 1, expires_at: Date.now() + 3600e3, edited_at: 1500 });
    ins(DB, 'suppr', 2001, { ciphertext: 'secret', deleted_at: 1600 });
    ins(DB, 'expire', 2002, { expires_at: 5 });
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    const { all, pages } = await catchUp(bob, { after_ts: 0, after_id: '' });
    expect(all[0].id).toBe('m050');                                         // rien avant son arrivée (1050)
    expect(all.map((m) => m.id)).not.toContain('expire');
    expect(pages.at(-1).cursor).toEqual({ ts: 2002, id: 'expire' });        // avance quand même
    const riche = all.find((m) => m.id === 'riche');
    expect(riche).toMatchObject({ reply_to: 'm055', view_once: 1, edited_at: 1500, sender_id: 'alice' });
    expect(riche.expires_at).toBeGreaterThan(Date.now());
    expect(all.find((m) => m.id === 'suppr')).toMatchObject({ ciphertext: '', deleted_at: 1600 });
    expect(all.find((m) => m.id === 'm051')).toMatchObject({ reply_to: null, view_once: 0, expires_at: null, edited_at: null, deleted_at: null });
  });

  it('fusionne les messages pas encore en D1 (buffer + lot en vol), la copie en RAM gagne ; autre conv / avant joined_at / avant curseur exclus', async () => {
    const DB = seed({ users: ['alice'] });
    addUser(DB, 'bob', 1000);
    ins(DB, 'a', 1001); ins(DB, 'b', 1002, { ciphertext: 'ancienne' });
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    d._inflight = [{ id: 'vol', conv_id: CONV, sender_id: 'alice', ciphertext: 'en vol', ts: 1003 }];
    d.pendingMessages.push(
      { id: 'b', conv_id: CONV, sender_id: 'alice', ciphertext: 'nouvelle', ts: 1002 },
      { id: 'buf', conv_id: CONV, sender_id: 'alice', ciphertext: 'buffer', ts: 1004 },
      { id: 'autre', conv_id: 'autre_conv', sender_id: 'alice', ciphertext: 'z', ts: 1005 },
      { id: 'avant', conv_id: CONV, sender_id: 'alice', ciphertext: 'z', ts: 999 },
      { id: 'tot', conv_id: CONV, sender_id: 'alice', ciphertext: 'z', ts: 1000 },
      { id: 'Z', conv_id: CONV, sender_id: 'alice', ciphertext: 'meme ts', ts: 1001 },   // même ts que 'a', id plus petit
    );
    const { all } = await catchUp(bob, { after_ts: 1000, after_id: 'tot' });
    expect(all.map((m) => [m.id, m.ciphertext])).toEqual([['Z', 'meme ts'], ['a', 'xa'], ['b', 'nouvelle'], ['vol', 'en vol'], ['buf', 'buffer']]);
  });

  it('paramètres bornés et assainis ; ordre total (ts, id) à ts égal ; page vide → curseur inchangé', async () => {
    const DB = seed();
    for (const id of ['e', 'a', 'c', 'b', 'd']) ins(DB, id, 5000);
    for (let i = 0; i < 230; i++) ins(DB, 'n' + String(i).padStart(3, '0'), 6000 + i);
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    await bob.emit({ type: 'history_since', after_ts: 5000, after_id: 'b', limit: 3 });
    expect(bob.frames('history_page')[0].messages.map((m) => m.id)).toEqual(['c', 'd', 'e']);
    await bob.emit({ type: 'history_since', after_ts: 0, limit: 10000 });
    expect(bob.frames('history_page')[1].messages).toHaveLength(200);        // plafond serveur
    for (const bad of [-5, 'abc', Infinity, null]) {
      await bob.emit({ type: 'history_since', after_ts: bad, after_id: 42, limit: 'x' });
    }
    for (const p of bob.frames('history_page').slice(2)) {
      expect(p.messages).toHaveLength(100);                                  // défaut, depuis le début
      expect(p.messages[0].id).toBe('a');
    }
    await bob.emit({ type: 'history_since', after_ts: 0, after_id: 'x'.repeat(200), limit: 1 });
    expect(bob.frames('history_page').at(-1).messages[0].id).toBe('a');      // id trop long → ''
    await bob.emit({ type: 'history_since', after_ts: 99999, after_id: 'zz' });
    const vide = bob.frames('history_page').at(-1);
    expect(vide).toMatchObject({ messages: [], more: false, cursor: { ts: 99999, id: 'zz' } });
    expect(vide.changes).toBeUndefined();
  });

  it('membre présent depuis la création (joined_at = 0) : tout est rattrapable', async () => {
    const DB = seed({ users: ['alice'] });
    addUser(DB, 'dan', 0);
    ins(DB, 'tout1', 0); ins(DB, 'tout2', 5);
    const d = mkDO(DB);
    const dan = await connect(d, 'dan');
    await dan.emit({ type: 'history_since', after_ts: 0, after_id: '' });
    expect(dan.frames('history_page')[0].messages.map((m) => m.id)).toEqual(['tout1', 'tout2']);
  });

  it('A2-16 : changed_since renvoie les anciens messages édités / supprimés depuis (D1 et buffer)', async () => {
    const DB = seed();
    ins(DB, 'old1', 1001, { ciphertext: 'v2', edited_at: 5000 });
    ins(DB, 'old2', 1002, { ciphertext: 'secret', deleted_at: 6000 });
    ins(DB, 'old3', 1003, { edited_at: 3000 });                              // avant le repère
    ins(DB, 'neuf', 9000);
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    d.pendingMessages.push(
      { id: 'bufE', conv_id: CONV, sender_id: 'alice', ciphertext: 'e2', ts: 1004, edited_at: 7000 },
      { id: 'bufD', conv_id: CONV, sender_id: 'alice', ciphertext: '', ts: 1005, deleted_at: 7001 },
      { id: 'bufN', conv_id: CONV, sender_id: 'alice', ciphertext: 'n', ts: 1006 },
      { id: 'bufAvant', conv_id: CONV, sender_id: 'alice', ciphertext: 'n', ts: 0, edited_at: 7002 },
    );
    await bob.emit({ type: 'history_since', after_ts: 9000, after_id: 'neuf', changed_since: 4000 });
    const p = bob.frames('history_page')[0];
    expect(p.messages).toEqual([]);
    expect(p.changes.map((m) => [m.id, m.ciphertext])).toEqual([['old1', 'v2'], ['old2', ''], ['bufE', 'e2'], ['bufD', '']]);
    expect(p.server_ts).toBeGreaterThan(0);
  });

  it('panne D1 pendant le rattrapage → erreur explicite (le client réessaie), pas de page fausse', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const p0 = DB.prepare;
    DB.prepare = (sql) => (/ORDER BY ts ASC, id ASC/.test(sql) ? { bind: () => ({ all: async () => { throw new Error('D1 down'); } }) } : p0(sql));
    await bob.emit({ type: 'history_since', after_ts: 0 });
    expect(bob.frames('history_page')).toHaveLength(0);
    expect(bob.frames('error').at(-1).code).toBe('history_failed');
  });

  it('un membre retiré ne peut plus rattraper (re-vérification → 1008, aucune page)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed();
    ins(DB, 'm1', 1001);
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    DB.raw.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?').run(CONV, 'bob');
    vi.setSystemTime(Date.now() + 46000);
    await bob.emit({ type: 'history_since', after_ts: 0 });
    expect(bob.closed.code).toBe(1008);
    expect(bob.frames('history_page')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-01 (P1) aucun message acquitté perdu au redémarrage du DO', () => {
  it('9 messages acquittés, nouvelle instance sur le même stockage, alarme → 9 lignes en D1 dans l’ordre de seq', async () => {
    const DB = seed();
    const state = mkState();
    const d1 = mkDO(DB, state);
    const alice = await connect(d1, 'alice');
    for (let i = 0; i < 9; i++) await alice.emit({ type: 'message', ciphertext: 'E2E1:m' + i, id: 'c' + i });
    expect(alice.frames('ack')).toHaveLength(9);
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(0);
    expect(pendKeys(state)).toHaveLength(9);                                 // durable AVANT l'accusé
    const d2 = mkDO(DB, state);                                              // déploiement / plantage
    await tick();
    expect(d2.pendingMessages.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await d2.alarm();
    expect(DB.raw.prepare('SELECT ciphertext FROM messages ORDER BY ts, rowid').all().map((r) => r.ciphertext))
      .toEqual(Array.from({ length: 9 }, (_, i) => 'E2E1:m' + i));
    expect(pendKeys(state)).toHaveLength(0);                                 // effacées une fois en D1
    const bob = await connect(d2, 'bob');
    expect(bob.frames('history')[0].messages).toHaveLength(9);
  });

  it('effacement de la clé pend: en échec → journalisé ; la clé restante est rejouée SANS doublon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const DB = seed();
    const state = mkState();
    state.storage.delete = async () => { throw new Error('delete KO'); };
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'une fois', id: 'c1' });
    await d.alarm();
    expect(warn.mock.calls.some((c) => /effacement pend/.test(c[0]))).toBe(true);
    expect(pendKeys(state)).toHaveLength(1);
    const d2 = mkDO(DB, state); await tick();
    await d2.alarm();
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE ciphertext='une fois'")).toBe(1);
  });

  it('stockage du DO en panne → ni accusé ni diffusion, rien en attente (l’app renverra)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const DB = seed();
    const state = mkState(new Map(), { put: async (k, v) => { if (k.startsWith('pend:')) throw new Error('storage down'); state.store.set(k, v); } });
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    await alice.emit({ type: 'message', ciphertext: 'perdu ?', id: 'c1' });
    expect(alice.frames('ack')).toHaveLength(0);
    expect(alice.frames('error').at(-1)).toMatchObject({ code: 'not_durable', client_id: 'c1' });
    expect(bob.frames('message')).toHaveLength(0);
    expect(d.pendingMessages).toHaveLength(0);
  });

  it('reprise robuste : liste illisible journalisée ; entrées invalides ignorées ; pas de doublon avec la RAM', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const DB = seed();
    const broken = mkState(new Map(), { list: async () => { throw new Error('list KO'); } });
    const d0 = mkDO(DB, broken);
    await tick();
    expect(d0.pendingMessages).toEqual([]);
    expect(err.mock.calls.some((c) => /reprise du stockage/.test(c[0]))).toBe(true);

    const store = new Map([
      ['pend:000000000002:b', { id: 'b', seq: 2, conv_id: CONV, sender_id: 'alice', ciphertext: 'B', ts: 2 }],
      ['pend:000000000001:a', { id: 'a', seq: 1, conv_id: CONV, sender_id: 'alice', ciphertext: 'A', ts: 1 }],
      ['pend:000000000003:x', null], ['pend:000000000004:y', {}],
      ['pend:000000000005:dup', { id: 'dup', seq: 5, conv_id: CONV, sender_id: 'alice', ciphertext: 'D', ts: 5 }],
    ]);
    const state = mkState(store, { setAlarm: vi.fn(async () => {}) });
    state.blockConcurrencyWhile = async (fn) => { await tick(); return fn(); };
    const d = mkDO(DB, state);
    d.pendingMessages.push({ id: 'dup', conv_id: CONV, sender_id: 'alice', ciphertext: 'D', ts: 5 }, { id: 'sansSeq', conv_id: CONV, sender_id: 'alice', ciphertext: 'S', ts: 6 });
    await tick(); await tick();
    expect(d.pendingMessages.map((m) => m.id)).toEqual(['dup', 'sansSeq', 'a', 'b']);   // triés par seq (sans seq = 0)
    expect(state.storage.setAlarm).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-01c (P1) panne D1 : jamais d’abandon, recul exponentiel, quarantaine des seules erreurs permanentes', () => {
  it('groupe actif : 200 messages acquittés pendant la panne → 200 gardés, pas un flush par message, puis 200 lignes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { DB, state: db } = downDB();
    const state = mkState();
    const d = mkDO(DB, state);
    const a = await connect(d, 'alice'); const b = await connect(d, 'bob');
    for (let i = 0; i < 100; i++) { await a.emit({ type: 'message', ciphertext: 'a' + i }); await b.emit({ type: 'message', ciphertext: 'b' + i }); }
    expect(a.frames('ack').length + b.frames('ack').length).toBe(200);
    expect(d.pendingMessages).toHaveLength(200);                             // aucun abandonné
    expect(pendKeys(state)).toHaveLength(200);
    expect(db.attempts).toBeLessThan(5);                                     // recul : pas un essai (ni lot ni ligne) par message
    for (let i = 0; i < 150; i++) await d.alarm();                           // ≈ 150 essais (> l'ancien plafond de 100)
    expect(d.pendingMessages).toHaveLength(200);
    db.down = false;
    await d.alarm();
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(200);
    expect(pendKeys(state)).toHaveLength(0);
  });

  it('conversation calme : l’alarme recule (5 s, 10 s… ≤ 5 min) et le message survit à 150 essais', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { DB, state: db } = downDB();
    const state = mkState();
    const d = mkDO(DB, state);
    const ws = await connect(d, 'alice');
    await ws.emit({ type: 'message', ciphertext: 'important' });
    const delays = [];
    for (let i = 0; i < 150; i++) {
      await d.alarm();
      delays.push(state.storage.setAlarm.mock.calls.at(-1)[0] - Date.now());
    }
    expect(d.pendingMessages).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(4900);
    expect(delays[2]).toBeGreaterThanOrEqual(19000);                        // 3e échec : 20 s
    expect(Math.max(...delays)).toBeLessThanOrEqual(5 * 60000 + 100);        // plafonné à 5 min
    expect(delays.at(-1)).toBeGreaterThanOrEqual(5 * 60000 - 1000);
    // Un nouveau message pendant le recul n'avance pas l'alarme avant la fin du recul.
    await ws.emit({ type: 'message', ciphertext: 'second' });
    expect(state.storage.setAlarm.mock.calls.at(-1)[0] - Date.now()).toBeGreaterThan(60000);
    db.down = false;
    await d.alarm();
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(2);
    expect(d._flushRetryAt).toBe(0);
    expect(ws.frames('ack')).toHaveLength(2);
  });

  it('erreur SQLite PERMANENTE → quarantaine durable et journalisée (jamais effacée en silence), les autres passent', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const DB = seed();
    const state = mkState();
    const d = mkDO(DB, state);
    const bad = { id: 'poison', seq: 7, conv_id: CONV, sender_id: null, ciphertext: 'P', mime: 'text/plain', ts: 1 };   // sender_id NOT NULL
    const good = { id: 'ok', seq: 8, conv_id: CONV, sender_id: 'alice', ciphertext: 'K', mime: 'text/plain', ts: 2 };
    for (const r of [bad, good]) { await state.storage.put('pend:' + String(r.seq).padStart(12, '0') + ':' + r.id, r); d.pendingMessages.push(r); }
    await d.flushToD1();                                                     // lot refusé → mode ligne
    await d.flushToD1();
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE id='ok'")).toBe(1);
    expect(d.pendingMessages).toHaveLength(0);
    expect(state.store.get('quar:000000000007:poison')).toMatchObject({ rec: { id: 'poison' }, error: expect.stringMatching(/NOT NULL/) });
    expect(pendKeys(state)).toEqual([]);
    expect(d.env.TELEMETRY_QUEUE.send.mock.calls.map((c) => c[0].msg).some((m) => /^quarantine poison: /.test(m))).toBe(true);
    expect(err.mock.calls.some((c) => /quarantaine/.test(c[0]))).toBe(true);
  });

  it('quarantaine impossible (stockage en panne) → la clé pend: reste (rechargée au redémarrage)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const DB = seed();
    const state = mkState();
    const d = mkDO(DB, state);
    const bad = { id: 'poison', seq: 3, conv_id: CONV, sender_id: null, ciphertext: 'P', mime: 'text/plain', ts: 1 };
    await state.storage.put('pend:000000000003:poison', bad);
    d.pendingMessages.push(bad);
    d._flushFails.set('poison', 1);
    state.storage.put = async () => { throw new Error('storage down'); };
    await d.flushToD1();
    expect(pendKeys(state)).toEqual(['pend:000000000003:poison']);
  });

  it('contre-pression : buffer plein (nombre ou octets) → refus SANS accusé ; lettre interne → 503', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    d.pendingMessages = Array.from({ length: 5000 }, (_, i) => ({ id: 'p' + i, conv_id: CONV, ciphertext: 'x', ts: i }));
    await alice.emit({ type: 'message', ciphertext: 'trop', id: 'c1' });
    expect(alice.frames('ack')).toHaveLength(0);
    expect(alice.frames('error').at(-1)).toMatchObject({ code: 'busy', client_id: 'c1' });
    d.pendingMessages = [{ id: 'gros', conv_id: CONV, ciphertext: 'x'.repeat(16 * 1024 * 1024), ts: 1 }];
    await alice.emit({ type: 'message', ciphertext: 'trop', id: 'c2' });
    expect(alice.frames('error').at(-1)).toMatchObject({ code: 'busy', client_id: 'c2' });
    const r = await d.fetch({ url: 'https://internal/admin/inject-message', method: 'POST', headers: { get: (n) => (n === 'X-Apex-Internal' ? 'adm' : null) }, json: async () => ({ conv_id: CONV, sender_id: 'alice', ciphertext: 'lettre' }) });
    expect(r.status).toBe(503);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-07 inject-message (lettres 24 h) : « ok » seulement une fois durable', () => {
  const inject = (d, body = { conv_id: CONV, sender_id: 'alice', ciphertext: 'lettre' }) => d.fetch({ url: 'https://internal/admin/inject-message', method: 'POST', headers: { get: (n) => (n === 'X-Apex-Internal' ? 'adm' : null) }, json: async () => body });
  it('D1 en panne → 200 mais la lettre est DURABLE (stockage) et arrive en D1 après redémarrage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { DB, state: db } = downDB();
    const state = mkState();
    const r = await inject(mkDO(DB, state));
    expect(r.status).toBe(200);
    expect(pendKeys(state)).toHaveLength(1);
    db.down = false;
    const d2 = mkDO(DB, state); await tick();
    await d2.alarm();
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE ciphertext='lettre'")).toBe(1);
  });
  it('stockage en panne → 500 (le cron relâche la réclamation et réessaie)', async () => {
    const DB = seed();
    const state = mkState(new Map(), { put: async (k, v) => { if (k.startsWith('pend:')) throw new Error('storage down'); state.store.set(k, v); } });
    const r = await inject(mkDO(DB, state));
    expect(r.status).toBe(500);
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-02 (P1) membre retiré / suspendu : coupé, ne reçoit plus rien', () => {
  it('retiré, il n’envoie que des ping : coupé en 1008 au ping suivant (> 45 s), plus aucun message reçu', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed({ users: ['alice', 'bob', 'carol'] });
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    DB.raw.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?').run(CONV, 'bob');
    vi.setSystemTime(Date.now() + 10 * 60000);
    await bob.emit({ type: 'ping' });
    expect(bob.closed).toMatchObject({ code: 1008 });
    for (let i = 0; i < 3; i++) { vi.setSystemTime(Date.now() + 60000); await alice.emit({ type: 'message', ciphertext: 'secret ' + i }); }
    expect(bob.frames('message')).toHaveLength(0);
    expect(d.sessions.size).toBe(1);
  });

  it('retiré et totalement muet : re-vérifié AVANT la diffusion suivante → 0 message reçu', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    DB.raw.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?').run(CONV, 'bob');
    vi.setSystemTime(Date.now() + 46000);
    await alice.emit({ type: 'message', ciphertext: 'après le retrait' });
    await alice.emit({ type: 'typing' });
    expect(bob.frames('message')).toHaveLength(0);
    expect(bob.frames('typing')).toHaveLength(0);
    expect(bob.closed).toMatchObject({ code: 1008, reason: 'Not a member' });
  });

  it('banUser (status=suspended) : refusé à la connexion ET coupé à la re-vérification', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed();
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    DB.raw.prepare("UPDATE users SET status='suspended' WHERE id='bob'").run();
    vi.setSystemTime(Date.now() + 60000);
    await bob.emit({ type: 'message', ciphertext: 'toujours là ?' });
    expect(bob.closed).toMatchObject({ code: 1008, reason: 'Session révoquée' });
    expect(bob.frames('ack')).toHaveLength(0);
    const again = await connect(d, 'bob');
    expect(again.closed).toMatchObject({ code: 1008, reason: 'Session révoquée' });
  });

  it('révocation interne signée (typ dorevoke) : ferme tout de suite TOUTES les sockets de bob sur la conv', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob1 = await connect(d, 'bob'); const bob2 = await connect(d, 'bob');
    const now = Math.floor(Date.now() / 1000);
    const call = async (payload, { method = 'POST', auth } = {}) => {
      const tok = payload ? await signJWT({ iat: now, exp: now + 60, ...payload }, KEY) : null;
      return d.fetch({ url: 'https://internal/internal/revoke', method, headers: { get: (n) => (n === 'Authorization' ? (auth !== undefined ? auth : (tok ? 'Bearer ' + tok : null)) : null) } });
    };
    for (const [p, o] of [
      [{ sub: 'bob', conv: CONV, typ: 'wsfwd' }],                // jeton de relais WS : refusé
      [{ sub: 'bob', conv: CONV }],                              // sans typ
      [{ conv: CONV, typ: 'dorevoke' }],                         // sans sub
      [{ sub: 'bob', typ: 'dorevoke' }],                         // sans conv
      [{ sub: 'bob', conv: CONV, typ: 'dorevoke' }, { method: 'GET' }],
      [null],                                                    // aucun en-tête
      [null, { auth: 'Bearer pas.un.jwt' }],
    ]) {
      const r = await call(p, o);
      expect(r.status).toBe(403);
    }
    const autre = await call({ sub: 'bob', conv: 'autre_conv', typ: 'dorevoke' });
    expect(await autre.json()).toEqual({ ok: true, closed: 0 });
    expect(bob1.closed).toBeNull();
    const r = await call({ sub: 'bob', conv: CONV, typ: 'dorevoke' });
    expect(await r.json()).toEqual({ ok: true, closed: 2 });
    expect(bob1.closed).toMatchObject({ code: 1008, reason: 'Accès retiré' });
    expect(bob2.closed).toMatchObject({ code: 1008 });
    expect(alice.closed).toBeNull();
    expect(alice.frames('presence').filter((p) => p.userId === 'bob' && p.status === 'offline')).toHaveLength(2);
    await alice.emit({ type: 'message', ciphertext: 'après' });
    expect(bob1.frames('message')).toHaveLength(0);
  });

  it('filet périodique : la connexion arme une alarme (5 min) qui re-vérifie et se réarme tant qu’il reste des sockets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed();
    const state = mkState();
    const d = mkDO(DB, state);
    const t0 = Date.now();
    const bob = await connect(d, 'bob');
    expect(state.storage.setAlarm.mock.calls.at(-1)[0]).toBe(t0 + 5 * 60000);
    DB.raw.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?').run(CONV, 'bob');
    const alice = await connect(d, 'alice');
    vi.setSystemTime(t0 + 5 * 60000);
    state.storage.setAlarm.mockClear();
    await d.alarm();                                                          // aucune trame : coupé par l'alarme
    expect(bob.closed).toMatchObject({ code: 1008 });
    expect(alice.closed).toBeNull();
    expect(state.storage.setAlarm).toHaveBeenCalledWith(Date.now() + 5 * 60000);
    await alice.fire('close');
    d.sessions.clear();
    state.storage.setAlarm.mockClear();
    await d.alarm();
    expect(state.storage.setAlarm).not.toHaveBeenCalled();                    // plus de socket → plus d'alarme
  });

  it('connexion avec un message en attente : l’alarme de flush (5 s) n’est pas repoussée à 5 min', async () => {
    const DB = seed();
    const state = mkState();
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'x' });
    state.storage.setAlarm.mockClear();
    await connect(d, 'bob');
    expect(state.storage.setAlarm).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-05 (P1) éditer / « supprimer pour tous » pendant un flush en vol', () => {
  function gatedDB() {
    const DB = seed();
    const orig = DB.batch.bind(DB);
    let open; const gate = new Promise((r) => { open = r; });
    let calls = 0;
    const ctl = { failReplay: false };
    DB.batch = async (s) => { calls++; if (calls === 1) await gate; if (calls === 2 && ctl.failReplay) throw new Error('D1_ERROR: reset'); return orig(s); };
    return { DB, open, ctl };
  }
  it('suppression pendant le flush → D1 = tombstone dès la fin de CE flush ; une connexion pendant le flush voit le tombstone', async () => {
    const { DB, open } = gatedDB();
    const state = mkState();
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'oups photo privée' });
    const id = alice.frames('ack')[0].id;
    const flushing = d.alarm();
    await tick();
    await alice.emit({ type: 'delete_message', message_id: id, id: 'del1' });
    expect(alice.frames('ack').filter((a) => a.deleted_at)[0]).toMatchObject({ id, client_id: 'del1' });
    const early = await connect(d, 'bob');
    expect(early.frames('history')[0].messages[0]).toMatchObject({ id, ciphertext: '' });
    open(); await flushing;
    const row = DB.raw.prepare('SELECT ciphertext, deleted_at FROM messages WHERE id=?').get(id);
    expect(row.ciphertext).toBe('');
    expect(row.deleted_at).toBeGreaterThan(0);
    const late = await connect(d, 'bob');
    expect(late.frames('history')[0].messages[0].ciphertext).toBe('');
    expect(d.pendingMessages).toHaveLength(0);
    expect(pendKeys(state)).toHaveLength(0);
  });

  it('édition pendant le flush → D1 = v2 + edited_at ; rejeu en échec → gardé (stockage) et appliqué au flush suivant', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { DB, open, ctl } = gatedDB();
    ctl.failReplay = true;
    const state = mkState();
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'v1' });
    const id = alice.frames('ack')[0].id;
    const flushing = d.alarm(); await tick();
    await alice.emit({ type: 'edit_message', message_id: id, new_text: 'v2', id: 'ed1' });
    expect(alice.frames('ack').find((a) => a.edited_at)).toMatchObject({ id, client_id: 'ed1' });
    open(); await flushing;
    expect(DB.raw.prepare('SELECT ciphertext FROM messages WHERE id=?').get(id).ciphertext).toBe('v1');
    expect(d.pendingMessages.map((m) => m.id)).toEqual([id]);                 // pas perdu
    expect(state.store.get(pendKeys(state)[0]).ciphertext).toBe('v2');        // et durable
    await d.alarm();
    const row = DB.raw.prepare('SELECT ciphertext, edited_at FROM messages WHERE id=?').get(id);
    expect(row.ciphertext).toBe('v2');
    expect(row.edited_at).toBeGreaterThan(0);
  });

  it('édition d’un message encore en buffer : enregistrée avant l’accusé (survit au redémarrage) ; stockage en panne → refus', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const DB = seed();
    const state = mkState();
    const d = mkDO(DB, state);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'v1' });
    const id = alice.frames('ack')[0].id;
    await alice.emit({ type: 'edit_message', message_id: id, new_text: 'v2' });
    await alice.emit({ type: 'edit_message', message_id: id, new_text: 'v3' });
    const d2 = mkDO(DB, state); await tick();
    await d2.alarm();
    expect(DB.raw.prepare('SELECT ciphertext FROM messages WHERE id=?').get(id).ciphertext).toBe('v3');

    await alice.emit({ type: 'message', ciphertext: 'w1' });
    const id2 = alice.frames('ack').filter((a) => a.seq).at(-1).id;
    state.storage.put = async () => { throw new Error('storage down'); };
    const acks = alice.frames('ack').length;
    await alice.emit({ type: 'edit_message', message_id: id2, new_text: 'w2', id: 'ed9' });
    await alice.emit({ type: 'delete_message', message_id: id2, id: 'del9' });
    expect(alice.frames('ack')).toHaveLength(acks);
    expect(alice.frames('error').slice(-2)).toMatchObject([{ code: 'not_durable', client_id: 'ed9', id: id2 }, { code: 'not_durable', client_id: 'del9', id: id2 }]);
  });

  it('un seul flush à la fois : un appel concurrent attend celui en cours (le lot en vol n’est jamais écrasé)', async () => {
    const { DB, open } = gatedDB();
    const d = mkDO(DB);
    d.pendingMessages.push({ id: 'a', seq: 1, conv_id: CONV, sender_id: 'alice', ciphertext: 'A', mime: 'text/plain', ts: 1 });
    const f1 = d.flushToD1();
    await tick();
    d.pendingMessages.push({ id: 'b', seq: 2, conv_id: CONV, sender_id: 'alice', ciphertext: 'B', mime: 'text/plain', ts: 2 });
    const f2 = d.flushToD1();
    expect(d._inflight.map((m) => m.id)).toEqual(['a']);
    open(); await f1; await f2;
    expect(d.pendingMessages.map((m) => m.id)).toEqual(['b']);
    await d.flushToD1();
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-08 (serveur) renvoi idempotent par identifiant client', () => {
  it('même id client deux fois → 1 diffusion, 1 ligne, 2 accusés au MÊME id (le 2e marqué dup)', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    await alice.emit({ type: 'message', ciphertext: 'E2E1:same', id: 'm_1' });
    await alice.emit({ type: 'message', ciphertext: 'E2E1:same', id: 'm_1' });
    await d.alarm();
    await alice.emit({ type: 'message', ciphertext: 'E2E1:same', id: 'm_1' });   // après le flush (accusés récents)
    expect(bob.frames('message')).toHaveLength(1);
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE ciphertext='E2E1:same'")).toBe(1);
    const acks = alice.frames('ack');
    expect(new Set(acks.map((a) => a.id)).size).toBe(1);
    expect(acks.map((a) => !!a.dup)).toEqual([false, true, true]);
    expect(acks.every((a) => a.client_id === 'm_1' && a.seq === acks[0].seq)).toBe(true);
  });

  it('après un redémarrage, le renvoi garde le même id → toujours une seule ligne en D1', async () => {
    const DB = seed();
    const state = mkState();
    const d1 = mkDO(DB, state);
    const a1 = await connect(d1, 'alice');
    await a1.emit({ type: 'message', ciphertext: 'once', id: 'm_9' });
    await d1.alarm();
    const d2 = mkDO(DB, state); await tick();
    const a2 = await connect(d2, 'alice');
    await a2.emit({ type: 'message', ciphertext: 'once', id: 'm_9' });
    await d2.alarm();
    expect(a2.frames('ack')[0].id).toBe(a1.frames('ack')[0].id);
    expect(count(DB, "SELECT COUNT(*) c FROM messages WHERE ciphertext='once'")).toBe(1);
  });

  it('id client absent / non textuel / vide / trop long → pas de dédup (ids serveur aléatoires), pas de client_id', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    for (const id of [undefined, 42, '', 'x'.repeat(129)]) {
      await alice.emit({ type: 'message', ciphertext: 'r', id });
      await alice.emit({ type: 'message', ciphertext: 'r', id });
    }
    const acks = alice.frames('ack');
    expect(new Set(acks.map((a) => a.id)).size).toBe(8);
    expect(acks.every((a) => a.client_id === undefined)).toBe(true);
  });

  it('le registre des accusés récents est borné (2000)', () => {
    const d = mkDO(seed());
    for (let i = 0; i < 2001; i++) d._remember({ id: 'r' + i, seq: i, ts: i });
    expect(d._recent.size).toBe(2000);
    expect(d._recent.has('r0')).toBe(false);
  });

  it('les erreurs d’un message renvoient le client_id (refus définitif identifiable par l’app)', async () => {
    const DB = seed();
    DB.raw.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES ('FEATURE_E2E_STRICT','true', 1, 'test')").run();
    DB.raw.prepare("UPDATE conversations SET type='dm' WHERE id=?").run(CONV);
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: '', id: 'c_vide' });
    await alice.emit({ type: 'message', ciphertext: 'en clair', id: 'c_clair' });
    expect(alice.frames('error').map((e) => [e.code, e.client_id])).toEqual([['invalid_message', 'c_vide'], ['e2e_required', 'c_clair']]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-13 last_msg_ts ne recule jamais', () => {
  it('A échoue (transitoire), B passe ; au flush suivant A passe → last_msg reste B', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const DB = seed();
    const p0 = DB.prepare; let failA = 1; let aId = null;
    DB.batch = async () => { throw new Error('D1_ERROR: overloaded'); };
    DB.prepare = (sql) => { const st = p0(sql); if (/INSERT INTO messages/.test(sql)) { const b = st.bind; st.bind = (...a) => { const r = b(...a); const run = r.run; r.run = async () => { if (a[0] === aId && failA-- > 0) throw new Error('D1_ERROR: timeout'); return run(); }; return r; }; } return st; };
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'A' }); aId = alice.frames('ack')[0].id;
    vi.setSystemTime(Date.now() + 1000);
    await alice.emit({ type: 'message', ciphertext: 'B' });
    const bId = alice.frames('ack')[1].id;
    await d.alarm(); await d.alarm();
    const afterB = DB.raw.prepare('SELECT last_msg_ts, last_msg_id FROM conversations WHERE id=?').get(CONV);
    expect(afterB.last_msg_id).toBe(bId);
    await d.alarm();
    const after = DB.raw.prepare('SELECT last_msg_ts, last_msg_id FROM conversations WHERE id=?').get(CONV);
    expect(after).toEqual(afterB);
    expect(count(DB, 'SELECT COUNT(*) c FROM messages')).toBe(2);
  });

  it('dans un même lot, le plus récent gagne même s’il n’est pas le dernier de la file', async () => {
    const DB = seed();
    const d = mkDO(DB);
    d.pendingMessages.push(
      { id: 'recent', seq: 1, conv_id: CONV, sender_id: 'alice', ciphertext: 'R', mime: 'text/plain', ts: 900 },
      { id: 'ancien', seq: 2, conv_id: CONV, sender_id: 'alice', ciphertext: 'A', mime: 'text/plain', ts: 800 },
    );
    await d.flushToD1();
    expect(DB.raw.prepare('SELECT last_msg_id FROM conversations WHERE id=?').get(CONV).last_msg_id).toBe('recent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-14 outil de test : d1Reel se comporte comme D1 sur bind() + batch()', () => {
  it('db.batch([stmt.bind(a), stmt.bind(b)]) → 2 lignes', async () => {
    const DB = d1Reel();
    DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('c','dm','a',1,'d')`).run();
    const st = DB.prepare('INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING');
    await DB.batch([st.bind('a', 'c', 'u', 'x', 1), st.bind('b', 'c', 'u', 'y', 2)]);
    expect(DB.raw.prepare('SELECT id FROM messages ORDER BY id').all().map((r) => r.id)).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-15 (serveur) un message éphémère est stocké avec expires_at et disparaît à l’échéance', () => {
  it('expires_at + reply_to + view_once persistés ; après l’échéance : absent de l’historique et du rattrapage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'message', ciphertext: 'normal', id: 'm_0' });
    const parent = alice.frames('ack')[0].id;
    await alice.emit({ type: 'message', ciphertext: 'bombe', id: 'm_1', expires_at: Date.now() + 1000, reply_to: parent, view_once: 1 });
    await d.alarm();
    const row = DB.raw.prepare("SELECT expires_at, reply_to, view_once FROM messages WHERE ciphertext='bombe'").get();
    expect(row).toMatchObject({ reply_to: parent, view_once: 1 });
    expect(row.expires_at).toBeGreaterThan(Date.now());
    vi.setSystemTime(Date.now() + 2000);
    const bob = await connect(d, 'bob');
    expect(bob.frames('history')[0].messages.map((m) => m.ciphertext)).toEqual(['normal']);
    await bob.emit({ type: 'history_since', after_ts: 0 });
    expect(bob.frames('history_page')[0].messages.map((m) => m.ciphertext)).toEqual(['normal']);
  });
});
