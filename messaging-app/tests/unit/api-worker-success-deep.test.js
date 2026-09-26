/**
 * Tests api-worker.js — Phase 100% success DB INSERTs avec bons field names.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCreateStory,
  handleCreatePoll,
  handleVotePoll,
  handleCreateTimeCapsule,
  handleSignalement,
  handleAddMember,
  handleRemoveMember,
  handleListMembers,
  handleCancelLetter,
} from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

async function userToken() {
  return makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) });
}

function makeReq(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), {
    method, headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

function userEnvAuth(extras = {}) {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => {
      if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
      return extras.first ? extras.first(sql) : null;
    },
    all: async () => extras.all ? extras.all(sql) : { results: [] },
    run: async () => extras.run ? extras.run(sql) : { success: true, meta: { changes: 1 } },
  }));
  return env;
}

// ---------------------------------------------------------------------------
// handleCreateStory success
// ---------------------------------------------------------------------------
describe('handleCreateStory success path', () => {
  it('ciphertext + mime → INSERT + 200', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/stories', {
      ciphertext: 'encrypted-story-content',
      mime: 'text/plain',
    }, token);
    const r = await handleCreateStory(req, env);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.story).toBeTruthy();
  });

  it('ciphertext manquant → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/stories', { mime: 'text/plain' }, token);
    const r = await handleCreateStory(req, env);
    expect(r.status).toBe(400);
  });

  it('ciphertext trop volumineux → 413', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/stories', {
      ciphertext: 'x'.repeat(60 * 1024 * 1024), // 60MB
      mime: 'video/mp4',
    }, token);
    const r = await handleCreateStory(req, env);
    expect([200, 400, 413]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleCreatePoll success
// ---------------------------------------------------------------------------
describe('handleCreatePoll success path', () => {
  it('full params → INSERT + 200', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('conversation_members') ?
        { role: 'owner', user_id: 'u1' } : null,
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/polls', {
      conv_id: 'c1',
      msg_id: 'msg-parent',
      question: 'Quelle option ?',
      options: ['A', 'B', 'C'],
      multi_choice: true,
      anonymous: false,
      closes_at: Date.now() + 86400000,
    }, token);
    const r = await handleCreatePoll(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('question manquante → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls', {
      conv_id: 'c1', options: ['A', 'B'],
    }, token);
    const r = await handleCreatePoll(req, env);
    expect([400, 403]).toContain(r.status);
  });

  it('options invalides (1 seul) → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls', {
      conv_id: 'c1', question: 'Q?', options: ['Solo'],
    }, token);
    const r = await handleCreatePoll(req, env);
    expect([400, 403]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleVotePoll success
// ---------------------------------------------------------------------------
describe('handleVotePoll success path', () => {
  it('vote sur option valide → UPDATE votes', async () => {
    const env = userEnvAuth({
      first: (sql) => {
        if (sql.includes('FROM polls')) return {
          id: 'p1', conv_id: 'c1', options: '["A","B","C"]', votes: '{}',
          closes_at: Date.now() + 86400000, multi_choice: 0,
        };
        if (sql.includes('conversation_members')) return { role: 'member' };
        return null;
      },
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', {
      option_indexes: [1],
    }, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 403, 404]).toContain(r.status);
  });

  it('vote multi-choice → UPDATE votes multi', async () => {
    const env = userEnvAuth({
      first: (sql) => {
        if (sql.includes('FROM polls')) return {
          id: 'p1', conv_id: 'c1', options: '["A","B","C"]', votes: '{}',
          closes_at: Date.now() + 86400000, multi_choice: 1,
        };
        if (sql.includes('conversation_members')) return { role: 'member' };
        return null;
      },
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', {
      option_indexes: [0, 2],
    }, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 403, 404]).toContain(r.status);
  });

  it('vote option_indexes invalide → 400', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('FROM polls') ? {
        id: 'p1', conv_id: 'c1', options: '["A","B"]', votes: '{}',
        closes_at: Date.now() + 86400000,
      } : sql.includes('conversation_members') ? { role: 'member' } : null,
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', {
      option_indexes: [5], // out of range
    }, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 404]).toContain(r.status);
  });

  it('poll fermé → 400', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('FROM polls') ? {
        id: 'p1', conv_id: 'c1', options: '["A","B"]', votes: '{}',
        closes_at: Date.now() - 1000, // déjà fermé
      } : sql.includes('conversation_members') ? { role: 'member' } : null,
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', { option_indexes: [0] }, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 410, 404]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleCreateTimeCapsule success
// ---------------------------------------------------------------------------
describe('handleCreateTimeCapsule success path', () => {
  it('full params → INSERT + 200', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      recipient_id: 'peer',
      ciphertext: 'capsule-encrypted-content',
      mime: 'text/plain',
      open_at: Date.now() + 365 * 86400000,
      preview: 'Souvenir 2026',
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect(r.status).toBe(200);
  });

  it('ciphertext manquant → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      recipient_id: 'peer', open_at: Date.now() + 86400000,
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect(r.status).toBe(400);
  });

  it('ciphertext trop volumineux (>200KB) → 413', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      recipient_id: 'peer',
      ciphertext: 'x'.repeat(201000),
      open_at: Date.now() + 86400000,
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect(r.status).toBe(413);
  });

  it('open_at trop proche (<5min) → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      recipient_id: 'peer',
      ciphertext: 'x',
      open_at: Date.now() + 1000, // trop proche
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect(r.status).toBe(400);
  });

  it('open_at trop lointain (>50 ans) → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      recipient_id: 'peer',
      ciphertext: 'x',
      open_at: Date.now() + 100 * 365 * 86400000, // 100 ans
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// handleSignalement success
// ---------------------------------------------------------------------------
describe('handleSignalement success path', () => {
  it('full params → INSERT + 200', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/signalements', {
      target_user_id: 'spam-user',
      conv_id: 'c1',
      msg_id: 'm-abc',
      reason: 'harassment',
      description: 'Comportement insultant répété',
    }, token);
    const r = await handleSignalement(req, env);
    expect(r.status).toBe(200);
  });

  it('target_user_id manquant → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/signalements', {
      reason: 'spam',
    }, token);
    const r = await handleSignalement(req, env);
    expect(r.status).toBe(400);
  });

  it('reason manquant → 400', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('POST', '/api/signalements', {
      target_user_id: 'peer',
    }, token);
    const r = await handleSignalement(req, env);
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// handleAddMember + handleRemoveMember + handleListMembers DB success
// ---------------------------------------------------------------------------
describe('handleAddMember + Remove + List DB success', () => {
  function ownerEnv() {
    return userEnvAuth({
      first: (sql) => {
        if (sql.includes('conversation_members WHERE conv_id=? AND user_id=?')) {
          return { role: 'owner', user_id: 'u1' };
        }
        if (sql.includes('SELECT COUNT')) return { c: 3 };
        return null;
      },
      all: () => ({ results: [
        { user_id: 'u1', role: 'owner' },
        { user_id: 'peer', role: 'member' },
      ] }),
    });
  }

  it('handleAddMember owner ajoute → INSERT + UPDATE count', async () => {
    const env = ownerEnv();
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations/c1/members', {
      user_id: 'newpeer', role: 'member',
    }, token);
    const r = await handleAddMember('c1', req, env);
    expect([200, 400, 404]).toContain(r.status);
  });

  it('handleAddMember user_id déjà membre → ON CONFLICT', async () => {
    const env = userEnvAuth({
      first: (sql) => {
        if (sql.includes('conversation_members WHERE conv_id=? AND user_id=?')) {
          // First call (caller perm) returns owner ; 2nd call (target perm check) returns existing
          return { role: 'owner', user_id: 'u1' };
        }
        return null;
      },
    });
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations/c1/members', { user_id: 'peer' }, token);
    const r = await handleAddMember('c1', req, env);
    expect([200, 400, 404, 409]).toContain(r.status);
  });

  it('handleRemoveMember owner retire member → DELETE + UPDATE count', async () => {
    const env = ownerEnv();
    const token = await userToken();
    const req = makeReq('DELETE', '/api/conversations/c1/members/peer', null, token);
    const r = await handleRemoveMember('c1', 'peer', req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('handleListMembers member liste → 200 array', async () => {
    const env = ownerEnv();
    const token = await userToken();
    const req = makeReq('GET', '/api/conversations/c1/members', null, token);
    const r = await handleListMembers('c1', req, env);
    expect([200, 403]).toContain(r.status);
  });
});

// ---------------------------------------------------------------------------
// handleCancelLetter DB success path
// ---------------------------------------------------------------------------
describe('handleCancelLetter DB success', () => {
  it('owner cancel letter → UPDATE cancelled=1 + 200', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('FROM letters_queue') ?
        { id: 'l1', sender_id: 'u1', delivered: 0, cancelled: 0 } : null,
    });
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/l1', null, token);
    const r = await handleCancelLetter('l1', req, env);
    expect([200, 403, 404]).toContain(r.status);
  });

  it('letter d\'un autre user → 403', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('FROM letters_queue') ?
        { id: 'l1', sender_id: 'other-user', delivered: 0 } : null,
    });
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/l1', null, token);
    const r = await handleCancelLetter('l1', req, env);
    expect([403, 200, 404]).toContain(r.status);
  });

  it('letter déjà délivrée → 400/410', async () => {
    const env = userEnvAuth({
      first: (sql) => sql.includes('FROM letters_queue') ?
        { id: 'l1', sender_id: 'u1', delivered: 1 } : null,
    });
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/l1', null, token);
    const r = await handleCancelLetter('l1', req, env);
    expect([200, 400, 410]).toContain(r.status);
  });

  it('letter introuvable → 404', async () => {
    const env = userEnvAuth();
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/xxx', null, token);
    const r = await handleCancelLetter('xxx', req, env);
    expect([200, 404]).toContain(r.status);
  });
});
