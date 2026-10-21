// @vitest-environment node
/**
 * Le navigateur n'envoie une requête PUT / PATCH / DELETE qu'après une pré-requête (OPTIONS) qui doit LISTER la méthode. Le robot « toutes les fonctions » (21.10.2026) a mesuré :
 * la sourdine d'une conversation (PUT /mute) et le surnom d'un contact (PUT /contact/…) n'atteignaient jamais le serveur — « PUT » manquait à la liste. Garde générale : toute méthode
 * qu'une route du serveur accepte doit figurer dans la liste du CORS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, withOrigin } from './api-worker-helpers.js';

const src = readFileSync(new URL('../../workers/api-worker.js', import.meta.url), 'utf8');
const preflight = async (methode) => {
  const req = withOrigin(makeRequest({ method: 'OPTIONS', path: '/api/conversations/x/mute', extraHeaders: { 'Access-Control-Request-Method': methode } }), 'https://apex-chat.kd-mc.com');
  const r = await worker.fetch(req, ENV(), { waitUntil() {} });
  return { statut: r.status, liste: (r.headers.get('access-control-allow-methods') || '').split(',').map((x) => x.trim()) };
};

describe('CORS : méthodes acceptées', () => {
  it('chaque méthode utilisée par une route du serveur est annoncée à la pré-requête', async () => {
    const utilisees = new Set([...src.matchAll(/\bmethod === '([A-Z]+)'/g)].map((m) => m[1]));
    expect([...utilisees]).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE']));
    const { liste } = await preflight('PUT');
    for (const m of utilisees) expect(liste, `méthode ${m} absente du CORS`).toContain(m);
  });
  it('la pré-requête d\'une sourdine (PUT) est acceptée', async () => {
    const { statut, liste } = await preflight('PUT');
    expect(statut).toBeLessThan(300); expect(liste).toContain('PUT');
  });
});
