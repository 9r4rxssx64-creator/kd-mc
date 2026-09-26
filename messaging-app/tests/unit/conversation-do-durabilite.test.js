// Durabilité du buffer de messages du ConversationDO (audit 17/09/2026, P1).
//
// Avant : `pendingMessages` n'était vidé en D1 qu'au 10e message, ou au message SUIVANT
// s'il arrivait plus de 5 s après. `alarm()` existait mais `setAlarm` n'était appelé nulle
// part, et la fermeture d'une connexion ne vidait rien. Un Durable Object évincé (inactivité,
// redéploiement) emportait donc jusqu'à 9 messages déjà ACQUITTÉS aux clients.
// Désormais : chaque message arme une alarme 5 s (flush garanti), la fermeture d'une
// connexion vide le buffer, et une alarme dont le flush échoue se réarme.
// Prouvé discriminant : sans `_armFlushAlarm()` → 2 échecs ; sans le flush au close → 1 échec.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

class MockWebSocket extends EventTarget {
  constructor() { super(); this.sent = []; this._l = {}; }
  accept() {}
  send(d) { this.sent.push(d); }
  close() {}
  addEventListener(t, fn) { super.addEventListener(t, fn); (this._l[t] = this._l[t] || []).push(fn); }
  async triggerClose() { for (const fn of this._l.close || []) await fn({ type: 'close' }); }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new MockWebSocket(); this[1] = new MockWebSocket(); } };

function makeState() {
  const data = new Map();
  return {
    id: { toString: () => 'conv-do' },
    storage: {
      get: vi.fn(async (k) => data.get(k)),
      put: vi.fn(async (k, v) => { data.set(k, v); }),
      setAlarm: vi.fn(async () => {}),
    },
    blockConcurrencyWhile: vi.fn(async (fn) => { await fn(); }),
  };
}
function makeDB(opts = {}) {
  return {
    prepare: vi.fn((sql) => ({
      bind() { return this; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    })),
    batch: vi.fn(async (stmts) => { if (opts.batchFails) throw new Error('D1 down'); return { success: true, count: stmts.length }; }),
  };
}
const ENV = (db) => ({ JWT_SIGN_KEY: 's', APEX_CHAT_DB: db, TELEMETRY_QUEUE: { send: vi.fn(async () => {}) } });
const session = () => ({ userId: 'u1', deviceId: 'd1', convId: 'conv1', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });

describe('ConversationDO — aucun message acquitté ne peut être perdu', () => {
  let state, db, _do, ws;
  beforeEach(async () => {
    state = makeState(); db = makeDB();
    _do = new ConversationDO(state, ENV(db));
    await new Promise((r) => setTimeout(r, 5));
    ws = new MockWebSocket();
    _do.sessions.set(ws, session());
    vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue();
  });

  it('un message reçu arme une alarme de flush à ≤ 5 s', async () => {
    const t0 = Date.now();
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    expect(_do.pendingMessages.length).toBe(1);   // pas encore en D1 (buffer < 10)
    expect(state.storage.setAlarm).toHaveBeenCalledTimes(1);
    const when = state.storage.setAlarm.mock.calls[0][0];
    expect(when - t0).toBeGreaterThanOrEqual(4900);
    expect(when - t0).toBeLessThanOrEqual(5200);
  });

  it("l'alarme vide le buffer en D1 (batch) et le réarme seulement si le flush a échoué", async () => {
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    state.storage.setAlarm.mockClear();
    await _do.alarm();
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(_do.pendingMessages.length).toBe(0);
    expect(state.storage.setAlarm).not.toHaveBeenCalled();
  });

  it('flush en panne → messages re-queue + alarme réarmée (rien perdu)', async () => {
    db = makeDB({ batchFails: true });
    _do = new ConversationDO(state, ENV(db));
    await new Promise((r) => setTimeout(r, 5));
    _do.sessions.set(ws, session());
    vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    state.storage.setAlarm.mockClear();
    await _do.alarm();
    spy.mockRestore();
    expect(_do.pendingMessages.length).toBe(1);
    expect(state.storage.setAlarm).toHaveBeenCalledTimes(1);
  });

  it("la fermeture de la connexion vide le buffer en D1 (rien d'acquitté ne reste en mémoire)", async () => {
    const req = { url: 'https://do/ws?token=x&uid=u1&did=d1', method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } };
    vi.spyOn(_do, 'verifyJWT').mockResolvedValue({ sub: 'u1', device_id: 'd1' });
    // membre autorisé + pas d'historique
    db.prepare = vi.fn((sql) => ({
      bind() { return this; },
      first: async () => (sql.includes('conversation_members') ? { user_id: 'u1', role: 'member' } : null),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const r = await _do.fetch(req);
    expect(r.status).toBe(101);
    const server = [..._do.sessions.keys()].find((s) => s !== ws);
    await _do.handleMessage(server, { type: 'message', ciphertext: 'E2E1:def' });
    expect(_do.pendingMessages.length).toBe(1);
    await server.triggerClose();
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(_do.pendingMessages.length).toBe(0);
  });

  it('un stockage sans setAlarm (mock ancien) ne casse pas la réception', async () => {
    delete state.storage.setAlarm;
    await _do.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    expect(_do.pendingMessages.length).toBe(1);
  });
});
