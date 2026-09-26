/**
 * Tests api-worker.js — Médias R2 (v1.1.186)
 * Upload (photos/vidéos/fichiers tous formats) + service depuis R2.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

function dbOk() {
  // getAuthUser (statut actif) + insert media + lookup media
  const store = { media: null };
  return {
    _store: store,
    prepare: vi.fn((sql) => ({
      _a: [],
      bind(...a) { this._a = a; return this; },
      async first() {
        if (sql.includes('SELECT last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active' };
        if (sql.includes('FROM media WHERE id')) return store.media; // r2_key, mime, owner_id
        // requête d'autorisation « conversation partagée » : contrôlée par store.shared
        if (sql.includes('conversation_members a JOIN conversation_members b')) return store.shared ? { 1: 1 } : null;
        return null;
      },
      async run() {
        if (sql.includes('INSERT INTO media')) {
          store.media = { r2_key: this._a[2], mime: this._a[4], owner_id: this._a[1] };
        }
        return { success: true };
      },
      async all() { return { results: [] }; },
    })),
  };
}

async function tok() { return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) }); }

describe('Médias R2', () => {
  it('refuse l\'upload non authentifié (401)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbOk() });
    const req = new Request('https://api.apex/api/media', { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array([1, 2, 3]) });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('upload une vidéo → R2 + media table → renvoie une URL', async () => {
    const r2 = ENV().APEX_CHAT_MEDIA;
    const env = ENV({ APEX_CHAT_DB: dbOk(), APEX_CHAT_MEDIA: r2 });
    const token = await tok();
    const body = new Uint8Array(2048).fill(7);
    const req = new Request('https://api.apex/api/media', {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', 'x-file-name': 'clip.mp4', 'Authorization': 'Bearer ' + token },
      body,
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.url).toMatch(/^\/api\/media\//);
    expect(d.mime).toBe('video/mp4');
    expect(d.size).toBe(2048);
    expect(r2._store.size).toBe(1);   // stocké dans R2
  });

  it('refuse un fichier > 100 Mo (413)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbOk() });
    const token = await tok();
    // simule un gros fichier via un arrayBuffer factice (on ne crée pas 100 Mo réels)
    const big = { byteLength: 101 * 1024 * 1024 };
    const req = {
      headers: new Map([['content-type', 'video/mp4'], ['x-file-name', 'big.mp4'], ['authorization', 'Bearer ' + token]]),
      url: 'https://api.apex/api/media',
      method: 'POST',
      arrayBuffer: async () => big,
    };
    // adapte headers.get
    req.headers.get = (k) => req.headers instanceof Map ? (new Map([...req.headers].map(([a, b]) => [a.toLowerCase(), b]))).get(k.toLowerCase()) : null;
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(413);
  });

  it('sert le média depuis R2 (GET /api/media/:id)', async () => {
    const db = dbOk();
    const r2 = ENV().APEX_CHAT_MEDIA;
    const env = ENV({ APEX_CHAT_DB: db, APEX_CHAT_MEDIA: r2 });
    const token = await tok();
    // upload d'abord
    await worker.fetch(new Request('https://api.apex/api/media', {
      method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'p.png', 'Authorization': 'Bearer ' + token },
      body: new Uint8Array([9, 9, 9]),
    }), env);
    const key = db._store.media.r2_key;
    // get
    const res = await worker.fetch(new Request('https://api.apex/api/media/abc123?token=' + token, { method: 'GET' }), env);
    expect(res.status).toBe(200); // le propriétaire (kevin) accède à son propre média
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(r2._store.has(key)).toBe(true);
  });

  it('SÉCU (IDOR) : refuse un média à un non-propriétaire sans conversation partagée (403)', async () => {
    const db = dbOk();
    const r2 = ENV().APEX_CHAT_MEDIA;
    const env = ENV({ APEX_CHAT_DB: db, APEX_CHAT_MEDIA: r2 });
    // upload par kevin
    const ownerTok = await tok();
    await worker.fetch(new Request('https://api.apex/api/media', {
      method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'p.png', 'Authorization': 'Bearer ' + ownerTok },
      body: new Uint8Array([9, 9, 9]),
    }), env);
    // un AUTRE utilisateur (mallory) sans conversation partagée → 403
    db._store.shared = false;
    const otherTok = await makeJWT({ sub: 'mallory', iat: Math.floor(Date.now() / 1000) });
    const res403 = await worker.fetch(new Request('https://api.apex/api/media/abc123?token=' + otherTok, { method: 'GET' }), env);
    expect(res403.status).toBe(403);
    // mais s'il PARTAGE une conversation avec le propriétaire → 200
    db._store.shared = true;
    const res200 = await worker.fetch(new Request('https://api.apex/api/media/abc123?token=' + otherTok, { method: 'GET' }), env);
    expect(res200.status).toBe(200);
  });
});
