// @vitest-environment node
// Lot C2 (audit A4 P1-2 / A6-16, 15.10.2026) — routes du serveur sur un VRAI SQLite bâti avec
// toutes les migrations (d1Reel), jamais une fausse base qui accepte tout.
//  A4 P1-2 : le muet est gardé par le serveur (PUT /api/conversations/:id/mute, table conv_mutes)
//            et le temps réel ne notifie plus un membre muet (bout en bout : route → ConversationDO).
//  A6-16   : les statuts 24 h existent côté serveur : publiés, vus par les contacts mutuels,
//            supprimables par l'auteur, effacés à l'échéance (cron) et avec le compte.
// Sabotage : retirer le filtre muet du DO, la route, ou la purge → ces tests échouent.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { purgeExpiredStories } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import './_support/do-hibernation.js'; // Lot E1 : API d'hibernation du runtime (acceptWebSocket, attachments, réveil)
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

const CONV = 'g_c2';
function seed() {
  const DB = d1Reel();
  DB.raw.prepare(`INSERT INTO conversations (id,type,name,created_by,created_at,sharded_to_do,last_msg_ts) VALUES (?,?,?,?,?,?,?)`).run(CONV, 'group', 'Famille', 'alice', 1, 'do_' + CONV, 1);
  ['alice', 'bob', 'carol', 'dan'].forEach((u, i) => {
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
      VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(u, u, 'Nom ' + u, '+3360000000' + i, 'h_' + u);
    if (u !== 'dan') DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,joined_at) VALUES (?,?,1)`).run(CONV, u);
  });
  return DB;
}
const env = (DB) => ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: { delete: vi.fn(async () => {}) } });
async function call(DB, uid, method, path, body) {
  const token = await makeJWT({ sub: uid, iat: Math.floor(Date.now() / 1000) - 5 });
  const r = await worker.fetch(makeRequest({ method, path, body, token }), env(DB), { waitUntil() {} });
  return { status: r.status, j: await r.json() };
}
/** Destinataires des notifications d'un message, calculés par le VRAI ConversationDO (aucune socket ouverte). */
async function notified(DB, sender = 'alice') {
  const d = new ConversationDO({ storage: { get: async () => undefined, put: async () => {}, list: async () => new Map() }, blockConcurrencyWhile: async (f) => f() }, { APEX_CHAT_DB: DB });
  const spy = vi.spyOn(d, '_pushToUsers').mockResolvedValue();
  await d.notifyOfflineMembers({ id: 'm1', conv_id: CONV, sender_id: sender, ts: Date.now(), mime: 'text/plain' });
  return spy.mock.calls.length ? spy.mock.calls[0][0].sort() : [];
}

describe('A4 P1-2 — muet gardé par le serveur', () => {
  it('bob met le groupe en muet → il n\'est plus notifié, carol oui ; il le retrouve dans sa liste', async () => {
    const DB = seed();
    expect(await notified(DB)).toEqual(['bob', 'carol']);
    const r = await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true });
    expect(r.status, JSON.stringify(r.j)).toBe(200);
    expect(r.j).toMatchObject({ ok: true, muted: true, muted_until: null });
    expect(await notified(DB)).toEqual(['carol']);
    const list = await call(DB, 'bob', 'GET', '/api/conversations');
    expect(list.j.conversations.find((c) => c.id === CONV)).toMatchObject({ muted: true, muted_until: null });
    const listCarol = await call(DB, 'carol', 'GET', '/api/conversations');
    expect(listCarol.j.conversations.find((c) => c.id === CONV)).toMatchObject({ muted: false });
    // Réactivation : bob est de nouveau notifié.
    const un = await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: false });
    expect(un.j).toMatchObject({ ok: true, muted: false });
    expect(await notified(DB)).toEqual(['bob', 'carol']);
  });

  it('muet pour une durée : actif avant l\'échéance, plus après', async () => {
    const DB = seed();
    const until = Date.now() + 8 * 3600000;
    const r = await call(DB, 'carol', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true, until });
    expect(r.j.muted_until).toBe(until);
    expect(await notified(DB)).toEqual(['bob']);
    DB.raw.prepare('UPDATE conv_mutes SET muted_until=? WHERE user_id=?').run(Date.now() - 1, 'carol');
    expect(await notified(DB)).toEqual(['bob', 'carol']);
    const list = await call(DB, 'carol', 'GET', '/api/conversations');
    expect(list.j.conversations.find((c) => c.id === CONV).muted).toBe(false);
  });

  it('refus propres : non-membre, corps invalide, durée invalide, sans jeton', async () => {
    const DB = seed();
    expect((await call(DB, 'dan', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true })).status).toBe(404);
    expect((await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: 'oui' })).status).toBe(400);
    expect((await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, [1])).status).toBe(400);
    for (const until of [Date.now() - 10, 'demain', Date.now() + 400 * 86400000]) {
      expect((await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true, until })).status).toBe(400);
    }
    expect((await call(DB, 'bob', 'PUT', `/api/conversations/${'x'.repeat(130)}/mute`, { muted: true })).status).toBe(400);
    const anon = await worker.fetch(makeRequest({ method: 'PUT', path: `/api/conversations/${CONV}/mute`, body: { muted: true } }), env(DB), { waitUntil() {} });
    expect(anon.status).toBe(401);
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM conv_mutes').get().c).toBe(0);
  });

  it('un muet ne coupe jamais les autres : bob ne peut pas rendre carol muette', async () => {
    const DB = seed();
    await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true, user_id: 'carol' });
    expect(DB.raw.prepare('SELECT user_id FROM conv_mutes').all().map((r) => r.user_id)).toEqual(['bob']);
  });

  it('table absente (avant migration) : la liste marche, tout le monde est notifié', async () => {
    const DB = seed();
    DB.raw.exec('DROP TABLE conv_mutes');
    const list = await call(DB, 'bob', 'GET', '/api/conversations');
    expect(list.status).toBe(200);
    expect(list.j.conversations.find((c) => c.id === CONV).muted).toBe(false);
    expect(await notified(DB)).toEqual(['bob', 'carol']);
  });

  it('suppression du compte : ses muets et ses statuts sont effacés', async () => {
    const DB = seed();
    await call(DB, 'bob', 'PUT', `/api/conversations/${CONV}/mute`, { muted: true });
    await call(DB, 'bob', 'POST', '/api/stories', { ciphertext: JSON.stringify({ t: 'Coucou' }), mime: 'application/x-apex-story' });
    const r = await call(DB, 'bob', 'DELETE', '/api/users/me', { confirm: 'SUPPRIMER' });
    expect(r.status, JSON.stringify(r.j)).toBe(200);
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM conv_mutes WHERE user_id='bob'").get().c).toBe(0);
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM stories WHERE author_id='bob'").get().c).toBe(0);
  });
});

describe('A6-16 — statuts 24 h réellement partagés', () => {
  function mutual(DB, a, b) {
    for (const [x, y] of [[a, b], [b, a]]) DB.raw.prepare('INSERT INTO contacts (user_id,contact_id,mutual_at,created_at) VALUES (?,?,1,1)').run(x, y);
  }
  it('publié par alice → vu par bob (contact mutuel), pas par dan ; supprimable ; purgé à l\'échéance', async () => {
    const DB = seed();
    mutual(DB, 'alice', 'bob');
    const pub = await call(DB, 'alice', 'POST', '/api/stories', { ciphertext: JSON.stringify({ t: 'Bonne journée' }), mime: 'application/x-apex-story' });
    expect(pub.status).toBe(200);
    const id = pub.j.story.id;
    const lb = await call(DB, 'bob', 'GET', '/api/stories');
    expect(lb.j.stories.map((s) => s.id)).toEqual([id]);
    const v = await call(DB, 'bob', 'GET', '/api/stories/' + id);
    expect(JSON.parse(v.j.story.ciphertext).t).toBe('Bonne journée');
    expect((await call(DB, 'dan', 'GET', '/api/stories')).j.stories).toEqual([]);
    expect((await call(DB, 'dan', 'GET', '/api/stories/' + id)).status).toBe(404);
    // Seule l'autrice supprime.
    expect((await call(DB, 'bob', 'DELETE', '/api/stories/' + id)).status).toBe(404);
    expect((await call(DB, 'alice', 'DELETE', '/api/stories/' + id)).j).toMatchObject({ ok: true, deleted: id });
    expect((await call(DB, 'bob', 'GET', '/api/stories')).j.stories).toEqual([]);
    // Purge : une ligne expirée disparaît, une ligne valide reste.
    await call(DB, 'alice', 'POST', '/api/stories', { ciphertext: 'a', mime: 'application/x-apex-story' });
    DB.raw.prepare(`INSERT INTO stories (id, author_id, ciphertext, mime, ts, expires_at, views) VALUES ('old','alice','x','text/plain',1,2,'[]')`).run();
    expect(await purgeExpiredStories({ APEX_CHAT_DB: DB })).toBe(1);
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM stories').get().c).toBe(1);
    expect(await purgeExpiredStories({ APEX_CHAT_DB: { prepare() { throw new Error('D1 down'); } } })).toMatch(/^erreur/);
    const noAuth = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/stories/x' }), env(DB), { waitUntil() {} });
    expect(noAuth.status).toBe(401);
  });

  it('le cron horaire purge les statuts expirés', async () => {
    const DB = seed();
    DB.raw.prepare(`INSERT INTO stories (id, author_id, ciphertext, mime, ts, expires_at, views) VALUES ('old','alice','x','text/plain',1,2,'[]')`).run();
    await worker.scheduled({ cron: '0 */1 * * *' }, env(DB), { waitUntil() {} });
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM stories').get().c).toBe(0);
  });
});
