/**
 * Audit P2c — le jeton de SESSION ne doit plus voyager dans l'URL des médias
 * (v1.1.288).
 *
 * `K._mediaSrc` collait `?token=<jeton de session>` sur chaque photo/vidéo :
 * le jeton entrait donc dans le DOM, l'historique du navigateur et les
 * journaux du serveur, avec la durée de vie d'un mot de passe.
 *
 * Contrairement au ticket WebSocket, un ticket média doit être RÉUTILISABLE :
 * une photo est relue à chaque affichage (aperçu, plein écran, re-rendu). Sa
 * protection n'est donc pas l'usage unique mais la **portée** : 5 minutes, et
 * valable NULLE PART ailleurs que sur la route qui sert les fichiers.
 *
 * Ce fichier PROUVE, en appelant le vrai worker :
 *   1. /api/auth/media-ticket exige une session valide.
 *   2. Le ticket sert bien un média (?mt=), et plusieurs fois de suite.
 *   3. Le ticket ne vaut RIEN ailleurs : ni en Bearer, ni en ?token=, ni sur
 *      une autre route.
 *   4. Un ticket WebSocket ne sert pas de ticket média (et réciproquement).
 *   5. Le client demande un ticket au lieu de coller le jeton de session.
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

function stubDB() {
  return {
    prepare(sql) {
      const stmt = {
        _a: [],
        bind(...a) { return { ...stmt, _a: a }; },
        async first() {
          if (sql.includes('last_force_logout_at')) {
            return { last_force_logout_at: null, is_banned: 0, status: 'active', phone: '+33600000000' };
          }
          if (sql.includes('FROM media')) return { r2_key: 'media/u_kevin/m1.jpg', mime: 'image/jpeg', owner_id: UID };
          return null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

const env = () => ({
  ...ENV(),
  APEX_CHAT_DB: stubDB(),
  APEX_CHAT_MEDIA: { get: async () => ({ body: 'BINAIRE', httpMetadata: { contentType: 'image/jpeg' } }) },
});

const session = (E) => signJWT({ sub: UID, exp: Math.floor(Date.now() / 1000) + 3600 }, E.JWT_SIGN_KEY);
const media = (qs) => new Request('https://api.apex/api/media/m1?' + qs);

async function ticketFor(E, token) {
  const r = await worker.fetch(
    new Request('https://api.apex/api/auth/media-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }),
    E, {}
  );
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe('Médias : ticket de portée limitée au lieu du jeton de session (v1.1.288)', () => {
  it('1. /api/auth/media-ticket exige une session valide', async () => {
    const E = env();
    const r = await worker.fetch(new Request('https://api.apex/api/auth/media-ticket', { method: 'POST' }), E, {});
    expect(r.status).toBe(401);
  });

  it('2. le ticket sert un média, et plusieurs fois (il est réutilisable)', async () => {
    const E = env();
    const { status, body } = await ticketFor(E, await session(E));
    expect(status).toBe(200);
    expect(typeof body.ticket).toBe('string');

    const q = 'mt=' + encodeURIComponent(body.ticket);
    expect((await worker.fetch(media(q), E, {})).status).toBe(200);
    expect((await worker.fetch(media(q), E, {})).status).toBe(200);   // relu : OK
    expect((await worker.fetch(media(q), E, {})).status).toBe(200);
  });

  it('3. le ticket média ne vaut RIEN ailleurs', async () => {
    const E = env();
    const { body } = await ticketFor(E, await session(E));

    // en-tête Bearer → refusé
    const asBearer = await worker.fetch(
      new Request('https://api.apex/api/conversations', { headers: { Authorization: 'Bearer ' + body.ticket } }), E, {}
    );
    expect(asBearer.status).toBe(401);

    // ?token= sur la route média → refusé (seul ?mt= est prévu pour ça)
    expect((await worker.fetch(media('token=' + encodeURIComponent(body.ticket)), E, {})).status).toBe(401);

    // ?mt= sur une AUTRE route → ignoré (l'option n'est activée que par la
    // route média) donc non authentifié
    const elsewhere = await worker.fetch(
      new Request('https://api.apex/api/conversations?mt=' + encodeURIComponent(body.ticket)), E, {}
    );
    expect(elsewhere.status).toBe(401);
  });

  it('4. un ticket WebSocket n\'est pas un ticket média', async () => {
    const E = env();
    const wsTicket = await signJWT(
      { sub: UID, typ: 'wstkt', jti: 'j1', exp: Math.floor(Date.now() / 1000) + 60 }, E.JWT_SIGN_KEY
    );
    expect((await worker.fetch(media('mt=' + encodeURIComponent(wsTicket)), E, {})).status).toBe(401);
  });

  it('5. le jeton de session, lui, sert toujours un média (repli, une version)', async () => {
    const E = env();
    const s = await session(E);
    expect((await worker.fetch(media('token=' + encodeURIComponent(s)), E, {})).status).toBe(200);
  });

  it('6. le client demande un ticket média au lieu de coller le jeton', () => {
    const html = readFileSync(INDEX, 'utf8');
    expect(html).toContain('/api/auth/media-ticket');
    expect(html).toContain('K._ensureMediaTicket');
    expect(html).toContain("'mt=' + encodeURIComponent(t.v)");
  });
});
