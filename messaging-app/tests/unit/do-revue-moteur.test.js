// Revue du moteur temps réel (ConversationDO) — 08.10.2026.
// Chaque bloc correspond à un correctif ; chaque test échoue sur la version d'avant
// (prouvé en restaurant une copie de l'ancien fichier, cf. rapport).
//  1. edit/delete : diffusion seulement si l'appelant est l'AUTEUR
//  2. champs invalides refusés à la réception + flushToD1 résilient et idempotent
//  3. delete : ciphertext '' (colonne NOT NULL), jamais NULL
//  4. historique : rien d'antérieur à joined_at, aucun contenu supprimé
//  5. re-vérification périodique membership / ban / force_logout
//  6. rate limit étendu + réactions bornées
//  7. signaling ciblé (`to`)
//  8. e2e_strict appliqué à edit_message
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

function makeState() {
  const data = new Map();
  return {
    id: { toString: () => 'do-id' },
    storage: { get: vi.fn(async (k) => data.get(k)), put: vi.fn(async (k, v) => { data.set(k, v); }), setAlarm: vi.fn(async () => {}) },
    blockConcurrencyWhile: vi.fn(async (fn) => fn()),
  };
}

/**
 * D1 en mémoire, assez fidèle pour ces tests :
 *  - messages : PK id (INSERT sans ON CONFLICT/OR IGNORE → UNIQUE constraint failed),
 *    ciphertext NOT NULL (→ NOT NULL constraint failed), meta.changes sur UPDATE.
 *  - members / users configurables, journal des requêtes.
 */
