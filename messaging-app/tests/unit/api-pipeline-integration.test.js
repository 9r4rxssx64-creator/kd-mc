/**
 * INTÉGRATION PIPELINE COMPLET — vrai code serveur, en process, sans réseau.
 * ════════════════════════════════════════════════════════════════════════
 * Kevin (2026-06-09) : « trouve des solutions pour les tests réels. »
 *
 * La prod a le backdoor OTP de test DÉSACTIVÉ (sécurité) → le test live se skip.
 * Ici on exécute le VRAI code serveur (handleVerifyOtp + handleCreateConversation
 * + captureConnection + getAuthUser) PARTAGÉ avec le VRAI ConversationDO, sur un
 * D1 EN MÉMOIRE unique. Parcours réel de bout en bout :
 *   auth Alice + Bob → création du DM → upload photo (R2) → message TEXTE et
 *   PHOTO livrés d'un client à l'autre via le moteur + persistés en D1.
 * Déterministe, hors-ligne, dans le gate vitest. Aucune dépendance prod.
 */
import { describe, it, expect } from 'vitest';
import { handleVerifyOtp, handleCreateConversation, handleMediaUpload } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV, makeRequest } from './api-worker-helpers.js';

// ── D1 EN MÉMOIRE, STATEFUL, partagé handlers + Durable Object ──────────────
function makeStatefulDB() {
  const s = { users: [], conversations: [], members: [], messages: [], media: [], connections: [] };
  const norm = (p) => String(p || '').replace(/\D/g, '');
  function run(sql, a) {
    if (sql.includes('INSERT INTO users')) {
      // (id, pseudo, real_name, phone, phone_hash, ...)
      const [id, pseudo, real_name, phone] = a;
      if (s.users.some(u => u.pseudo === pseudo)) return { success: true }; // ON CONFLICT(pseudo) DO NOTHING
      if (s.users.some(u => u.phone === phone)) return { success: true };
      s.users.push({ id, pseudo, real_name, phone, phone_hash: a[4], is_admin: 0, status: 'active', merged_into: null, last_seen: 0, last_force_logout_at: null, is_banned: 0 });
      return { success: true };
    }
    if (sql.includes('INSERT INTO conversations')) {
      const [id, type, name, created_by, created_at] = a;
      s.conversations.push({ id, type, name, created_by, created_at, archived_at: null });
      return { success: true };
    }
    if (sql.includes('INSERT OR IGNORE INTO conversation_members')) {
      const [conv_id, user_id, , joined_at] = a;
      if (!s.members.some(m => m.conv_id === conv_id && m.user_id === user_id)) {
        s.members.push({ conv_id, user_id, role: sql.includes("'owner'") ? 'owner' : 'member', joined_at });
      }
      return { success: true };
    }
    if (sql.includes('INSERT INTO media')) { s.media.push({ id: a[0] }); return { success: true }; }
    if (sql.includes('UPDATE users SET merged_into')) { return { success: true }; }
    if (sql.includes('UPDATE conversations SET')) { return { success: true }; }
    return { success: true }; // auditLog, connections, etc. → no-op sûr
  }
  function first(sql, a) {
    if (sql.includes('SELECT * FROM users WHERE phone=?')) return s.users.find(u => u.phone === a[0]) || null;
    if (sql.includes('FROM users WHERE id=?') && sql.includes('last_force_logout_at')) {
      const u = s.users.find(x => x.id === a[0]);
      return u ? { last_force_logout_at: u.last_force_logout_at, is_banned: u.is_banned, status: u.status, phone: u.phone } : null;
    }
    if (sql.includes('SELECT status FROM users WHERE id=?')) {
      const u = s.users.find(x => x.id === a[0]); return u ? { status: u.status } : null;
    }
    if (sql.includes('SELECT merged_into FROM users WHERE id=?')) {
      const u = s.users.find(x => x.id === a[0]); return u ? { merged_into: u.merged_into } : null;
    }
    if (sql.includes("status != 'deleted'") && sql.includes('phone LIKE')) return null; // pas de doublon
    if (sql.includes('SELECT id FROM users WHERE is_admin=1')) return s.users.find(u => u.is_admin) || null;
    if (sql.includes('SELECT pseudo, real_name FROM users WHERE id=?')) {
      const u = s.users.find(x => x.id === a[0]); return u ? { pseudo: u.pseudo, real_name: u.real_name } : null;
    }
    // Dédup DM : 2 membres dans une même conv dm non archivée
    if (sql.includes('FROM conversations c') && sql.includes('conversation_members a')) {
      const [self, peer] = a;
      for (const c of s.conversations) {
        if (c.type !== 'dm' || c.archived_at) continue;
        const has = (uid) => s.members.some(m => m.conv_id === c.id && m.user_id === uid);
        if (has(self) && has(peer)) return { id: c.id, type: c.type, name: c.name, created_at: c.created_at };
      }
      return null;
    }
    if (sql.includes('FROM connections WHERE user_id=?')) return null;
    return null;
  }
  function all(sql, a) {
    if (sql.includes('FROM system_config')) return { results: [] };
    if (sql.includes('SELECT user_id FROM conversation_members WHERE conv_id=?')) {
      return { results: s.members.filter(m => m.conv_id === a[0]).map(m => ({ user_id: m.user_id })) };
    }
    if (sql.includes('FROM messages WHERE conv_id=?')) {
      return { results: s.messages.filter(m => m.conv_id === a[0]).slice().sort((x, y) => y.ts - x.ts).slice(0, 50) };
    }
    return { results: [] };
  }
  const db = {
    _s: s,
    prepare(sql) {
      const stmt = { _a: [], bind(...x) { return { ...stmt, _a: x }; },
        async run() { return run(sql, this._a); },
        async first() { return first(sql, this._a); },
        async all() { return all(sql, this._a); } };
      return stmt;
    },
    async batch(stmts) {
      for (const st of stmts) {
        // flushToD1 : INSERT INTO messages (id, conv_id, sender_id, ciphertext, mime, ts, ...)
        if (st._a && st._a.length >= 6) {
          const [id, conv_id, sender_id, ciphertext, mime, ts] = st._a;
          s.messages.push({ id, conv_id, sender_id, ciphertext, mime, ts });
        }
      }
      return { success: true, count: stmts.length };
    },
  };
  return db;
}

