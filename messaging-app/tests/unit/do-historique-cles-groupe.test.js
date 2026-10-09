// @vitest-environment node
// Historique à la connexion (09.10.2026) : les messages de clés de groupe (mime application/x-apex-grpkey,
// E2EGK1/E2EGR1) ne prennent plus les 50 places des messages lisibles, mais arrivent quand même (le téléphone
// en a besoin pour déchiffrer). Vérifié sur un VRAI SQLite aux vraies migrations (d1Reel), pas une fausse base.
import { describe, it, expect, vi } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { d1Reel } from './_support/d1-sqlite.js';

const GRPKEY = 'application/x-apex-grpkey';
const CONV = 'g_hist';

class MockWS {
  constructor() { this.sent = []; this.closed = null; }
  accept() {}
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = { code, reason }; }
  addEventListener() {}
  frames(type) { return this.sent.map((m) => JSON.parse(m)).filter((m) => m.type === type); }
}
// Node refuse un Response au statut 101 (passage en WebSocket, propre à Cloudflare) : réponse minimale, ce fichier seulement.
globalThis.Response = class { constructor(b, init = {}) { this._b = b; this.status = init.status ?? 200; this.webSocket = init.webSocket; this.headers = new Map(); } async text() { return String(this._b ?? ''); } async json() { return JSON.parse(this._b); } };
globalThis.WebSocketPair = class { constructor() { this[0] = new MockWS(); this[1] = new MockWS(); } };

function base() {
  const DB = d1Reel();
  const now = Date.now();
  DB.raw.prepare(`INSERT INTO conversations (id,type,name,created_by,created_at,sharded_to_do) VALUES (?,?,?,?,?,?)`).run(CONV, 'group', 'g', 'alice', 1, CONV);
  for (const u of ['alice', 'bob']) {
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(u, u, u, '+3360000000' + u.length, 'h_' + u, 1, 'k', 'k', 'k', 'active');
    DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,joined_at) VALUES (?,?,?)`).run(CONV, u, 1);
  }
  const add = (id, mime, ts) => DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,mime,ts) VALUES (?,?,?,?,?,?)`).run(id, CONV, 'alice', 'x', mime, ts);
  return { DB, add, now };
}

async function historique(DB) {
  const state = {
    id: { toString: () => CONV },
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => {}), list: vi.fn(async () => new Map()), setAlarm: vi.fn(async () => {}) },
    blockConcurrencyWhile: vi.fn(async (fn) => fn()),
  };
  const _do = new ConversationDO(state, { APEX_CHAT_DB: DB });
  vi.spyOn(_do, 'verifyJWT').mockResolvedValue({ sub: 'bob', typ: 'wsfwd', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 });
  const r = await _do.fetch({ url: `https://do/ws?token=t&uid=bob&conv=${CONV}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } });
  expect(r.status).toBe(101);
  const ws = [..._do.sessions.keys()][0];
  return ws.frames('history')[0]?.messages || [];
}

describe('historique : les clés de groupe ne volent pas la place des messages', () => {
  it('10 messages lisibles PUIS 60 distributions de clés → les 10 messages sont tous là (+ 50 clés)', async () => {
    const { DB, add } = base();
    for (let i = 0; i < 10; i++) add('m' + i, 'text/plain', 100 + i);
    for (let i = 0; i < 60; i++) add('k' + i, GRPKEY, 1000 + i);
    const h = await historique(DB);
    const lisibles = h.filter((m) => m.mime !== GRPKEY).map((m) => m.id);
    expect(lisibles).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
    expect(h.filter((m) => m.mime === GRPKEY)).toHaveLength(50);
    const ts = h.map((m) => m.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));   // ordre chronologique conservé
  });

  it('60 messages lisibles + 5 clés anciennes → 50 derniers messages ET les 5 clés (pour les déchiffrer)', async () => {
    const { DB, add } = base();
    for (let i = 0; i < 5; i++) add('k' + i, GRPKEY, 10 + i);
    for (let i = 0; i < 60; i++) add('m' + i, 'text/plain', 100 + i);
    const h = await historique(DB);
    expect(h.filter((m) => m.mime !== GRPKEY)).toHaveLength(50);
    expect(h.filter((m) => m.mime !== GRPKEY)[0].id).toBe('m10');
    expect(h.filter((m) => m.mime === GRPKEY).map((m) => m.id)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });

  it('un message sans mime (NULL, anciens messages) reste un message lisible', async () => {
    const { DB, add } = base();
    add('ancien', null, 50);
    const h = await historique(DB);
    expect(h.map((m) => m.id)).toEqual(['ancien']);
  });
});
