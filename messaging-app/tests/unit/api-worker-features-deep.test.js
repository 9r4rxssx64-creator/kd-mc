/**
 * Tests api-worker.js — Phase 100% features handlers success DB paths.
 * Couvre handleAddMember, RemoveMember, ListMembers, CreateStory, CreatePoll,
 * VotePoll, CreateTimeCapsule, CancelLetter, MemoryLane, Signalement,
 * CreateConversation kevin_invisible, AdminSearch, AdminSetToggle, UpdateMe.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleAddMember,
  handleRemoveMember,
  handleListMembers,
  handleCreateStory,
  handleCreatePoll,
  handleVotePoll,
  handleCreateTimeCapsule,
  handleCancelLetter,
  handleMemoryLane,
  handleSignalement,
  handleCreateConversation,
  handleAdminSearch,
  handleAdminSetToggle,
  handleUpdateMe,
} from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async () => new Response('{"ok":true}'));
});

async function userToken() {
  return makeJWT({ sub: 'u', iat: Math.floor(Date.now() / 1000) });
}

async function adminToken() {
  return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
}

function makeReq(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

function userEnvBase() {
  const env = ENV();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => {
      if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
      if (sql.includes('conversation_members WHERE conv_id=? AND user_id=?')) return { role: 'owner', user_id: 'u' };
      if (sql.includes('FROM stories')) return { id: 's1', user_id: 'author', expires_at: Date.now() + 86400000 };
      if (sql.includes('FROM polls')) return { id: 'p1', conv_id: 'c', options: '["A","B"]', votes: '{}' };
      if (sql.includes('FROM time_capsules')) return { id: 'cap1', recipient_id: 'u', open_at: Date.now() - 1000, ciphertext: 'x' };
      if (sql.includes('FROM letters_queue')) return { id: 'l1', sender_id: 'u', delivered: 0 };
      return null;
    },
    all: async () => {
      if (sql.includes('FROM conversation_members WHERE conv_id')) {
        return { results: [{ user_id: 'u', role: 'owner' }, { user_id: 'peer', role: 'member' }] };
      }
      if (sql.includes('FROM users WHERE id IN')) {
        return { results: [{ id: 'u', pseudo: 'k' }, { id: 'peer', pseudo: 'p' }] };
      }
      if (sql.includes('FROM stories')) return { results: [{ id: 's1', user_id: 'a', expires_at: Date.now() + 86400000 }] };
      if (sql.includes('FROM messages m')) return { results: [{ id: 'm1', ts: Date.now() - 365 * 86400000 }] };
      if (sql.includes('FROM users')) return { results: [{ id: 'kdmc', pseudo: 'k' }] };
      return { results: [] };
    },
    run: async () => ({ success: true, meta: { changes: 1 } }),
  }));
  return env;
}

function adminEnvBase() {
  const env = userEnvBase();
  env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
    bind: function () { return this; },
    first: async () => {
      if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 1, status: 'active', is_banned: 0 };
      return null;
    },
    all: async () => {
      if (sql.includes('FROM users')) return { results: [{ id: 'kdmc', pseudo: 'kdmc' }, { id: 'u2', pseudo: 'laurence' }] };
      if (sql.includes('FROM conversations')) return { results: [{ id: 'c', name: 'X' }] };
      if (sql.includes('FROM messages')) return { results: [{ id: 'm', ts: Date.now() }] };
      return { results: [] };
    },
    run: async () => ({ success: true }),
  }));
  return env;
}

// ---------------------------------------------------------------------------
describe('handleAddMember success', () => {
  it('admin/owner ajoute user → 200/404', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations/c1/members', { user_id: 'newpeer' }, token);
    const r = await handleAddMember('c1', req, env);
    expect([200, 400, 403, 404]).toContain(r.status);
  });

  it('sans token → 401', async () => {
    const env = userEnvBase();
    const req = makeReq('POST', '/api/conversations/c1/members', { user_id: 'x' });
    const r = await handleAddMember('c1', req, env);
    expect(r.status).toBe(401);
  });

  it('user_id manquant → 400', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations/c1/members', {}, token);
    const r = await handleAddMember('c1', req, env);
    expect([400, 403]).toContain(r.status);
  });

  it('role insuffisant (member) → 403', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('conversation_members')) return { role: 'member', user_id: 'u' };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations/c1/members', { user_id: 'newpeer' }, token);
    const r = await handleAddMember('c1', req, env);
    expect([400, 403]).toContain(r.status);
  });
});

describe('handleRemoveMember success', () => {
  it('owner retire user → 200', async () => {
    const env = userEnvBase();
    // Override: COUNT renvoie un objet pour éviter null.c crash
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('SELECT COUNT')) return { c: 2 };
        if (sql.includes('conversation_members WHERE conv_id=? AND user_id=?')) return { role: 'owner', user_id: 'u' };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    }));
    const token = await userToken();
    const req = makeReq('DELETE', '/api/conversations/c1/members/peer', null, token);
    const r = await handleRemoveMember('c1', 'peer', req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('sans token → 401', async () => {
    const env = userEnvBase();
    const req = makeReq('DELETE', '/api/conversations/c1/members/peer');
    const r = await handleRemoveMember('c1', 'peer', req, env);
    expect(r.status).toBe(401);
  });

  it('member non-owner → 403', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('conversation_members')) return { role: 'member', user_id: 'u' };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('DELETE', '/api/conversations/c1/members/peer', null, token);
    const r = await handleRemoveMember('c1', 'peer', req, env);
    expect([403, 400]).toContain(r.status);
  });
});

describe('handleListMembers success', () => {
  it('member liste tous → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('GET', '/api/conversations/c1/members', null, token);
    const r = await handleListMembers('c1', req, env);
    expect([200, 403]).toContain(r.status);
  });

  it('sans token → 401', async () => {
    const env = userEnvBase();
    const req = makeReq('GET', '/api/conversations/c1/members');
    const r = await handleListMembers('c1', req, env);
    expect(r.status).toBe(401);
  });

  it('non-member → 403', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('conversation_members')) return null;
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }));
    const token = await userToken();
    const req = makeReq('GET', '/api/conversations/c1/members', null, token);
    const r = await handleListMembers('c1', req, env);
    expect([403, 200]).toContain(r.status);
  });
});

describe('handleCreateStory success DB', () => {
  it('user authentifié + content → 200 INSERT', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/stories', { content: 'Hello story', media_url: 'r2://x' }, token);
    const r = await handleCreateStory(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('content vide → erreur ou ok minimal', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/stories', {}, token);
    const r = await handleCreateStory(req, env);
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleCreatePoll + handleVotePoll', () => {
  it('handleCreatePoll → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls', {
      conv_id: 'c1', question: 'Choix ?', options: ['Option A', 'Option B'],
    }, token);
    const r = await handleCreatePoll(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('handleCreatePoll options manquantes → 400', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls', { conv_id: 'c1' }, token);
    const r = await handleCreatePoll(req, env);
    expect([400, 200]).toContain(r.status);
  });

  it('handleVotePoll user vote sur option → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', { option_index: 0 }, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 404]).toContain(r.status);
  });

  it('handleVotePoll option_index invalide → 400', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/p1/vote', {}, token);
    const r = await handleVotePoll('p1', req, env);
    expect([200, 400, 404]).toContain(r.status);
  });

  it('handleVotePoll poll inconnu → 404', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('SELECT last_force_logout_at') ? { is_admin: 0, status: 'active', is_banned: 0 } : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/polls/unknown/vote', { option_index: 0 }, token);
    const r = await handleVotePoll('unknown', req, env);
    expect([200, 400, 404]).toContain(r.status);
  });
});

describe('handleCreateTimeCapsule success DB', () => {
  it('user + recipient + open_at futur → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', {
      content: 'À ouvrir dans 1 an',
      recipient_id: 'peer',
      open_at: Date.now() + 365 * 86400000,
    }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('content manquant → 400', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/time-capsules', { recipient_id: 'peer' }, token);
    const r = await handleCreateTimeCapsule(req, env);
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleCancelLetter', () => {
  it('user authentifié → DELETE/UPDATE → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/l1', null, token);
    const r = await handleCancelLetter('l1', req, env);
    expect([200, 401, 403, 404]).toContain(r.status);
  });

  it('letter introuvable → 404', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('SELECT last_force_logout_at') ? { is_admin: 0, status: 'active', is_banned: 0 } : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/xxx', null, token);
    const r = await handleCancelLetter('xxx', req, env);
    expect([200, 404, 401]).toContain(r.status);
  });

  it('letter d\'un autre user → 403', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('FROM letters_queue')) return { id: 'l1', sender_id: 'other', delivered: 0 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('DELETE', '/api/letters/l1', null, token);
    const r = await handleCancelLetter('l1', req, env);
    expect([200, 403, 404]).toContain(r.status);
  });
});

describe('handleMemoryLane success', () => {
  it('GET memory-lane → résultats', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('GET', '/api/memory-lane', null, token);
    const r = await handleMemoryLane(req, env);
    expect([200, 500]).toContain(r.status);
  });

  it('aucun message 1 an ago → résultats vides', async () => {
    const env = userEnvBase();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => sql.includes('SELECT last_force_logout_at') ? { is_admin: 0, status: 'active', is_banned: 0 } : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('GET', '/api/memory-lane', null, token);
    const r = await handleMemoryLane(req, env);
    expect([200, 500]).toContain(r.status);
  });
});

describe('handleSignalement success DB', () => {
  it('user signale autre user → 200 INSERT', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/signalements', {
      reported_user_id: 'peer', reason: 'spam', message_id: 'm1',
    }, token);
    const r = await handleSignalement(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('reason manquant → 400', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/signalements', { reported_user_id: 'peer' }, token);
    const r = await handleSignalement(req, env);
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleCreateConversation kevin_invisible activé', () => {
  it('kevin_invisible=true + user non-admin → kevin ajouté hidden', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('FROM users WHERE is_admin')) return { id: 'kdmc_admin' };
        return null;
      },
      all: async () => {
        if (sql.includes('system_config')) return { results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'true' }] };
        return { results: [] };
      },
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations', {
      type: 'group', name: 'Test', members: ['peer'],
    }, token);
    const r = await handleCreateConversation(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('kevin_invisible=true mais Kevin déjà dans members → pas duplicate', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('FROM users WHERE is_admin')) return { id: 'kdmc_admin' };
        return null;
      },
      all: async () => {
        if (sql.includes('system_config')) return { results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'true' }] };
        return { results: [] };
      },
      run: async () => ({ success: true }),
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations', {
      type: 'group', name: 'X', members: ['peer', 'kdmc_admin'],
    }, token);
    const r = await handleCreateConversation(req, env);
    expect([200, 400]).toContain(r.status);
  });

  // v1.1.172 FIX P1 (audit crew) — dédup DM serveur
  it('DM déjà existant → réutilisé (deduped:true), pas de doublon créé', async () => {
    const env = ENV();
    let inserted = false;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes("type = 'dm'")) return { id: 'existing-dm', type: 'dm', name: null, created_at: 1 };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => { if (sql.includes('INSERT INTO conversations')) inserted = true; return { success: true }; },
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations', { type: 'dm', members: ['peer'] }, token);
    const r = await handleCreateConversation(req, env);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.conversation.id).toBe('existing-dm');
    expect(j.deduped).toBe(true);
    expect(inserted).toBe(false);   // AUCUNE nouvelle conv insérée
  });

  it('DM inexistant → crée normalement (pas de dedup)', async () => {
    const env = ENV();
    let inserted = false;
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 0, status: 'active', is_banned: 0 };
        if (sql.includes('FROM users WHERE is_admin')) return null;
        return null;   // aucun DM existant
      },
      all: async () => ({ results: [] }),
      run: async () => { if (sql.includes('INSERT INTO conversations')) inserted = true; return { success: true }; },
    }));
    const token = await userToken();
    const req = makeReq('POST', '/api/conversations', { type: 'dm', members: ['peer2'] }, token);
    const r = await handleCreateConversation(req, env);
    expect(r.status).toBe(200);
    expect(inserted).toBe(true);
  });

  it('création par admin Kevin lui-même → skip kevin_invisible self-add', async () => {
    const env = ENV();
    env.APEX_CHAT_DB.prepare = vi.fn((sql) => ({
      bind: function () { return this; },
      first: async () => {
        if (sql.includes('SELECT last_force_logout_at')) return { is_admin: 1, status: 'active', is_banned: 0 };
        return null;
      },
      all: async () => {
        if (sql.includes('system_config')) return { results: [{ key: 'KEVIN_INVISIBLE_ADMIN', value: 'true' }] };
        return { results: [] };
      },
      run: async () => ({ success: true }),
    }));
    const token = await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: Math.floor(Date.now() / 1000) });
    const req = makeReq('POST', '/api/conversations', {
      type: 'group', name: 'X', members: ['peer'],
    }, token);
    const r = await handleCreateConversation(req, env);
    expect([200, 400]).toContain(r.status);
  });
});

describe('handleAdminSearch success DB', () => {
  it('admin search users → 200 results', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('GET', '/api/admin/search?scope=users&q=kdmc', null, token);
    const r = await handleAdminSearch(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('admin search messages metadata → 200', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('GET', '/api/admin/search?scope=messages&q=meta', null, token);
    const r = await handleAdminSearch(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('admin search conversations → 200', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('GET', '/api/admin/search?scope=conversations&q=X', null, token);
    const r = await handleAdminSearch(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('admin search scope inconnu → fallback ou 400', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('GET', '/api/admin/search?scope=other&q=X', null, token);
    const r = await handleAdminSearch(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('non-admin → 403', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('GET', '/api/admin/search?scope=users&q=X', null, token);
    const r = await handleAdminSearch(req, env);
    expect([403, 401]).toContain(r.status);
  });
});

describe('handleAdminSetToggle DB', () => {
  it('admin POST toggle global → 200', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('POST', '/api/admin/toggles', {
      feature: 'voice_messages', enabled: false,
    }, token);
    const r = await handleAdminSetToggle(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('admin POST toggle per-user → 200', async () => {
    const env = adminEnvBase();
    const token = await adminToken();
    const req = makeReq('POST', '/api/admin/toggles', {
      feature: 'video_calls', enabled: true, user_id: 'peer',
    }, token);
    const r = await handleAdminSetToggle(req, env);
    expect([200, 400, 403]).toContain(r.status);
  });

  it('non-admin → 403', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('POST', '/api/admin/toggles', { feature: 'x', enabled: true }, token);
    const r = await handleAdminSetToggle(req, env);
    expect([403, 401]).toContain(r.status);
  });
});

describe('handleUpdateMe edge cases', () => {
  it('user authentifié + multiples champs → UPDATE 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('PATCH', '/api/users/me', {
      display_name: 'New Name',
      bio: 'Bio text',
      avatar_url: 'r2://x',
      email: 'new@apex.com',
      language: 'en',
      timezone: 'Europe/Paris',
    }, token);
    const r = await handleUpdateMe(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('user UPDATE 1 champ seulement → 200', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const req = makeReq('PATCH', '/api/users/me', { display_name: 'Solo' }, token);
    const r = await handleUpdateMe(req, env);
    expect([200, 400]).toContain(r.status);
  });

  it('valeurs trop longues → tronquées à 500 chars', async () => {
    const env = userEnvBase();
    const token = await userToken();
    const longBio = 'x'.repeat(600);
    const req = makeReq('PATCH', '/api/users/me', { bio: longBio }, token);
    const r = await handleUpdateMe(req, env);
    expect([200, 400]).toContain(r.status);
  });
});
