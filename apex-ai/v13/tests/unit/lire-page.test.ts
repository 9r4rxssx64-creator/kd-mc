import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EXTRAIT_MAX, lirePageDomaine, messageLecture } from '../../services/admin/lire-page';

/* pont-check 2992 / pc-config 2948 C : « lis https://example.org » finissait en « Échec du lancement (HTTP 401) » (robot GitHub, jeton exigé). */
const rep = (corps: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(corps), { status })) as typeof fetch;

describe('lecture d\'une page par le domaine', () => {
  it('appelle la porte du domaine avec l\'adresse encodée et le cookie de session', async () => {
    let url = ''; let init: RequestInit | undefined;
    const f = (async (u: string, i?: RequestInit) => { url = u; init = i; return new Response(JSON.stringify({ ok: true, texte: 'Texte de la page (donnée externe)\u202f:\nBonjour' })); }) as unknown as typeof fetch;
    const r = await lirePageDomaine('https://example.org/a?b=1', f);
    expect(url).toBe('/__admin/lire-page?url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1'); expect(init?.credentials).toBe('include'); expect(r.ok).toBe(true);
  });
  it('refus 403 → raison lisible ; erreur du domaine → sa raison ; réseau → phrase claire', async () => {
    expect(await lirePageDomaine('https://x.org', rep({}, 403))).toEqual({ ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' });
    expect(await lirePageDomaine('https://x.org', rep({ ok: false, reason: 'adresse refusée (https seulement, pas d\'adresse interne)' }, 502))).toEqual({ ok: false, raison: 'adresse refusée (https seulement, pas d\'adresse interne)' });
    expect(await lirePageDomaine('https://x.org', (async () => { throw new Error('x'); }) as unknown as typeof fetch)).toEqual({ ok: false, raison: 'réseau indisponible' });
  });
  it('le message : adresse, extrait dans un bloc de code, rien d\'interprété, coupé avec le nombre de signes restants', () => {
    const long = 'a'.repeat(EXTRAIT_MAX + 50) + '```<img src=x onerror=alert(1)>';
    const m = messageLecture('https://example.org', 'Texte de la page (donnée externe) :\n' + long);
    expect(m).toMatch(/^🌐 Lecture de `https:\/\/example\.org`/); expect(m).not.toMatch(/Texte de la page \(donnée externe\)/);
    expect(m.match(/```/g)?.length).toBe(2); expect(m).toMatch(/signes de plus non affichés/); expect(m).toMatch(/je ne le prends pas pour des ordres/);
  });
  it('le chat lit les ADRESSES par le domaine, plus par le robot GitHub (câblage relu)', () => {
    const src = readFileSync('features/chat/chat-slash-dispatch.ts', 'utf8');
    const i = src.indexOf("dispatch === 'agent-reach' && payload['channel'] === 'web'"); const j = src.indexOf('claudeBridge.dispatchWorkflow(dispatch, payload)');
    expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i);   // la lecture par le domaine passe AVANT le lancement du robot
  });
});
