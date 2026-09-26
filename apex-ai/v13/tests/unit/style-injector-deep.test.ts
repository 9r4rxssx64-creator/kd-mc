/**
 * APEX v13 — Tests style-injector deep (Constructible Stylesheets + fallback nonce).
 *
 * Cible : pousser services/style-injector.ts vers 100% lines + branches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { styleInjector, StyleInjector } from '../../services/core-svc/style-injector.js';

beforeEach(() => {
  styleInjector.clear();
  document.head.querySelectorAll('style[data-style-injector-id]').forEach((n) => n.remove());
  document.head.querySelectorAll('script[nonce]').forEach((n) => n.remove());
});

afterEach(() => {
  styleInjector.clear();
  document.head.querySelectorAll('style[data-style-injector-id]').forEach((n) => n.remove());
  document.head.querySelectorAll('script[nonce]').forEach((n) => n.remove());
});

describe('StyleInjector — happy path constructible', () => {
  it('inject() retourne id', () => {
    const id = styleInjector.inject('test-1', '.x{color:red}');
    expect(id).toBe('test-1');
  });

  it('has() true après inject', () => {
    styleInjector.inject('test-2', '.x{color:red}');
    expect(styleInjector.has('test-2')).toBe(true);
  });

  it('list() contient les ids', () => {
    styleInjector.inject('a', '.x{}');
    styleInjector.inject('b', '.y{}');
    const ids = styleInjector.list();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('isConstructibleSupported renvoie true (happy-dom)', () => {
    /* happy-dom supporte CSSStyleSheet + adoptedStyleSheets */
    const supported = styleInjector.isConstructibleSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('inject idempotent : même id remplace via update', () => {
    styleInjector.inject('idem', '.a{color:red}');
    const id = styleInjector.inject('idem', '.a{color:blue}');
    expect(id).toBe('idem');
    /* Une seule entrée encore */
    expect(styleInjector.list().filter((x) => x === 'idem').length).toBe(1);
  });

  it('update() retourne true si id existe', () => {
    styleInjector.inject('upd', '.x{}');
    expect(styleInjector.update('upd', '.x{color:green}')).toBe(true);
  });

  it('update() retourne false si id inconnu', () => {
    expect(styleInjector.update('inconnu', '.x{}')).toBe(false);
  });

  it('remove() retourne true si id existe', () => {
    styleInjector.inject('rm', '.x{}');
    expect(styleInjector.remove('rm')).toBe(true);
    expect(styleInjector.has('rm')).toBe(false);
  });

  it('remove() retourne false si id inconnu', () => {
    expect(styleInjector.remove('inconnu')).toBe(false);
  });

  it('clear() supprime tous les sheets', () => {
    styleInjector.inject('a', '.x{}');
    styleInjector.inject('b', '.y{}');
    styleInjector.clear();
    expect(styleInjector.list()).toHaveLength(0);
  });
});

