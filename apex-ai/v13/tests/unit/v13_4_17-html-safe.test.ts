/* eslint-disable no-script-url -- Test fixtures intentionnels (vérifient sanitization XSS) */

/**
 * Test régression v13.4.17 — core/html-safe.ts (P1 sécurité audit, 0% coverage).
 *
 * Module critique sécu : escapeHtml, sanitizeUrl, safeSetHTML.
 * Anti-XSS si user input → innerHTML. Sans ces fonctions = injection JS possible.
 *
 * Tests réels appelant le VRAI helper exporté.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeUrl, safeSetHTML } from '../../core/html-safe.js';

describe('v13.4.17 escapeHtml (anti-XSS strict)', () => {
  it("retourne '' pour null/undefined (back-compat sécurité)", () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it("retourne '' pour string vide", () => {
    expect(escapeHtml('')).toBe('');
  });

  it('convertit number en string', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(-3.14)).toBe('-3.14');
  });

  it('échappe les 5 caractères dangereux HTML', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('neutralise script tag (vecteur XSS classique)', () => {
    const xss = '<script>alert("xss")</script>';
    const escaped = escapeHtml(xss);
    expect(escaped).not.toContain('<script');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('neutralise event handler inline (onerror, onclick)', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('texte normal passe sans modification', () => {
    expect(escapeHtml('bonjour Kevin')).toBe('bonjour Kevin');
    expect(escapeHtml('Apex v13.4.16 ready')).toBe('Apex v13.4.16 ready');
  });

  it('escape & avant les autres (ordre critique anti-double-escape)', () => {
    /* Si & était échappé APRÈS <, on aurait &amp;lt; (double-escape).
     * Le test vérifie qu'on ne double-escape PAS car remplacement single-pass. */
    expect(escapeHtml('A&B<C')).toBe('A&amp;B&lt;C');
  });

  it('protège contre tentative bypass via Unicode et chars exotiques', () => {
    expect(escapeHtml('emoji 🔑 et accent é')).toBe('emoji 🔑 et accent é'); /* Unicode passe */
    expect(escapeHtml('"><svg/onload=alert(1)>'))
      .toBe('&quot;&gt;&lt;svg/onload=alert(1)&gt;');
  });
});

describe('v13.4.17 sanitizeUrl (anti unsafe scheme)', () => {
  it("retourne '' pour null/undefined/vide", () => {
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl('')).toBe('');
  });

  it('refuse javascript: scheme (vecteur XSS href)', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe(''); /* case insensitive */
    expect(sanitizeUrl('  javascript:alert(1)  ')).toBe(''); /* trim */
  });

  it('refuse vbscript: scheme', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeUrl('VbScript:msgbox(1)')).toBe('');
  });

  it('refuse data:text/html (XSS vector via data URL HTML)', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeUrl('DATA:TEXT/HTML,<script>alert(1)</script>')).toBe('');
  });

  it('accepte data:image/png (image légitime)', () => {
    const dataImg = 'data:image/png;base64,iVBORw0KGgo';
    expect(sanitizeUrl(dataImg)).toBe(dataImg);
  });

  it('accepte http(s) URLs normales', () => {
    expect(sanitizeUrl('https://anthropic.com')).toBe('https://anthropic.com');
    expect(sanitizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('accepte relative paths', () => {
    expect(sanitizeUrl('/path/to/file')).toBe('/path/to/file');
    expect(sanitizeUrl('./relative')).toBe('./relative');
  });

  it('accepte mailto:', () => {
    expect(sanitizeUrl('mailto:kevin@example.com')).toBe('mailto:kevin@example.com');
  });
});

describe('v13.4.17 safeSetHTML (sync XSS strip)', () => {
  it('skip silencieusement si el null/undefined', () => {
    expect(() => safeSetHTML(null, '<script>')).not.toThrow();
    expect(() => safeSetHTML(undefined, '<script>')).not.toThrow();
  });

  it("clear innerHTML si html null/undefined", () => {
    const el = document.createElement('div');
    el.innerHTML = 'existing content';
    safeSetHTML(el, null);
    expect(el.innerHTML).toBe('');
    safeSetHTML(el, undefined);
    expect(el.innerHTML).toBe('');
  });

  it('strip <script> tags (cause XSS)', () => {
    const el = document.createElement('div');
    safeSetHTML(el, 'before <script>alert(1)</script> after');
    expect(el.innerHTML).not.toContain('<script');
    expect(el.innerHTML).not.toContain('alert(1)');
  });

  it('strip on*= event handlers (onclick, onload, onerror)', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<img src="x" onerror="alert(1)" onclick="evil()">');
    expect(el.innerHTML).not.toContain('onerror');
    expect(el.innerHTML).not.toContain('onclick');
  });

  it('strip iframe (anti-clickjacking + XSS)', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<iframe src="https://evil.com"></iframe>');
    expect(el.innerHTML).not.toContain('<iframe');
  });

  it('strip javascript: dans href', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<a href="javascript:alert(1)">click</a>');
    expect(el.innerHTML).not.toContain('javascript:');
  });

  it('preserve HTML safe (p, span, strong, etc.)', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<p><strong>Kevin</strong> ok</p>');
    expect(el.innerHTML).toContain('<p>');
    expect(el.innerHTML).toContain('<strong>');
    expect(el.innerHTML).toContain('Kevin');
  });
});
