/**
 * v13.4.372 — « Vérifie tout en détail » (Kevin 16.10.2026). Mesuré dans un vrai Chromium (écran iPhone, Apex ouverte
 * comme Kevin) : trois bulles d'information s'empilaient au démarrage (« Proxy Cloudflare activé », « 7 clés restaurées »
 * en DOUBLE) et recouvraient la réponse d'Apex ; le bouton « ← Chat » s'affichait nu, en texte, par-dessus le logo,
 * parce que son <style> posé à la main était refusé par la politique de sécurité de la page (style-src nonce).
 * Ces tests verrouillent : une seule bulle par ouverture, et un CSS du bouton posé par styleInjector (CSP-safe).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bulles: string[] = [];
vi.mock('../../ui/toast.js', () => ({
  toast: {
    show: (m: string) => { bulles.push(m); return 'id'; },
    info: (m: string) => { bulles.push(m); return 'id'; },
  },
}));

describe('v13.4.372 — une seule bulle par ouverture', () => {
  beforeEach(() => { bulles.length = 0; localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('« clés restaurées » : trois passages de restoreAutomatically → une bulle', async () => {
    const { autoRestoreCredentials } = await import('../../services/vault/auto-restore-credentials.js');
    /* Un audit qui trouve une clé récupérable à chaque fois, et une restauration qui réussit. */
    vi.spyOn(autoRestoreCredentials as unknown as { auditMissing: () => Promise<unknown> }, 'auditMissing')
      .mockResolvedValue({ missing: [], recoverable: [{ storage_key: 'ax_groq_key', recoverable_from: 'alias' }], truly_absent: [] });
    vi.spyOn(autoRestoreCredentials as unknown as { restoreOne: () => Promise<unknown> }, 'restoreOne').mockResolvedValue({ ok: true });
    for (let i = 0; i < 3; i++) await autoRestoreCredentials.restoreAutomatically();
    expect(bulles.filter((b) => /restaurées/.test(b)).length).toBe(1);
  });

  it('le CSS du bouton « ← Chat » passe par styleInjector (nonce CSP), jamais par un <style> nu', async () => {
    const { styleInjector } = await import('../../services/core-svc/style-injector.js');
    const { globalBackButton } = await import('../../services/core-svc/global-back-button.js');
    const posesNus = vi.spyOn(document.head, 'appendChild');
    (globalBackButton as unknown as { installed: boolean }).installed = false;
    globalBackButton.install();
    expect(styleInjector.has('apex-global-back-style')).toBe(true);
    const stylesNus = posesNus.mock.calls.filter(([n]) => (n as Element).tagName === 'STYLE' && !(n as Element).getAttribute('nonce') && !(n as HTMLElement).dataset['styleInjectorId']);
    expect(stylesNus.length).toBe(0);
    styleInjector.remove('apex-global-back-style');
  });
});
