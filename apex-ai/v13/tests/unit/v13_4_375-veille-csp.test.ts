/**
 * v13.4.375 — la veille technologique respecte la CSP de la page (16.10.2026).
 * Mesuré (Lighthouse au dépôt public, run 38955866488 ; vrai Chromium) : 16 violations « connect-src » à chaque
 * ouverture — registry.npmjs.org, huggingface.co, api.github.com ne sont pas dans la CSP d'index.html. Un hôte
 * interdit n'est pas appelé : le scan est sauté et le dit une fois.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cspAutorise, innovationWatch } from '../../services/sentinels/innovation-watch.js';

const CSP = "default-src 'self'; connect-src 'self' https://apis.kd-mc.com https://*.firebaseio.com https://api.groq.com; img-src 'self' https:";
let meta: HTMLMetaElement | null = null;
const poseCSP = (contenu: string) => {
  meta = document.createElement('meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', contenu);
  document.head.appendChild(meta);
};

describe('v13.4.375 — veille technologique et CSP connect-src', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { meta?.remove(); meta = null; vi.restoreAllMocks(); });

  it('cspAutorise lit connect-src : hôte exact, joker *.domaine, self ; le reste est refusé', () => {
    poseCSP(CSP);
    expect(cspAutorise('https://apis.kd-mc.com/ai')).toBe(true);
    expect(cspAutorise('https://cmcteams-c16ab.firebaseio.com/x.json')).toBe(true);
    expect(cspAutorise(location.origin + '/api/x')).toBe(true);
    expect(cspAutorise('https://registry.npmjs.org/idb/latest')).toBe(false);
    expect(cspAutorise('https://huggingface.co/api/models')).toBe(false);
    expect(cspAutorise('https://api.github.com/search/repositories')).toBe(false);
  });

  it('sans connect-src dans la page, rien n\'est interdit', () => {
    poseCSP("default-src 'self'");
    expect(cspAutorise('https://registry.npmjs.org/idb/latest')).toBe(true);
  });

  it('runScan ne touche jamais un hôte interdit par la CSP (npm, Hugging Face, GitHub sautés)', async () => {
    poseCSP(CSP);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [], items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await innovationWatch.runScan();
    const appels = fetchSpy.mock.calls.map((c) => String(c[0]));
    const interdits = appels.filter((u) => /registry\.npmjs\.org|huggingface\.co|api\.github\.com/.test(u));
    expect(interdits).toEqual([]);
  });
});