function doState() {
  const store = new Map();
  return { storage: { async get(k) { return store.get(k); }, async put(k, v) { store.set(k, v); } },
    async blockConcurrencyWhile(fn) { return fn(); } };
}
function fakeWs() {
  return { received: [], send(d) { try { this.received.push(JSON.parse(d)); } catch { this.received.push(d); } },
    addEventListener() {}, all(t) { return this.received.filter(m => m.type === t); }, last(t) { return [...this.received].reverse().find(m => m.type === t); } };
}
async function authUser(env, phone, name, pseudo) {
  const res = await handleVerifyOtp(makeRequest({ method: 'POST', path: '/api/auth/verify-otp', body: { phone, otp: '000000', name, pseudo } }), env);
  const d = await res.json();
  return { status: res.status, token: d.token, id: d.user && d.user.id, body: d };
}

describe('Pipeline complet en process (auth → conv → message + photo) — vrai code serveur', () => {
  it('Alice et Bob s\'authentifient, créent UN DM, et le message TEXTE + PHOTO sont livrés et persistés', async () => {
    const env = ENV({ APEX_CHAT_DB: makeStatefulDB() });

    // 1) AUTH réelle des 2 clients (vrai handleVerifyOtp, OTP test activé en env de test)
    const A = await authUser(env, '+33600000091', 'Alice E2E', 'alice_pipe');
    const B = await authUser(env, '+33600000092', 'Bob E2E', 'bob_pipe');
    expect(A.status, 'auth Alice : ' + JSON.stringify(A.body)).toBe(200);
    expect(B.status, 'auth Bob : ' + JSON.stringify(B.body)).toBe(200);
    expect(A.token && B.token).toBeTruthy();
    expect(A.id).not.toBe(B.id);

    // 2) Bob crée le DM avec Alice (vrai handleCreateConversation)
    const convRes = await handleCreateConversation(
      makeRequest({ method: 'POST', path: '/api/conversations', token: B.token, body: { type: 'dm', members: [A.id] } }), env);
    expect(convRes.status, 'create conv').toBe(200);
    const convBody = await convRes.json();
    const convId = (convBody.conversation && convBody.conversation.id) || convBody.id;
    expect(convId, 'convId : ' + JSON.stringify(convBody)).toBeTruthy();
    // Les 2 vrais comptes sont membres
    const mem = env.APEX_CHAT_DB._s.members.filter(m => m.conv_id === convId).map(m => m.user_id).sort();
    expect(mem).toEqual([A.id, B.id].sort());

    // 3) Dédup : re-créer le même DM renvoie LA MÊME conversation (1 conv/contact)
    const conv2 = await (await handleCreateConversation(
      makeRequest({ method: 'POST', path: '/api/conversations', token: A.token, body: { type: 'dm', members: [B.id] } }), env)).json();
    const conv2Id = (conv2.conversation && conv2.conversation.id) || conv2.id;
    expect(conv2Id).toBe(convId);

    // 4) Le VRAI ConversationDO route les messages sur le MÊME D1
    const DO = new ConversationDO(doState(), env);
    await new Promise(r => setTimeout(r, 0));
    const wsA = fakeWs(), wsB = fakeWs();
    DO.sessions.set(wsA, { userId: A.id, deviceId: 'a', convId, messageCount: 0, lastReset: Date.now() });
    DO.sessions.set(wsB, { userId: B.id, deviceId: 'b', convId, messageCount: 0, lastReset: Date.now() });

    // TEXTE Bob → Alice
    await DO.handleMessage(wsB, { type: 'message', ciphertext: 'Coucou Alice', mime: 'text/plain' });
    await DO.flushToD1();
    expect(wsA.last('message')?.ciphertext).toBe('Coucou Alice');
    expect(wsB.last('ack')).toBeTruthy();

    // 5) PHOTO : Bob upload (vrai handleMediaUpload → R2) puis envoie le marqueur
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const upReq = new Request('https://api.apex/api/media', {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'x-file-name': 'photo.png', Authorization: 'Bearer ' + B.token },
      body: png,
    });
    const upRes = await handleMediaUpload(upReq, env);
    expect(upRes.status, 'upload média').toBe(200);
    const media = await upRes.json();
    expect(media.url).toMatch(/^\/api\/media\//);
    const marker = 'APXMEDIA1:' + JSON.stringify({ u: media.url, m: 'image/png', n: 'photo.png', s: media.size, c: '' });
    await DO.handleMessage(wsB, { type: 'message', ciphertext: marker, mime: 'image/png' });
    await DO.flushToD1();
    const photoFrame = wsA.last('message');
    expect(photoFrame.mime).toBe('image/png');
    expect(photoFrame.ciphertext).toContain(media.url);

    // 6) Durabilité : texte + photo persistés en D1 (récupérables à la reconnexion)
    const stored = env.APEX_CHAT_DB._s.messages.filter(m => m.conv_id === convId);
    expect(stored.length).toBe(2);
    expect(stored.some(m => m.ciphertext === 'Coucou Alice')).toBe(true);
    expect(stored.some(m => m.mime === 'image/png')).toBe(true);
  });
});
