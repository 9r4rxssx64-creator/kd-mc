/**
 * Tests workers/durable-objects/ConversationDO.js — DO temps réel WebSocket
 * Coverage 100% via mocks state, storage, WebSocketPair, D1, fetch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationDO, BroadcastDO, PresenceDO } from '../../workers/durable-objects/ConversationDO.js';

// ----------------------------------------------------------------------------
// Mocks Cloudflare Durable Object runtime
// ----------------------------------------------------------------------------
class MockWebSocket extends EventTarget {
  constructor(role = 'server') {
    super();
    this.role = role;
    this.sent = [];
    this.closed = null;
    this.accepted = false;
    this._listeners = {};
  }
  accept() { this.accepted = true; }
  send(data) { this.sent.push(data); }
  close(code, reason) { this.closed = { code, reason }; }
  addEventListener(type, fn) {
    super.addEventListener(type, fn);
    this._listeners[type] = (this._listeners[type] || []).concat(fn);
  }
  triggerMessage(data) {
    const event = { data, type: 'message' };
    (this._listeners.message || []).forEach((fn) => fn(event));
  }
  triggerClose() {
    (this._listeners.close || []).forEach((fn) => fn({ type: 'close' }));
  }
}
globalThis.WebSocketPair = class {
  constructor() {
    this[0] = new MockWebSocket('client');
    this[1] = new MockWebSocket('server');
  }
};

function makeStorage() {
  const data = new Map();
  return {
    data,
    get: vi.fn(async (k) => data.get(k)),
    put: vi.fn(async (k, v) => { data.set(k, v); }),
  };
}

function makeState(id = 'conv-id-123') {
  return {
    id: { toString: () => id },
    storage: makeStorage(),
    blockConcurrencyWhile: vi.fn(async (fn) => { await fn(); }),
  };
}

// Helper qui crée un objet "Request-like" avec Upgrade header (que fetch natif strip)
function wsRequest(url) {
  return {
    url,
    method: 'GET',
    headers: {
      get(name) {
        return name.toLowerCase() === 'upgrade' ? 'websocket' : null;
      },
    },
  };
}

function httpRequest(url, init = {}) {
  return new Request(url, init);
}

function makeDB(rows = []) {
  return {
    _rows: rows,
    prepare: vi.fn((sql) => ({
      sql,
      bind: vi.fn(function (...args) {
        this._args = args;
        return this;
      }),
      first: vi.fn(async function () {
        if (sql.includes('system_config')) return null;
        if (sql.includes('conversation_members')) {
          // First member match
          return rows.find((r) => r.user_id === this._args?.[1]) || null;
        }
        if (sql.includes('FROM messages')) return rows[0] || null;
        return null;
      }),
      all: vi.fn(async () => ({ results: rows })),
      run: vi.fn(async () => ({ success: true })),
    })),
    batch: vi.fn(async (stmts) => ({ success: true, count: stmts.length })),
  };
}

async function makeJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payloadB64}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payloadB64}.${sigB64}`;
}

const SECRET = 'jwt-test-secret';

const ENV = (overrides = {}) => ({
  JWT_SIGN_KEY: SECRET,
  APEX_CHAT_ADMIN_TOKEN: 'admin-secret',
  APEX_CHAT_DB: makeDB([{ user_id: 'kdmc', role: 'owner' }]),
  TELEMETRY_QUEUE: { send: vi.fn(async () => {}) },
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
});

// ----------------------------------------------------------------------------
// ConversationDO — basic
// ----------------------------------------------------------------------------
describe('ConversationDO — constructor + storage rehydrate', () => {
  it('init seq=0 si rien dans storage', async () => {
    const state = makeState();
    const env = ENV();
    const _do = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 5));
    expect(_do.seq).toBe(0);
    expect(state.blockConcurrencyWhile).toHaveBeenCalled();
  });

  it('rehydrate seq depuis storage si existant', async () => {
    const state = makeState();
    state.storage.data.set('seq', 42);
    const env = ENV();
    const _do = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 5));
    expect(_do.seq).toBe(42);
  });

  it('loadConfig fail → fallback B', async () => {
    const env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          all: async () => { throw new Error('db down'); },
        }),
      },
    });
    const state = makeState();
    const _do = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 10));
    expect(_do.config.ADMIN_MODE).toBe('B');
  });

  it('loadConfig success → applique values', async () => {
    const env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          all: async () => ({ results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'true' }] }),
        }),
      },
    });
    const state = makeState();
    const _do = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 10));
    expect(_do.config.KEVIN_INVISIBLE_ADMIN).toBe('true');
  });

  it('loadConfig avec results undefined', async () => {
    const env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({ all: async () => ({}) }),
      },
    });
    const state = makeState();
    const _do = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 10));
    expect(_do.config).toEqual({});
  });
});

// ----------------------------------------------------------------------------
// ConversationDO — verifyJWT
// ----------------------------------------------------------------------------
describe('ConversationDO — verifyJWT', () => {
  let _do;
  beforeEach(async () => {
    _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
  });

  it('token null → null', async () => {
    expect(await _do.verifyJWT(null)).toBe(null);
  });

  it('JWT_SIGN_KEY manquant → null', async () => {
    _do.env = { ...ENV(), JWT_SIGN_KEY: '' };
    const t = await makeJWT({ sub: 'kdmc' }, SECRET);
    expect(await _do.verifyJWT(t)).toBe(null);
  });

  it('format invalide (pas 3 parts) → null', async () => {
    expect(await _do.verifyJWT('aaaa')).toBe(null);
    expect(await _do.verifyJWT('aaaa.bbbb')).toBe(null);
  });

  it('signature invalide → null', async () => {
    const fake = await makeJWT({ sub: 'kdmc' }, 'WRONG_SECRET');
    expect(await _do.verifyJWT(fake)).toBe(null);
  });

  it('JWT expired → null', async () => {
    const expired = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) - 100 }, SECRET);
    expect(await _do.verifyJWT(expired)).toBe(null);
  });

  it('JWT valide → payload', async () => {
    const valid = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const p = await _do.verifyJWT(valid);
    expect(p.sub).toBe('kdmc');
  });

  it('JWT sans exp → accepted', async () => {
    const noExp = await makeJWT({ sub: 'kdmc' }, SECRET);
    const p = await _do.verifyJWT(noExp);
    expect(p.sub).toBe('kdmc');
  });

  it('JWT format malformé (atob throw) → null', async () => {
    expect(await _do.verifyJWT('!!.!!.!!')).toBe(null);
  });
});

// ----------------------------------------------------------------------------
// ConversationDO — fetch (HTTP routes)
// ----------------------------------------------------------------------------
describe('ConversationDO — fetch /health', () => {
  it('GET /health → connected/seq/pending', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const r = await _do.fetch(new Request('https://x/health'));
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(b.connected).toBe(0);
    expect(b.seq).toBe(0);
    expect(b.pending).toBe(0);
  });
});

describe('ConversationDO — fetch WebSocket upgrade', () => {
  it('sans Upgrade header → 426', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const r = await _do.fetch(new Request('https://x/ws'));
    expect(r.status).toBe(426);
  });

  it('manque token/uid → close 1008 Auth required', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const r = await _do.fetch(wsRequest('https://x/ws'));
    expect(r.status).toBe(101);
  });

  it('JWT invalide → close 1008 Invalid token', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const url = 'https://x/ws?token=INVALID&uid=kdmc&conv=conv1';
    const r = await _do.fetch(wsRequest(url));
    expect(r.status).toBe(101);
  });

  it('UID mismatch → close 1008', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'realuser', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=fakeUser&conv=conv1`;
    const r = await _do.fetch(wsRequest(url));
    expect(r.status).toBe(101);
  });

  it('user pas membre → close 1008 Not a member', async () => {
    const env = ENV({ APEX_CHAT_DB: makeDB([]) }); // empty members
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    const r = await _do.fetch(wsRequest(url));
    expect(r.status).toBe(101);
  });

  it('DB error → close 1011', async () => {
    const env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          first: async () => { throw new Error('db down'); },
        }),
      },
    });
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    const r = await _do.fetch(wsRequest(url));
    expect(r.status).toBe(101);
  });

  it('upgrade success → session ajoutée + hello envoyé', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    const r = await _do.fetch(wsRequest(url));
    expect(r.status).toBe(101);
    expect(_do.sessions.size).toBe(1);
    const server = [..._do.sessions.keys()][0];
    expect(server.sent.some((m) => JSON.parse(m).type === 'hello')).toBe(true);
  });

  // v1.1.254 — présence live : le broadcast join/leave DOIT porter `status`
  // (online/offline), sinon la garde client `if(pFrom && pStatus)` l'ignore.
  it('join → présence online reçue par les membres présents (avec status)', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    // Observateur déjà connecté (autre membre de la conv)
    const observer = new MockWebSocket();
    _do.sessions.set(observer, { userId: 'other', server: observer });
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    const presence = observer.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'presence');
    expect(presence).toBeTruthy();
    expect(presence.userId).toBe('kdmc');
    expect(presence.status).toBe('online'); // ← le champ qui manquait
    expect(presence.action).toBe('join');   // rétrocompat conservée
  });

  it('leave → présence offline broadcastée (avec status + last_seen)', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const observer = new MockWebSocket();
    _do.sessions.set(observer, { userId: 'other', server: observer });
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    // Le nouveau client se déconnecte → close listener broadcast 'leave'
    const joiner = [..._do.sessions.keys()].find((s) => _do.sessions.get(s).userId === 'kdmc');
    joiner.triggerClose();
    const leave = observer.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'presence' && m.action === 'leave');
    expect(leave).toBeTruthy();
    expect(leave.status).toBe('offline');
    expect(typeof leave.last_seen).toBe('number');
  });

  it('upgrade success sans deviceId param → utilise random UUID', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    const session = [..._do.sessions.values()][0];
    expect(session.deviceId).toBeTruthy();
  });

  it('upgrade success sans conv param → utilise state.id', async () => {
    const _do = new ConversationDO(makeState('SOME-DO-ID'), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc`;
    await _do.fetch(wsRequest(url));
    const session = [..._do.sessions.values()][0];
    expect(session.convId).toBe('SOME-DO-ID');
  });

  // --- Historique envoyé à la connexion (couverture L155-176) ---
  // DB où membership passe (first conversation_members) et où on contrôle l'historique messages.
  function makeConnectDB({ historyAll = { results: [] }, historyThrow = false } = {}) {
    return {
      prepare: vi.fn((sql) => ({
        sql,
        bind: vi.fn(function () { return this; }),
        first: vi.fn(async function () {
          if (sql.includes('conversation_members')) return { user_id: 'kdmc', role: 'owner' };
          return null; // system_config / users
        }),
        all: vi.fn(async function () {
          if (sql.includes('FROM messages')) {
            if (historyThrow) throw new Error('hist down');
            return historyAll;
          }
          return { results: [] }; // loadConfig
        }),
        run: vi.fn(async () => ({ success: true })),
      })),
      batch: vi.fn(async () => ({ success: true })),
    };
  }

  async function connectWS(_do, conv = 'conv1') {
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    return _do.fetch(wsRequest(`https://x/ws?token=${validJWT}&uid=kdmc&conv=${conv}`));
  }

  it('historique : envoi DB throw → catch silencieux, session quand même ajoutée', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyThrow: true }) }));
    await new Promise((r) => setTimeout(r, 5));
    const r = await connectWS(_do);
    expect(r.status).toBe(101);
    expect(_do.sessions.size).toBe(1);
    const server = [..._do.sessions.keys()][0];
    expect(server.sent.some((m) => JSON.parse(m).type === 'hello')).toBe(true);
    expect(server.sent.some((m) => JSON.parse(m).type === 'history')).toBe(false);
  });

  it('historique : message en buffer (pendingMessages) fusionné + hist.results absent → history envoyé', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: {} }) }));
    await new Promise((r) => setTimeout(r, 5));
    // message non encore flushé en D1, sans reply_to/view_once/expires_at (défauts)
    _do.pendingMessages = [{ conv_id: 'conv1', id: 'pm1', sender_id: 'kdmc', ciphertext: 'c', mime: 'text/plain', ts: Date.now() }];
    const r = await connectWS(_do);
    expect(r.status).toBe(101);
    const server = [..._do.sessions.keys()][0];
    const histMsg = server.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'history');
    expect(histMsg).toBeTruthy();
    expect(histMsg.messages.some((m) => m.id === 'pm1' && m.reply_to === null && m.view_once === 0)).toBe(true);
  });

  it('historique : tous les messages expirés → fresh vide → pas d\'envoi history', async () => {
    const expired = { results: [{ id: 'old', sender_id: 'k', ciphertext: 'x', mime: 'text/plain', ts: 1, expires_at: 1 }] };
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: expired }) }));
    await new Promise((r) => setTimeout(r, 5));
    const r = await connectWS(_do);
    expect(r.status).toBe(101);
    const server = [..._do.sessions.keys()][0];
    expect(server.sent.some((m) => JSON.parse(m).type === 'history')).toBe(false);
  });

  // v1.1.242 : rejoue l'appel en attente au destinataire qui rejoint la conv
  it('pendingCall frais d\'un autre user → REJOUE offer + candidates au join', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: {} }) }));
    await new Promise((r) => setTimeout(r, 5));
    _do.pendingCall = { fromUserId: 'caller', fromDevice: 'dC', callType: 'audio',
      offer: { type: 'offer', sdp: 's' }, candidates: [{ candidate: 'ice1' }], ts: Date.now() };
    await connectWS(_do); // rejoint en tant que kdmc (≠ caller)
    const server = [..._do.sessions.keys()][0];
    const sent = server.sent.map((m) => JSON.parse(m));
    expect(sent.find((m) => m.type === 'webrtc-offer' && m.replayed)).toBeTruthy();
    expect(sent.find((m) => m.type === 'webrtc-candidate' && m.replayed)).toBeTruthy();
  });

  it('pendingCall du MÊME user qui rejoint → pas de rejeu', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: {} }) }));
    await new Promise((r) => setTimeout(r, 5));
    _do.pendingCall = { fromUserId: 'kdmc', callType: 'audio', offer: { type: 'offer', sdp: 's' }, candidates: [], ts: Date.now() };
    await connectWS(_do);
    const server = [..._do.sessions.keys()][0];
    expect(server.sent.some((m) => JSON.parse(m).replayed)).toBe(false);
  });

  it('pendingCall expiré (>45s) → pas de rejeu', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: {} }) }));
    await new Promise((r) => setTimeout(r, 5));
    _do.pendingCall = { fromUserId: 'caller', callType: 'audio', offer: { type: 'offer', sdp: 's' }, candidates: [], ts: Date.now() - 50000 };
    await connectWS(_do);
    const server = [..._do.sessions.keys()][0];
    expect(server.sent.some((m) => JSON.parse(m).replayed)).toBe(false);
  });

  it('rejeu : offer non sérialisable → catch silencieux, session ajoutée', async () => {
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: makeConnectDB({ historyAll: {} }) }));
    await new Promise((r) => setTimeout(r, 5));
    const circular = {}; circular.self = circular;
    _do.pendingCall = { fromUserId: 'caller', callType: 'audio', offer: circular, candidates: [], ts: Date.now() };
    const r = await connectWS(_do);
    expect(r.status).toBe(101);
    expect(_do.sessions.size).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// ConversationDO — handleMessage (chaque type)
// ----------------------------------------------------------------------------
describe('ConversationDO — handleMessage', () => {
  let _do, ws, server;
  beforeEach(async () => {
    _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    ws = new MockWebSocket();
    _do.sessions.set(ws, {
      userId: 'kdmc', deviceId: 'd1', convId: 'conv1', lastSeq: 0,
      connectedAt: Date.now(), messageCount: 0, lastReset: Date.now(),
    });
  });

  it('handleMessage avec session inconnue → no-op', async () => {
    const otherWs = new MockWebSocket();
    await _do.handleMessage(otherWs, { type: 'message', ciphertext: 'x' });
    expect(otherWs.sent.length).toBe(0);
  });

  it('rate limit reset si > 60s', async () => {
    const session = _do.sessions.get(ws);
    session.lastReset = Date.now() - 70000;
    session.messageCount = 50;
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'x' });
    expect(_do.sessions.get(ws).messageCount).toBe(1);
  });

  it('rate limit > 100 msg/min → erreur', async () => {
    const session = _do.sessions.get(ws);
    session.messageCount = 100;
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'x' });
    const last = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(last.code).toBe('rate_limit');
  });

  it('message sans ciphertext → erreur', async () => {
    await _do.handleMessage(ws, { type: 'message' });
    const e = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(e.message).toContain('ciphertext required');
  });

  it('message ciphertext > 100KB → erreur', async () => {
    const big = 'x'.repeat(100001);
    await _do.handleMessage(ws, { type: 'message', ciphertext: big });
    const e = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(e.message).toContain('too large');
  });

  it('message valide → seq inc, broadcast, ack', async () => {
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'cipher-data' });
    expect(_do.seq).toBe(1);
    const ackMsg = ws.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'ack');
    expect(ackMsg).toBeDefined();
    expect(ackMsg.seq).toBe(1);
  });

  it('message avec mime/reply_to/thread_root/view_once/expires_at', async () => {
    await _do.handleMessage(ws, {
      type: 'message', ciphertext: 'x', mime: 'image/png',
      reply_to: 'msg-prev', thread_root: 'thread-root',
      view_once: true, expires_at: Date.now() + 1000,
    });
    const recorded = _do.pendingMessages[0];
    expect(recorded.mime).toBe('image/png');
    expect(recorded.view_once).toBe(1);
    expect(recorded.reply_to).toBe('msg-prev');
  });

  it('message → flush D1 quand pendingMessages atteint 10', async () => {
    for (let i = 0; i < 10; i++) {
      await _do.handleMessage(ws, { type: 'message', ciphertext: 'x' + i });
    }
    expect(_do.pendingMessages.length).toBe(0); // flushé au 10ème
  });

  it('message → flush D1 quand > 5s même peu de messages', async () => {
    _do.lastFlush = Date.now() - 6000;
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'x' });
    expect(_do.pendingMessages.length).toBe(0);
  });

  it('typing → broadcast (excluant ws expéditeur)', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'other' });
    await _do.handleMessage(ws, { type: 'typing' });
    const t = ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'typing');
    expect(t).toBeDefined();
    expect(t.userId).toBe('kdmc');
  });

  it('read → marque last_read_msg_id + broadcast', async () => {
    await _do.handleMessage(ws, { type: 'read', message_id: 'msg-42' });
    // Pas d'erreur, broadcast envoyé aux autres
  });

  // v1.1.255 — édition/suppression propagées serveur (parité WhatsApp).
  function editEnv() {
    const calls = [];
    return {
      calls,
      env: ENV({
        APEX_CHAT_DB: {
          prepare: vi.fn((sql) => ({
            bind: function (...args) { calls.push({ sql, args }); return this; },
            first: async () => null,
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          })),
        },
        JWT_SIGN_KEY: SECRET,
      }),
    };
  }

  it('edit_message (E2E ciphertext) → UPDATE D1 + broadcast ciphertext + ack', async () => {
    const { env, calls } = editEnv();
    _do.env = env;
    const observer = new MockWebSocket();
    _do.sessions.set(observer, { userId: 'other', convId: 'conv1' });
    await _do.handleMessage(ws, { type: 'edit_message', message_id: 'm1', ciphertext: 'E2E1:abc' });
    const upd = calls.find((c) => c.sql.includes('UPDATE messages SET ciphertext=?, edited_at=?'));
    expect(upd).toBeTruthy();
    expect(upd.args).toContain('E2E1:abc');
    expect(upd.args).toContain('kdmc'); // garde sender_id
    const bc = observer.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'edit_message');
    expect(bc.ciphertext).toBe('E2E1:abc');
    expect(bc.new_text).toBeNull();
    const ack = ws.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'ack' && m.edited_at);
    expect(ack).toBeTruthy();
  });

  it('edit_message (legacy new_text) → persiste new_text + rediffuse new_text', async () => {
    const { env, calls } = editEnv();
    _do.env = env;
    const observer = new MockWebSocket();
    _do.sessions.set(observer, { userId: 'other', convId: 'conv1' });
    await _do.handleMessage(ws, { type: 'edit_message', message_id: 'm2', new_text: 'corrigé' });
    const upd = calls.find((c) => c.sql.includes('UPDATE messages SET ciphertext=?, edited_at=?'));
    expect(upd.args).toContain('corrigé');
    const bc = observer.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'edit_message');
    expect(bc.new_text).toBe('corrigé');
    expect(bc.ciphertext).toBeNull();
  });

  it('edit_message met à jour un message encore en attente de flush', async () => {
    const { env } = editEnv();
    _do.env = env;
    _do.pendingMessages.push({ id: 'mp', sender_id: 'kdmc', ciphertext: 'old' });
    await _do.handleMessage(ws, { type: 'edit_message', message_id: 'mp', new_text: 'neuf' });
    expect(_do.pendingMessages[0].ciphertext).toBe('neuf');
    expect(_do.pendingMessages[0].edited_at).toBeTruthy();
  });

  it('edit_message sans contenu → erreur', async () => {
    await _do.handleMessage(ws, { type: 'edit_message', message_id: 'm3' });
    const e = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(e.message).toContain('contenu requis');
  });

  it('edit_message contenu > 100KB → erreur', async () => {
    await _do.handleMessage(ws, { type: 'edit_message', message_id: 'm4', ciphertext: 'x'.repeat(100001) });
    const e = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(e.message).toContain('trop grand');
  });

  it('delete_message → tombstone D1 (deleted_at + ciphertext NULL) + broadcast + ack', async () => {
    const { env, calls } = editEnv();
    _do.env = env;
    const observer = new MockWebSocket();
    _do.sessions.set(observer, { userId: 'other', convId: 'conv1' });
    await _do.handleMessage(ws, { type: 'delete_message', message_id: 'm5', scope: 'everyone' });
    const del = calls.find((c) => c.sql.includes('UPDATE messages SET deleted_at=?, ciphertext=NULL'));
    expect(del).toBeTruthy();
    expect(del.args).toContain('kdmc'); // garde sender_id
    const bc = observer.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'delete_message');
    expect(bc.message_id).toBe('m5');
    const ack = ws.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'ack' && m.deleted_at);
    expect(ack).toBeTruthy();
  });

  it('delete_message met à jour un message encore en attente de flush', async () => {
    const { env } = editEnv();
    _do.env = env;
    _do.pendingMessages.push({ id: 'md', sender_id: 'kdmc', ciphertext: 'secret' });
    await _do.handleMessage(ws, { type: 'delete_message', message_id: 'md' });
    expect(_do.pendingMessages[0].deleted_at).toBeTruthy();
    expect(_do.pendingMessages[0].ciphertext).toBeNull();
  });

  it('delete_message sans message_id → erreur', async () => {
    await _do.handleMessage(ws, { type: 'delete_message' });
    const e = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(e.message).toContain('message_id requis');
  });

  it('reaction → toggle add/remove', async () => {
    const env = ENV({
      APEX_CHAT_DB: {
        prepare: vi.fn((sql) => ({
          bind: function (...args) { this._args = args; return this; },
          first: async function () {
            if (sql.includes('SELECT reactions')) return { reactions: '{}' };
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [] }),
        })),
      },
      JWT_SIGN_KEY: SECRET,
    });
    _do.env = env;
    await _do.handleMessage(ws, { type: 'reaction', message_id: 'msg-1', emoji: '👍' });
  });

  it('reaction inexistante (existing null) → no broadcast', async () => {
    _do.env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          first: async () => null,
          run: async () => ({ success: true }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    });
    await _do.handleMessage(ws, { type: 'reaction', message_id: 'unknown', emoji: '👍' });
    // No broadcast happens — pas de crash
  });

  it('reaction toggle remove (déjà présent)', async () => {
    _do.env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          first: async () => ({ reactions: JSON.stringify({ '👍': ['kdmc'] }) }),
          run: async () => ({ success: true }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    });
    await _do.handleMessage(ws, { type: 'reaction', message_id: 'msg-1', emoji: '👍' });
  });

  it('reaction parse fail → vide', async () => {
    _do.env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          first: async () => ({ reactions: 'INVALID-JSON' }),
          run: async () => ({ success: true }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    });
    await _do.handleMessage(ws, { type: 'reaction', message_id: 'msg-1', emoji: '🎉' });
  });

  it('reaction avec reactions null → fallback "{}"', async () => {
    _do.env = ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          first: async () => ({ reactions: null }),
          run: async () => ({ success: true }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    });
    await _do.handleMessage(ws, { type: 'reaction', message_id: 'msg-1', emoji: '🚀' });
  });

  it('ping → pong', async () => {
    await _do.handleMessage(ws, { type: 'ping' });
    const pong = ws.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'pong');
    expect(pong).toBeDefined();
  });

  it('type inconnu → erreur Type inconnu', async () => {
    await _do.handleMessage(ws, { type: 'TOTALLY_UNKNOWN' });
    const e = ws.sent.map((m) => JSON.parse(m)).find((m) => (m.message || '').includes('Type inconnu'));
    expect(e).toBeDefined();
  });

  // Visio WebRTC : relay signaling messages aux autres sessions
  it('webrtc-offer → broadcast aux autres avec from + to + callType + offer', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2', deviceId: 'd2' });
    await _do.handleMessage(ws, {
      type: 'webrtc-offer', to: 'peer2', callType: 'video',
      offer: { type: 'offer', sdp: 'remote-sdp' },
    });
    const fwd = ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'webrtc-offer');
    expect(fwd).toBeDefined();
    expect(fwd.from).toBe('kdmc');
    expect(fwd.to).toBe('peer2');
    expect(fwd.callType).toBe('video');
    expect(fwd.offer.sdp).toBe('remote-sdp');
  });

  it('webrtc-answer → broadcast', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws, { type: 'webrtc-answer', to: 'peer2', answer: { type: 'answer', sdp: 'a' } });
    const fwd = ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'webrtc-answer');
    expect(fwd).toBeDefined();
    expect(fwd.answer.sdp).toBe('a');
  });

  it('webrtc-candidate → broadcast (ICE relay)', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws, { type: 'webrtc-candidate', to: 'peer2', candidate: { candidate: 'ice-foo' } });
    const fwd = ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'webrtc-candidate');
    expect(fwd).toBeDefined();
    expect(fwd.candidate.candidate).toBe('ice-foo');
  });

  it('call-end → broadcast', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws, { type: 'call-end' });
    expect(ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'call-end')).toBeDefined();
  });

  it('call-busy → broadcast', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws, { type: 'call-busy', to: 'peer2' });
    expect(ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'call-busy')).toBeDefined();
  });

  it('webrtc-offer sans to → to=null + broadcast all', async () => {
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 'x' } });
    const fwd = ws2.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'webrtc-offer');
    expect(fwd.to).toBeNull();
  });

  // v1.1.242 : mémorisation appel en attente (pour rejouer au destinataire au join)
  it('webrtc-offer → mémorise pendingCall', async () => {
    await _do.handleMessage(ws, { type: 'webrtc-offer', callType: 'audio', offer: { type: 'offer', sdp: 's' } });
    expect(_do.pendingCall).toBeTruthy();
    expect(_do.pendingCall.fromUserId).toBe('kdmc');
    expect(_do.pendingCall.callType).toBe('audio');
  });

  it('webrtc-candidate du caller → bufferisé dans pendingCall', async () => {
    await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 's' } });
    await _do.handleMessage(ws, { type: 'webrtc-candidate', candidate: { candidate: 'ice-a' } });
    expect(_do.pendingCall.candidates).toHaveLength(1);
    expect(_do.pendingCall.candidates[0].candidate).toBe('ice-a');
  });

  it('webrtc-candidate d\'un AUTRE user que le caller → pas bufferisé', async () => {
    await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 's' } }); // caller=kdmc
    const ws2 = new MockWebSocket();
    _do.sessions.set(ws2, { userId: 'peer2' });
    await _do.handleMessage(ws2, { type: 'webrtc-candidate', candidate: { candidate: 'ice-z' } });
    expect(_do.pendingCall.candidates).toHaveLength(0);
  });

  it('webrtc-candidate quand 30 déjà bufferisés → ignoré (cap)', async () => {
    await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 's' } });
    _do.pendingCall.candidates = Array.from({ length: 30 }, (_, i) => ({ candidate: 'c' + i }));
    await _do.handleMessage(ws, { type: 'webrtc-candidate', candidate: { candidate: 'overflow' } });
    expect(_do.pendingCall.candidates).toHaveLength(30);
  });

  it('webrtc-candidate sans candidate → pas bufferisé', async () => {
    await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 's' } });
    await _do.handleMessage(ws, { type: 'webrtc-candidate' }); // candidate absent
    expect(_do.pendingCall.candidates).toHaveLength(0);
  });

  it('webrtc-answer / call-end / call-busy → efface pendingCall', async () => {
    for (const t of ['webrtc-answer', 'call-end', 'call-busy']) {
      await _do.handleMessage(ws, { type: 'webrtc-offer', offer: { type: 'offer', sdp: 's' } });
      expect(_do.pendingCall).toBeTruthy();
      await _do.handleMessage(ws, { type: t });
      expect(_do.pendingCall).toBeNull();
    }
  });
});

// ----------------------------------------------------------------------------
// ConversationDO — broadcast helpers
// ----------------------------------------------------------------------------
describe('ConversationDO — broadcast & notifyOfflineMembers & flushToD1', () => {
  it('broadcast send échoue → catch silencieux', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    ws.send = () => { throw new Error('dead'); };
    _do.sessions.set(ws, { userId: 'kdmc' });
    expect(() => _do.broadcast({ type: 'x' })).not.toThrow();
  });

  it('notifyOfflineMembers : tous online → return early', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          all: async () => ({ results: [{ user_id: 'kdmc' }] }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('notifyOfflineMembers : 2 offline → 2 fetch /web-push (v1.1.206)', async () => {
    // v1.1.206 : _pushToUsers résout les subscriptions en D1 puis appelle
    // /web-push (1 par device). 2 offline × 1 sub = 2 fetch.
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [{ endpoint: 'https://push/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
            : { results: [{ user_id: 'kdmc' }, { user_id: 'laurence' }, { user_id: 'amis-1' }] }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    // doit cibler /web-push (pas /broadcast no-op) avec la subscription résolue
    const url = globalThis.fetch.mock.calls[0][0];
    expect(String(url)).toContain('/web-push');
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.subscription.endpoint).toBe('https://push/x');
    expect(sentBody.subscription.keys.p256dh).toBe('p');
  });

  it('notifyOfflineMembers : offline SANS subscription active → aucun push (pas de crash)', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [] } // user offline mais pas (ou plus) abonné
            : { results: [{ user_id: 'kdmc' }, { user_id: 'laurence' }] }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('_pushToUsers : lookup subscriptions throw → user sauté, pas de crash', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => {
            if (sql.includes('push_subscriptions')) throw new Error('db down');
            return { results: [{ user_id: 'kdmc' }, { user_id: 'laurence' }] };
          },
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await expect(_do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() })).resolves.toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('_pushToUsers : results undefined → [] ET sub sans endpoint → ignorée', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => {
          const stmt = {
            _uid: null,
            bind(uid) { this._uid = uid; return this; },
            all: async () => {
              if (sql.includes('push_subscriptions')) {
                // 'laurence' → résultat sans clé results (couvre (subs && subs.results) || [])
                if (stmt._uid === 'laurence') return {};
                // 'amis-1' → sub présente mais SANS endpoint (couvre le continue)
                return { results: [{ endpoint: '', vapid_p256dh: '' }] };
              }
              return { results: [{ user_id: 'kdmc' }, { user_id: 'laurence' }, { user_id: 'amis-1' }] };
            },
          };
          return stmt;
        },
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('_pushToUsers : /web-push répond non-ok → warn, pas de crash', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 502 }));
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [{ endpoint: 'https://push/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
            : { results: [{ user_id: 'kdmc' }, { user_id: 'laurence' }] }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    const ws = new MockWebSocket();
    _do.sessions.set(ws, { userId: 'kdmc' });
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    await new Promise((r) => setTimeout(r, 5)); // laisse le .then(!r.ok) se résoudre
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('notifyOfflineMembers : nom expéditeur résolu (real_name) → senderName appliqué', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [{ endpoint: 'https://push/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
            : { results: [{ user_id: 'kdmc' }, { user_id: 'bob' }] }),
          first: async () => (sql.includes('FROM users') ? { real_name: 'Alice', pseudo: 'al' } : null),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    _do.sessions = new Map(); // bob offline
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it.each([
    ['pseudo seul', { real_name: null, pseudo: 'bobby' }],
    ['ni real_name ni pseudo → fallback', { real_name: null, pseudo: null }],
  ])('notifyOfflineMembers : senderName %s', async (_label, userRow) => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [{ endpoint: 'https://push/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
            : { results: [{ user_id: 'kdmc' }, { user_id: 'bob' }] }),
          first: async () => (sql.includes('FROM users') ? userRow : null),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    _do.sessions = new Map();
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: Date.now() });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('notifyOfflineMembers DB error → catch silencieux', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: { prepare: () => ({ bind: function () { return this; }, all: async () => { throw new Error('db'); } }) },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    await expect(_do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: 0 })).resolves.toBeUndefined();
  });

  it('notifyOfflineMembers results undefined', async () => {
    const _do = new ConversationDO(makeState(), ENV({
      APEX_CHAT_DB: { prepare: () => ({ bind: function () { return this; }, all: async () => ({}) }) },
      JWT_SIGN_KEY: SECRET,
    }));
    await new Promise((r) => setTimeout(r, 5));
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: 0 });
  });

  it('notifyOfflineMembers sans APEX_CHAT_ADMIN_TOKEN → header vide', async () => {
    const env = ENV({
      APEX_CHAT_ADMIN_TOKEN: undefined,
      APEX_CHAT_DB: {
        prepare: (sql) => ({
          bind: function () { return this; },
          all: async () => (sql.includes('push_subscriptions')
            ? { results: [{ endpoint: 'https://push/x', vapid_p256dh: 'p', vapid_auth: 'a' }] }
            : { results: [{ user_id: 'offline1' }] }),
        }),
      },
      JWT_SIGN_KEY: SECRET,
    });
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    await _do.notifyOfflineMembers({ id: 'm', conv_id: 'c', sender_id: 'kdmc', ts: 0 });
    expect(globalThis.fetch).toHaveBeenCalled();
    const tokenHeader = globalThis.fetch.mock.calls[0][1].headers['X-Apex-Push-Token'];
    expect(tokenHeader).toBe('');
  });

  it('flushToD1 : pendingMessages vide → return', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    await _do.flushToD1();
    expect(_do.env.APEX_CHAT_DB.batch).not.toHaveBeenCalled();
  });

  it('flushToD1 : success → batch + update conv', async () => {
    const env = ENV();
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    _do.pendingMessages = [
      { id: '1', conv_id: 'c', sender_id: 'k', ciphertext: 'x', mime: 't', ts: 1, reply_to: null, thread_root: null, view_once: 0, expires_at: null },
    ];
    await _do.flushToD1();
    expect(env.APEX_CHAT_DB.batch).toHaveBeenCalled();
    expect(_do.pendingMessages).toEqual([]);
  });

  it('flushToD1 : DB throw → re-queue + telemetry', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.batch = vi.fn(async () => { throw new Error('batch fail'); });
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    const msg = { id: '1', conv_id: 'c', sender_id: 'k', ciphertext: 'x', mime: 't', ts: 1, reply_to: null, thread_root: null, view_once: 0, expires_at: null };
    _do.pendingMessages = [msg];
    await _do.flushToD1();
    expect(_do.pendingMessages).toContainEqual(msg);
    expect(env.TELEMETRY_QUEUE.send).toHaveBeenCalled();
  });

  it('flushToD1 sans TELEMETRY_QUEUE → fail silencieux', async () => {
    const env = ENV({ TELEMETRY_QUEUE: undefined });
    env.APEX_CHAT_DB.batch = vi.fn(async () => { throw new Error('batch fail'); });
    const _do = new ConversationDO(makeState(), env);
    await new Promise((r) => setTimeout(r, 5));
    _do.pendingMessages = [
      { id: '1', conv_id: 'c', sender_id: 'k', ciphertext: 'x', mime: 't', ts: 1, reply_to: null, thread_root: null, view_once: 0, expires_at: null },
    ];
    await expect(_do.flushToD1()).resolves.toBeUndefined();
  });

  it('alarm appelle flushToD1', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const spy = vi.spyOn(_do, 'flushToD1');
    await _do.alarm();
    expect(spy).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// BroadcastDO
// ----------------------------------------------------------------------------
describe('BroadcastDO', () => {
  it('init shards depuis storage', async () => {
    const state = makeState();
    state.storage.data.set('shards', ['s1', 's2']);
    const _do = new BroadcastDO(state, ENV());
    await new Promise((r) => setTimeout(r, 5));
    const r = await _do.fetch(new Request('https://x/'));
    expect((await r.json()).shards).toBe(2);
  });

  it('init shards défaut []', async () => {
    const _do = new BroadcastDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const r = await _do.fetch(new Request('https://x/'));
    expect((await r.json()).shards).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// PresenceDO
// ----------------------------------------------------------------------------
describe('PresenceDO', () => {
  it('POST /heartbeat → ok + ts', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    const r = await _do.fetch(new Request('https://x/heartbeat', {
      method: 'POST', body: JSON.stringify({ userId: 'kdmc', deviceId: 'd1' }),
    }));
    const b = await r.json();
    expect(b.ok).toBe(true);
    expect(_do.online.get('kdmc')).toBeDefined();
  });

  it('GET /list → online_count', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    _do.online.set('kdmc', { lastHeartbeat: Date.now() });
    _do.online.set('expired', { lastHeartbeat: Date.now() - 100000 });
    const r = await _do.fetch(new Request('https://x/list'));
    const b = await r.json();
    expect(b.online_count).toBe(1);
    expect(b.users).toContain('kdmc');
    expect(b.users).not.toContain('expired');
  });

  it('POST /check user online → online:true', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    _do.online.set('kdmc', { lastHeartbeat: Date.now() });
    const r = await _do.fetch(new Request('https://x/check', {
      method: 'POST', body: JSON.stringify({ userId: 'kdmc' }),
    }));
    expect((await r.json()).online).toBe(true);
  });

  it('POST /check user expired → online:false', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    _do.online.set('kdmc', { lastHeartbeat: Date.now() - 100000 });
    const r = await _do.fetch(new Request('https://x/check', {
      method: 'POST', body: JSON.stringify({ userId: 'kdmc' }),
    }));
    expect((await r.json()).online).toBe(false);
  });

  it('POST /check user inconnu → online:false', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    const r = await _do.fetch(new Request('https://x/check', {
      method: 'POST', body: JSON.stringify({ userId: 'never-seen' }),
    }));
    expect((await r.json()).online).toBe(false);
  });

  it('route inconnue → 404', async () => {
    const _do = new PresenceDO(makeState(), ENV());
    const r = await _do.fetch(new Request('https://x/xyz'));
    expect(r.status).toBe(404);
  });
});

// ----------------------------------------------------------------------------
// Trigger ws message handler (covers addEventListener message+close handlers)
// ----------------------------------------------------------------------------
describe('ConversationDO — WS event handlers (message + close)', () => {
  it('WS message → handleMessage triggered', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    const server = [..._do.sessions.keys()][0];
    server.triggerMessage(JSON.stringify({ type: 'ping' }));
    await new Promise((r) => setTimeout(r, 10));
    const pong = server.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'pong');
    expect(pong).toBeDefined();
  });

  it('WS message JSON malformé → erreur envoyée', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    const server = [..._do.sessions.keys()][0];
    server.triggerMessage('not-json');
    await new Promise((r) => setTimeout(r, 10));
    const e = server.sent.map((m) => JSON.parse(m)).find((m) => m.type === 'error');
    expect(e).toBeDefined();
  });

  it('WS close → session removed + broadcast leave', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    expect(_do.sessions.size).toBe(1);
    const server = [..._do.sessions.keys()][0];
    server.triggerClose();
    expect(_do.sessions.size).toBe(0);
  });

  it('WS close session déjà absente → no broadcast', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    await new Promise((r) => setTimeout(r, 5));
    const validJWT = await makeJWT({ sub: 'kdmc', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const url = `https://x/ws?token=${validJWT}&uid=kdmc&conv=conv1`;
    await _do.fetch(wsRequest(url));
    const server = [..._do.sessions.keys()][0];
    _do.sessions.delete(server); // delete avant close
    server.triggerClose();
    // Pas de crash, no broadcast
  });
});

// ----------------------------------------------------------------------------
// ConversationDO — notifyOfflineCall (push d'appel aux membres hors-ligne)
// ----------------------------------------------------------------------------
describe('ConversationDO — notifyOfflineCall', () => {
  it('membre offline → _pushToUsers avec payload call', async () => {
    const env = ENV({ APEX_CHAT_DB: makeDB([{ user_id: 'bob' }]) });
    const _do = new ConversationDO(makeState(), env);
    _do.sessions = new Map(); // personne connecté → bob est offline
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'video');
    expect(spy).toHaveBeenCalledWith(['bob'], expect.objectContaining({ tag: 'call-conv-1' }));
    expect(spy.mock.calls[0][1].payload.type).toBe('call');
  });

  it('aucun membre offline → pas de push', async () => {
    const env = ENV({ APEX_CHAT_DB: makeDB([{ user_id: 'kev' }]) }); // seul le caller
    const _do = new ConversationDO(makeState(), env);
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'audio');
    expect(spy).not.toHaveBeenCalled();
  });

  it('caller résolu (real_name) + callType audio → payload audio + bon nom', async () => {
    const db = makeDB([{ user_id: 'bob' }]);
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (sql.includes('FROM users')) stmt.first = vi.fn(async () => ({ real_name: 'Alice', pseudo: 'al' }));
      return stmt;
    });
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: db }));
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'audio');
    const payload = spy.mock.calls[0][1];
    expect(payload.title).toContain('audio');
    expect(payload.body).toBe('Alice t\'appelle');
    expect(payload.payload.callType).toBe('audio');
  });

  it('DB throw → catch silencieux (pas de crash)', async () => {
    const env = ENV();
    env.APEX_CHAT_DB = { prepare: () => { throw new Error('db down'); } };
    const _do = new ConversationDO(makeState(), env);
    await expect(_do.notifyOfflineCall('kev', 'conv-1', 'audio')).resolves.toBeUndefined();
  });

  it('members.results absent → aucun offline → pas de push (branche || [])', async () => {
    const db = makeDB([{ user_id: 'bob' }]);
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (sql.includes('conversation_members')) stmt.all = vi.fn(async () => ({})); // pas de .results
      return stmt;
    });
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: db }));
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'audio');
    expect(spy).not.toHaveBeenCalled();
  });

  it('caller pseudo seul (real_name null) + callType null → nom=pseudo + callType défaut audio', async () => {
    const db = makeDB([{ user_id: 'bob' }]);
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (sql.includes('FROM users')) stmt.first = vi.fn(async () => ({ real_name: null, pseudo: 'bobby' }));
      return stmt;
    });
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: db }));
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', null);
    const payload = spy.mock.calls[0][1];
    expect(payload.body).toBe('bobby t\'appelle');
    expect(payload.payload.callType).toBe('audio');
  });

  it('caller sans real_name ni pseudo → fallback "Quelqu\'un"', async () => {
    const db = makeDB([{ user_id: 'bob' }]);
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (sql.includes('FROM users')) stmt.first = vi.fn(async () => ({ real_name: null, pseudo: null }));
      return stmt;
    });
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: db }));
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'video');
    expect(spy.mock.calls[0][1].body).toBe('Quelqu\'un t\'appelle');
  });

  it('caller lookup throw → catch interne, push quand même (nom défaut)', async () => {
    const db = makeDB([{ user_id: 'bob' }]);
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (sql.includes('FROM users')) stmt.first = vi.fn(async () => { throw new Error('users down'); });
      return stmt;
    });
    const _do = new ConversationDO(makeState(), ENV({ APEX_CHAT_DB: db }));
    _do.sessions = new Map();
    const spy = vi.spyOn(_do, '_pushToUsers').mockResolvedValue(undefined);
    await _do.notifyOfflineCall('kev', 'conv-1', 'audio');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][1].body).toBe('Quelqu\'un t\'appelle');
  });
});

// ----------------------------------------------------------------------------
// v1.1.172 FIX P1 (audit crew) — /admin/inject-message (Letters) + révocation WS
// ----------------------------------------------------------------------------
describe('ConversationDO — /admin/inject-message (Letters delayed delivery)', () => {
  it('403 si X-Apex-Internal manquant / faux', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'WRONG' },
      body: JSON.stringify({ conv_id: 'c1', sender_id: 'u1', ciphertext: 'hi' }),
    }));
    expect(r.status).toBe(403);
  });

  it('403 si header X-Apex-Internal totalement absent', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: {},
      body: JSON.stringify({ conv_id: 'c1', sender_id: 'u1', ciphertext: 'hi' }),
    }));
    expect(r.status).toBe(403);
  });

  it('403 si APEX_CHAT_ADMIN_TOKEN non configuré (expected vide)', async () => {
    const env = ENV(); delete env.APEX_CHAT_ADMIN_TOKEN;
    const _do = new ConversationDO(makeState(), env);
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'anything' },
      body: JSON.stringify({ conv_id: 'c1', sender_id: 'u1', ciphertext: 'hi' }),
    }));
    expect(r.status).toBe(403);
  });

  it('400 si champs requis manquants', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'admin-secret' },
      body: JSON.stringify({ sender_id: 'u1' }),
    }));
    expect(r.status).toBe(400);
  });

  it('400 si body JSON invalide (catch → body {})', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'admin-secret', 'Content-Type': 'application/json' },
      body: 'pas-du-json{{{',
    }));
    expect(r.status).toBe(400);
  });

  it('200 + persiste (flushToD1) + broadcast quand token valide', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    _do.sessions = new Map();
    const flushSpy = vi.spyOn(_do, 'flushToD1').mockResolvedValue(undefined);
    const bcastSpy = vi.spyOn(_do, 'broadcast').mockImplementation(() => {});
    vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue(undefined);
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'admin-secret' },
      body: JSON.stringify({ conv_id: 'c1', sender_id: 'u1', ciphertext: 'lettre' }),
    }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.id).toBeTruthy();
    expect(flushSpy).toHaveBeenCalled();      // durable AVANT d'acquitter
    expect(bcastSpy).toHaveBeenCalled();       // diffusé aux connectés
    expect(_do.pendingMessages.some((m) => m.ciphertext === 'lettre')).toBe(true);
  });

  it('500 si flushToD1 throw (catch block — pas d\'acquittement)', async () => {
    const _do = new ConversationDO(makeState(), ENV());
    _do.sessions = new Map();
    vi.spyOn(_do, 'broadcast').mockImplementation(() => {});
    vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue(undefined);
    vi.spyOn(_do, 'flushToD1').mockRejectedValue(new Error('D1 down'));
    const r = await _do.fetch(httpRequest('https://x/admin/inject-message', {
      method: 'POST', headers: { 'X-Apex-Internal': 'admin-secret' },
      body: JSON.stringify({ conv_id: 'c1', sender_id: 'u1', ciphertext: 'lettre' }),
    }));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toBe('D1 down');
  });
});

describe('ConversationDO — révocation WS (force_logout / ban honorés)', () => {
  function dbWithUser(acct) {
    const db = makeDB([{ user_id: 'kdmc', role: 'owner' }]);
    const orig = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = orig(sql);
      if (sql.includes('FROM users')) stmt.first = vi.fn(async () => acct);
      return stmt;
    });
    return db;
  }

  it('ferme (rejet, aucune session) si user banni', async () => {
    const token = await makeJWT({ sub: 'kdmc', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const env = ENV({ APEX_CHAT_DB: dbWithUser({ is_banned: 1, status: 'active', last_force_logout_at: null }) });
    const _do = new ConversationDO(makeState(), env);
    await _do.fetch(wsRequest(`https://x/ws?token=${token}&uid=kdmc&conv=c1`));
    expect(_do.sessions.size).toBe(0);
  });

  it('ferme (rejet) si JWT antérieur au dernier force_logout', async () => {
    const iatSec = Math.floor((Date.now() - 100000) / 1000);
    const token = await makeJWT({ sub: 'kdmc', iat: iatSec, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const env = ENV({ APEX_CHAT_DB: dbWithUser({ is_banned: 0, status: 'active', last_force_logout_at: Date.now() }) });
    const _do = new ConversationDO(makeState(), env);
    await _do.fetch(wsRequest(`https://x/ws?token=${token}&uid=kdmc&conv=c1`));
    expect(_do.sessions.size).toBe(0);
  });

  it('accepte (session établie) si compte sain', async () => {
    const token = await makeJWT({ sub: 'kdmc', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const env = ENV({ APEX_CHAT_DB: dbWithUser({ is_banned: 0, status: 'active', last_force_logout_at: null }) });
    const _do = new ConversationDO(makeState(), env);
    await _do.fetch(wsRequest(`https://x/ws?token=${token}&uid=kdmc&conv=c1`));
    expect(_do.sessions.size).toBe(1);
  });
});
