// @vitest-environment node
// Lot D (finitions de l'ultra-audit, 15.10.2026) — côté SERVEUR, sur un VRAI SQLite bâti avec toutes les
// migrations (d1Reel), jamais une fausse base qui accepte tout.
//  Item 4 : le jeton de SESSION dans l'adresse (?token=) n'ouvre plus le temps réel (WebSocket), ni /ws-diag,
//           ni aucune autre route ; code clair `url_token_refused`. Le ticket (?ticket=) marche toujours.
//  Item 5 : la route des médias refuse ?token= ; elle sert avec le ticket média (?mt=) ou l'en-tête Bearer.
//  Item 7 : la sourdine temporaire (« snooze ») de l'APP part au serveur avec sa fin : le serveur ne notifie plus
//           le membre jusqu'à cette fin, puis de nouveau ; annuler la sourdine la retire du serveur.
//           (vraies fonctions de la page index.html → vraie route → vraie base → vrai ConversationDO)
// Sabotage : remettre `else token = qs.get('token')` dans getAuthUser, ou retirer l'envoi au serveur dans
// K._setSnooze / K._muteServerState → ces tests échouent.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { signJWT } from '../../workers/api-worker.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';
import { loadDefs } from './client-extract.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

const CONV = 'g_lotd';
function seed() {
  const DB = d1Reel();
  DB.raw.prepare(`INSERT INTO conversations (id,type,name,created_by,created_at,sharded_to_do,last_msg_ts) VALUES (?,?,?,?,?,?,?)`).run(CONV, 'group', 'Famille', 'alice', 1, 'do_' + CONV, 1);
  ['alice', 'bob', 'carol'].forEach((u, i) => {
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
      VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(u, u, 'Nom ' + u, '+3360000000' + i, 'h_' + u);
    DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,joined_at) VALUES (?,?,1)`).run(CONV, u);
  });
  DB.raw.prepare(`INSERT INTO media (id, owner_id, r2_key, size, mime, uploaded_at, expires_at, conv_id) VALUES (?,?,?,?,?,?,?,?)`)
    .run('med1', 'alice', 'media/alice/med1.png', 3, 'image/png', Date.now(), Date.now() + 86400000, CONV);
  return DB;
}
function env(DB, doFetch) {
  return ENV({
    APEX_CHAT_DB: DB,
    APEX_CHAT_MEDIA: { get: async () => ({ body: 'PNG', httpMetadata: { contentType: 'image/png' } }), delete: vi.fn(async () => {}) },
    CONVERSATION_DO: { idFromName: (n) => n, get: () => ({ fetch: doFetch || (async () => new Response('DO_OK', { status: 200 })) }) },
  });
}
const session = (uid) => makeJWT({ sub: uid, iat: Math.floor(Date.now() / 1000) - 5 });
// Node interdit l'en-tête Upgrade sur une Request : on passe un objet requête équivalent (url, méthode, en-têtes).
function wsUpgrade(qs) {
  return { url: `https://api.apex/api/conversations/${CONV}/ws?${qs}`, method: 'GET', headers: new Headers({ Upgrade: 'websocket' }) };
}

describe('Item 4 — WebSocket : ticket seulement, plus jamais le jeton de session dans l\'adresse', () => {
  it('?token=<session valide> → 401 url_token_refused, le serveur de conversation n\'est JAMAIS joint', async () => {
    const DB = seed();
    const doFetch = vi.fn(async () => new Response('DO_OK', { status: 200 }));
    const r = await worker.fetch(wsUpgrade('token=' + encodeURIComponent(await session('bob')) + '&uid=bob'), env(DB, doFetch), {});
    expect(r.status).toBe(401);
    const j = await r.json();
    expect(j.error).toBe('url_token_refused');
    expect(j.message).toMatch(/mets Apex Chat à jour/);
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('ticket à usage unique (?ticket=) → le serveur de conversation reçoit la connexion (jeton interne, pas le ticket)', async () => {
    const DB = seed();
    const doFetch = vi.fn(async () => new Response('DO_OK', { status: 200 }));
    const E = env(DB, doFetch);
    const t = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/ws-ticket', token: await session('bob') }), E, {});
    const { ticket } = await t.json();
    const r = await worker.fetch(wsUpgrade('ticket=' + encodeURIComponent(ticket)), E, {});
    expect(await r.text()).toBe('DO_OK');
    expect(doFetch).toHaveBeenCalledTimes(1);
    const fwd = new URL(doFetch.mock.calls[0][0].url);
    expect(fwd.searchParams.get('ticket')).toBeNull();
    expect(fwd.searchParams.get('uid')).toBe('bob');
  });

  it('/ws-diag : ?token= → cause url_token_refused ; en-tête Bearer → authentifié', async () => {
    const DB = seed();
    const s = await session('bob');
    const r = await worker.fetch(new Request(`https://api.apex/api/conversations/${CONV}/ws-diag?token=` + encodeURIComponent(s)), env(DB), {});
    const d = await r.json();
    expect(d.authenticated).toBe(false);
    expect(d.cause).toBe('url_token_refused');
    const h = await worker.fetch(makeRequest({ path: `/api/conversations/${CONV}/ws-diag`, token: s }), env(DB), {});
    expect(await h.json()).toMatchObject({ authenticated: true, ok: true });
  });

  it('aucune autre route n\'accepte ?token= (ex. liste des conversations)', async () => {
    const DB = seed();
    const r = await worker.fetch(new Request('https://api.apex/api/conversations?token=' + encodeURIComponent(await session('bob'))), env(DB), {});
    expect(r.status).toBe(401);
  });
});

describe('Item 5 — médias : ticket média ou en-tête, jamais ?token=', () => {
  it('?token=<session> → 401 url_token_refused ; ?mt=<ticket média> → 200 ; Bearer → 200', async () => {
    const DB = seed();
    const E = env(DB);
    const s = await session('bob');
    const bad = await worker.fetch(new Request('https://api.apex/api/media/med1?token=' + encodeURIComponent(s)), E, {});
    expect(bad.status).toBe(401);
    expect((await bad.json()).error).toBe('url_token_refused');
    const mt = await (await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/media-ticket', token: s }), E, {})).json();
    expect((await worker.fetch(new Request('https://api.apex/api/media/med1?mt=' + encodeURIComponent(mt.ticket)), E, {})).status).toBe(200);
    expect((await worker.fetch(makeRequest({ path: '/api/media/med1', token: s }), E, {})).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────── Item 7
async function notified(DB, sender = 'alice') {
  const d = new ConversationDO({ storage: { get: async () => undefined, put: async () => {}, list: async () => new Map() }, blockConcurrencyWhile: async (f) => f() }, { APEX_CHAT_DB: DB });
  const spy = vi.spyOn(d, '_pushToUsers').mockResolvedValue();
  await d.notifyOfflineMembers({ id: 'm' + Math.random(), conv_id: CONV, sender_id: sender, ts: Date.now(), mime: 'text/plain' });
  return spy.mock.calls.length ? spy.mock.calls[0][0].sort() : [];
}
/** Les VRAIES fonctions de la page (sourdine) branchées sur la VRAIE route du serveur. */
async function appOf(DB, uid) {
  const token = await session(uid);
  const store = {};
  const K = {
    token, conversations: [{ id: CONV, name: 'Famille', type: 'group' }], render() {}, _closeModal() {},
    _api: async (method, path, body) => {
      const r = await worker.fetch(makeRequest({ method, path, body, token }), env(DB), { waitUntil() {} });
      return r.json();
    },
  };
  loadDefs(['K._setSnooze = function(convId, durationOrToken){', 'K._cancelSnooze = function(convId){',
    'K._muteServerState = function(conv){', 'K._syncConvMute = async function(conv, silent){', 'K._mergeMuted = function(serverConv, localConv){'],
  { K, ls: (k, v) => { store[k] = v; }, toast: () => {}, _safeCatch() {} });
  return K;
}

describe('Item 7 — sourdine temporaire (snooze) gardée par le serveur, comme le muet permanent', () => {
  it('bob met le groupe en sourdine 1 h depuis l\'app → serveur : fin enregistrée, bob n\'est plus notifié ; à l\'échéance il l\'est de nouveau', async () => {
    const DB = seed();
    expect(await notified(DB)).toEqual(['bob', 'carol']);
    const K = await appOf(DB, 'bob');
    const t0 = Date.now();
    expect(await K._setSnooze(CONV, String(3600000))).toBe(true);
    const row = DB.raw.prepare('SELECT muted_until FROM conv_mutes WHERE conv_id=? AND user_id=?').get(CONV, 'bob');
    expect(row.muted_until).toBeGreaterThanOrEqual(t0 + 3600000 - 50);
    expect(row.muted_until).toBeLessThanOrEqual(Date.now() + 3600000);
    expect(await notified(DB)).toEqual(['carol']);
    // L'autre téléphone de bob retrouve la sourdine (💤, avec sa fin), pas un muet permanent.
    const list = await K._api('GET', '/api/conversations');
    const c = list.conversations.find((x) => x.id === CONV);
    expect(K._mergeMuted(c, {})).toMatchObject({ muted: false, snoozed_until: row.muted_until });
    // Échéance passée → notifié de nouveau, sans rien faire.
    DB.raw.prepare('UPDATE conv_mutes SET muted_until=? WHERE user_id=?').run(Date.now() - 1, 'bob');
    expect(await notified(DB)).toEqual(['bob', 'carol']);
  });

  it('annuler la sourdine depuis l\'app la retire du serveur ; muet permanent + sourdine → le serveur garde le permanent', async () => {
    const DB = seed();
    const K = await appOf(DB, 'carol');
    await K._setSnooze(CONV, 'tomorrow_8am');
    expect(await notified(DB)).toEqual(['bob']);
    await K._cancelSnooze(CONV);
    expect(DB.raw.prepare('SELECT COUNT(*) n FROM conv_mutes WHERE user_id=?').get('carol').n).toBe(0);
    expect(await notified(DB)).toEqual(['bob', 'carol']);
    K.conversations[0].muted = true;
    await K._setSnooze(CONV, String(3600000));
    expect(DB.raw.prepare('SELECT muted_until FROM conv_mutes WHERE user_id=?').get('carol').muted_until).toBeNull();
  });
});
