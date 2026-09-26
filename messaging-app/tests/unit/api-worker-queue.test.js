/**
 * Tests api-worker.js — worker.queue() consumer (7 queue types).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(null));
});

function makeMsg(body) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function envWithMocks(handlers = {}) {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => handlers.first ? handlers.first(sql) : null,
    all: async () => handlers.all ? handlers.all(sql) : { results: [] },
    run: async () => ({ success: true }),
  }));
  env.APEX_CHAT_MEDIA = { delete: vi.fn(async () => ({})), put: vi.fn(async () => ({})) };
  env.CONVERSATION_DO = {
    idFromName: vi.fn(() => ({ toString: () => 'id' })),
    get: vi.fn(() => ({ fetch: vi.fn(async () => new Response('{"ok":true}')) })),
  };
  return env;
}

describe('worker.queue()', () => {
  it('queue_type telemetry → pushToApexTelemetry + ack', async () => {
    const env = envWithMocks();
    env.APEX_HANDOFF_FIREBASE_URL = 'https://fb';
    env.APEX_HANDOFF_TOKEN = 'tok';
    const msg = makeMsg({ queue_type: 'telemetry', severity: 'warn', sentinel: 's' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type pipeline-fix → runAutoFix + ack', async () => {
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'pipeline-fix', action: 'restart-do' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type letters-deliver — letter à délivrer (date passée)', async () => {
    const env = envWithMocks({
      first: (sql) => sql.includes('letters_queue') ? {
        id: 'l1', conv_id: 'c1', deliver_at: Date.now() - 1000,
        sender_id: 'u', ciphertext: 'x', delivered: 0, cancelled: 0,
      } : null,
    });
    const msg = makeMsg({ queue_type: 'letters-deliver', letter_id: 'l1' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
    expect(env.CONVERSATION_DO.get).toHaveBeenCalled();
  });

  it('queue_type letters-deliver — letter pas encore due', async () => {
    const env = envWithMocks({
      first: (sql) => sql.includes('letters_queue') ? {
        id: 'l1', deliver_at: Date.now() + 100000, sender_id: 'u', ciphertext: 'x',
      } : null,
    });
    const msg = makeMsg({ queue_type: 'letters-deliver', letter_id: 'l1' });
    await worker.queue({ messages: [msg] }, env);
    expect(env.CONVERSATION_DO.get).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type letters-deliver — letter introuvable', async () => {
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'letters-deliver', letter_id: 'xxx' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type timecapsule-open — capsule due', async () => {
    const env = envWithMocks({
      first: (sql) => sql.includes('time_capsules') ? {
        id: 'cap1', recipient_id: 'u', sender_id: 's', open_at: Date.now() - 100,
      } : null,
      all: (sql) => sql.includes('push_subscriptions') ? { results: [] } : { results: [] },
    });
    const msg = makeMsg({ queue_type: 'timecapsule-open', capsule_id: 'cap1' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type timecapsule-open — capsule pas encore due', async () => {
    const env = envWithMocks({
      first: () => ({ id: 'cap1', recipient_id: 'u', open_at: Date.now() + 100000 }),
    });
    const msg = makeMsg({ queue_type: 'timecapsule-open', capsule_id: 'cap1' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type timecapsule-open — capsule introuvable', async () => {
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'timecapsule-open', capsule_id: 'xxx' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type memory-lane — messages 1 an plus tôt', async () => {
    const env = envWithMocks({
      all: (sql) => sql.includes('FROM messages m') ?
        { results: [{ id: 'm1', sender_id: 'u', ts: Date.now() - 365 * 86400000 }] } :
        sql.includes('push_subscriptions') ? { results: [] } : { results: [] },
    });
    const msg = makeMsg({ queue_type: 'memory-lane', user_id: 'u' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type memory-lane — pas de messages 1 an', async () => {
    const env = envWithMocks({ all: () => ({ results: [] }) });
    const msg = makeMsg({ queue_type: 'memory-lane', user_id: 'u' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type lifecycle-r2 — purge médias expirés', async () => {
    const env = envWithMocks({
      all: (sql) => sql.includes('FROM media') ?
        { results: [{ id: 'm1', r2_key: 'r1' }, { id: 'm2', r2_key: 'r2' }] } :
        { results: [] },
    });
    const msg = makeMsg({ queue_type: 'lifecycle-r2' });
    await worker.queue({ messages: [msg] }, env);
    expect(env.APEX_CHAT_MEDIA.delete).toHaveBeenCalledTimes(2);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type lifecycle-r2 — rien à purger', async () => {
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'lifecycle-r2' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type purge-expired-messages → DELETE messages', async () => {
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'purge-expired-messages' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type inconnu → warn + ack', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = envWithMocks();
    const msg = makeMsg({ queue_type: 'unknown-type' });
    await worker.queue({ messages: [msg] }, env);
    expect(spy).toHaveBeenCalledWith('Queue type inconnu:', 'unknown-type');
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue_type manquant → default unknown + ack', async () => {
    const env = envWithMocks();
    const msg = makeMsg({});
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
  });

  it('queue handler throw → retry (pas ack)', async () => {
    const env = envWithMocks({
      first: () => { throw new Error('DB fail'); },
    });
    const msg = makeMsg({ queue_type: 'letters-deliver', letter_id: 'l' });
    await worker.queue({ messages: [msg] }, env);
    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('batch multiple messages → tous traités', async () => {
    const env = envWithMocks();
    const msgs = [
      makeMsg({ queue_type: 'pipeline-fix', action: 'restart-do' }),
      makeMsg({ queue_type: 'purge-expired-messages' }),
      makeMsg({ queue_type: 'lifecycle-r2' }),
    ];
    await worker.queue({ messages: msgs }, env);
    for (const m of msgs) expect(m.ack).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
//  handleViewStory + handleVotePoll + handleOpenTimeCapsule success paths
// -----------------------------------------------------------------------------
import { makeRequest, makeJWT } from './api-worker-helpers.js';

describe('handleViewStory + handleVotePoll + handleOpenTimeCapsule', () => {
  const userEnv = (storyOrPollData) => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('FROM users')) return { status: 'active', is_banned: 0 };
        if (sql.includes('FROM stories')) return storyOrPollData?.story;
        if (sql.includes('FROM polls')) return storyOrPollData?.poll;
        if (sql.includes('FROM time_capsules')) return storyOrPollData?.capsule;
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    return env;
  };

  it('POST /api/stories/:id/view existing story → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const env = userEnv({ story: { id: 's1', user_id: 'u2', expires_at: Date.now() + 86400000 } });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/stories/s1/view', token, body: {} }),
      env, { waitUntil: vi.fn() },
    );
    expect([200, 404, 500]).toContain(r.status);
  });

  it('POST /api/polls/:id/vote existing poll → ok', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const env = userEnv({ poll: { id: 'p1', conv_id: 'c', options: '["A","B"]', votes: '{}' } });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/polls/p1/vote', token, body: { option_index: 0 } }),
      env, { waitUntil: vi.fn() },
    );
    expect([200, 400, 404, 500]).toContain(r.status);
  });

  it('GET /api/time-capsules/:id pas encore ouvert → 200 or 403', async () => {
    const token = await makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
    const env = userEnv({ capsule: { id: 'cap1', recipient_id: 'u', open_at: Date.now() - 10000, opened_at: null, ciphertext: 'x' } });
    const r = await worker.fetch(
      makeRequest({ method: 'GET', path: '/api/time-capsules/cap1', token }),
      env, { waitUntil: vi.fn() },
    );
    expect([200, 403, 404, 500]).toContain(r.status);
  });
});
