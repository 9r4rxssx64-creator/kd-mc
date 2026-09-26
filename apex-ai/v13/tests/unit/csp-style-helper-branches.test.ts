/**
 * csp-style-helper — couverture branches restantes (campagne 100%, 2026-06-02).
 * Cible getNonce : document undefined, querySelector throw, nonce trouvé/absent.
 * Reset le singleton entre tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';

beforeEach(() => { vi.clearAllMocks(); cspStyleHelper.reset(); document.querySelector('script[nonce]')?.remove(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cspStyleHelper.reset(); });

describe('csp-style-helper — getNonce', () => {
  it('script[nonce] présent → retourne le nonce + cache', () => {
    const s = document.createElement('script');
    s.setAttribute('nonce', 'abc123');
    document.head.appendChild(s);
    expect(cspStyleHelper.getNonce()).toBe('abc123');
    /* 2e appel → cache (detected) */
    expect(cspStyleHelper.getNonce()).toBe('abc123');
    s.remove();
  });

  it('pas de script[nonce] → null', () => {
    expect(cspStyleHelper.getNonce()).toBeNull();
  });

  it('document undefined → null (guard typeof)', () => {
    vi.stubGlobal('document', undefined);
    expect(cspStyleHelper.getNonce()).toBeNull();
  });

  it('querySelector throw → catch → null', () => {
    vi.spyOn(document, 'querySelector').mockImplementation(() => { throw new Error('dom err'); });
    expect(cspStyleHelper.getNonce()).toBeNull();
  });

  it('setNonce force la valeur (cache)', () => {
    cspStyleHelper.setNonce('forced');
    expect(cspStyleHelper.getNonce()).toBe('forced');
  });
});

describe('csp-style-helper — withNonce & extractStyles', () => {
  it('withNonce sans nonce → html inchangé', () => {
    cspStyleHelper.setNonce(null);
    expect(cspStyleHelper.withNonce('<style>a{}</style>')).toBe('<style>a{}</style>');
  });

  it('withNonce avec nonce → ajoute nonce aux <style> sans nonce', () => {
    cspStyleHelper.setNonce('n1');
    const out = cspStyleHelper.withNonce('<style>a{}</style>');
    expect(out).toContain('nonce="n1"');
  });

  it('extractStyles → sépare cleanHtml et styles', () => {
    const { cleanHtml, styles } = cspStyleHelper.extractStyles('<div>x</div><style>a{color:red}</style>');
    expect(cleanHtml).not.toContain('<style');
    expect(styles).toEqual(['a{color:red}']);
  });

  it('extractStyles sans <style> → styles vide', () => {
    const { styles } = cspStyleHelper.extractStyles('<div>plain</div>');
    expect(styles).toEqual([]);
  });
});