function makeDB(opts = {}) {
  const st = {
    messages: opts.messages || [],
    members: opts.members || [],
    users: opts.users || [],
    log: [],
    failConvUpdate: opts.failConvUpdate || 0,
    batchCalls: 0,
  };
  function exec(sql, a) {
    st.log.push({ sql, args: a });
    if (sql.includes('INSERT INTO messages')) {
      const [id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at, deleted_at] = a;
      if (ciphertext == null) throw new Error('D1_ERROR: NOT NULL constraint failed: messages.ciphertext');
      if (typeof ciphertext === 'object') throw new Error('D1_TYPE_ERROR: Type object is not supported');
      if (expires_at != null && typeof expires_at !== 'number') throw new Error('D1_ERROR: datatype mismatch');
      if (st.messages.some((m) => m.id === id)) {
        if (/ON CONFLICT|OR IGNORE/i.test(sql)) return { success: true, meta: { changes: 0 } };
        throw new Error('D1_ERROR: UNIQUE constraint failed: messages.id');
      }
      st.messages.push({ id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at: edited_at ?? null, deleted_at: deleted_at ?? null, reactions: '{}' });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE messages SET ciphertext=?, edited_at=?')) {
      const [ct, editedAt, id, conv, sender] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv && x.sender_id === sender && x.deleted_at == null);
      if (m) { m.ciphertext = ct; m.edited_at = editedAt; }
      return { success: true, meta: { changes: m ? 1 : 0 } };
    }
    if (sql.startsWith('UPDATE messages SET deleted_at=?')) {
      if (/ciphertext=NULL/i.test(sql)) throw new Error('D1_ERROR: NOT NULL constraint failed: messages.ciphertext');
      const [at, id, conv, sender] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv && x.sender_id === sender);
      if (m) { m.deleted_at = at; m.ciphertext = ''; }
      return { success: true, meta: { changes: m ? 1 : 0 } };
    }
    if (sql.startsWith('UPDATE messages SET reactions=?')) {
      const [r, id, conv] = a;
      const m = st.messages.find((x) => x.id === id && x.conv_id === conv);
      if (m) m.reactions = r;
      return { success: true, meta: { changes: m ? 1 : 0 } };
    }
    if (sql.includes('UPDATE conversations SET last_msg_id')) {
      if (st.failConvUpdate > 0) { st.failConvUpdate--; throw new Error('D1_ERROR: conv update failed'); }
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 0 } };
  }
  const db = {
    _st: st,
    prepare(sql) {
      const stmt = {
        _sql: sql, _args: [],
        bind(...a) { return { ...stmt, _args: a }; },
        async run() { return exec(this._sql, this._args); },
        async first() {
          st.log.push({ sql: this._sql, args: this._args });
          const a = this._args;
          if (this._sql.includes('FROM conversation_members')) return st.members.find((m) => m.conv_id === a[0] && m.user_id === a[1]) || null;
          if (this._sql.includes('FROM users WHERE id=?')) return st.users.find((u) => u.id === a[0]) || null;
          if (this._sql.includes('SELECT reactions FROM messages')) return st.messages.find((m) => m.id === a[0] && m.conv_id === a[1]) || null;
          if (this._sql.includes('FROM messages WHERE id=?')) return st.messages.find((m) => m.id === a[0] && m.conv_id === a[1]) || null;
          return null;
        },
        async all() {
          st.log.push({ sql: this._sql, args: this._args });
          if (this._sql.includes('FROM system_config')) return { results: opts.config || [] };
          // Volontairement SANS appliquer de filtre SQL autre que conv_id : le DO doit filtrer lui-même.
          if (this._sql.includes('FROM messages WHERE conv_id=?')) {
            return { results: st.messages.filter((m) => m.conv_id === this._args[0]).slice().sort((x, y) => y.ts - x.ts) };
          }
          if (this._sql.includes('FROM conversation_members')) return { results: st.members.filter((m) => m.conv_id === this._args[0]) };
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      st.batchCalls++;
      // Atomique comme D1 : tout ou rien.
      const snapshot = st.messages.map((m) => ({ ...m }));
      try { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
      catch (e) { st.messages = snapshot; throw e; }
    },
  };
  return db;
}

const CONV = 'conv1';
function sess(userId, extra = {}) {
  return { userId, deviceId: userId + '-d', convId: CONV, lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now(), ...extra };
}

async function makeDO(dbOpts = {}) {
  const db = makeDB({
    members: [{ conv_id: CONV, user_id: 'alice', role: 'member', joined_at: 0 }, { conv_id: CONV, user_id: 'bob', role: 'member', joined_at: 0 }],
    users: [{ id: 'alice', is_banned: 0, status: 'active' }, { id: 'bob', is_banned: 0, status: 'active' }],
    ...dbOpts,
  });
  const env = { JWT_SIGN_KEY: 'k', APEX_CHAT_DB: db, TELEMETRY_QUEUE: { send: vi.fn(async () => {}) } };
  const _do = new ConversationDO(makeState(), env);
  await new Promise((r) => setTimeout(r, 0));
  vi.spyOn(_do, 'notifyOfflineMembers').mockResolvedValue();
  return { _do, db, env };
}

function addMsg(db, m) {
  db._st.messages.push({ conv_id: CONV, mime: 'text/plain', reply_to: null, thread_root: null, view_once: 0, expires_at: null, edited_at: null, deleted_at: null, reactions: '{}', ...m });
}

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

// ─────────────────────────────────────────────────────────────────────────────
describe('1. edit/delete — seul l\'auteur déclenche une diffusion', () => {
  it('edit par un NON-auteur : aucune diffusion, aucun ack, erreur à l\'appelant seulement', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'original', ts: 1 });
    const bob = new MockWS(); const alice = new MockWS();
    _do.sessions.set(bob, sess('bob')); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(bob, { type: 'edit_message', message_id: 'm1', new_text: 'piraté' });
    expect(alice.frames('edit_message')).toHaveLength(0);
    expect(bob.frames('edit_message')).toHaveLength(0);
    expect(bob.frames('ack')).toHaveLength(0);
    expect(bob.frames('error')[0].code).toBe('forbidden');
    expect(db._st.messages[0].ciphertext).toBe('original');
  });

  it('delete par un NON-auteur : aucune diffusion, aucun ack', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'original', ts: 1 });
    const bob = new MockWS(); const alice = new MockWS();
    _do.sessions.set(bob, sess('bob')); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(bob, { type: 'delete_message', message_id: 'm1' });
    expect(alice.frames('delete_message')).toHaveLength(0);
    expect(bob.frames('ack')).toHaveLength(0);
    expect(bob.frames('error')[0].code).toBe('forbidden');
    expect(db._st.messages[0].deleted_at).toBeNull();
  });

  it('edit/delete d\'un message d\'autrui ENCORE EN BUFFER : refusé, buffer intact', async () => {
    const { _do } = await makeDO();
    _do.pendingMessages.push({ id: 'p1', conv_id: CONV, sender_id: 'alice', ciphertext: 'secret', ts: 1 });
    const bob = new MockWS(); const alice = new MockWS();
    _do.sessions.set(bob, sess('bob')); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(bob, { type: 'edit_message', message_id: 'p1', new_text: 'x' });
    await _do.handleMessage(bob, { type: 'delete_message', message_id: 'p1' });
    expect(alice.frames('edit_message')).toHaveLength(0);
    expect(alice.frames('delete_message')).toHaveLength(0);
    expect(_do.pendingMessages[0].ciphertext).toBe('secret');
    expect(_do.pendingMessages[0].deleted_at).toBeUndefined();
  });

  it('l\'auteur, lui, édite (D1 ou buffer) → diffusion + ack', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'v1', ts: 1 });
    _do.pendingMessages.push({ id: 'p1', conv_id: CONV, sender_id: 'alice', ciphertext: 'b1', ts: 2 });
    const bob = new MockWS(); const alice = new MockWS();
    _do.sessions.set(bob, sess('bob')); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'm1', new_text: 'v2' });
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'p1', new_text: 'b2' });
    expect(bob.frames('edit_message').map((f) => f.message_id)).toEqual(['m1', 'p1']);
    expect(alice.frames('ack')).toHaveLength(2);
    expect(db._st.messages[0].ciphertext).toBe('v2');
    expect(_do.pendingMessages[0].ciphertext).toBe('b2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2. champs invalides refusés + flushToD1 résilient et idempotent', () => {
  const bad = [
    ['ciphertext objet', { ciphertext: { evil: 1 } }],
    ['ciphertext nombre', { ciphertext: 12345 }],
    ['mime non-string', { ciphertext: 'x', mime: 42 }],
    ['thread_root objet', { ciphertext: 'x', thread_root: { a: 1 } }],
    ['expires_at string', { ciphertext: 'x', expires_at: 'demain' }],
    ['expires_at NaN/Infinity', { ciphertext: 'x', expires_at: Infinity }],
    ['reply_to nombre', { ciphertext: 'x', reply_to: 7 }],
  ];
  for (const [label, payload] of bad) {
    it(`refuse à la réception : ${label} (erreur à l'expéditeur, rien en buffer, rien diffusé)`, async () => {
      const { _do } = await makeDO();
      const alice = new MockWS(); const bob = new MockWS();
      _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
      await _do.handleMessage(alice, { type: 'message', ...payload });
      expect(_do.pendingMessages).toHaveLength(0);
      expect(bob.frames('message')).toHaveLength(0);
      expect(alice.frames('ack')).toHaveLength(0);
      expect(alice.frames('error')).toHaveLength(1);
    });
  }

  it('reply_to objet (forme du client {id,text,from_name}) → stocké en id string, sans le texte en clair', async () => {
    const { _do } = await makeDO();
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'E2E1:x', reply_to: { id: 'm_parent', text: 'texte en clair', from_name: 'Bob' } });
    expect(_do.pendingMessages[0].reply_to).toBe('m_parent');
    expect(JSON.stringify(_do.pendingMessages[0])).not.toContain('texte en clair');
    await _do.flushToD1();
    expect(_do.pendingMessages).toHaveLength(0);
  });

  it('une ligne empoisonnée dans le buffer ne bloque plus la conversation (retry ligne par ligne + abandon journalisé)', async () => {
    const { _do, db, env } = await makeDO();
    _do.pendingMessages.push(
      { id: 'ok1', conv_id: CONV, sender_id: 'alice', ciphertext: 'a', mime: 'text/plain', ts: 1 },
      { id: 'bad', conv_id: CONV, sender_id: 'alice', ciphertext: 'b', mime: 'text/plain', ts: 2, expires_at: 'poison' },
      { id: 'ok2', conv_id: CONV, sender_id: 'alice', ciphertext: 'c', mime: 'text/plain', ts: 3 },
    );
    await _do.flushToD1();   // lot atomique en échec → re-queue
    await _do.flushToD1();   // ligne par ligne : ok1/ok2 persistés, 'bad' abandonné
    expect(db._st.messages.map((m) => m.id).sort()).toEqual(['ok1', 'ok2']);
    expect(_do.pendingMessages).toHaveLength(0);
    expect(env.TELEMETRY_QUEUE.send).toHaveBeenCalled();
    // Et la conv continue de fonctionner normalement ensuite.
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'suite' });
    await _do.flushToD1();
    expect(db._st.messages.some((m) => m.ciphertext === 'suite')).toBe(true);
    expect(_do.pendingMessages).toHaveLength(0);
  });

  it('flush partiellement réussi (messages insérés, MAJ conversation en échec) : pas de boucle sur clé dupliquée', async () => {
    const { _do, db } = await makeDO({ failConvUpdate: 1 });
    _do.pendingMessages.push({ id: 'x1', conv_id: CONV, sender_id: 'alice', ciphertext: 'a', mime: 'text/plain', ts: 1 });
    await _do.flushToD1();
    await _do.flushToD1();
    await _do.flushToD1();
    expect(db._st.messages.filter((m) => m.id === 'x1')).toHaveLength(1);
    expect(_do.pendingMessages).toHaveLength(0);
  });

  it('insertion idempotente : rejouer une ligne déjà en D1 ne lève pas d\'erreur', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'dup', sender_id: 'alice', ciphertext: 'a', ts: 1 });
    _do.pendingMessages.push({ id: 'dup', conv_id: CONV, sender_id: 'alice', ciphertext: 'a', mime: 'text/plain', ts: 1 },
      { id: 'new', conv_id: CONV, sender_id: 'alice', ciphertext: 'b', mime: 'text/plain', ts: 2 });
    await _do.flushToD1();
    expect(db._st.batchCalls).toBe(1);
    expect(_do.pendingMessages).toHaveLength(0);
    expect(db._st.messages.map((m) => m.id).sort()).toEqual(['dup', 'new']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3. delete_message — ciphertext \'\' (NOT NULL), jamais NULL', () => {
  it('D1 : suppression acceptée par une colonne NOT NULL, tombstone (deleted_at + contenu vidé)', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'secret', ts: 1 });
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'delete_message', message_id: 'm1' });
    expect(alice.frames('error')).toHaveLength(0);
    expect(db._st.messages[0].ciphertext).toBe('');
    expect(db._st.messages[0].deleted_at).toBeGreaterThan(0);
    expect(bob.frames('delete_message')).toHaveLength(1);
  });

  it('buffer : message supprimé avant flush → ciphertext \'\' + deleted_at, et le flush le persiste tel quel', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'secret' });
    const id = _do.pendingMessages[0].id;
    await _do.handleMessage(alice, { type: 'delete_message', message_id: id });
    expect(_do.pendingMessages[0].ciphertext).toBe('');
    expect(_do.pendingMessages[0].deleted_at).toBeGreaterThan(0);
    await _do.flushToD1();
    expect(_do.pendingMessages).toHaveLength(0);
    const row = db._st.messages.find((m) => m.id === id);
    expect(row.ciphertext).toBe('');
    expect(row.deleted_at).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4. historique à la connexion — joined_at + messages supprimés', () => {
  async function connect(_do, uid) {
    vi.spyOn(_do, 'verifyJWT').mockResolvedValue({ sub: uid, typ: 'wsfwd', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 });
    const req = { url: `https://do/ws?token=fresh&uid=${uid}&conv=${CONV}`, method: 'GET', headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) } };
    const r = await _do.fetch(req);
    expect(r.status).toBe(101);
    return [..._do.sessions.keys()].find((w) => _do.sessions.get(w).userId === uid);
  }

  it('un membre arrivé tard ne reçoit pas les messages antérieurs à son arrivée ; un supprimé n\'expose pas son contenu', async () => {
    const { _do, db } = await makeDO({
      members: [{ conv_id: CONV, user_id: 'alice', role: 'member', joined_at: 0 }, { conv_id: CONV, user_id: 'carol', role: 'member', joined_at: 1000 }],
      users: [{ id: 'carol', is_banned: 0, status: 'active' }],
    });
    addMsg(db, { id: 'avant', sender_id: 'alice', ciphertext: 'confidentiel-avant-arrivee', ts: 500 });
    addMsg(db, { id: 'apres', sender_id: 'alice', ciphertext: 'bonjour carol', ts: 1500 });
    addMsg(db, { id: 'suppr', sender_id: 'alice', ciphertext: 'contenu-supprime', ts: 1600, deleted_at: 1700 });
    _do.pendingMessages.push({ id: 'buf-avant', conv_id: CONV, sender_id: 'alice', ciphertext: 'buf-old', ts: 900 });
    const ws = await connect(_do, 'carol');
    const hist = ws.frames('history')[0];
    const ids = hist.messages.map((m) => m.id);
    expect(ids).toEqual(['apres', 'suppr']);
    const raw = JSON.stringify(hist);
    expect(raw).not.toContain('confidentiel-avant-arrivee');
    expect(raw).not.toContain('contenu-supprime');
    expect(raw).not.toContain('buf-old');
    expect(hist.messages.find((m) => m.id === 'suppr').ciphertext).toBe('');
    // la requête D1 est bornée par joined_at
    const q = db._st.log.find((l) => l.sql.includes('FROM messages WHERE conv_id=?'));
    expect(q.args.slice(0, 2)).toEqual([CONV, 1000]);   // + le mime des clés de groupe exclu (09.10.2026)
  });

  it('contrat worker → DO conservé : ?token= interne + uid + conv du chemin → session sur la bonne conv', async () => {
    const { _do } = await makeDO();
    const ws = await connect(_do, 'alice');
    expect(_do.sessions.get(ws).convId).toBe(CONV);
    expect(ws.closed).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('5. re-vérification périodique de la membership', () => {
  it('membre retiré de la conv → la trame suivante (après l\'intervalle) ferme la socket en 1008, rien n\'est diffusé', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice', { lastMemberCheck: Date.now() - 120000 }));
    _do.sessions.set(bob, sess('bob'));
    db._st.members = db._st.members.filter((m) => m.user_id !== 'alice');
    await _do.handleMessage(alice, { type: 'message', ciphertext: 'après exclusion' });
    expect(alice.closed && alice.closed.code).toBe(1008);
    expect(_do.sessions.has(alice)).toBe(false);
    expect(_do.pendingMessages).toHaveLength(0);
    expect(bob.frames('message')).toHaveLength(0);
  });

  for (const [label, acct] of [
    ['banni', { is_banned: 1, status: 'active' }],
    ['force_logout postérieur à la connexion', { is_banned: 0, status: 'active', last_force_logout_at: Date.now() + 1 }],
  ]) {
    it(`compte ${label} → socket coupée à la réaction / édition suivante`, async () => {
      const { _do, db } = await makeDO();
      db._st.users = [{ id: 'alice', ...acct }];
      addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'x', ts: 1 });
      const alice = new MockWS(); const bob = new MockWS();
      _do.sessions.set(alice, sess('alice', { connectedAt: Date.now() - 120000, authAt: Date.now() - 120000 }));
      _do.sessions.set(bob, sess('bob'));
      await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: '👍' });
      expect(alice.closed && alice.closed.code).toBe(1008);
      expect(bob.frames('reaction')).toHaveLength(0);
    });
  }

  it('dans l\'intervalle : aucune requête de re-vérification (coût maîtrisé)', async () => {
    const { _do, db } = await makeDO();
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    for (let i = 0; i < 5; i++) await _do.handleMessage(alice, { type: 'typing' });
    expect(db._st.log.filter((l) => l.sql.includes('FROM conversation_members WHERE conv_id=? AND user_id=?'))).toHaveLength(0);
    expect(alice.closed).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('6. rate limit étendu + réactions bornées', () => {
  for (const [type, payload, limit] of [
    ['reaction', { message_id: 'nope', emoji: '👍' }, 120],
    ['typing', {}, 120],
    ['read', { message_id: 'm1' }, 300],
    ['webrtc-candidate', { to: 'bob', candidate: { c: 1 } }, 600],
    ['edit_message', { message_id: 'nope', new_text: 'x' }, 30],
  ]) {
    it(`${type} : au-delà de ${limit}/min → rate_limit`, async () => {
      const { _do } = await makeDO();
      const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
      for (let i = 0; i < limit; i++) await _do.handleMessage(alice, { type, ...payload });
      expect(alice.frames('error').filter((e) => e.code === 'rate_limit')).toHaveLength(0);
      await _do.handleMessage(alice, { type, ...payload });
      expect(alice.frames('error').filter((e) => e.code === 'rate_limit')).toHaveLength(1);
    });
  }

  it('emoji trop long (> 16) ou non-string → refusé, rien écrit ni diffusé', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'x', ts: 1 });
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: 'x'.repeat(5000) });
    await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: { o: 1 } });
    expect(bob.frames('reaction')).toHaveLength(0);
    expect(db._st.messages[0].reactions).toBe('{}');
    expect(alice.frames('error')).toHaveLength(2);
  });

  it('au plus 20 réactions DISTINCTES par message', async () => {
    const { _do, db } = await makeDO();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'x', ts: 1 });
    const alice = new MockWS(); _do.sessions.set(alice, sess('alice'));
    for (let i = 0; i < 25; i++) await _do.handleMessage(alice, { type: 'reaction', message_id: 'm1', emoji: 'e' + i, action: 'add' });
    expect(Object.keys(JSON.parse(db._st.messages[0].reactions))).toHaveLength(20);
    expect(alice.frames('error').filter((e) => e.code === 'too_many_reactions')).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('7. signaling ciblé', () => {
  it('avec `to` : seul le destinataire reçoit (offer / candidate / answer)', async () => {
    const { _do } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS(); const carol = new MockWS(); const bob2 = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob')); _do.sessions.set(carol, sess('carol')); _do.sessions.set(bob2, sess('bob'));
    await _do.handleMessage(alice, { type: 'webrtc-offer', to: 'bob', callType: 'video', offer: { sdp: 'S' } });
    await _do.handleMessage(alice, { type: 'webrtc-candidate', to: 'bob', candidate: { c: 1 } });
    expect(bob.frames('webrtc-offer')).toHaveLength(1);
    expect(bob2.frames('webrtc-offer')).toHaveLength(1);   // tous les appareils du destinataire
    expect(carol.frames()).toHaveLength(0);
    expect(alice.frames('webrtc-offer')).toHaveLength(0);
  });

  it('sans `to` (1:1 legacy) : broadcast aux autres sessions', async () => {
    const { _do } = await makeDO();
    const alice = new MockWS(); const bob = new MockWS(); const carol = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob')); _do.sessions.set(carol, sess('carol'));
    await _do.handleMessage(alice, { type: 'webrtc-offer', offer: { sdp: 'S' } });
    expect(bob.frames('webrtc-offer')).toHaveLength(1);
    expect(carol.frames('webrtc-offer')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('8. e2e_strict appliqué à edit_message', () => {
  it('ON : une édition en clair est refusée (rien écrit, rien diffusé) ; une édition E2E passe', async () => {
    const { _do, db } = await makeDO({ config: [{ key: 'FEATURE_E2E_STRICT', value: 'true' }] });
    _do.config = { FEATURE_E2E_STRICT: 'true' }; _do._configTs = Date.now();
    addMsg(db, { id: 'm1', sender_id: 'alice', ciphertext: 'E2E1:orig', ts: 1 });
    const alice = new MockWS(); const bob = new MockWS();
    _do.sessions.set(alice, sess('alice')); _do.sessions.set(bob, sess('bob'));
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'm1', new_text: 'en clair' });
    expect(alice.frames('error')[0].code).toBe('e2e_required');
    expect(db._st.messages[0].ciphertext).toBe('E2E1:orig');
    expect(bob.frames('edit_message')).toHaveLength(0);
    await _do.handleMessage(alice, { type: 'edit_message', message_id: 'm1', ciphertext: 'E2E1:nouveau' });
    expect(db._st.messages[0].ciphertext).toBe('E2E1:nouveau');
    expect(bob.frames('edit_message')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('9. accusé de réception : renvoie l\'id local (client_id)', () => {
  it('l\'ack d\'un message porte le client_id envoyé par l\'app', async () => {
    const { _do } = await makeDO();
    const alice = new MockWS();
    _do.sessions.set(alice, sess('alice'));
    await _do.handleMessage(alice, { type: 'message', id: 'm_local_42', ciphertext: 'salut', mime: 'text/plain' });
    const ack = alice.frames('ack')[0];
    expect(ack).toBeTruthy();
    expect(ack.client_id).toBe('m_local_42');
  });
});
