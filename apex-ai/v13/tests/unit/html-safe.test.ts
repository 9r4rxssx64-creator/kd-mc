// @vitest-environment jsdom
/* eslint-disable no-script-url -- tests vérifient explicitement le blocage de ce schéma */
/**
 * P1 SECU (audit v13.2.7) : tests core/html-safe.ts (escapeHtml + sanitizeHtml + sanitizeUrl).
 *
 * v13.4.324 : tourne sous jsdom (pas happy-dom global). DOMPurify 3.x + happy-dom
 * MALFONCTIONNE (strippe les <p>/<a> mais GARDE <script> → faux échec sécu sur
 * "retire SCRIPT"). jsdom = env de référence DOMPurify → vraie sanitization
 * vérifiée (script/iframe strippés, href https préservé). Prod = vrai navigateur
 * = DOMPurify OK ; cette incompat est UNIQUEMENT happy-dom (env de test).
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeHtml, sanitizeUrl, safeSetHTML, stripDangerousHtml } from '../../core/html-safe.js';

describe('html-safe (P1 SECU XSS)', () => {
  describe('escapeHtml', () => {
    it('échappe les 5 caractères dangereux HTML', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtml('a"b\'c&d>e<f')).toBe('a&quot;b&#39;c&amp;d&gt;e&lt;f');
    });

    it('gère null/undefined sans crash', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('convertit number en string échappé', () => {
      expect(escapeHtml(42)).toBe('42');
      expect(escapeHtml(0)).toBe('0');
    });

    it('chaîne sans caractères dangereux passe inchangée', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
      expect(escapeHtml('123-456')).toBe('123-456');
    });

    it('défense XSS img onerror (les < > sont échappés, le payload n\'est plus exécutable)', () => {
      const xss = '"><img src=x onerror=alert(1)>';
      const safe = escapeHtml(xss);
      /* Les chevrons sont échappés → impossible de fermer un attribut existant et créer un tag */
      expect(safe).not.toContain('<img');
      expect(safe).not.toContain('">');
      expect(safe).toContain('&lt;img');
      expect(safe).toContain('&quot;&gt;');
    });

    it('défense XSS double-quote attribute injection', () => {
      const xss = 'hello" onmouseover="alert(1)';
      const safe = escapeHtml(xss);
      expect(safe).not.toContain('" on');
      expect(safe).toContain('&quot;');
    });
  });

  describe('sanitizeUrl', () => {
    it('refuse javascript: scheme', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('JavaScript:alert(1)')).toBe('');
      expect(sanitizeUrl('  javascript:alert(1)  ')).toBe('');
    });

    it('refuse vbscript: scheme', () => {
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('refuse data:text/html (XSS via base64)', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('autorise https://', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('autorise http://', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('autorise data:image/png (image base64 légitime)', () => {
      const dataImg = 'data:image/png;base64,iVBORw0KGgo=';
      expect(sanitizeUrl(dataImg)).toBe(dataImg);
    });

    it('gère null/empty sans crash', () => {
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null)).toBe('');
      expect(sanitizeUrl(undefined)).toBe('');
    });
  });

  describe('sanitizeHtml (DOMPurify lazy ou escape fallback)', () => {
    /* sanitizeHtml peut soit retourner du HTML safe via DOMPurify, soit fallback
     * escape complet si DOMPurify ne charge pas correctement (happy-dom limit).
     * Dans les 2 cas, le résultat ne doit JAMAIS contenir un script exécutable. */

    it('retire SCRIPT exécutable (DOMPurify ou escape fallback)', async () => {
      const safe = await sanitizeHtml('<p>OK</p><script>alert(1)</script>');
      /* Soit <script> supprimé (DOMPurify), soit échappé (&lt;script&gt; — fallback) */
      expect(safe).not.toMatch(/<script\b/i);
    });

    it('neutralise onerror handler dans HTML', async () => {
      const safe = await sanitizeHtml('<img src=x onerror="alert(1)">');
      /* DOMPurify retire l'attr, fallback échappe les chevrons */
      expect(safe).not.toMatch(/<img[^>]*onerror=/i);
    });

    it('gère HTML vide sans crash', async () => {
      expect(await sanitizeHtml('')).toBe('');
    });

    it('neutralise javascript: dans href', async () => {
      const safe = await sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      /* DOMPurify retire href, fallback échappe le tag entier */
      if (safe.includes('<a')) {
        expect(safe).not.toMatch(/href\s*=\s*['"]?javascript:/i);
      }
    });

    it('preserve contenu textuel sans XSS', async () => {
      const safe = await sanitizeHtml('Hello world');
      expect(safe).toContain('Hello world');
    });
  });

  describe('stripDangerousHtml (synchronous strip)', () => {
    it('retire <script>', () => {
      const r = stripDangerousHtml('<p>OK</p><script>alert(1)</script>');
      expect(r).not.toMatch(/<script/i);
      expect(r).toContain('<p>OK</p>');
    });

    it('retire <iframe>', () => {
      const r = stripDangerousHtml('<div>X</div><iframe src="evil.com"></iframe>');
      expect(r).not.toMatch(/<iframe/i);
    });

    it('retire on* event handlers (double-quoted)', () => {
      const r = stripDangerousHtml('<img src="x.png" onerror="alert(1)">');
      expect(r).not.toMatch(/onerror=/i);
    });

    it('retire on* event handlers (single-quoted)', () => {
      const r = stripDangerousHtml("<img src='x.png' onclick='alert(1)'>");
      expect(r).not.toMatch(/onclick=/i);
    });

    it('neutralise javascript: dans href', () => {
      const r = stripDangerousHtml('<a href="javascript:alert(1)">x</a>');
      expect(r).not.toMatch(/javascript:/i);
    });

    it('neutralise data:text/html', () => {
      const r = stripDangerousHtml('<a href="data:text/html,<script>x</script>">x</a>');
      expect(r).not.toMatch(/data:text\/html/i);
    });

    it('preserve contenu safe', () => {
      const r = stripDangerousHtml('<p>Hello <strong>world</strong></p>');
      expect(r).toContain('<p>');
      expect(r).toContain('<strong>');
      expect(r).toContain('Hello');
    });

    it('handle empty/null', () => {
      expect(stripDangerousHtml('')).toBe('');
    });
  });

  describe('safeSetHTML (DOM helper)', () => {
    it('strips XSS et set innerHTML', () => {
      const el = document.createElement('div');
      safeSetHTML(el, '<p>OK</p><script>alert(1)</script>');
      expect(el.innerHTML).not.toMatch(/<script/i);
      expect(el.innerHTML).toContain('OK');
    });

    it('handle null element sans crash', () => {
      expect(() => safeSetHTML(null, '<p>x</p>')).not.toThrow();
      expect(() => safeSetHTML(undefined, '<p>x</p>')).not.toThrow();
    });

    it('handle null/undefined html', () => {
      const el = document.createElement('div');
      el.innerHTML = '<p>existing</p>';
      safeSetHTML(el, null);
      expect(el.innerHTML).toBe('');
      el.innerHTML = '<p>existing</p>';
      safeSetHTML(el, undefined);
      expect(el.innerHTML).toBe('');
    });

    it('preserve safe HTML', () => {
      const el = document.createElement('div');
      safeSetHTML(el, '<p>Hello <strong>world</strong></p>');
      expect(el.innerHTML).toContain('Hello');
      expect(el.innerHTML).toContain('<strong>');
    });
  });
});
