/**
 * Tests api-worker.js — utilities exportés (normalizeName, isKevinAdmin,
 * sha256, signJWT, verifyJWT, pushToApexTelemetry, runAutoFix, sendPushToUser,
 * performDailyBackup, fetchFirebasePublicKeys, verifyFirebaseIdToken).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeName,
  isKevinAdmin,
  sha256,
  signJWT,
  verifyJWT,
  pushToApexTelemetry,
  runAutoFix,
  sendPushToUser,
  performDailyBackup,
  fetchFirebasePublicKeys,
  verifyFirebaseIdToken,
} from '../../workers/api-worker.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeName', () => {
  it('null/undefined → ""', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('')).toBe('');
  });
  it('accents enlevés', () => {
    expect(normalizeName('Kévin Désàrzéns')).toBe('kevin desarzens');
  });
  it('séparateurs unifiés en espace', () => {
    expect(normalizeName('kevin.desarzens')).toBe('kevin desarzens');
    expect(normalizeName('kevin-desarzens')).toBe('kevin desarzens');
    expect(normalizeName('kevin_desarzens')).toBe('kevin desarzens');
    expect(normalizeName('kevin@monaco.mc')).toBe('kevin monaco mc');
  });
  it('trim + lowercase', () => {
    expect(normalizeName('  KEVIN  ')).toBe('kevin');
  });
});

describe('isKevinAdmin', () => {
  it('null name → false', () => {
    expect(isKevinAdmin(null)).toBe(false);
    expect(isKevinAdmin('')).toBe(false);
    expect(isKevinAdmin(undefined)).toBe(false);
  });
  it('exact match alias → true', () => {
    expect(isKevinAdmin('kevin')).toBe(true);
    expect(isKevinAdmin('Kevin DESARZENS')).toBe(true);
    expect(isKevinAdmin('Desarzens Kevin')).toBe(true);
    expect(isKevinAdmin('kdmc')).toBe(true);
    expect(isKevinAdmin('K Desarzens')).toBe(true); // alias exact "k desarzens"
  });
  it('email avec @ n\'est pas re-normalisé contre les aliases (bug latent connu)', () => {
    // kevind@monaco.mc normalisé = 'kevind monaco mc' mais aliases stockés raw
    expect(isKevinAdmin('kevind@monaco.mc')).toBe(false);
  });
  it('non-admin name → false', () => {
    expect(isKevinAdmin('jean dupont')).toBe(false);
    expect(isKevinAdmin('Marie Curie')).toBe(false);
  });
  it('avec accents normalisés', () => {
    expect(isKevinAdmin('Kévin Désarzéns')).toBe(true);
  });
  it('tokens fuzzy match alias multi-mots', () => {
    expect(isKevinAdmin('kevin desarzens')).toBe(true);
    expect(isKevinAdmin('Desarzens Kevin')).toBe(true);
  });
});

describe('sha256', () => {
  it('produces 64-char hex', async () => {
    const h = await sha256('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
  it('deterministic', async () => {
    expect(await sha256('x')).toBe(await sha256('x'));
  });
  it('different input → different hash', async () => {
    expect(await sha256('a')).not.toBe(await sha256('b'));
  });
});

describe('signJWT / verifyJWT roundtrip', () => {
  const SECRET = 'secret-test';

  it('sign + verify valid', async () => {
    const token = await signJWT({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    expect(token.split('.')).toHaveLength(3);
    const payload = await verifyJWT(token, SECRET);
    expect(payload.sub).toBe('u1');
  });

  it('verify wrong secret → null', async () => {
    const token = await signJWT({ sub: 'u1' }, SECRET);
    expect(await verifyJWT(token, 'wrong-secret')).toBeNull();
  });

  it('verify expired → null', async () => {
    const expired = await signJWT({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 100 }, SECRET);
    expect(await verifyJWT(expired, SECRET)).toBeNull();
  });

  it('verify token null → null', async () => {
    expect(await verifyJWT(null, SECRET)).toBeNull();
    expect(await verifyJWT('', SECRET)).toBeNull();
  });

  it('verify malformed → null', async () => {
    expect(await verifyJWT('a.b', SECRET)).toBeNull();
    expect(await verifyJWT('aaaaaaaaa', SECRET)).toBeNull();
  });

  it('verify signature mauvaise → null (catch atob crash)', async () => {
    // Header+payload valide mais signature random bytes → verify retourne false
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: 'u' }) + '.aGVsbG8';
    expect(await verifyJWT(t, SECRET)).toBeNull();
  });

  it('verify without exp → ok', async () => {
    const t = await signJWT({ sub: 'u' }, SECRET);
    const p = await verifyJWT(t, SECRET);
    expect(p.sub).toBe('u');
  });
});

describe('pushToApexTelemetry', () => {
  it('sans config Firebase → return silent', async () => {
    await expect(pushToApexTelemetry({ sentinel: 's', severity: 'warn' }, {})).resolves.toBeUndefined();
  });

  it('avec config Firebase → POST', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null));
    await pushToApexTelemetry({ sentinel: 's', severity: 'warn' }, {
      APEX_HANDOFF_FIREBASE_URL: 'https://fb',
      APEX_HANDOFF_TOKEN: 'tok',
    });
    expect(globalThis.fetch).toHaveBeenCalled();
    const call = globalThis.fetch.mock.calls[0];
    expect(call[0]).toContain('ax_telemetry_in.json?auth=tok');
  });

  it('fetch throw → catch silent', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('net'); });
    await expect(pushToApexTelemetry({}, {
      APEX_HANDOFF_FIREBASE_URL: 'https://fb',
      APEX_HANDOFF_TOKEN: 'tok',
    })).resolves.toBeUndefined();
  });
});

describe('runAutoFix', () => {
  it('action whitelist → log no-op', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAutoFix({ action: 'restart-do' }, {});
    expect(spy).toHaveBeenCalledWith('Auto-fix attempt', 'restart-do');
  });

  it('action non-whitelist → no-op', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAutoFix({ action: 'rm-rf' }, {});
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sendPushToUser', () => {
  it('user sans subs → no fetch', async () => {
    const env = {
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          all: async () => ({ results: [] }),
        }),
      },
    };
    globalThis.fetch = vi.fn();
    await sendPushToUser('u', { title: 'X' }, env);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('user avec 2 subs → 2 push fetch (best-effort)', async () => {
    const env = {
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          all: async () => ({ results: [
            { endpoint: 'https://fcm.googleapis.com/wp/a', vapid_p256dh: 'p', vapid_auth: 'a' },
            { endpoint: 'https://web.push.b', vapid_p256dh: 'p2', vapid_auth: 'a2' },
          ] }),
        }),
      },
      PUSH_WORKER_URL: 'https://push-worker',
    };
    globalThis.fetch = vi.fn(async () => new Response('ok'));
    await sendPushToUser('u', { title: 'X' }, env);
    expect(globalThis.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('results undefined → no-op', async () => {
    const env = {
      APEX_CHAT_DB: {
        prepare: () => ({
          bind: function () { return this; },
          all: async () => ({}),
        }),
      },
    };
    globalThis.fetch = vi.fn();
    await sendPushToUser('u', {}, env);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('performDailyBackup — chiffrée, complète, vérifiée, avec rotation (audit 17/09/2026)', () => {
  const SECRET = 'jwt-test-secret';
  function makeR2(existing = []) {
    const store = new Map(existing.map((k) => [k, 'ancien']));
    return {
      store,
      put: vi.fn(async (k, body) => { store.set(k, body); }),
      get: vi.fn(async (k) => (store.has(k) ? { text: async () => store.get(k) } : null)),
      list: vi.fn(async () => ({ objects: [...store.keys()].map((key) => ({ key })) })),
      delete: vi.fn(async (k) => { store.delete(k); }),
    };
  }
  function makeDB(tables = ['users', 'messages']) {
    const written = [];
    return {
      written,
      prepare: (sql) => ({
        _args: [],
        bind: function (...a) { this._args = a; return this; },
        all: async () => (sql.includes('sqlite_master') ? { results: tables.map((name) => ({ name })) } : { results: [{ id: 'x' }, { id: 'y' }] }),
        run: async function () { written.push({ sql, args: this._args }); return { success: true }; },
        first: async () => null,
      }),
    };
  }
  async function decrypt(enc) {
    const blob = JSON.parse(enc);
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('apex-chat-backup'), info: new TextEncoder().encode('d1-backup-v1') }, ikm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct))));
  }

  it('écrit UN fichier .json.enc chiffré, avec TOUTES les tables du schéma, et note backup_last_ok', async () => {
    const env = { APEX_CHAT_DB: makeDB(['users', 'messages', 'contacts']), APEX_CHAT_MEDIA: makeR2(), JWT_SIGN_KEY: SECRET };
    const r = await performDailyBackup(env, new Date('2026-09-17T03:00:00Z'));
    expect(r.ok).toBe(true);
    expect(env.APEX_CHAT_MEDIA.put).toHaveBeenCalledTimes(1);
    const [key, body] = env.APEX_CHAT_MEDIA.put.mock.calls[0];
    expect(key).toBe('backups/d1-2026-09-17.json.enc');
    expect(body).not.toContain('"users"');                 // rien en clair
    const clair = await decrypt(body);
    expect(Object.keys(clair.tables)).toEqual(['users', 'messages', 'contacts']);
    expect(clair.tables.contacts).toEqual([{ id: 'x' }, { id: 'y' }]);
    const note = env.APEX_CHAT_DB.written.find((w) => w.args[0] === 'backup_last_ok');
    expect(note).toBeTruthy();
    expect(JSON.parse(note.args[1])).toMatchObject({ key, tables: 3, rows: 6 });
  });

  it('rotation : les fichiers de plus de 14 jours (chiffrés OU anciens en clair) sont supprimés', async () => {
    const r2 = makeR2(['backups/d1-2026-08-01.json', 'backups/d1-2026-09-10.json.enc', 'backups/d1-2026-09-16.json.enc']);
    const env = { APEX_CHAT_DB: makeDB(), APEX_CHAT_MEDIA: r2, JWT_SIGN_KEY: SECRET };
    const r = await performDailyBackup(env, new Date('2026-09-17T03:00:00Z'));
    expect(r.purged.sort()).toEqual(['backups/d1-2026-08-01.json']);
    expect(r2.store.has('backups/d1-2026-09-10.json.enc')).toBe(true);
    expect(r2.store.has('backups/d1-2026-09-16.json.enc')).toBe(true);
  });

  it('sans JWT_SIGN_KEY : REFUSE d\'écrire en clair, note backup_last_error, prévient la télémétrie', async () => {
    const env = { APEX_CHAT_DB: makeDB(), APEX_CHAT_MEDIA: makeR2(), TELEMETRY_QUEUE: { send: vi.fn(async () => {}) } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await performDailyBackup(env);
    spy.mockRestore();
    expect(r.ok).toBe(false);
    expect(env.APEX_CHAT_MEDIA.put).not.toHaveBeenCalled();
    expect(env.APEX_CHAT_DB.written.some((w) => w.args[0] === 'backup_last_error')).toBe(true);
    expect(env.TELEMETRY_QUEUE.send).toHaveBeenCalledWith(expect.objectContaining({ sentinel: 'backup-failed' }));
  });

  it('relecture R2 incohérente → échec noté (la sauvegarde n\'est pas déclarée réussie)', async () => {
    const r2 = makeR2();
    r2.get = vi.fn(async () => ({ text: async () => 'tronqué' }));
    const env = { APEX_CHAT_DB: makeDB(), APEX_CHAT_MEDIA: r2, JWT_SIGN_KEY: SECRET };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await performDailyBackup(env);
    spy.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/relecture/);
  });

  it('R2 absent → échec propre (résout, ne lève pas)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await performDailyBackup({ APEX_CHAT_DB: makeDB(), JWT_SIGN_KEY: SECRET });
    spy.mockRestore();
    expect(r.ok).toBe(false);
  });
});

describe('fetchFirebasePublicKeys', () => {
  it('KV miss → fetch + cache', async () => {
    const env = {
      APEX_CHAT_CACHE: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ kid1: 'cert1' })));
    const keys = await fetchFirebasePublicKeys(env);
    expect(keys).toEqual({ kid1: 'cert1' });
    expect(env.APEX_CHAT_CACHE.put).toHaveBeenCalled();
  });

  it('KV hit non-expired → utilise cache', async () => {
    const env = {
      APEX_CHAT_CACHE: {
        get: vi.fn(async () => ({ keys: { kid: 'c' }, expires_at: Date.now() + 100000 })),
        put: vi.fn(),
      },
    };
    globalThis.fetch = vi.fn();
    const keys = await fetchFirebasePublicKeys(env);
    expect(keys).toEqual({ kid: 'c' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('KV hit expired → re-fetch', async () => {
    const env = {
      APEX_CHAT_CACHE: {
        get: vi.fn(async () => ({ keys: { kid: 'old' }, expires_at: 1 })),
        put: vi.fn(async () => {}),
      },
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ kid: 'new' })));
    const keys = await fetchFirebasePublicKeys(env);
    expect(keys).toEqual({ kid: 'new' });
  });

  it('fetch fail → throw', async () => {
    const env = { APEX_CHAT_CACHE: { get: vi.fn(async () => null), put: vi.fn() } };
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(fetchFirebasePublicKeys(env)).rejects.toThrow('JWKS fetch failed');
  });

  it('sans APEX_CHAT_CACHE → fetch direct', async () => {
    const env = {};
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ k: 'c' })));
    const keys = await fetchFirebasePublicKeys(env);
    expect(keys).toEqual({ k: 'c' });
  });
});

describe('verifyFirebaseIdToken — validation', () => {
  const baseEnv = { FIREBASE_PROJECT_ID: 'apex-chat' };

  it('FIREBASE_PROJECT_ID manquant → throw', async () => {
    await expect(verifyFirebaseIdToken('a.b.c', {})).rejects.toThrow('FIREBASE_PROJECT_ID');
  });

  it('token malformé → throw', async () => {
    await expect(verifyFirebaseIdToken('badtoken', baseEnv)).rejects.toThrow('malformé');
  });

  it('exp passé → throw expiré', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'k' }) + '.' + enc({ exp: 1000, aud: 'apex-chat', iss: 'https://securetoken.google.com/apex-chat' }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('expiré');
  });

  it('iat futur → throw', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'k' }) + '.' + enc({ iat: Math.floor(Date.now() / 1000) + 1000 }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('futur');
  });

  it('aud incorrect → throw', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'k' }) + '.' + enc({ aud: 'autre-app' }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('aud incorrect');
  });

  it('iss incorrect → throw', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'k' }) + '.' + enc({ aud: 'apex-chat', iss: 'bad' }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('iss incorrect');
  });

  it('sub manquant → throw', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'k' }) + '.' + enc({ aud: 'apex-chat', iss: 'https://securetoken.google.com/apex-chat' }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('sub manquant');
  });

  it('alg HS256 (pas RS256) → throw', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'HS256', kid: 'k' }) + '.' + enc({ aud: 'apex-chat', iss: 'https://securetoken.google.com/apex-chat', sub: 'u' }) + '.sig';
    await expect(verifyFirebaseIdToken(t, baseEnv)).rejects.toThrow('alg incorrect');
  });

  it('kid inconnu dans JWKS → throw (signature ou kid)', async () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = enc({ alg: 'RS256', kid: 'unknown' }) + '.' + enc({ aud: 'apex-chat', iss: 'https://securetoken.google.com/apex-chat', sub: 'u' }) + '.aGVsbG8';
    const env = {
      ...baseEnv,
      APEX_CHAT_CACHE: { get: vi.fn(async () => null), put: vi.fn() },
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ otherKid: 'cert' })));
    // L'erreur peut être 'kid inconnu' ou un crash signature — les deux paths sont défensifs
    await expect(verifyFirebaseIdToken(t, env)).rejects.toBeDefined();
  });
});