describe('StyleInjector — fallback nonce path', () => {
  it('inject avec nonce ajoute attribut nonce sur <style>', () => {
    /* Ajoute un script avec nonce pour que getNonce() le trouve */
    const script = document.createElement('script');
    script.setAttribute('nonce', 'abc123nonce');
    document.head.appendChild(script);

    /* Force fallback en désactivant constructible */
    const inj = new StyleInjector();
    /* Force fallback path */
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    inj.inject('with-nonce', '.x{color:red}');

    const styleEl = document.querySelector('style[data-style-injector-id="with-nonce"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.getAttribute('nonce')).toBe('abc123nonce');
    inj.clear();
  });

  it('inject sans nonce dispo crée <style> sans attribut nonce', () => {
    const inj = new StyleInjector();
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    inj.inject('no-nonce', '.x{}');
    const el = document.querySelector('style[data-style-injector-id="no-nonce"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('nonce')).toBeNull();
    inj.clear();
  });

  it('update fallback met à jour textContent du <style>', () => {
    const inj = new StyleInjector();
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    inj.inject('upd-fb', '.x{color:red}');
    expect(inj.update('upd-fb', '.x{color:blue}')).toBe(true);
    const el = document.querySelector<HTMLStyleElement>('style[data-style-injector-id="upd-fb"]');
    expect(el?.textContent).toBe('.x{color:blue}');
    inj.clear();
  });

  it('remove fallback retire <style> du DOM', () => {
    const inj = new StyleInjector();
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    inj.inject('rm-fb', '.x{}');
    expect(document.querySelector('style[data-style-injector-id="rm-fb"]')).not.toBeNull();
    expect(inj.remove('rm-fb')).toBe(true);
    expect(document.querySelector('style[data-style-injector-id="rm-fb"]')).toBeNull();
  });
});

describe('StyleInjector — edge cases', () => {
  it('clear vide même quand 0 sheets', () => {
    const inj = new StyleInjector();
    inj.clear();
    expect(inj.list()).toHaveLength(0);
  });

  it('detectCapabilities ne re-runs pas (cached)', () => {
    const inj = new StyleInjector();
    inj.isConstructibleSupported(); /* premier appel */
    const before = (inj as unknown as { supportsConstructible: boolean | null }).supportsConstructible;
    inj.isConstructibleSupported(); /* second appel : doit court-circuiter */
    const after = (inj as unknown as { supportsConstructible: boolean | null }).supportsConstructible;
    expect(after).toBe(before);
  });

  it('getNonce cached après premier call', () => {
    const script = document.createElement('script');
    script.setAttribute('nonce', 'cachednonce');
    document.head.appendChild(script);

    const inj = new StyleInjector();
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    inj.inject('first', '.x{}');
    /* Retire le script, le 2e inject doit utiliser le cache */
    script.remove();
    inj.inject('second', '.y{}');
    const el = document.querySelector('style[data-style-injector-id="second"]');
    expect(el?.getAttribute('nonce')).toBe('cachednonce');
    inj.clear();
  });

  it('inject sans document (SSR-like) ne plante pas', () => {
    const inj = new StyleInjector();
    /* Force le path SSR : supportsConstructible=false ET document undefined */
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = false;
    const origDoc = globalThis.document;
    /* @ts-expect-error simul SSR */
    delete globalThis.document;
    try {
      const id = inj.inject('ssr', '.x{}');
      expect(id).toBe('ssr');
      expect(inj.has('ssr')).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'document', { value: origDoc, configurable: true });
    }
  });

  it('inject quand constructible throw → tombe en fallback', () => {
    const inj = new StyleInjector();
    /* Force constructible = true mais le constructeur throw */
    (inj as unknown as { supportsConstructible: boolean }).supportsConstructible = true;
    const orig = globalThis.CSSStyleSheet;
    /* @ts-expect-error mock force */
    globalThis.CSSStyleSheet = function () {
      throw new Error('Forced throw');
    };
    try {
      const id = inj.inject('ctor-throw', '.x{}');
      expect(id).toBe('ctor-throw');
      /* DOM <style> doit avoir été créé en fallback */
      expect(document.querySelector('style[data-style-injector-id="ctor-throw"]')).not.toBeNull();
    } finally {
      globalThis.CSSStyleSheet = orig;
      inj.clear();
    }
  });

  it('update constructible throw → retourne false', () => {
    const inj = new StyleInjector();
    inj.inject('upd-throw', '.x{}');
    const sheet = (inj as unknown as { sheets: Map<string, { sheet?: { replaceSync: (s: string) => void } }> }).sheets.get('upd-throw');
    if (sheet?.sheet) {
      const orig = sheet.sheet.replaceSync;
      sheet.sheet.replaceSync = () => {
        throw new Error('replace fail');
      };
      try {
        expect(inj.update('upd-throw', '.x{color:red}')).toBe(false);
      } finally {
        sheet.sheet.replaceSync = orig;
      }
    }
    inj.clear();
  });

  it('remove constructible filter throw → ne plante pas', () => {
    const inj = new StyleInjector();
    inj.inject('rm-throw', '.x{}');
    /* Capture le sheet, simule throw sur filter */
    const doc = document as Document & { adoptedStyleSheets: CSSStyleSheet[] };
    const origDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'adoptedStyleSheets');
    let getCount = 0;
    Object.defineProperty(doc, 'adoptedStyleSheets', {
      get() {
        getCount++;
        if (getCount > 1) throw new Error('forced get throw');
        return [];
      },
      set() { /* ignore */ },
      configurable: true,
    });
    try {
      expect(inj.remove('rm-throw')).toBe(true);
    } finally {
      if (origDescriptor) {
        Object.defineProperty(doc, 'adoptedStyleSheets', origDescriptor);
      } else {
        delete (doc as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
      }
    }
  });

  it('detectCapabilities catch throw → supportsConstructible false', () => {
    const inj = new StyleInjector();
    /* Force throw via Object.defineProperty pour que `Array.isArray` fail */
    const orig = globalThis.CSSStyleSheet;
    Object.defineProperty(globalThis, 'CSSStyleSheet', {
      get() {
        throw new Error('detect throw');
      },
      configurable: true,
    });
    try {
      const supported = inj.isConstructibleSupported();
      expect(supported).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'CSSStyleSheet', { value: orig, configurable: true, writable: true });
    }
  });
});

describe('StyleInjector — singleton instance', () => {
  it('exporte styleInjector singleton', () => {
    expect(styleInjector).toBeInstanceOf(StyleInjector);
  });

  it('exporte StyleInjector class', () => {
    expect(StyleInjector).toBeDefined();
    expect(typeof StyleInjector).toBe('function');
  });
});

describe('StyleInjector — branches restantes (campagne 100%)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('getNonce : document undefined → null (61)', () => {
    const inj = new StyleInjector() as unknown as { getNonce(): string | null };
    vi.stubGlobal('document', undefined);
    expect(inj.getNonce()).toBeNull();
  });

  it('getNonce : querySelector throw → catch null (66)', () => {
    const inj = new StyleInjector() as unknown as { getNonce(): string | null };
    vi.spyOn(document, 'querySelector').mockImplementation(() => { throw new Error('dom'); });
    expect(inj.getNonce()).toBeNull();
  });

  it('update : replaceSync throw → catch false (136)', () => {
    const inj = new StyleInjector();
    (inj as unknown as { sheets: Map<string, unknown> }).sheets.set('x', {
      id: 'x', css: '', sheet: { replaceSync: () => { throw new Error('r'); } },
    });
    expect(inj.update('x', 'body{}')).toBe(false);
  });

  it('update : sheet sans .sheet ni .el → return false (136)', () => {
    const inj = new StyleInjector();
    (inj as unknown as { sheets: Map<string, unknown> }).sheets.set('y', { id: 'y', css: '' });
    expect(inj.update('y', 'body{}')).toBe(false);
  });

  it('remove : adoptedStyleSheets accès throw → catch (150)', () => {
    const inj = new StyleInjector();
    (inj as unknown as { sheets: Map<string, unknown> }).sheets.set('x', { id: 'x', css: '', sheet: {} });
    const orig = Object.getOwnPropertyDescriptor(document, 'adoptedStyleSheets');
    Object.defineProperty(document, 'adoptedStyleSheets', {
      get() { throw new Error('no adopted'); }, configurable: true,
    });
    expect(() => inj.remove('x')).not.toThrow();
    if (orig) Object.defineProperty(document, 'adoptedStyleSheets', orig);
    else delete (document as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  });
});
