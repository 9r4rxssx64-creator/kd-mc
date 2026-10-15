// @vitest-environment node
// Lot C2 (audit A6-08 / A6-15, 15.10.2026) — ConversationDO sur un VRAI SQLite (d1Reel).
//  A6-15 : la position « live » (trame location_update) était rejetée (« Type inconnu ») : le pair
//          ne voyait que la 1re position. Elle est relayée aux membres connectés, avec l'émetteur
//          imposé par la session, des bornes strictes et un plafond de débit.
//  A6-08 : rafale d'appels — 25 offres faisaient 25 notifications « 📞 Appel entrant ». Désormais au plus
//          une notification par appelant toutes les 45 s (3 par 10 min), et 20 offres/min par socket.
// Sabotage : retirer le `case 'location_update'`, `_callPushAllowed` ou le plafond `call_offer` → échec.
import { describe, it, expect, vi } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import './_support/do-hibernation.js'; // Lot E1 : API d'hibernation du runtime (acceptWebSocket, attachments, réveil)
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

const CONV = 'g_lotc2';
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

describe('A6-15 — position live relayée', () => {
  it('alice → bob reçoit la mise à jour, émetteur imposé par le serveur ; rien n\'est stocké', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    await alice.emit({ type: 'location_update', msg_id: 'loc1', lat: 43.7, lng: 7.42, accuracy: 12, updated_at: 5, from: 'bob' });
    const f = bob.frames('location_update');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ from: 'alice', msg_id: 'loc1', lat: 43.7, lng: 7.42, accuracy: 12, convId: CONV });
    expect(alice.frames('error')).toEqual([]);
    expect(alice.frames('location_update')).toEqual([]);   // pas d'écho à l'émetteur
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM messages').get().c).toBe(0);
    // précision absente ou invalide → null (jamais une valeur arbitraire relayée)
    await alice.emit({ type: 'location_update', msg_id: 'loc1', lat: 1, lng: 2, accuracy: -3 });
    expect(bob.frames('location_update')[1].accuracy).toBe(null);
  });

  it('valeurs invalides refusées, rien n\'est relayé', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    for (const bad of [
      { msg_id: '', lat: 1, lng: 1 }, { msg_id: 'x'.repeat(200), lat: 1, lng: 1 }, { msg_id: 7, lat: 1, lng: 1 },
      { msg_id: 'a', lat: '43', lng: 7 }, { msg_id: 'a', lat: 43, lng: Infinity }, { msg_id: 'a', lat: 91, lng: 7 },
      { msg_id: 'a', lat: 43, lng: -181 }, { msg_id: 'a', lat: 43 },
    ]) await alice.emit({ type: 'location_update', ...bad });
    expect(bob.frames('location_update')).toEqual([]);
    expect(alice.frames('error')).toHaveLength(8);
    expect(alice.frames('error').every((e) => /location_update/.test(e.message))).toBe(true);
  });

  it('plafond : au plus 30 mises à jour par minute et par socket', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const alice = await connect(d, 'alice');
    const bob = await connect(d, 'bob');
    for (let i = 0; i < 35; i++) await alice.emit({ type: 'location_update', msg_id: 'l', lat: 1, lng: 1 });
    expect(bob.frames('location_update')).toHaveLength(30);
    expect(alice.frames('error').filter((e) => e.code === 'rate_limit')).toHaveLength(5);
  });

  it('un non-membre ne peut pas se connecter, donc ne peut rien relayer', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const bob = await connect(d, 'bob');
    const r = await d.fetch({ url: `https://do/ws?token=dan&uid=dan&conv=${CONV}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } });
    const dan = r.status === 101 ? lastPair[1] : null;
    if (dan) await dan.emit({ type: 'location_update', msg_id: 'l', lat: 1, lng: 1 });
    expect(bob.frames('location_update')).toEqual([]);
  });
});

describe('A6-08 — rafale d\'appels', () => {
  it('25 offres en une minute → 1 seule notification d\'appel, 20 offres relayées au plus', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const spy = vi.spyOn(d, 'notifyOfflineCall').mockResolvedValue();
    const alice = await connect(d, 'alice');
    for (let i = 0; i < 25; i++) await alice.emit({ type: 'webrtc-offer', to: 'bob', callType: 'video', offer: { sdp: 'v=' + i } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(alice.frames('error').filter((e) => e.code === 'rate_limit')).toHaveLength(5);
    // Les autres trames de signalisation (ICE, fin d'appel) ne sont pas comptées comme des offres.
    await alice.emit({ type: 'call-end', to: 'bob' });
    expect(alice.frames('error').filter((e) => e.code === 'rate_limit')).toHaveLength(5);
  });

  it('plusieurs sockets du même appelant ne contournent pas le plafond de notifications', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const spy = vi.spyOn(d, 'notifyOfflineCall').mockResolvedValue();
    const a1 = await connect(d, 'alice', '&device=d1');
    const a2 = await connect(d, 'alice', '&device=d2');
    for (let i = 0; i < 5; i++) { await a1.emit({ type: 'webrtc-offer', to: 'bob', offer: {} }); await a2.emit({ type: 'webrtc-offer', to: 'bob', offer: {} }); }
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('règle : 1 notification / 45 s, 3 au plus par 10 min, par appelant', () => {
    const d = mkDO(seed());
    const t0 = 1_000_000;
    expect(d._callPushAllowed('alice', t0)).toBe(true);
    expect(d._callPushAllowed('alice', t0 + 44000)).toBe(false);
    expect(d._callPushAllowed('carol', t0 + 1000)).toBe(true);     // un autre appelant n'est pas bloqué
    expect(d._callPushAllowed('alice', t0 + 46000)).toBe(true);
    expect(d._callPushAllowed('alice', t0 + 92000)).toBe(true);
    expect(d._callPushAllowed('alice', t0 + 140000)).toBe(false);  // 4e en moins de 10 min
    expect(d._callPushAllowed('alice', t0 + 600000 + 1000)).toBe(true); // fenêtre écoulée
  });

  it('notification d\'appel inchangée pour un vrai appel (destinataire hors ligne prévenu)', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const push = vi.spyOn(d, '_pushToUsers').mockResolvedValue();
    const alice = await connect(d, 'alice');
    await alice.emit({ type: 'webrtc-offer', to: 'bob', callType: 'audio', offer: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual(['bob']);
  });
});

describe('A4 P3-7 — notifications « Nom · Groupe »', () => {
  async function titre(DB, conv = CONV) {
    const d = mkDO(DB);
    const spy = vi.spyOn(d, '_pushToUsers').mockResolvedValue();
    await d.notifyOfflineMembers({ id: 'm1', conv_id: conv, sender_id: 'alice', ts: Date.now(), mime: 'text/plain' });
    return spy.mock.calls[0][1];
  }
  it('groupe : « Alice Martin · Famille » (nom du groupe ajouté)', async () => {
    const DB = seed();
    DB.raw.prepare("UPDATE users SET real_name='Alice Martin' WHERE id='alice'").run();
    DB.raw.prepare("UPDATE conversations SET name='Famille' WHERE id=?").run(CONV);
    const p = await titre(DB);
    expect(p.title).toBe('Alice Martin · Famille');
    expect(p.payload.groupName).toBe('Famille');
  });
  it('conversation à deux : le nom seul ; sans nom → pseudo ; rien → « Quelqu\'un »', async () => {
    const DB = seed({ type: 'dm' });
    DB.raw.prepare("UPDATE users SET real_name='Alice Martin' WHERE id='alice'").run();
    expect((await titre(DB)).title).toBe('Alice Martin');
    DB.raw.prepare("UPDATE users SET real_name='' WHERE id='alice'").run();
    expect((await titre(DB)).title).toBe('alice');
    DB.raw.prepare("UPDATE users SET pseudo='  ' WHERE id='alice'").run();
    expect((await titre(DB)).title).toBe('Quelqu\'un');
  });
  it('base en panne pour les noms → notification quand même, titre générique', async () => {
    const DB = seed();
    const d = mkDO(DB);
    const real = DB.prepare;
    DB.prepare = (sql) => (/FROM users WHERE id=|FROM conversations WHERE id=/.test(sql) ? { bind: () => ({ first: async () => { throw new Error('D1 down'); } }) } : real(sql));
    const spy = vi.spyOn(d, '_pushToUsers').mockResolvedValue();
    await d.notifyOfflineMembers({ id: 'm1', conv_id: CONV, sender_id: 'alice', ts: Date.now(), mime: 'text/plain' });
    expect(spy.mock.calls[0][1].title).toBe('Quelqu\'un');
  });
});
