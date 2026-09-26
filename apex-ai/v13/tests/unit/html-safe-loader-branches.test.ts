/**
 * html-safe loadDOMPurify — couverture des shapes d'import + catch fallback (campagne 100%).
 * Mocke 'dompurify' avec différentes formes (browser direct / factory / inconnu) + resetModules
 * pour réinitialiser le memo `_dompurifyPromise` à chaque test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('dompurify'); });

describe('html-safe — loadDOMPurify shapes', () => {
  it('mod.default nullish (sanitize au top-level) → `?? mod` + case1 browser', async () => {
    vi.resetModules();
    vi.doMock('dompurify', () => ({ default: null, sanitize: (h: string) => h }));
    const { sanitizeHtml } = await import('../../core/html-safe.js');
    const r = await sanitizeHtml('<p>x</p>');
    expect(r).toBe('<p>x</p>'); // sanitize identité du mock (def = namespace via ?? mod)
  });

  it('default = factory fn → case2 factory(window)', async () => {
    vi.resetModules();
    vi.doMock('dompurify', () => ({
      default: (_w: unknown) => ({ sanitize: (h: string) => `F:${h}` }),
    }));
    const { sanitizeHtml } = await import('../../core/html-safe.js');
    const r = await sanitizeHtml('<p>x</p>');
    expect(r).toBe('F:<p>x</p>');
  });

  it('shape inconnu (ni sanitize ni fonction) → throw → sanitizeHtml catch → escape fallback', async () => {
    vi.resetModules();
    vi.doMock('dompurify', () => ({ default: {} }));
    const { sanitizeHtml } = await import('../../core/html-safe.js');
    const r = await sanitizeHtml('<p>x</p>');
    expect(r).toContain('&lt;'); // fallback escapeHtml → < devient &lt;
  });
});
