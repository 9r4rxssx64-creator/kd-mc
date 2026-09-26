/**
 * Tests api-worker.js — /api/turn (v1.1.229)
 * Credentials TURN Cloudflare Realtime pour appels P2P cross-réseau.
 * Garanties : auth requise, FAIL-OPEN (STUN seul si non provisionné / si CF KO),
 * le TOKEN CF n'est JAMAIS renvoyé au client, diagnostic exact en cas d'échec.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

// DB minimale : getAuthUser doit voir un compte actif.
function dbActive() {
  return {
    prepare: vi.fn((sql) => ({
      bind() { return this; },
      async first() {
        if (sql.includes('last_force_logout_at')) return { last_force_logout_at: null, is_banned: 0, status: 'active' };
        return null;
      },
      async run() { return { success: true }; },
      async all() { return { results: [] }; },
    })),
  };
}

async function tok() { return makeJWT({ sub: 'kevin', is_admin: true, iat: Math.floor(Date.now() / 1000) }); }

function turnReq(token) {
  const h = { 'Authorization': 'Bearer ' + token };
  return new Request('https://api.apex/api/turn', { method: 'GET', headers: h });
}

describe('/api/turn — TURN Cloudflare', () => {
  it('refuse sans authentification (401)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive() });
    const req = new Request('https://api.apex/api/turn', { method: 'GET' });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('FAIL-OPEN : secrets TURN absents → 200 STUN seul (turn:false)', async () => {
    const env = ENV({ APEX_CHAT_DB: dbActive() }); // pas de CF_TURN_KEY_ID/CF_TURN_TOKEN
    const res = await worker.fetch(turnReq(await tok()), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.turn).toBe(false);
    expect(d.reason).toBe('turn_not_provisioned');
    expect(Array.isArray(d.iceServers)).toBe(true);
    expect(d.iceServers.length).toBeGreaterThan(0);
    // STUN présent, AUCUN credential TURN
    const flat = JSON.stringify(d.iceServers);
    expect(flat).toContain('stun:');
    expect(flat).not.toContain('credential');
  });

  it('secrets présents → mint credentials éphémères, STUN + TURN renvoyés, token JAMAIS exposé', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      // doit appeler l'endpoint Cloudflare avec le Bearer = token secret
      expect(String(url)).toContain('rtc.live.cloudflare.com/v1/turn/keys/KID123/credentials/generate-ice-servers');
      expect(opts.headers.Authorization).toBe('Bearer SECRET_TOKEN');
      return new Response(JSON.stringify({
        iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'eph-user', credential: 'eph-cred' }
      }), { status: 200 });
    });
    const env = ENV({ APEX_CHAT_DB: dbActive(), CF_TURN_KEY_ID: 'KID123', CF_TURN_TOKEN: 'SECRET_TOKEN' });
    const res = await worker.fetch(turnReq(await tok()), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.turn).toBe(true);
    const flat = JSON.stringify(d.iceServers);
    expect(flat).toContain('stun:');                 // STUN gardé
    expect(flat).toContain('turn:turn.cloudflare.com'); // relais éphémère
    expect(flat).toContain('eph-user');
    // le TOKEN secret ne doit JAMAIS sortir
    expect(flat).not.toContain('SECRET_TOKEN');
    expect(JSON.stringify(d)).not.toContain('SECRET_TOKEN');
  });

  it('FAIL-OPEN : Cloudflare répond 403 → 200 STUN seul + diagnostic exact', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ errors: ['no calls perm'] }), { status: 403 }));
    const env = ENV({ APEX_CHAT_DB: dbActive(), CF_TURN_KEY_ID: 'KID123', CF_TURN_TOKEN: 'SECRET_TOKEN' });
    const res = await worker.fetch(turnReq(await tok()), env);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.turn).toBe(false);
    expect(d.reason).toBe('cf_turn_http_403'); // cause EXACTE (règle CLAUDE.md)
    expect(JSON.stringify(d.iceServers)).toContain('stun:');
  });
});
