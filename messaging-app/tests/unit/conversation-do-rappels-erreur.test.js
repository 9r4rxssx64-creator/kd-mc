// ConversationDO — chaque rappel d'erreur « best-effort » est réellement exécuté (audit 17/09/2026).
//
// Pourquoi ce fichier : le cliquet de couverture de ConversationDO.js (99.3 % lignes / 89.7 %
// fonctions) a rougi en CI après l'ajout de l'alarme de flush et du mode E2E strict — pas parce
// que du code neuf était mort, mais parce que six rappels `.catch(...)` d'erreur (anciens et
// nouveaux) n'avaient jamais été DÉCLENCHÉS par un test. Un `.catch(() => {})` jamais exécuté
// est une promesse : « si ça casse, ça ne casse rien d'autre ». Ici on le prouve, cas par cas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

class MockWebSocket extends EventTarget {
  constructor() { super(); this.sent = []; }
  accept() {}
  send(d) { this.sent.push(JSON.parse(d)); }
  close() {}
}

function makeState(storageOverrides = {}) {
  const data = new Map();
  return {
    id: { toString: () => 'conv-do' },
    storage: {
      get: vi.fn(async (k) => data.get(k)),
      put: vi.fn(async (k, v) => { data.set(k, v); }),
      setAlarm: vi.fn(async () => {}),
      ...storageOverrides,
    },
    blockConcurrencyWhile: vi.fn(async (fn) => { await fn(); }),
  };
}

/** D1 mock : `fail` = motif SQL dont le run() rejette ; `rows` = résultats de all() par motif. */
function makeDB({ fail = null, rows = {}, batchFails = false } = {}) {
  return {
    prepare: vi.fn((sql) => ({
      bind() { return this; },
      first: async () => null,
      all: async () => {
        const k = Object.keys(rows).find((p) => sql.includes(p));
        return { results: k ? rows[k] : [] };
      },
      run: async () => { if (fail && sql.includes(fail)) throw new Error('D1 down: ' + fail); return { success: true }; },
    })),
    batch: vi.fn(async (stmts) => { if (batchFails) throw new Error('D1 batch down'); return { success: true, count: stmts.length }; }),
  };
}
const ENV = (db, extra = {}) => ({ JWT_SIGN_KEY: 's', APEX_CHAT_DB: db, TELEMETRY_QUEUE: { send: vi.fn(async () => {}) }, ...extra });
const session = () => ({ userId: 'u1', deviceId: 'd1', convId: 'conv1', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });
const tick = () => new Promise((r) => setTimeout(r, 10));

describe('ConversationDO — les rappels d\'erreur best-effort sont exercés', () => {
  let warn, error;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { warn.mockRestore(); error.mockRestore(); });

  it('e2eStrict() : si la relecture de la config plante, la politique retombe sur OFF (jamais bloquant)', async () => {
    const d = new ConversationDO(makeState(), ENV(makeDB()));
    await tick();
    d.loadConfig = async () => { throw new Error('D1 injoignable'); };
    d._configTs = 0;                       // force la relecture
    await expect(d.e2eStrict()).resolves.toBe(false);
  });

  it('« read » : l\'écriture last_read en panne n\'empêche pas la diffusion de l\'accusé de lecture', async () => {
    const d = new ConversationDO(makeState(), ENV(makeDB({ fail: 'last_read_msg_id' })));
    await tick();
    const ws = new MockWebSocket(); d.sessions.set(ws, session());
    const other = new MockWebSocket(); d.sessions.set(other, { ...session(), userId: 'u2', deviceId: 'd2' });
    await d.handleMessage(ws, { type: 'read', message_id: 'm42' });
    await tick();
    expect(other.sent.some((m) => m.type === 'read' && m.userId === 'u1')).toBe(true);
  });

  it('appel entrant : un push d\'appel qui échoue est journalisé, l\'offre reste mise en attente', async () => {
    const d = new ConversationDO(makeState(), ENV(makeDB()));
    await tick();
    vi.spyOn(d, 'notifyOfflineCall').mockRejectedValue(new Error('push KO'));
    const ws = new MockWebSocket(); d.sessions.set(ws, session());
    await d.handleMessage(ws, { type: 'webrtc-offer', offer: { sdp: 'v=0' }, callType: 'video' });
    await tick();
    expect(d.pendingCall && d.pendingCall.fromUserId).toBe('u1');
    expect(warn).toHaveBeenCalledWith('[call push] failed:', 'push KO');
  });

  it('notification hors-ligne : un web-push qui rejette est journalisé par appareil, sans faire tomber les autres', async () => {
    const db = makeDB({ rows: {
      conversation_members: [{ user_id: 'u1' }, { user_id: 'u2' }],
      push_subscriptions: [{ endpoint: 'https://push/a', vapid_p256dh: 'p', vapid_auth: 'a' }],
    } });
    const env = ENV(db, { PUSH_WORKER: { fetch: vi.fn(() => Promise.reject(new Error('binding down'))) } });
    const d = new ConversationDO(makeState(), env);
    await tick();
    const ws = new MockWebSocket(); d.sessions.set(ws, session());   // u1 en ligne, u2 hors-ligne
    await d.notifyOfflineMembers({ id: 'm', conv_id: 'conv1', sender_id: 'u1', ts: Date.now() });
    await tick();
    expect(env.PUSH_WORKER.fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[push]', 'u2', 'web-push failed:', 'binding down');
  });

  it('_armFlushAlarm : un setAlarm qui rejette ne remonte pas (le message reste acquitté et bufferisé)', async () => {
    const state = makeState({ setAlarm: vi.fn(() => Promise.reject(new Error('alarm quota'))) });
    const d = new ConversationDO(state, ENV(makeDB()));
    await tick();
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    const ws = new MockWebSocket(); d.sessions.set(ws, session());
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await d.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    await tick();
    process.off('unhandledRejection', unhandled);
    expect(state.storage.setAlarm).toHaveBeenCalledTimes(1);
    expect(d.pendingMessages.length).toBe(1);
    expect(ws.sent.some((m) => m.type === 'ack')).toBe(true);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('flushToD1 en panne : la télémétrie qui rejette à son tour ne masque pas la remise en file des messages', async () => {
    const db = makeDB({ batchFails: true });
    const env = ENV(db, { TELEMETRY_QUEUE: { send: vi.fn(() => Promise.reject(new Error('queue down'))) } });
    const d = new ConversationDO(makeState(), env);
    await tick();
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    const ws = new MockWebSocket(); d.sessions.set(ws, session());
    await d.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    await expect(d.flushToD1()).resolves.toBeUndefined();
    await tick();
    expect(env.TELEMETRY_QUEUE.send).toHaveBeenCalledTimes(1);
    expect(d.pendingMessages.length).toBe(1);     // rien perdu
    expect(error).toHaveBeenCalledWith('flushToD1 error', 'D1 batch down');
  });
});
