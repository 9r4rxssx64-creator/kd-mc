/**
 * v13.4.378 — 2e capture de Kevin (16.10, 23h32) : premier « Test » → « La clé API IA n'est plus valide… » (anthropic, 1,0 s),
 * le second → groq, gratuit. Sa clé Anthropic du Coffre est refusée (401) et, au même instant, les IA gratuites du domaine
 * n'ont pas répondu (incident Cloudflare) : Apex concluait « clé invalide » (non récupérable) au lieu de « les gratuites
 * n'ont pas répondu, je réessaie ». Ces tests verrouillent : passerelle OK → réponse gratuite ; passerelle muette → erreur
 * RÉCUPÉRABLE qui nomme la passerelle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiRouter } from '../../services/ai/ai-router.js';
import { errors } from '../../core/errors.js';

type R = { hasAnyKey: () => boolean; streamWithFailover: (...a: unknown[]) => Promise<unknown>; buildPolicyAwareChain: () => Promise<string[]> };
const prive = aiRouter as unknown as R;
const reponse = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('v13.4.378 — clé refusée + cascade épuisée : la passerelle gratuite décide du message', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(prive, 'hasAnyKey').mockReturnValue(true);
    vi.spyOn(prive, 'buildPolicyAwareChain').mockResolvedValue(['anthropic']);
    vi.spyOn(prive, 'streamWithFailover').mockResolvedValue({ status: 'error', error: new Error('HTTP 401 invalid_api_key') });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('passerelle OK : la réponse gratuite arrive, aucune erreur de clé', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reponse(200, { ok: true, provider: 'groq', text: 'Test reçu.' })));
    const textes: string[] = []; let erreur: Error | null = null;
    await aiRouter.stream([{ role: 'user', content: 'Test' }], 'Tu es Apex.', (c) => { if (c.text) textes.push(c.text); }, (e) => { erreur = e; });
    expect(textes.join('')).toContain('Test reçu.');
    expect(erreur).toBeNull();
  });

  it('passerelle muette (503) : l\'erreur est RÉCUPÉRABLE et nomme la passerelle, pas seulement la clé', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reponse(503, { ok: false })));
    let erreur: Error | null = null;
    await aiRouter.stream([{ role: 'user', content: 'Test' }], 'Tu es Apex.', () => undefined, (e) => { erreur = e; });
    expect(erreur).not.toBeNull();
    const msg = String((erreur as unknown as Error).message);
    expect(msg).toMatch(/passerelle du domaine/);
    expect(msg).toMatch(/5\d{2}/);              /* ce que le chat considère récupérable → nouvelle tentative auto */
    expect(msg).toMatch(/clé Anthropic/);        /* et la vérité sur la clé, en plus */
    const pourKevin = errors.toUserMessage(erreur as unknown as Error);
    expect(pourKevin).toMatch(/IA gratuites/);   /* la phrase montrée à Kevin parle des gratuites, pas d'« Anthropic en panne » */
    expect(pourKevin).not.toMatch(/Anthropic en panne/);
  });
});
