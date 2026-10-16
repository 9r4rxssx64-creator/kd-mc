/**
 * iPhone : au retour de veille / de réseau, le temps réel de la conversation affichée se rouvre
 * (audit 16.10.2026 : après 8 essais ratés, ou une socket gelée par iOS, plus rien ne le relançait).
 * Le test exécute la VRAIE fonction extraite de index.html.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

function charger(K) {
  const src = extractDef(readIndex(), 'K._wsRevive = function(){', '\n  };');
  // eslint-disable-next-line no-new-func
  new Function('K', '_safeCatch', src)(K, () => {});
  return K._wsRevive;
}
const base = (o = {}) => ({ view: 'chat', viewData: { id: 'c1' }, token: 't', ws: null, _wsRetry: 8, _openWs: vi.fn(), ...o });

describe('réveil du temps réel', () => {
  it('rouvre la conversation affichée quand la socket est absente, et remet le compteur à zéro', () => {
    const K = base(); const f = charger(K);
    expect(f()).toBe(true);
    expect(K._openWs).toHaveBeenCalledWith('c1');
    expect(K._wsRetry).toBe(0);
  });
  it('rouvre aussi une socket fermée (état 3) ou en fermeture (2)', () => {
    for (const st of [2, 3]) { const K = base({ ws: { readyState: st } }); expect(charger(K)()).toBe(true); }
  });
  it('ne touche pas une socket ouverte ou en cours de connexion', () => {
    for (const st of [0, 1]) { const K = base({ ws: { readyState: st } }); expect(charger(K)()).toBe(false); expect(K._openWs).not.toHaveBeenCalled(); }
  });
  it('ne fait rien hors d\'une conversation ou sans session', () => {
    expect(charger(base({ view: 'chats' }))()).toBe(false);
    expect(charger(base({ token: null }))()).toBe(false);
  });
  it('est branchée sur le retour d\'écran, la page restaurée et le retour du réseau', () => {
    const html = readIndex();
    expect(html).toMatch(/visibilitychange', \(\) => \{ if\(!document\.hidden\) K\._wsRevive\(\); \}\)/);
    expect(html).toMatch(/addEventListener\('pageshow', \(\) => K\._wsRevive\(\)\)/);
    expect(html).toMatch(/K\.isOnline = true;\n    K\._wsRevive\(\);/);
  });
});
