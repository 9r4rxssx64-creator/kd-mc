/**
 * Audit P2a — le jeton de SESSION ne doit plus voyager dans l'URL du WebSocket
 * (v1.1.286).
 *
 * Une URL finit dans les journaux du serveur, l'historique du navigateur et
 * parfois l'en-tête Referer : y mettre le jeton de session revient à y écrire
 * le mot de passe. On échange donc le jeton (en-tête Authorization, qui ne
 * voyage jamais dans une URL) contre un TICKET à usage unique valable 60 s.
 *
 * Ce que ce fichier PROUVE, en appelant le vrai worker :
 *   1. POST /api/auth/ws-ticket exige une session valide (401 sinon).
 *   2. Le ticket délivré ouvre bien le chemin WS (?ticket=).
 *   3. Le MÊME ticket une 2ᵉ fois est REFUSÉ (usage unique, anti-rejeu).
 *   4. Un ticket ne vaut JAMAIS session : refusé en Bearer et en ?token=.
 *   5. Le jeton de session reste accepté en ?token= (repli d'une version, pour
 *      ne pas couper les apps encore en cache — jamais casser la connexion).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { signJWT } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

const UID = 'u_kevin';

/** Base simulée : users + conversation_members + la table ws_tickets réelle. */
function stubDB() {
  const tickets = new Set();
  return {
    _tickets: tickets,
    prepare(sql) {
      const stmt = {
        _a: [],
        bind(...a) { return { ...stmt, _a: a }; },
        async first() {
          if (sql.includes('last_force_logout_at')) {
            return { last_force_logout_at: null, is_banned: 0, status: 'active', phone: '+33600000000' };
          }
          if (sql.includes('FROM conversation_members')) return { conv_id: 'c1', user_id: UID, role: 'member' };
          if (sql.includes('FROM conversations')) return { id: 'c1', type: 'dm', sharded_to_do: 'do_c1' };
          return null;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO ws_tickets')) {
            const jti = this._a[0];
            if (tickets.has(jti)) return { success: true, meta: { changes: 0 } };  // rejeu
            tickets.add(jti);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

function env() {
  return {
    ...ENV(),
    APEX_CHAT_DB: stubDB(),
    // Le WS délègue à un Durable Object : on renvoie une réponse reconnaissable
    // pour prouver qu'on est allé JUSQU'AU BOUT du chemin authentifié.
    CONVERSATION_DO: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('DO_OK', { status: 101 }) }) },
  };
}

// Node refuse de poser l'en-tête `Upgrade` sur une Request (en-tête interdit
// par fetch) → on ne peut pas rejouer un vrai handshake ici. On interroge donc
// /ws-diag, qui traverse EXACTEMENT le même `getAuthUser` que le WebSocket et
// renvoie le verdict d'authentification en JSON.
async function wsAuth(E, qs) {
  const r = await worker.fetch(new Request('https://api.apex/api/conversations/c1/ws-diag?' + qs), E, {});
  const d = await r.json().catch(() => ({}));
  return d.authenticated === true;
}

async function getTicket(E, token) {
  const r = await worker.fetch(
    new Request('https://api.apex/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }),
    E, {}
  );
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe('WebSocket : ticket à usage unique au lieu du jeton de session (v1.1.286)', () => {
  it('1. POST /api/auth/ws-ticket refuse sans session valide', async () => {
    const E = env();
    const r = await worker.fetch(new Request('https://api.apex/api/auth/ws-ticket', { method: 'POST' }), E, {});
    expect(r.status).toBe(401);
  });

  it('2. avec une session valide, délivre un ticket qui ouvre le WebSocket', async () => {
    const E = env();
    const session = await signJWT({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
    const { status, body } = await getTicket(E, session);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.ticket).toBe('string');

    expect(await wsAuth(E, 'ticket=' + encodeURIComponent(body.ticket))).toBe(true);
  });

  it('3. le MÊME ticket une 2ᵉ fois est refusé (usage unique, anti-rejeu)', async () => {
    const E = env();
    const session = await signJWT({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
    const { body } = await getTicket(E, session);

    expect(await wsAuth(E, 'ticket=' + encodeURIComponent(body.ticket))).toBe(true);
    expect(await wsAuth(E, 'ticket=' + encodeURIComponent(body.ticket))).toBe(false); // rejeu REFUSÉ
  });

  it('4. un ticket ne vaut JAMAIS session (ni en Bearer, ni en ?token=)', async () => {
    const E = env();
    const session = await signJWT({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
    const { body } = await getTicket(E, session);

    // En-tête Bearer avec un ticket → refusé
    const asBearer = await worker.fetch(
      new Request('https://api.apex/api/conversations', { headers: { Authorization: 'Bearer ' + body.ticket } }), E, {}
    );
    expect(asBearer.status).toBe(401);

    // ?token= avec un ticket → refusé (sinon le ticket redeviendrait une clé)
    expect(await wsAuth(E, 'token=' + encodeURIComponent(body.ticket))).toBe(false);

    // …et le ticket n'a PAS été consommé par ces tentatives : il reste valable
    // une fois sur le vrai chemin.
    expect(await wsAuth(E, 'ticket=' + encodeURIComponent(body.ticket))).toBe(true);
  });

  it('5. repli : le jeton de session reste accepté en ?token= (une version)', async () => {
    const E = env();
    const session = await signJWT({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
    expect(await wsAuth(E, 'token=' + encodeURIComponent(session))).toBe(true);
  });

  it('6. le client demande un ticket et ne met plus le jeton dans l\'URL du WS', () => {
    const html = readFileSync(INDEX, 'utf8');

    expect(html).toContain('/api/auth/ws-ticket');
    expect(html).toContain('K._wsTicket');
    // Le chemin par défaut du WebSocket porte un ticket ; ?token= n'y subsiste
    // que comme repli explicite quand le serveur n'a pas encore la route.
    expect(html).toMatch(/ticket=\$\{encodeURIComponent\(ticket\)\}|'ticket=' \+ encodeURIComponent\(ticket\)/);
  });
});
