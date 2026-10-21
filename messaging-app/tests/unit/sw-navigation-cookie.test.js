/**
 * MESURÉ en vrai navigateur (robot « toutes les fonctions », 22.10.2026) : une personne déjà installée (service worker actif) qui rouvre Apex Chat reçoit « Connexion au domaine requise. »
 * en texte brut — la requête que le SW refait lui-même part SANS le cookie du domaine. La requête d'origine du navigateur (pré-chargement de navigation) l'a : on la prend d'abord.
 */
import { describe, it, expect, vi } from 'vitest';
import * as sw from '../../lib/sw-handlers.js';

const caches = () => { const put = vi.fn(); return { put, open: vi.fn(async () => ({ put })), match: vi.fn(async () => undefined) }; };
const reponse = (corps, status = 200) => ({ body: corps, status, ok: status < 300, clone() { return this; } });

describe('SW : navigation avec le cookie du domaine', () => {
  it('la réponse du pré-chargement de navigation est utilisée ; le SW ne refait PAS la requête', async () => {
    const fetch = vi.fn(async () => reponse('refaite-sans-cookie', 401));
    const r = await sw.handleFetchNavigation({ url: 'https://x/' }, { fetch, caches: caches(), response: Response }, { preloadResponse: Promise.resolve(reponse('page-avec-cookie')) });
    expect(r.body).toBe('page-avec-cookie'); expect(fetch).not.toHaveBeenCalled();
  });
  it('sans pré-chargement : repli sur la requête du SW (comme avant)', async () => {
    const fetch = vi.fn(async () => reponse('reseau'));
    const r = await sw.handleFetchNavigation({ url: 'https://x/' }, { fetch, caches: caches(), response: Response }, { preloadResponse: Promise.resolve(undefined) });
    expect(r.body).toBe('reseau'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('une page de refus (401) n\'est jamais mise en cache', async () => {
    const c = caches();
    await sw.handleFetchNavigation({ url: 'https://x/' }, { fetch: vi.fn(), caches: c, response: Response }, { preloadResponse: Promise.resolve(reponse('refus', 401)) });
    expect(c.put).not.toHaveBeenCalled();
  });
  it('l\'activation allume le pré-chargement de navigation (et ne casse pas s\'il manque)', async () => {
    const enable = vi.fn(async () => {});
    const deps = { caches: { keys: async () => [], delete: async () => true }, clients: { claim: async () => {}, matchAll: async () => [] } };
    await sw.handleActivate({ ...deps, registration: { navigationPreload: { enable } } });
    expect(enable).toHaveBeenCalledTimes(1);
    await expect(sw.handleActivate({ ...deps, registration: {} })).resolves.toBeDefined();
  });
  it('le pré-chargement échoue (promesse rejetée) : repli sur la requête du SW', async () => {
    const fetch = vi.fn(async () => reponse('reseau'));
    const r = await sw.handleFetchNavigation({ url: 'https://x/' }, { fetch, caches: caches(), response: Response }, { preloadResponse: Promise.reject(new Error('annulé')) });
    expect(r.body).toBe('reseau');
  });
  it('l\'activation survit à un navigateur dont enable() échoue', async () => {
    const deps = { caches: { keys: async () => [], delete: async () => true }, clients: { claim: async () => {}, matchAll: async () => [] } };
    await expect(sw.handleActivate({ ...deps, registration: { navigationPreload: { enable: async () => { throw new Error('non supporté'); } } } })).resolves.toBeDefined();
  });
});
