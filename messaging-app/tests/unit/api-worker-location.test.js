/**
 * Tests api-worker.js — Localisation / trajet (v1.1.187)
 * GET /api/location/:userId : historique depuis user_activity (admin ou soi-même).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

function db(activityRows, users) {
  return {
    prepare: vi.fn((sql) => ({
      _a: [],
      bind(...a) { this._a = a; return this; },
      async first() {
        if (sql.includes('SELECT last_force_logout_at')) {
          const u = (users || []).find(x => x.id === this._a[0]);
          return u ? { last_force_logout_at: null, is_banned: 0, status: u.status || 'active' } : { last_force_logout_at: null, is_banned: 0, status: 'active' };
        }
        if (sql.includes('SELECT merged_into FROM users')) {
          const u = (users || []).find(x => x.id === this._a[0]);
          return { merged_into: (u && u.merged_into) || null };
        }
        if (sql.includes('SELECT last_lat, last_lng')) return { last_lat: 1, last_lng: 2, last_geo_label: 'Monaco', last_seen: 99 };
        return null;
      },
      async all() {
        if (sql.includes('FROM user_activity')) return { results: activityRows.slice() };
        return { results: [] };
      },
      async run() { return { success: true }; },
    })),
  };
}

describe('GET /api/location/:userId', () => {
  it('refuse un non-admin pour un AUTRE user (403)', async () => {
    const env = ENV({ APEX_CHAT_DB: db([], [{ id: 'laurence' }]) });
    const token = await makeJWT({ sub: 'kevinX', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/location/laurence', token }), env);
    expect(res.status).toBe(403);
  });

  it('admin obtient le trajet (points chronologiques + dédup)', async () => {
    const rows = [
      // renvoyés DESC par la requête ; le handler les remet ASC
      { lat: 43.74, lng: 7.43, ts: 3000, geo_label: 'C' },
      { lat: 43.7400, lng: 7.4300, ts: 2900, geo_label: 'C' }, // quasi-identique & <60s → dédup
      { lat: 43.70, lng: 7.40, ts: 1000, geo_label: 'A' },
    ];
    const env = ENV({ APEX_CHAT_DB: db(rows, [{ id: 'laurence' }]) });
    const token = await makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/location/laurence?limit=500', token }), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    // ASC : premier point = le plus ancien (ts 1000)
    expect(d.points[0].ts).toBe(1000);
    // dédup du point quasi-identique → 2 points au lieu de 3
    expect(d.points.length).toBe(2);
    expect(d.last.label).toBe('Monaco');
  });

  it('soi-même peut voir son propre trajet', async () => {
    const env = ENV({ APEX_CHAT_DB: db([{ lat: 1, lng: 2, ts: 5, geo_label: null }], [{ id: 'me' }]) });
    const token = await makeJWT({ sub: 'me', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const res = await worker.fetch(makeRequest({ method: 'GET', path: '/api/location/me', token }), env);
    expect(res.status).toBe(200);
  });
});
