/**
 * Tests api-worker.js — scheduled handler (4 cron) + helpers internals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
});

function makeQueue() {
  const sent = [];
  return {
    _sent: sent,
    send: vi.fn(async (msg) => { sent.push(msg); }),
  };
}

function fullEnv() {
  const env = ENV();
  env.LETTERS_QUEUE = makeQueue();
  env.TIMECAPSULE_QUEUE = makeQueue();
  env.MEMORY_LANE_QUEUE = makeQueue();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => null,
    all: async () => {
      if (sql.includes('letters_queue')) return { results: [{ id: 'l1' }, { id: 'l2' }] };
      if (sql.includes('time_capsules')) return { results: [{ id: 'c1' }] };
      if (sql.includes('FROM users WHERE last_seen')) return { results: [{ id: 'u1' }, { id: 'u2' }] };
      return { results: [] };
    },
    run: async () => ({ success: true }),
  }));
  env.APEX_CHAT_MEDIA = {
    put: vi.fn(async () => ({ success: true })),
  };
  return env;
}

describe('scheduled handler — 4 cron expressions', () => {
  it('cron "0 */1 * * *" → purge messages + R2', async () => {
    const env = fullEnv();
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '0 */1 * * *' }, env, ctx);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
  });

  it('cron "*/5 * * * *" → letters delivery + capsules', async () => {
    const env = fullEnv();
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '*/5 * * * *' }, env, ctx);
    expect(ctx.waitUntil.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('cron "0 9 * * *" → memory lane', async () => {
    const env = fullEnv();
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '0 9 * * *' }, env, ctx);
    expect(ctx.waitUntil.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('cron "0 3 * * *" → backup + cleanup audit + cleanup ratelimit', async () => {
    const env = fullEnv();
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '0 3 * * *' }, env, ctx);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('cron inconnu → no-op', async () => {
    const env = fullEnv();
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '* * * * *' }, env, ctx);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it('cron "*/5 * * * *" sans queues → catch silent', async () => {
    const env = ENV();
    delete env.LETTERS_QUEUE;
    delete env.TIMECAPSULE_QUEUE;
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      all: async () => ({ results: [{ id: 'l1' }] }),
      first: async () => null,
      run: async () => ({}),
    }));
    const ctx = { waitUntil: vi.fn() };
    await expect(worker.scheduled({ cron: '*/5 * * * *' }, env, ctx)).resolves.toBeUndefined();
  });
});
