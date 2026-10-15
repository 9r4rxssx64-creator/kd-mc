/**
 * Lot E1 (audit A5 F1, P0) — ConversationDO passe à l'API d'HIBERNATION des WebSockets.
 *
 * Avant : `server.accept()` → le DO restait en mémoire (facturé en durée, 128 Mo) tant qu'une socket était
 * ouverte. 13 000 GB-s/jour gratuits = 28,9 h de DO actif pour TOUT le compte ; un onglet ouvert 24 h en
 * consommait 83 %. Après : `state.acceptWebSocket()` ; le DO s'endort entre deux trames, le ping du client
 * reçoit son pong du runtime sans réveil, et l'état de chaque session survit au sommeil (attachment).
 *
 * Ces tests simulent un VRAI réveil (nouvelle instance sur le même état et les mêmes sockets) et vérifient
 * que rien du comportement existant ne se perd : débits, re-vérification d'appartenance, durabilité avant
 * accusé, présence, appels.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConversationDO, PING_FRAME, PONG_FRAME } from '../../workers/durable-objects/ConversationDO.js';
import { wake } from './_support/do-hibernation.js';
import { readIndex } from './client-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DO_SRC = readFileSync(join(__dirname, '..', '..', 'workers', 'durable-objects', 'ConversationDO.js'), 'utf8');
/** Code sans commentaires (les commentaires racontent l'histoire de `accept()`, le code ne doit plus l'appeler). */
const DO_CODE = DO_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

class MockWS {
  constructor() { this.sent = []; this.closed = null; this._l = {}; }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = { code, reason }; }
  frames() { return this.sent.map((d) => JSON.parse(d)); }
  async triggerMessage(data) { for (const fn of this._l.message || []) await fn({ data }); }
  async triggerClose() { for (const fn of this._l.close || []) await fn({ code: 1000, reason: '' }); }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new MockWS(); this[1] = new MockWS(); } };

const SECRET = 'jwt-e1-secret';
async function jwt(sub) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub, iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(h + '.' + p)));
  return h + '.' + p + '.' + btoa(String.fromCharCode(...sig)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
/** Laisse finir la reprise du constructeur (blockConcurrencyWhile, plusieurs lectures). */
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const wsReq = (url) => ({ url, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } });

/** D1 minimal : membres modifiables, comptes sains, aucun historique. */
function makeDB(members) {
  return {
    prepare(sql) {
      const st = {
        args: [],
        bind(...a) { st.args = a; return st; },
        async first() {
          if (sql.includes('FROM conversation_members')) return members.has(st.args[1]) ? { user_id: st.args[1], role: 'member', joined_at: 0 } : null;
          if (sql.includes('FROM users')) return { is_banned: 0, status: 'active', last_force_logout_at: null, pseudo: 'p', real_name: '' };
          if (sql.includes('FROM conversations')) return { type: 'dm', name: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM conversation_members')) return { results: [...members].map((user_id) => ({ user_id })) };
          return { results: [] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return st;
    },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })); },
  };
}

function makeState() {
  const data = new Map();
  return {
    id: { toString: () => 'do_e1' },
    data,
    storage: {
      get: vi.fn(async (k) => data.get(k)),
      put: vi.fn(async (k, v) => { data.set(k, v); }),
      delete: vi.fn(async (k) => data.delete(k)),
      list: vi.fn(async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)))),
      setAlarm: vi.fn(async () => {}),
    },
    blockConcurrencyWhile: async (fn) => fn(),
  };
}

