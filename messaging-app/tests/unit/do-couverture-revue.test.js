// Couverture de la revue du moteur temps réel (ConversationDO) — 08.10.2026.
// Complète do-revue-moteur.test.js : chaque test vise un chemin du DO qui n'était
// exercé par aucun test (gardes de validation, repli _isAuthorInDb, flush en vol,
// mode ligne-par-ligne de flushToD1, re-vérification fail-open, rejeu d'appel ciblé…)
// et vérifie le COMPORTEMENT (trames émises, état D1, buffer), pas seulement l'appel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

class MockWS {
  constructor() { this.sent = []; this.closed = null; this._l = {}; }
  accept() {}
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = { code, reason }; }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  frames(type) { return this.sent.map((m) => JSON.parse(m)).filter((m) => !type || m.type === type); }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new MockWS(); this[1] = new MockWS(); } };

function makeState(storageExtra = {}) {
  const data = new Map();
  return {
    id: { toString: () => 'do-id' },
    storage: { get: vi.fn(async (k) => data.get(k)), put: vi.fn(async (k, v) => { data.set(k, v); }), setAlarm: vi.fn(async () => {}), ...storageExtra },
    blockConcurrencyWhile: vi.fn(async (fn) => fn()),
  };
}

/**
 * D1 en mémoire (même modèle que do-revue-moteur.test.js) + leviers de panne :
 *  - insertFail(id, value) → valeur à lever (Error, string…) ou undefined
 *  - noMeta : les UPDATE ne renvoient pas meta.changes (driver muet → repli _isAuthorInDb)
 *  - authorLookupThrows : la requête de repli auteur lève
 *  - memberLookupThrows : la re-vérification de membership lève
 *  - batchGate : promesse attendue APRÈS l'écriture du lot (réponse D1 « en vol »)
 */
