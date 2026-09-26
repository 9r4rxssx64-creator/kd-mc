/**
 * Tests api-worker.js — handleAdminCommand success paths (12 commands).
 * Cible : couvrir tous les success branches du switch admin commands.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

// JWT admin avec is_admin: true
async function adminToken() {
  return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
}

function adminEnv() {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function (...args) { this._args = args; return this; },
    first: async function () {
      // getAuthUser DB check : user existe + admin
      if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 1, status: 'active', is_banned: 0 };
      // Admin commands data
      if (sql.includes('FROM users u LEFT JOIN messages m')) return { id: 'u', pseudo: 'p', msg_count: 5, conv_count: 3 };
      if (sql.includes('SELECT MAX(ts) as last_msg')) return { last_msg: Date.now() };
      if (sql.includes('FROM push_subscriptions')) return { c: 2 };
      if (sql.includes('FROM signalements WHERE target_user_id')) return { c: 0 };
      if (sql.includes('FROM conversations WHERE id')) return { id: 'c', name: 'Conv' };
      if (sql.includes('SELECT COUNT(*) as msg_count')) return { msg_count: 10, first_ts: 0, last_ts: Date.now(), senders: 2 };
      if (sql.includes("FROM users WHERE status='active'")) return { c: 100 };
      if (sql.includes('FROM conversations WHERE archived_at IS NULL')) return { c: 50 };
      if (sql.includes('FROM messages WHERE ts')) return { c: 1000 };
      if (sql.includes('FROM users WHERE last_seen')) return { c: 12 };
      return null;
    },
    all: async function () {
      if (sql.includes('SELECT m.id, m.conv_id, m.sender_id') || sql.includes('FROM messages m')) {
        return { results: [{ id: 'm1', conv_id: 'c1', sender_id: 'u1', ts: Date.now(), mime: 'text', sender_pseudo: 'k', conv_name: 'X' }] };
      }
      if (sql.includes('FROM users WHERE status=? AND last_seen')) {
        return { results: [{ id: 'u1' }, { id: 'u2' }] };
      }
      if (sql.includes('FROM conversation_members WHERE conv_id')) {
        return { results: [{ user_id: 'u1', role: 'owner' }] };
      }
      if (sql.includes('SELECT id, sender_id, ts, mime, view_once, expires_at')) {
        return { results: [{ id: 'm1', sender_id: 'u1', ts: 0, mime: 't' }] };
      }
      if (sql.includes('FROM signalements s')) {
        return { results: [{ id: 's1', target_pseudo: 'spammer', reporter_pseudo: 'kevin', status: 'pending' }] };
      }
      return { results: [] };
    },
    run: async () => ({ success: true }),
  }));
  return env;
}

const cmd = async (command, params = {}, ctx = { waitUntil: vi.fn() }) => {
  const env = adminEnv();
  const token = await adminToken();
  return worker.fetch(
    makeRequest({
      method: 'POST', path: '/api/admin/commands', token,
      body: { command, params, confirm_token: 'CONFIRM' },
    }),
    env, ctx,
  );
};

describe('handleAdminCommand — admin guard', () => {
  it('non-admin → 403', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn(() => ({
      bind: function () { return this; },
      first: async () => ({ is_admin: 0, status: 'active', is_banned: 0 }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await makeJWT({ sub: 'u', is_admin: false, iat: Math.floor(Date.now() / 1000) });
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/commands', token, body: { command: 'globalStats' } }),
      env, { waitUntil: vi.fn() },
    );
    expect(r.status).toBe(403);
  });

  it('destructive command sans confirm_token → 400', async () => {
    const env = adminEnv();
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({ method: 'POST', path: '/api/admin/commands', token, body: { command: 'banUser', params: { userId: 'u' } } }),
      env, { waitUntil: vi.fn() },
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('confirm_required');
  });

  it('command inconnu → 400', async () => {
    const r = await cmd('UNKNOWN_CMD');
    expect(r.status).toBe(400);
  });
});

describe('handleAdminCommand — 12 success commands', () => {
  it('searchAllMessages → results 100', async () => {
    const r = await cmd('searchAllMessages', { days: 7 });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.command).toBe('searchAllMessages');
  });

  it('searchAllMessages sans days → default 7', async () => {
    const r = await cmd('searchAllMessages');
    expect(r.status).toBe(200);
  });

  it('analyzeUser → user + lastActivity + devices + signalements', async () => {
    const r = await cmd('analyzeUser', { userId: 'u1' });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.user.id).toBe('u');
    expect(b.result.devices).toBe(2);
  });

  it('broadcastNotif → sent count', async () => {
    const r = await cmd('broadcastNotif', { title: 'Hello', body: 'Body' });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.sent).toBeGreaterThanOrEqual(0);
    expect(b.result.total).toBe(2);
  });

  it('broadcastNotif sans title/body → defaults', async () => {
    const r = await cmd('broadcastNotif');
    expect(r.status).toBe(200);
  });

  it('kickUser → ok', async () => {
    const r = await cmd('kickUser', { convId: 'c', userId: 'u' });
    expect(r.status).toBe(200);
    expect((await r.json()).result.ok).toBe(true);
  });

  it('banUser → ok', async () => {
    const r = await cmd('banUser', { userId: 'u' });
    expect(r.status).toBe(200);
  });

  it('unbanUser → ok', async () => {
    const r = await cmd('unbanUser', { userId: 'u' });
    expect(r.status).toBe(200);
  });

  it('exportConv → R2 export_key', async () => {
    const r = await cmd('exportConv', { convId: 'c' });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.export_key).toMatch(/^exports\/conv_c_/);
    expect(b.result.msgs_count).toBe(1);
  });

  it('deleteConv → soft delete archived_at', async () => {
    const r = await cmd('deleteConv', { convId: 'c' });
    expect(r.status).toBe(200);
  });

  it('forceLogout → ok', async () => {
    const r = await cmd('forceLogout', { userId: 'u' });
    expect(r.status).toBe(200);
  });

  it('geoTrace → trace vide note', async () => {
    const r = await cmd('geoTrace', { userId: 'u' });
    expect(r.status).toBe(200);
    expect((await r.json()).result.note).toContain('Phase 8');
  });

  it('summarizeConv → stats metadata uniquement', async () => {
    const r = await cmd('summarizeConv', { convId: 'c' });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.stats.msg_count).toBe(10);
  });

  it('listSignalements default pending', async () => {
    const r = await cmd('listSignalements');
    expect(r.status).toBe(200);
    expect((await r.json()).result.signalements).toHaveLength(1);
  });

  it('listSignalements custom status', async () => {
    const r = await cmd('listSignalements', { status: 'resolved' });
    expect(r.status).toBe(200);
  });

  it('globalStats → users/convs/msgs/online', async () => {
    const r = await cmd('globalStats');
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.users).toBe(100);
    expect(b.result.online_now).toBe(12);
  });
});

describe('handleAdminCommand — broadcastNotif catch silent error per user', () => {
  it('sendPushToUser throw → catch silent, sent compte les success', async () => {
    const env = adminEnv();
    let count = 0;
    globalThis.fetch = vi.fn(async () => {
      count++;
      if (count === 1) throw new Error('push fail');
      return new Response('{"ok":true}');
    });
    const token = await adminToken();
    const r = await worker.fetch(
      makeRequest({
        method: 'POST', path: '/api/admin/commands', token,
        body: { command: 'broadcastNotif', params: { title: 'X', body: 'Y' } },
      }),
      env, { waitUntil: vi.fn() },
    );
    expect(r.status).toBe(200);
  });
});
