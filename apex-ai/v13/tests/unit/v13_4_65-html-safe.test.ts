/* eslint-disable no-script-url -- Test fixtures intentionnels (vérifient sanitization XSS) */

/**
 * Test régression v13.4.65 — core/html-safe.ts (sécu XSS critique).
 *
 * 5 fonctions : escapeHtml / sanitizeHtml / sanitizeUrl / safeSetHTML / stripDangerousHtml.
 * Erreur #8 CLAUDE.md : "innerHTML sans esc() = XSS guaranteed".
 */
import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeUrl,
  safeSetHTML,
  stripDangerousHtml,
} from '../../core/html-safe.js';

describe('v13.4.65 escapeHtml — 5 entités HTML', () => {
  it("string vide → string vide", () => {
    expect(escapeHtml('')).toBe('');
  });

  it("null/undefined → string vide", () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it("number → toString sans escape (chiffres safe)", () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it("& → &amp;", () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it("< → &lt; et > → &gt;", () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it("\" → &quot;", () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it("' → &#39;", () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it("Vecteur XSS classique neutralisé", () => {
    const xss = '<img src=x onerror=alert(1)>';
    const r = escapeHtml(xss);
    expect(r).not.toContain('<');
    expect(r).not.toContain('>');
    expect(r).toContain('&lt;');
  });
});

describe('v13.4.65 sanitizeUrl — anti javascript: schemes', () => {
  it("null/undefined/vide → string vide", () => {
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl('')).toBe('');
  });

  it("https:// retourne tel quel", () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it("http:// retourne tel quel", () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it("javascript:alert refused → string vide", () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it("JAVASCRIPT:alert (case-insensitive) refused", () => {
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it("vbscript: refused", () => {
    expect(sanitizeUrl('vbscript:msgbox')).toBe('');
  });

  it("data:text/html refused", () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it("relative path retourne tel quel", () => {
    expect(sanitizeUrl('/dashboard')).toBe('/dashboard');
  });
});

describe('v13.4.65 stripDangerousHtml — XSS vectors', () => {
  it("string vide → string vide", () => {
    expect(stripDangerousHtml('')).toBe('');
  });

  it("strip <script>...</script>", () => {
    const r = stripDangerousHtml('<p>hello</p><script>alert(1)</script>');
    expect(r).not.toContain('<script');
    expect(r).toContain('<p>hello</p>');
  });

  it("strip <iframe>", () => {
    const r = stripDangerousHtml('<iframe src="evil.com"></iframe><p>ok</p>');
    expect(r).not.toContain('<iframe');
    expect(r).toContain('<p>ok</p>');
  });

  it("strip <object>/<embed>", () => {
    const r1 = stripDangerousHtml('<object data="evil"></object>');
    const r2 = stripDangerousHtml('<embed src="evil">');
    expect(r1).not.toContain('<object');
    expect(r2).not.toContain('<embed');
  });

  it("strip onclick= attribute", () => {
    const r = stripDangerousHtml('<a onclick="alert(1)">click</a>');
    expect(r).not.toContain('onclick');
  });

  it("strip onerror= attribute", () => {
    const r = stripDangerousHtml('<img src=x onerror="alert(1)">');
    expect(r).not.toContain('onerror');
  });

  it("strip javascript: dans href", () => {
    const r = stripDangerousHtml('<a href="javascript:alert(1)">x</a>');
    expect(r).not.toContain('javascript:');
  });

  it("strip data:text/html dans src", () => {
    const r = stripDangerousHtml('<img src="data:text/html,<script>x</script>">');
    expect(r).not.toContain('data:text/html');
  });

  it("HTML safe (<p><strong>) passe inchangé", () => {
    const safe = '<p><strong>bold</strong></p>';
    expect(stripDangerousHtml(safe)).toBe(safe);
  });
});

describe('v13.4.65 safeSetHTML — wrapper innerHTML safe', () => {
  it("null el → no-op (pas de throw)", () => {
    expect(() => safeSetHTML(null, '<p>x</p>')).not.toThrow();
    expect(() => safeSetHTML(undefined, '<p>x</p>')).not.toThrow();
  });

  it("html null → innerHTML vidé", () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>old</p>';
    safeSetHTML(el, null);
    expect(el.innerHTML).toBe('');
  });

  it("html safe → innerHTML appliqué", () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<p>hello</p>');
    expect(el.innerHTML).toContain('<p>');
    expect(el.innerHTML).toContain('hello');
  });

  it("html avec <script> → script retiré", () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<p>ok</p><script>alert(1)</script>');
    expect(el.innerHTML).not.toContain('<script');
    expect(el.innerHTML).toContain('ok');
  });
});