function makeDB(opts = {}) {
  const st = {
    messages: opts.messages || [],
    members: opts.members || [],
    users: opts.users || [],
    log: [],
    batchCalls: 0,
  };
  function exec(sql, a) {
    st.log.push({ sql, args: a });
    if (sql.includes('INSERT INTO messages')) {
      const [id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at, deleted_at] = a;
      const injected = opts.insertFail && opts.insertFail(id);
      if (injected !== undefined) throw injected;
      if (ciphertext == null) throw new Error('D1_ERROR: NOT NULL constraint failed: messages.ciphertext');
      if (st.messages.some((m) => m.id === id)) return { success: true, meta: { changes: 0 } };
      st.messages.push({ id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at, deleted_at, reactions: '{}' });
      return { success: true, meta: { changes: 1 } };
    }
    const meta = (n) => (opts.noMeta ? { success: true } : { success: true, meta: { changes: n } });
    if (sql.startsWith('UPDATE messages SET ciphertext=?, edited_at=?')) {
      const [ct, editedAt, id, conv, sender] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv && x.sender_id === sender && x.deleted_at == null);
      if (m) { m.ciphertext = ct; m.edited_at = editedAt; }
      return meta(m ? 1 : 0);
    }
    if (sql.startsWith('UPDATE messages SET deleted_at=?')) {
      const [at, id, conv, sender] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv && x.sender_id === sender);
      if (m) { m.deleted_at = at; m.ciphertext = ''; }
      return meta(m ? 1 : 0);
    }
    if (sql.startsWith('UPDATE messages SET reactions=?')) {
      const [r, id, conv] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv);
      if (m) m.reactions = r;
      return meta(m ? 1 : 0);
    }
    return { success: true, meta: { changes: 0 } };
  }
  return {
    _st: st,
    prepare(sql) {
      const stmt = {
        _sql: sql, _args: [],
        bind(...a) { return { ...stmt, _args: a }; },
        async run() { return exec(this._sql, this._args); },
        async first() {
          st.log.push({ sql: this._sql, args: this._args });
          const a = this._args;
          if (this._sql.includes('FROM conversation_members')) {
            if (opts.memberLookupThrows) throw new Error('D1 overloaded');
            return st.members.find((m) => m.conv_id === a[0] && m.user_id === a[1]) || null;
          }
          if (this._sql.includes('FROM users WHERE id=?')) return st.users.find((u) => u.id === a[0]) || null;
          if (this._sql.includes('SELECT sender_id, deleted_at FROM messages') && opts.authorLookupThrows) throw new Error('D1 down');
          if (this._sql.includes('FROM messages WHERE id=?')) return st.messages.find((m) => m.id === a[0] && m.conv_id === a[1]) || null;
          return null;
        },
        async all() {
          st.log.push({ sql: this._sql, args: this._args });
          if (this._sql.includes('FROM system_config')) return { results: [] };
          if (this._sql.includes('FROM messages WHERE conv_id=?')) {
            return { results: st.messages.filter((m) => m.conv_id === this._args[0]).slice().sort((x, y) => (y.ts || 0) - (x.ts || 0)) };
          }
          if (this._sql.includes('FROM conversation_members')) return { results: st.members.filter((m) => m.conv_id === this._args[0]) };
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      st.batchCalls++;
      const snapshot = st.messages.map((m) => ({ ...m }));
      let out;
      try { out = []; for (const s of stmts) out.push(await s.run()); }
      catch (e) { st.messages = snapshot; throw e; }
      if (opts.batchGate) await opts.batchGate;
      return out;
    },
  };
}

const CONV = 'conv1';
function sess(userId, extra = {}) {
  return { userId, deviceId: userId + '-d', convId: CONV, lastSeq: 0, connectedAt: Date.now(), lastMemberCheck: Date.now(), messageCount: 0, lastReset: Date.now(), ...extra };
}

async function makeDO(dbOpts = {}, envExtra = {}, stateExtra = {}) {
  const db = makeDB({
    members: [{ conv_id: CONV, user_id: 'alice', role: 'member', joined_at: 0 }, { conv_id: CONV, user_id: 'bob', role: 'member', joined_at: 0 }],
    users: [{ id: 'alice', is_banned: 0, status: 'active' }, { id: 'bob', is_banned: 0, status: 'active' }],
    ...dbOpts,
  });
  const env = { JWT_SIGN_KEY: 'k', APEX_CHAT_DB: db, TELEMETRY_QUEUE: { send: vi.fn(async () => {}) }, ...envExtra };
  const _do = new ConversationDO(makeState(stateExtra), env);
  await new Promise((r) => setTimeout(r, 0));
  vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue();
  return { _do, db, env };
}

function addMsg(db, m) {
  db._st.messages.push({ conv_id: CONV, mime: 'text/plain', reply_to: null, thread_root: null, view_once: 0, expires_at: null, edited_at: null, deleted_at: null, reactions: '{}', ...m });
}

async function connect(_do, uid) {
  vi.spyOn(_do, 'verifyJWT').mockResolvedValue({ sub: uid, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 });
  const req = { url: `https://do/ws?token=t&uid=${uid}&conv=${CONV}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } };
  const r = await _do.fetch(req);
  expect(r.status).toBe(101);
  return [..._do.sessions.keys()].find((w) => _do.sessions.get(w).userId === uid);
}

function telemetryMsgs(env) { return env.TELEMETRY_QUEUE.send.mock.calls.map((c) => c[0].msg); }

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

// ─────────────────────────────────────────────────────────────────────────────
describe('A. /admin/inject-message — même validation que la trame WS', () => {
  const post = (body) => new Request('https://do/admin/inject-message', {
    method: 'POST', headers: { 'X-Apex-Internal': 'tok' }, body: JSON.stringify(body),
  });

  it('mime invalide → 400 avec l\'erreur de validation, rien en buffer, seq inchangée', async () => {
    const { _do } = await makeDO({}, { APEX_CHAT_ADMIN_TOKEN: 'tok' });
    const r = await _do.fetch(post({ conv_id: CONV, sender_id: 'alice', ciphertext: 'x', mime: 42 }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('mime invalide');
    expect(_do.pendingMessages).toHaveLength(0);
    expect(_do.seq).toBe(0);
  });

  it('conv_id / sender_id non-string → 400 « invalides », rien en buffer', async () => {
    const { _do, db } = await makeDO({}, { APEX_CHAT_ADMIN_TOKEN: 'tok' });
    const r = await _do.fetch(post({ conv_id: 12345, sender_id: 'alice', ciphertext: 'x' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('conv_id/sender_id invalides');
    expect(_do.pendingMessages).toHaveLength(0);
    expect(db._st.messages).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B. connexion — historique et rejeu d\'appel ciblé', () => {
  it('historique : buffer d\'une AUTRE conv exclu, doublon D1/buffer non répété, ts illisible exclu après joined_at', async () => {
    const { _do, db } = await makeDO({
      members: [{ conv_id: CONV, user_id: 'carol', role: 'member', joined_at: 1000 }],
      users: [{ id: 'carol', is_banned: 0, status: 'active' }],
    });
    addMsg(db, { id: 'd1', sender_id: 'alice', ciphertext: 'en-d1', ts: 1500 });
    addMsg(db, { id: 'sans-ts', sender_id: 'alice', ciphertext: 'ts-null', ts: null });
    _do.pendingMessages.push(
      { id: 'd1', conv_id: CONV, sender_id: 'alice', ciphertext: 'en-d1', ts: 1500 },          // déjà en D1
      { id: 'autre', conv_id: 'conv2', sender_id: 'alice', ciphertext: 'autre-conv', ts: 2000 }, // autre conversation
      { id: 'p-ok', conv_id: CONV, sender_id: 'alice', ciphertext: 'bufferise', ts: 2000 },
    );
    const ws = await connect(_do, 'carol');
    const hist = ws.frames('history')[0];
    expect(hist.messages.map((m) => m.id)).toEqual(['d1', 'p-ok']);
    expect(JSON.stringify(hist)).not.toContain('autre-conv');
    expect(JSON.stringify(hist)).not.toContain('ts-null');
  });

  it('appel en attente adressé à CE membre (`to`) → offer + ICE rejoués à sa connexion', async () => {
    const { _do } = await makeDO();
    _do.pendingCall = { fromUserId: 'alice', fromDevice: 'a-d', to: 'bob', callType: 'video', offer: { sdp: 'S' }, candidates: [{ c: 1 }, { c: 2 }], ts: Date.now() };
    const ws = await connect(_do, 'bob');
    const offer = ws.frames('webrtc-offer');
    expect(offer).toHaveLength(1);
    expect(offer[0]).toMatchObject({ from: 'alice', callType: 'video', replayed: true, convId: CONV });
    expect(ws.frames('webrtc-candidate').map((f) => f.candidate)).toEqual([{ c: 1 }, { c: 2 }]);
  });

  it('appel en attente adressé à QUELQU\'UN D\'AUTRE → rien rejoué à ce membre', async () => {
    const { _do } = await makeDO();
    _do.pendingCall = { fromUserId: 'alice', to: 'carol', callType: 'audio', offer: { sdp: 'S' }, candidates: [{ c: 1 }], ts: Date.now() };
    const ws = await connect(_do, 'bob');
    expect(ws.frames('webrtc-offer')).toHaveLength(0);
    expect(ws.frames('webrtc-candidate')).toHaveLength(0);
  });

  it('trame JSON non-objet (« null ») reçue sur la socket → erreur « trame invalide », socket vivante', async () => {
    const { _do } = await makeDO();
    const ws = await connect(_do, 'alice');
    await ws._l.message[0]({ data: 'null' });
    await ws._l.message[0]({ data: '42' });
    const errs = ws.frames('error').map((e) => e.message);
    expect(errs).toEqual(['trame invalide', 'trame invalide']);
    expect(ws.closed).toBeNull();
    expect(_do.sessions.has(ws)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C. re-vérification périodique — chemins non révoqués et fail-open', () => {
  it('membre toujours valide → la trame est traitée et l\'horodatage de vérif avance', async () => {
    const { _do, db } = await makeDO();
    const old = Date.now() - 120000;
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice', { lastMemberCheck: old, authAt: undefined }));
    _do.sessions.set(bob, sess('bob'));
    db._st.users[0].last_force_logout_at = old - 1000;   // force_logout ANTÉRIEUR à la connexion
    await _do.handleMessage(alice, { type: 'typing' });
    expect(alice.closed).toBeNull();
    expect(bob.frames('typing')).toHaveLength(1);
    expect(_do.sessions.get(alice).lastMemberCheck).toBeGreaterThan(old);
  });

  it('session sans authAt ni connectedAt : tout force_logout la révoque (fail-closed)', async () => {
    const { _do, db } = await makeDO();
    db._st.users[0].last_force_logout_at = 5;
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice', { connectedAt: undefined, authAt: undefined, lastMemberCheck: Date.now() - 120000 }));
    _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'x' });
    expect(alice.closed).toEqual({ code: 1008, reason: 'Session révoquée' });
    expect(_do.pendingMessages).toHaveLength(0);
    expect(bob.frames('presence')[0]).toMatchObject({ userId: 'alice', status: 'offline' });
  });

  it('D1 en panne pendant la re-vérif → fail-open : la trame passe, re-vérif retentée à la trame suivante', async () => {
    const { _do } = await makeDO({ memberLookupThrows: true });
    const old = Date.now() - 120000;
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice', { lastMemberCheck: old }));
    _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'typing' });
    expect(alice.closed).toBeNull();
    expect(bob.frames('typing')).toHaveLength(1);
    expect(_do.sessions.get(alice).lastMemberCheck).toBe(old);   // pas avancé → on réessaiera
    expect(console.warn).toHaveBeenCalledWith('[ConversationDO] membership recheck failed:', 'D1 overloaded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D. gardes de validation des trames', () => {
  it('read : message_id manquant / trop long → erreur, rien écrit en D1 ni diffusé', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'read' });
    await _do.handleMessage(alice, { type: 'read', message_id: 'x'.repeat(129) });
    expect(alice.frames('error').map((e) => e.message)).toEqual(['read: message_id invalide', 'read: message_id invalide']);
    expect(bob.frames('read')).toHaveLength(0);
    expect(db._st.log.some((l) => l.sql.includes('last_read_msg_id'))).toBe(false);
  });

  it('reaction : message_id non-string → erreur, aucune requête D1, rien diffusé', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'reaction', message_id: { $ne: null }, emoji: '👍' });
    expect(alice.frames('error')[0].message).toBe('reaction: message_id invalide');
    expect(bob.frames('reaction')).toHaveLength(0);
    expect(db._st.log.some((l) => l.sql.includes('reactions'))).toBe(false);
  });

  it('edit_message : contenu non-string → « contenu invalide », message D1 intact', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'orig', ts: 1 });
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'm1', ciphertext: { evil: 1 } });
    expect(alice.frames('error')[0].message).toBe('edit: contenu invalide');
    expect(db._st.messages[0].ciphertext).toBe('orig');
    expect(bob.frames('edit_message')).toHaveLength(0);
  });

  it('signaling : `to` non-string, vide ou trop long → erreur, rien relayé, aucun appel mémorisé', async () => {
    const { _do } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    for (const to of [42, '', 'x'.repeat(129)]) {
      await _do.handleMessage(alice, { type: 'webrtc-offer', to, offer: { sdp: 'S' } });
    }
    expect(alice.frames('error').map((e) => e.message)).toEqual(Array(3).fill('signaling: destinataire invalide'));
    expect(bob.frames()).toHaveLength(0);
    expect(_do.pendingCall).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('E. réactions — JSON corrompu, retrait partiel, ajout idempotent', () => {
  async function setup(reactions) {
    const ctx = await makeDO();
    addMsg(ctx.db, { id: 'm1', sender_id: 'bob', ciphertext: 'x', ts: 1, reactions });
    const alice = new MockWS(); ctx._do.sessions.set(alice, sess('alice'));
    return { ...ctx, alice };
  }

  it('reactions stockées sous forme de tableau (corrompu) → repart d\'un objet vide', async () => {
    const { _do, db, alice } = await setup('["x"]');
    await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: '👍' });
    expect(JSON.parse(db._st.messages[0].reactions)).toEqual({ '👍': ['alice'] });
    expect(alice.frames('reaction')[0].reactions).toEqual({ '👍': ['alice'] });
  });

  it('retrait alors qu\'un autre membre a la même réaction → l\'emoji reste pour lui', async () => {
    const { _do, db, alice } = await setup(JSON.stringify({ '❤️': ['alice', 'bob'] }));
    await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: '❤️', action: 'remove' });
    expect(JSON.parse(db._st.messages[0].reactions)).toEqual({ '❤️': ['bob'] });
  });

  it('action « add » déjà présente → pas de doublon', async () => {
    const { _do, db, alice } = await setup(JSON.stringify({ '👍': ['alice'] }));
    await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: '👍', action: 'add' });
    expect(JSON.parse(db._st.messages[0].reactions)).toEqual({ '👍': ['alice'] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('F. edit/delete — repli _isAuthorInDb quand D1 ne renvoie pas meta.changes', () => {
  async function setup(dbOpts = {}) {
    const ctx = await makeDO({ noMeta: true, ...dbOpts });
    const alice = new MockWS(); const bob = new MockWS();
    ctx._do.sessions.set(alice, sess('alice')); ctx._do.sessions.set(bob, sess('bob'));
    return { ...ctx, alice, bob };
  }

  it('auteur → édition autorisée et diffusée (vérifiée par relecture D1)', async () => {
    const { _do, db, alice, bob } = await setup();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'v1', ts: 1 });
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'm1', new_text: 'v2' });
    expect(bob.frames('edit_message')).toHaveLength(1);
    expect(alice.frames('ack')[0].id).toBe('m1');
    expect(db._st.log.some((l) => l.sql.startsWith('SELECT sender_id, deleted_at FROM messages'))).toBe(true);
  });

  it('non-auteur, message inexistant, ou message supprimé → édition refusée (forbidden), rien diffusé', async () => {
    const { _do, db, alice, bob } = await setup();
    addMsg(db, { id: 'de-bob', sender_id: 'bob', ciphertext: 'b', ts: 1 });
    addMsg(db, { id: 'suppr', sender_id: 'alice', ciphertext: '', ts: 2, deleted_at: 3 });
    for (const id of ['de-bob', 'fantome', 'suppr']) {
      await _do.handleMessage(alice, { type: 'edit_message', message_id: id, new_text: 'x' });
    }
    expect(alice.frames('error').map((e) => [e.code, e.id])).toEqual([['forbidden', 'de-bob'], ['forbidden', 'fantome'], ['forbidden', 'suppr']]);
    expect(bob.frames('edit_message')).toHaveLength(0);
    expect(alice.frames('ack')).toHaveLength(0);
  });

  it('delete d\'un message déjà supprimé par son auteur → autorisé (idempotent, allowDeleted)', async () => {
    const { _do, db, alice, bob } = await setup();
    addMsg(db, { id: 'suppr', sender_id: 'alice', ciphertext: '', ts: 2, deleted_at: 3 });
    await _do.handleMessage(alice, { type: 'delete_message', message_id: 'suppr' });
    expect(bob.frames('delete_message')).toHaveLength(1);
    expect(alice.frames('ack')[0].id).toBe('suppr');
  });

  it('relecture D1 en échec → refus (fail-closed), rien diffusé', async () => {
    const { _do, db, alice, bob } = await setup({ authorLookupThrows: true });
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'v1', ts: 1 });
    await _do.handleMessage(alice, { type: 'delete_message', message_id: 'm1' });
    expect(alice.frames('error')[0].code).toBe('forbidden');
    expect(bob.frames('delete_message')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('G. edit/delete pendant un flush en vol (_inflight)', () => {
  it('l\'auteur peut éditer puis supprimer un message dont l\'écriture D1 est en cours', async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const { _do, db } = await makeDO({ batchGate: gate });
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    _do.pendingMessages.push({ id: 'vol', conv_id: CONV, sender_id: 'alice', ciphertext: 'v1', mime: 'text/plain', ts: 1 });
    const flushing = _do.flushToD1();
    await Promise.resolve();
    expect(_do.pendingMessages).toHaveLength(0);
    expect(_do._inflight.map((m) => m.id)).toEqual(['vol']);

    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'vol', new_text: 'v2' });
    expect(bob.frames('edit_message')[0]).toMatchObject({ message_id: 'vol', new_text: 'v2' });
    expect(_do._inflight[0].ciphertext).toBe('v2');

    // Un autre membre ne peut pas toucher au message en vol.
    await _do.handleMessage(bob, { type: 'delete_message', message_id: 'vol' });
    expect(bob.frames('error')[0].code).toBe('forbidden');
    expect(_do._inflight[0].deleted_at).toBeUndefined();

    await _do.handleMessage(alice, { type: 'delete_message', message_id: 'vol' });
    expect(bob.frames('delete_message')).toHaveLength(1);
    expect(_do._inflight[0]).toMatchObject({ ciphertext: '' });

    release(); await flushing;
    expect(_do._inflight).toEqual([]);
    const row = db._st.messages.find((m) => m.id === 'vol');
    expect(row.ciphertext).toBe('');
    expect(row.deleted_at).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('H. flushToD1 — normalisation, mode ligne par ligne, abandon après N essais', () => {
  it('normalise chaque colonne : ciphertext absent → \'\', mime absent → NULL, thread_root/view_once/edited_at conservés', async () => {
    const { _do, db } = await makeDO();
    _do.pendingMessages.push({ id: 'n1', conv_id: CONV, sender_id: 'alice', ts: 7, thread_root: 'root', view_once: true, edited_at: 123 });
    await _do.flushToD1();
    expect(db._st.messages.find((m) => m.id === 'n1')).toMatchObject({
      ciphertext: '', mime: null, thread_root: 'root', view_once: 1, edited_at: 123, deleted_at: null, reply_to: null, expires_at: null,
    });
    expect(_do.pendingMessages).toHaveLength(0);
  });

  it('message édité dans le buffer → le flush persiste le contenu édité ET edited_at', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'v1', thread_root: 'parent', view_once: true });
    const id = _do.pendingMessages[0].id;
    await _do.handleMessage(alice, { type: 'edit_message', message_id: id, new_text: 'v2' });
    await _do.flushToD1();
    const row = db._st.messages.find((m) => m.id === id);
    expect(row).toMatchObject({ ciphertext: 'v2', thread_root: 'parent', view_once: 1 });
    expect(row.edited_at).toBeGreaterThan(0);
  });

  it('instance sans compteur d\'échecs (_flushFails absent) → recréé, le flush réussit', async () => {
    const { _do, db } = await makeDO();
    _do._flushFails = null;
    _do.pendingMessages.push({ id: 'f1', conv_id: CONV, sender_id: 'alice', ciphertext: 'a', mime: 'text/plain', ts: 1 });
    await _do.flushToD1();
    expect(_do._flushFails).toBeInstanceOf(Map);
    expect(db._st.messages.map((m) => m.id)).toEqual(['f1']);
  });

  it('mode ligne : une NOUVELLE ligne en erreur transitoire est remise en file (compteur 1) et finit par passer', async () => {
    let failA = true; let failC = true;
    const { _do, db, env } = await makeDO({
      insertFail: (id) => {
        if (id === 'a' && failA) { failA = false; return new Error('D1_ERROR: network reset'); }
        if (id === 'c' && failC) { failC = false; return new Error('D1_ERROR: network reset'); }
        return undefined;
      },
    });
    _do.pendingMessages.push({ id: 'a', conv_id: CONV, sender_id: 'alice', ciphertext: 'A', mime: 'text/plain', ts: 1 });
    await _do.flushToD1();                       // lot atomique en échec → 'a' re-queue (1 échec)
    expect(_do.pendingMessages.map((m) => m.id)).toEqual(['a']);
    _do.pendingMessages.push({ id: 'c', conv_id: CONV, sender_id: 'alice', ciphertext: 'C', mime: 'text/plain', ts: 2 });
    await _do.flushToD1();                       // ligne par ligne : 'a' OK, 'c' (jamais échoué) en échec transitoire
    expect(db._st.messages.map((m) => m.id)).toEqual(['a']);
    expect(_do.pendingMessages.map((m) => m.id)).toEqual(['c']);
    expect(_do._flushFails.get('c')).toBe(1);
    expect(_do._flushFails.has('a')).toBe(false);
    expect(telemetryMsgs(env)).toContain('row retry pending: 1');
    await _do.flushToD1();                       // 'c' rejoué ligne par ligne → persisté, compteur effacé
    expect(db._st.messages.map((m) => m.id)).toEqual(['a', 'c']);
    expect(_do.pendingMessages).toHaveLength(0);
    expect(_do._flushFails.size).toBe(0);
  });

  it('erreur transitoire au 100e essai → ligne abandonnée et journalisée (ne bloque plus la conv)', async () => {
    const { _do, db, env } = await makeDO({ insertFail: (id) => (id === 'z' ? new Error('D1_ERROR: timeout') : undefined) });
    _do._flushFails.set('z', 99);
    _do.pendingMessages.push({ id: 'z', conv_id: CONV, sender_id: 'alice', ciphertext: 'Z', mime: 'text/plain', ts: 1 },
      { id: 'ok', conv_id: CONV, sender_id: 'alice', ciphertext: 'K', mime: 'text/plain', ts: 2 });
    await _do.flushToD1();
    expect(_do.pendingMessages).toHaveLength(0);
    expect(_do._flushFails.has('z')).toBe(false);
    expect(db._st.messages.map((m) => m.id)).toEqual(['ok']);
    expect(telemetryMsgs(env)).toContain('drop z: D1_ERROR: timeout');
  });

  it('erreur levée comme simple chaîne : permanente → abandonnée ; transitoire → remise en file', async () => {
    const { _do, db } = await makeDO({
      insertFail: (id) => (id === 'perm' ? 'SQLITE_MISMATCH' : id === 'tmp' ? 'busy' : undefined),
    });
    _do._flushFails.set('perm', 1); _do._flushFails.set('tmp', 1);   // déjà échoués → mode ligne
    _do.pendingMessages.push(
      { id: 'perm', conv_id: CONV, sender_id: 'alice', ciphertext: 'P', mime: 'text/plain', ts: 1 },
      { id: 'tmp', conv_id: CONV, sender_id: 'alice', ciphertext: 'T', mime: 'text/plain', ts: 2 },
    );
    await _do.flushToD1();
    expect(_do.pendingMessages.map((m) => m.id)).toEqual(['tmp']);
    expect(_do._flushFails.has('perm')).toBe(false);
    expect(_do._flushFails.get('tmp')).toBe(2);
    expect(db._st.messages).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('I. alarme de flush avec un setAlarm synchrone', () => {
  it('setAlarm qui ne renvoie pas de promesse → alarme armée à +5 s, message acquitté normalement', async () => {
    const setAlarm = vi.fn(() => undefined);
    const { _do } = await makeDO({}, {}, { setAlarm });
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    const before = Date.now();
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'x' });
    expect(setAlarm).toHaveBeenCalledTimes(1);
    expect(setAlarm.mock.calls[0][0]).toBeGreaterThanOrEqual(before + 5000);
    expect(alice.frames('ack')).toHaveLength(1);
    expect(_do.pendingMessages).toHaveLength(1);
  });
});