async function setup(users = ['alice', 'bob']) {
  const members = new Set(users);
  const env = { JWT_SIGN_KEY: SECRET, APEX_CHAT_DB: makeDB(members) };
  const state = makeState();
  const d = new ConversationDO(state, env);
  await settle();
  const socks = {};
  for (const u of users) {
    const before = new Set(d.sessions.keys());
    const r = await d.fetch(wsReq(`https://do/ws?token=${await jwt(u)}&uid=${u}&conv=c1&did=dev-${u}`));
    expect(r.status).toBe(101);
    socks[u] = [...d.sessions.keys()].find((w) => !before.has(w));
  }
  return { d, state, env, members, socks };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Lot E1 — garde : plus jamais de WebSocket non hibernée', () => {
  it('le code n\'appelle plus `accept()` classique ni addEventListener ; il expose les gestionnaires d\'hibernation', () => {
    expect(DO_CODE).not.toMatch(/\.accept\s*\(/);
    expect(DO_CODE).not.toMatch(/\.addEventListener\s*\(/);
    expect(DO_CODE).toMatch(/this\.state\.acceptWebSocket\(server, \[/);
    for (const h of ['webSocketMessage', 'webSocketClose', 'webSocketError']) {
      expect(typeof ConversationDO.prototype[h]).toBe('function');
    }
  });

  it('le ping du client est EXACTEMENT la trame d\'auto-réponse (sinon chaque ping réveillerait le DO)', () => {
    const html = readIndex();
    const m = html.match(/K\.ws\.send\((JSON\.stringify\(\{ type: 'ping' \}\))\)/);
    expect(m, 'ping du client introuvable dans index.html').toBeTruthy();
    // eslint-disable-next-line no-new-func
    const clientFrame = new Function('return ' + m[1])();
    expect(clientFrame).toBe(PING_FRAME);
    expect(JSON.parse(PONG_FRAME).type).toBe('pong');   // le client gère `case 'pong'`
    expect(html).toMatch(/case 'pong':/);
  });
});

describe('Lot E1 — connexion hibernable et réveil', () => {
  it('acceptWebSocket avec l\'utilisateur en étiquette ; auto-réponse ping/pong posée ; session dans l\'attachment', async () => {
    const { state, socks } = await setup();
    expect(socks.alice.hibernatable).toBe(true);
    expect(socks.alice.tags).toEqual(['alice']);
    expect(state.getWebSockets('bob')).toEqual([socks.bob]);
    expect(state.autoResponse.getRequest()).toBe(PING_FRAME);
    expect(state.autoResponse.getResponse()).toBe(PONG_FRAME);
    const att = socks.alice.deserializeAttachment();
    expect(att).toMatchObject({ userId: 'alice', deviceId: 'dev-alice', convId: 'c1', joinedAt: 0 });
  });

  it('les refus passent aussi par acceptWebSocket puis close(1008) — motif lu par l\'app', async () => {
    const { d } = await setup(['alice']);
    const r = await d.fetch(wsReq(`https://do/ws?token=${await jwt('mallory')}&uid=mallory&conv=c1`));
    expect(r.status).toBe(101);
    const rejected = d.state.getWebSockets().find((w) => w.closed);
    expect(rejected.closed).toEqual({ code: 1008, reason: 'Not a member' });
    expect(rejected.hibernatable).toBe(true);
    expect(d.sessions.size).toBe(1);
  });

  it('réveil : sessions reconstruites, filet de re-vérification actif, une trame fonctionne et reste durable avant l\'accusé', async () => {
    const { d, state, socks } = await setup();
    const d2 = wake(d);
    await settle();
    expect(d2).not.toBe(d);
    expect(d2.sessions.size).toBe(2);
    expect([...d2.sessions.values()].map((s) => s.userId).sort()).toEqual(['alice', 'bob']);
    expect(d2._recheckTimer).toBe(true);

    socks.bob.sent.length = 0;
    await socks.alice.triggerMessage(JSON.stringify({ type: 'message', id: 'cli-1', ciphertext: 'E2E1:coucou' }));
    const ack = socks.alice.frames().find((f) => f.type === 'ack' && f.client_id === 'cli-1');
    expect(ack).toBeTruthy();
    const pendKeys = [...state.data.keys()].filter((k) => k.startsWith('pend:'));
    expect(pendKeys.some((k) => k.endsWith(':' + ack.id))).toBe(true);   // durable AVANT l'accusé (lot A)
    expect(socks.bob.frames().some((f) => f.type === 'message' && f.id === ack.id)).toBe(true);
    expect(d.sessions.size).toBe(2);   // l'ancienne instance n'a pas été sollicitée
  });

  it('les compteurs de débit survivent au sommeil (pas de remise à zéro gratuite)', async () => {
    const { d, socks } = await setup(['alice', 'bob']);
    for (let i = 0; i < 120; i++) await socks.alice.triggerMessage(JSON.stringify({ type: 'typing' }));
    expect(socks.alice.frames().some((f) => f.code === 'rate_limit')).toBe(false);
    const d2 = wake(d);
    await settle();
    await socks.alice.triggerMessage(JSON.stringify({ type: 'typing' }));
    expect(socks.alice.frames().some((f) => f.code === 'rate_limit')).toBe(true);
    expect(d2.sessions.get(socks.alice).rl.typing).toBe(121);
  });

  it('re-vérification d\'appartenance après le sommeil : retiré du groupe → 1008 + présence « offline »', async () => {
    const { d, members, socks } = await setup();
    const d2 = wake(d);
    await settle();
    members.delete('alice');
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 46000);
    await socks.alice.triggerMessage(JSON.stringify({ type: 'typing' }));
    expect(socks.alice.closed).toEqual({ code: 1008, reason: 'Not a member' });
    expect(d2.sessions.has(socks.alice)).toBe(false);
    expect(socks.bob.frames().some((f) => f.type === 'presence' && f.userId === 'alice' && f.status === 'offline')).toBe(true);
  });

  it('la dernière re-vérification réussie est gardée dans l\'attachment', async () => {
    const { d, socks } = await setup();
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 50000);
    await socks.alice.triggerMessage(JSON.stringify({ type: 'typing' }));
    expect(socks.alice.deserializeAttachment().lastMemberCheck).toBe(t0 + 50000);
    expect(d.sessions.has(socks.alice)).toBe(true);
  });

  it('fermeture et erreur de socket : session retirée, présence « offline », flush des messages acquittés', async () => {
    const { d, socks } = await setup();
    const d2 = wake(d);
    await settle();
    const flush = vi.spyOn(d2, 'flushToD1');
    await socks.alice.triggerClose();
    expect(d2.sessions.has(socks.alice)).toBe(false);
    expect(socks.bob.frames().some((f) => f.type === 'presence' && f.userId === 'alice' && f.action === 'leave')).toBe(true);
    expect(flush).toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await d2.webSocketError(socks.bob, new Error('reset'));
    expect(d2.sessions.size).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('socket sans session au réveil (attachment absent ou illisible) : ignorée, puis fermée en 1011 à sa première trame', async () => {
    const { d, state, socks } = await setup();
    const orphan = new MockWS();
    state.acceptWebSocket(orphan);                   // jamais d'attachment
    const broken = new MockWS();
    state.acceptWebSocket(broken);
    broken.deserializeAttachment = () => { throw new Error('corrompu'); };
    const d2 = wake(d);
    await settle();
    expect(d2.sessions.size).toBe(2);
    await d2.webSocketMessage(orphan, JSON.stringify({ type: 'typing' }));
    expect(orphan.closed).toEqual({ code: 1011, reason: 'Session perdue, reconnexion' });
    expect(orphan.sent).toEqual([]);
    const gone = new MockWS();
    gone.close = () => { throw new Error('déjà fermée'); };
    await expect(d2.webSocketMessage(gone, '{}')).resolves.toBeUndefined();
    expect(socks.bob.closed).toBe(null);
  });

  it('trame illisible → erreur renvoyée, session conservée ; attachment trop gros → avertissement, pas de panne', async () => {
    const { d, socks } = await setup();
    await socks.alice.triggerMessage('pas du json');
    expect(socks.alice.frames().some((f) => f.type === 'error')).toBe(true);
    expect(d.sessions.has(socks.alice)).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    socks.alice.serializeAttachment = () => { throw new Error('attachment > 2048'); };
    await socks.alice.triggerMessage(JSON.stringify({ type: 'typing' }));
    expect(warn.mock.calls.some((c) => String(c[0]).includes('attachment'))).toBe(true);
    expect(socks.bob.frames().some((f) => f.type === 'typing')).toBe(true);
  });
});

describe('Lot E1 — appels : rien ne se perd pendant le sommeil', () => {
  it('appel en attente : une minuterie de 45 s garde l\'objet éveillé, puis l\'appel expire', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { d, socks } = await setup();
    await d.handleMessage(socks.alice, { type: 'webrtc-offer', to: 'carol', offer: { sdp: 'x' }, callType: 'audio' });
    expect(d.pendingCall).toBeTruthy();
    expect(d._pendingCallTimer).not.toBe(null);
    vi.advanceTimersByTime(44000);
    expect(d.pendingCall).toBeTruthy();
    vi.advanceTimersByTime(1500);
    expect(d.pendingCall).toBe(null);
    expect(d._pendingCallTimer).toBe(null);
  });

  it('un appel remplacé n\'est pas effacé par la minuterie de l\'ancien ; décroché → minuterie annulée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { d, socks } = await setup();
    await d.handleMessage(socks.alice, { type: 'webrtc-offer', to: 'bob', offer: { sdp: 'a' } });
    const other = { fromUserId: 'zed', candidates: [], ts: Date.now() };
    d.pendingCall = other;                         // remplacé hors du chemin habituel
    vi.advanceTimersByTime(46000);
    expect(d.pendingCall).toBe(other);
    await d.handleMessage(socks.alice, { type: 'webrtc-offer', to: 'bob', offer: { sdp: 'b' } });
    await d.handleMessage(socks.bob, { type: 'webrtc-answer', to: 'alice', answer: { sdp: 'c' } });
    expect(d.pendingCall).toBe(null);
    expect(d._pendingCallTimer).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('le plafond des notifications d\'appel survit au sommeil (stockage), sans écrire quand c\'est refusé', async () => {
    const { d, state } = await setup(['alice']);
    const t = Date.now();
    expect(d._callPushAllowed('alice', t)).toBe(true);
    await settle();
    expect(state.data.get('callpushlog')).toEqual([['alice', [t]]]);
    const d2 = wake(d);
    await settle();
    const puts = state.storage.put.mock.calls.length;
    expect(d2._callPushAllowed('alice', t + 1000)).toBe(false);   // 45 s minimum entre deux sonneries
    expect(state.storage.put.mock.calls.length).toBe(puts);
    expect(d2._callPushAllowed('alice', t + 46000)).toBe(true);
  });

  it('écriture du journal impossible (rejet ou exception) → avertissement, l\'appel n\'est pas bloqué', async () => {
    const { d, state } = await setup(['alice']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.storage.put = vi.fn(async () => { throw new Error('quota'); });
    expect(d._callPushAllowed('u1', 1e12)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    state.storage.put = vi.fn(() => { throw new Error('sync'); });
    expect(d._callPushAllowed('u2', 1e12)).toBe(true);
    const msgs = warn.mock.calls.map((c) => String(c[0]));
    expect(msgs.filter((m) => m.includes('[call push] journal')).length).toBe(2);
  });
});

describe('Lot E1 — fermeture : le serveur renvoie la fermeture (poignée de main complète)', () => {
  const doMin = () => {
    const state = { id: { toString: () => 'c' }, storage: { get: async () => undefined, put: async () => {}, delete: async () => {}, list: async () => new Map(), setAlarm: async () => {}, getAlarm: async () => null },
      blockConcurrencyWhile: async (fn) => fn(), acceptWebSocket: () => {}, getWebSockets: () => [], setWebSocketAutoResponse: () => {} };
    const d = new ConversationDO(state, { APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run: async () => ({}), all: async () => ({ results: [] }), first: async () => null }) }), batch: async () => [] } });
    d.flushToD1 = async () => {};
    return d;
  };
  it('code normal renvoyé tel quel ; code réservé (1005/1006) ou absent → 1000 ; socket déjà fermée → pas d\'erreur', async () => {
    const d = doMin();
    const fermetures = [];
    const ws = (fail) => ({ close: (c) => { if (fail) throw new Error('déjà fermée'); fermetures.push(c); } });
    await d.webSocketClose(ws(false), 4001);
    await d.webSocketClose(ws(false), 1005);
    await d.webSocketClose(ws(false), 1006);
    await d.webSocketClose(ws(false));
    await d.webSocketClose(ws(true), 1000);
    expect(fermetures).toEqual([4001, 1000, 1000, 1000]);
  });
});
