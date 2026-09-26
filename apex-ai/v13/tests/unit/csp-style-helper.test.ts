/**
 * Tests csp-style-helper v13.4.149 (Kevin "100/100 réel").
 *
 * Module : services/csp-style-helper.ts (106 lines, 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';

describe('csp-style-helper (v13.4.149 coverage)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    cspStyleHelper.reset();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    cspStyleHelper.reset();
  });

  describe('getNonce', () => {
    it('retourne null si pas de script nonce', () => {
      expect(cspStyleHelper.getNonce()).toBeNull();
    });

    it('détecte nonce depuis script du DOM', () => {
      const s = document.createElement('script');
      s.setAttribute('nonce', 'test_nonce_xyz');
      document.head.appendChild(s);
      expect(cspStyleHelper.getNonce()).toBe('test_nonce_xyz');
    });

    it('cache le résultat (idempotent)', () => {
      const s = document.createElement('script');
      s.setAttribute('nonce', 'cached_nonce');
      document.head.appendChild(s);
      const n1 = cspStyleHelper.getNonce();
      /* Retire le script, mais cache doit retenir */
      s.remove();
      const n2 = cspStyleHelper.getNonce();
      expect(n1).toBe(n2);
      expect(n2).toBe('cached_nonce');
    });
  });

  describe('setNonce / reset', () => {
    it('setNonce force la valeur', () => {
      cspStyleHelper.setNonce('manual_nonce');
      expect(cspStyleHelper.getNonce()).toBe('manual_nonce');
    });

    it('setNonce null reset', () => {
      cspStyleHelper.setNonce(null);
      expect(cspStyleHelper.getNonce()).toBeNull();
    });

    it('reset re-détecte au prochain getNonce', () => {
      cspStyleHelper.setNonce('first');
      cspStyleHelper.reset();
      expect(cspStyleHelper.getNonce()).toBeNull();
    });
  });

  describe('withNonce', () => {
    it('ne change rien si pas de nonce', () => {
      const html = '<style>.foo{}</style><div>X</div>';
      expect(cspStyleHelper.withNonce(html)).toBe(html);
    });

    it('ajoute nonce à <style>', () => {
      cspStyleHelper.setNonce('test_n');
      const html = '<style>.foo{color:red}</style>';
      const result = cspStyleHelper.withNonce(html);
      expect(result).toContain('nonce="test_n"');
    });

    it('idempotent : ne change pas si nonce déjà présent', () => {
      cspStyleHelper.setNonce('test_n');
      const html = '<style nonce="other">.foo{}</style>';
      const result = cspStyleHelper.withNonce(html);
      expect(result).toContain('nonce="other"');
      /* ne doit pas avoir 2 nonces */
      expect((result.match(/nonce=/g) ?? []).length).toBe(1);
    });

    it('multiple <style> tags chacun reçoit nonce', () => {
      cspStyleHelper.setNonce('n_multi');
      const html = '<style>.a{}</style><div></div><style>.b{}</style>';
      const result = cspStyleHelper.withNonce(html);
      expect((result.match(/nonce="n_multi"/g) ?? []).length).toBe(2);
    });

    it('conserve autres attributs <style>', () => {
      cspStyleHelper.setNonce('n_x');
      const html = '<style type="text/css">.foo{}</style>';
      const result = cspStyleHelper.withNonce(html);
      expect(result).toContain('type="text/css"');
      expect(result).toContain('nonce="n_x"');
    });
  });

  describe('extractStyles', () => {
    it('extrait blocs <style> simples', () => {
      const html = '<style>.foo{color:red}</style><div>X</div>';
      const r = cspStyleHelper.extractStyles(html);
      expect(r.styles).toEqual(['.foo{color:red}']);
      expect(r.cleanHtml).toBe('<div>X</div>');
    });

    it('extrait multiple blocs', () => {
      const html = '<style>.a{}</style><div></div><style>.b{}</style>';
      const r = cspStyleHelper.extractStyles(html);
      expect(r.styles).toEqual(['.a{}', '.b{}']);
      expect(r.cleanHtml).toBe('<div></div>');
    });

    it('retourne [] si pas de <style>', () => {
      const r = cspStyleHelper.extractStyles('<div>X</div>');
      expect(r.styles).toEqual([]);
      expect(r.cleanHtml).toBe('<div>X</div>');
    });

    it('extrait avec attributs <style nonce="x">', () => {
      const html = '<style nonce="x">.foo{}</style>';
      const r = cspStyleHelper.extractStyles(html);
      expect(r.styles).toEqual(['.foo{}']);
    });
  });
});
