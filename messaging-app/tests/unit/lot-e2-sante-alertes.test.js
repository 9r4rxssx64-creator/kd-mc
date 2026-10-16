// @vitest-environment node
/**
 * Lot E2 (audit A5, F5 + F6) — Kevin apprend une panne serveur.
 *
 * F6 : /api/health VÉRIFIE (D1 réelle, Durable Object réel, fraîcheur de la sauvegarde) et rend
 *      503 quand un composant tombe — sans jamais exposer un message d'erreur ou un détail interne.
 * F5 : l'alerte de durabilité du ConversationDO (échec d'écriture D1) porte `queue_type` et
 *      atteint donc le relais de télémétrie au lieu d'être jetée comme « unknown ».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { checkHealth, _resetHealthCache, HEALTH_CACHE_MS, HEALTH_TIMEOUT_MS, BACKUP_STALE_MS } from '../../workers/api-worker.js';
import './_support/do-hibernation.js';   // lot E1 : API d'hibernation du runtime DO
import { ConversationDO, BroadcastDO } from '../../workers/durable-objects/ConversationDO.js';
import { makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

beforeEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); _resetHealthCache(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

/** Un VRAI BroadcastDO derrière un faux espace de noms (le chemin de santé est celui de la prod). */
function vraiBroadcast() {
  const data = new Map();
  const state = { storage: { get: async (k) => data.get(k) }, blockConcurrencyWhile: async (fn) => fn() };
  const instance = new BroadcastDO(state, {});
  return { idFromName: vi.fn((n) => n), get: vi.fn(() => ({ fetch: vi.fn((u) => instance.fetch(new Request(u))) })) };
}
const sante = async (env) => {
  const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/health' }), env, { waitUntil() {} });
  return { status: r.status, body: await r.json() };
};
const noteBackup = (DB, ts) => DB.raw.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES ('backup_last_ok', ?, 1, 't')").run(JSON.stringify({ ts }));

describe('F6 — /api/health vérifie vraiment', () => {
  it('D1 réelle + vrai Durable Object → 200, réponse SANS détail interne', async () => {
    const DB = d1Reel();
    noteBackup(DB, Date.now() - 3600000);
    const { status, body } = await sante({ APEX_CHAT_DB: DB, BROADCAST_DO: vraiBroadcast() });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, ts: expect.any(Number), version: expect.stringMatching(/^\d+\.\d+\.\d+$/), checks: { d1: 'ok', do: 'ok', backup: 'ok' } });
    expect(Object.keys(body).sort()).toEqual(['checks', 'ok', 'ts', 'version']);   // la version n'est pas un secret : elle prouve le déploiement
  });

  it('D1 en panne → 503 « d1: ko », et le message d\'erreur ne sort PAS', async () => {
    const DB = { prepare: () => ({ first: async () => { throw new Error('D1_ERROR: secret interne table users'); } }) };
    const { status, body } = await sante({ APEX_CHAT_DB: DB, BROADCAST_DO: vraiBroadcast() });
    expect(status).toBe(503);
    expect(body.checks).toEqual({ d1: 'ko', do: 'ok', backup: 'unknown' });
    expect(JSON.stringify(body)).not.toMatch(/D1_ERROR|secret|users/);
  });

  it('Durable Object injoignable, en erreur, ou qui répond autre chose → 503 « do: ko »', async () => {
    const DB = d1Reel();
    const ns = (impl) => ({ idFromName: () => 'h', get: () => ({ fetch: impl }) });
    for (const impl of [async () => { throw new Error('DO overloaded'); }, async () => new Response('x', { status: 500 }),
      async () => new Response('{"ok":false}'), async () => new Response('pas du json')]) {
      _resetHealthCache();
      const { status, body } = await sante({ APEX_CHAT_DB: DB, BROADCAST_DO: ns(impl) });
      expect(status).toBe(503);
      expect(body.checks.do).toBe('ko');
      expect(JSON.stringify(body)).not.toMatch(/overloaded/);
    }
    _resetHealthCache();
    expect((await sante({ APEX_CHAT_DB: DB })).status).toBe(503);   // binding absent
  });

  it('un appel qui ne répond jamais est coupé à 2 s (la santé ne pend pas)', async () => {
    vi.useFakeTimers();
    const DB = d1Reel();
    const pend = { idFromName: () => 'h', get: () => ({ fetch: () => new Promise(() => {}) }) };
    const p = checkHealth({ APEX_CHAT_DB: DB, BROADCAST_DO: pend });
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS + 10);
    const body = await p;
    expect(body.ok).toBe(false);
    expect(body.checks).toMatchObject({ d1: 'ok', do: 'ko' });
  });

  it('sauvegarde de plus de 26 h → « backup: stale » (le serveur reste 200 : la sonde, elle, alerte)', async () => {
    const DB = d1Reel();
    noteBackup(DB, Date.now() - BACKUP_STALE_MS - 60000);
    const { status, body } = await sante({ APEX_CHAT_DB: DB, BROADCAST_DO: vraiBroadcast() });
    expect(status).toBe(200);
    expect(body.checks.backup).toBe('stale');
    _resetHealthCache();
    DB.raw.prepare("UPDATE system_config SET value='pas du json' WHERE key='backup_last_ok'").run();
    expect((await checkHealth({ APEX_CHAT_DB: DB, BROADCAST_DO: vraiBroadcast() })).checks.backup).toBe('unknown');
  });

  it('« tout va bien » gardé 15 s (sentinelle client bon marché) ; un échec n\'est JAMAIS gardé', async () => {
    let lectures = 0;
    let panne = false;
    const DB = { prepare: () => ({ first: async () => { lectures++; if (panne) throw new Error('x'); return null; } }) };
    const env = { APEX_CHAT_DB: DB, BROADCAST_DO: vraiBroadcast() };
    const t0 = 1_000_000;
    expect((await checkHealth(env, t0)).ok).toBe(true);
    expect((await checkHealth(env, t0 + HEALTH_CACHE_MS - 1)).ok).toBe(true);
    expect(lectures).toBe(1);
    panne = true;
    expect((await checkHealth(env, t0 + HEALTH_CACHE_MS + 1)).ok).toBe(false);
    expect((await checkHealth(env, t0 + HEALTH_CACHE_MS + 2)).ok).toBe(false);
    expect(lectures).toBe(3);
    panne = false;
    expect((await checkHealth(env, t0 + HEALTH_CACHE_MS + 3)).ok).toBe(true);
  });
});

