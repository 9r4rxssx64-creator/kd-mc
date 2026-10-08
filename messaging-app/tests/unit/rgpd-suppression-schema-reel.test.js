// @vitest-environment node
/**
 * Revue 08.10.2026 — DELETE /api/users/me répondait « supprimé » alors que la
 * base REFUSAIT l'anonymisation (NULL dans des colonnes NOT NULL) : nom, numéro
 * et session restaient. Le test unitaire d'avant utilisait une fausse base qui
 * acceptait tout. Celui-ci rejoue la VRAIE route sur le VRAI schéma.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

function seed(db, id, pseudo, phone) {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, pseudo, 'Nom ' + pseudo, phone, 'h_' + id);
}

describe('Suppression de compte sur le schéma réel', () => {
  it('compte réellement anonymisé, messages vidés, session coupée — même pour deux ids au même début', async () => {
    const DB = d1Reel();
    seed(DB, 'kdmc_marie_a', 'mariea', '+33611111111');
    seed(DB, 'kdmc_marie_b', 'marieb', '+33622222222');
    DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m1','c1','kdmc_marie_a','secret',1)`).run();
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: { delete: vi.fn(async () => {}) } });

    for (const id of ['kdmc_marie_a', 'kdmc_marie_b']) {
      const tok = await makeJWT({ sub: id, iat: Math.floor(Date.now() / 1000) - 5 });
      const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: { confirm: 'SUPPRIMER' }, token: tok }), env, { waitUntil() {} });
      const j = await r.json();
      expect(r.status, JSON.stringify(j)).toBe(200);
      expect(j.deleted).toBe(true);
      const u = DB.raw.prepare('SELECT status, phone, real_name, last_force_logout_at FROM users WHERE id=?').get(id);
      expect(u.status).toBe('deleted');
      expect(u.phone).not.toMatch(/^\+/);
      expect(u.real_name).toBe('');
      expect(u.last_force_logout_at).toBeGreaterThan(0);
      // L'ancien jeton ne vaut plus rien.
      const me = await worker.fetch(makeRequest({ path: '/api/users/me', token: tok }), env, { waitUntil() {} });
      expect(me.status).toBe(401);
    }
    const m = DB.raw.prepare("SELECT ciphertext, deleted_at FROM messages WHERE id='m1'").get();
    expect(m.ciphertext).toBe('');
    expect(m.deleted_at).toBeGreaterThan(0);
  });
});