describe('F5 — l\'alerte de durabilité du DO arrive jusqu\'au relais', () => {
  it('échec d\'écriture D1 dans le DO → message typé « telemetry » → le consommateur le relaie', async () => {
    const data = new Map();
    const state = {
      id: { toString: () => 'conv-do' },
      storage: { get: vi.fn(async (k) => data.get(k)), put: vi.fn(async (k, v) => { data.set(k, v); }), delete: vi.fn(async (k) => { data.delete(k); }), setAlarm: vi.fn(async () => {}) },
      blockConcurrencyWhile: vi.fn(async (fn) => { await fn(); }),
    };
    const db = {
      prepare: vi.fn(() => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) })),
      batch: vi.fn(async () => { throw new Error('D1 batch down'); }),
    };
    const sent = [];
    const env = { JWT_SIGN_KEY: 's', APEX_CHAT_DB: db, TELEMETRY_QUEUE: { send: vi.fn(async (m) => { sent.push(m); }) },
      APEX_HANDOFF_FIREBASE_URL: 'https://fb.example', APEX_HANDOFF_TOKEN: 't' };
    const d = new ConversationDO(state, env);
    await new Promise((r) => setTimeout(r, 5));
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = { send: vi.fn(), close: vi.fn() };
    d.sessions.set(ws, { userId: 'u1', deviceId: 'd1', convId: 'conv1', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });
    await d.handleMessage(ws, { type: 'message', ciphertext: 'E2E1:abc' });
    await d.flushToD1();
    await new Promise((r) => setTimeout(r, 5));
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) expect(m).toMatchObject({ queue_type: 'telemetry', sentinel: 'do-flush-error', severity: 'err' });
    // le VRAI consommateur : le message n'est plus classé « unknown » et jeté, il part au relais
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const msg = { body: sent[0], ack: vi.fn(), retry: vi.fn() };
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith('Queue type inconnu:', expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('fb.example/apex/ax_telemetry_in.json');
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({ sentinel: 'do-flush-error', src: 'apex-chat' });
  });
});
