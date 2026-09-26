/**
 * Tests core/escape-html v13.4.185.
 *
 * Vérifie XSS-safety : 5 chars critiques (& < > " ') escapés vers entités HTML.
 * Couvre null/undefined/number/boolean fallback to ''.
 */
import { describe, expect, it } from 'vitest';

import { esc, escapeHtml, escapeAttr } from '../../core/escape-html.js';

describe('core/escape-html escapeAttr', () => {
  it('null/undefined → ""', () => {
    expect(escapeAttr(null)).toBe('');
    expect(escapeAttr(undefined)).toBe('');
  });
  it('échappe les chars critiques (attribut)', () => {
    expect(escapeAttr('a"<b>\'&')).toBe('a&quot;&lt;b&gt;&#39;&amp;');
  });
  it('number/boolean stringifiés', () => {
    expect(escapeAttr(42)).toBe('42');
    expect(escapeAttr(true)).toBe('true');
  });
});

describe('core/escape-html escapeHtml (v13.4.185)', () => {
  it('escape ampersand → &amp;', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escape less-than → &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escape greater-than → &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escape double-quote → &quot;', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escape single-quote → &#39;', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escape tous chars critiques ensemble', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&Z</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;Z&lt;/a&gt;',
    );
  });

  it('string vide → string vide', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('null → string vide', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('undefined → string vide', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('texte sans chars dangereux → inchangé', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('emojis préservés (pas dans chars dangereux)', () => {
    expect(escapeHtml('Bonjour 👋')).toBe('Bonjour 👋');
  });

  it('XSS payload neutralisé', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const safe = escapeHtml(payload);
    expect(safe).not.toContain('<img');
    expect(safe).not.toContain('"');
    expect(safe).toContain('&lt;img');
  });
});

describe('core/escape-html esc (v13.4.185)', () => {
  it('number → stringified + escaped', () => {
    expect(esc(42)).toBe('42');
  });

  it('boolean true → "true"', () => {
    expect(esc(true)).toBe('true');
  });

  it('null → ""', () => {
    expect(esc(null)).toBe('');
  });

  it('undefined → ""', () => {
    expect(esc(undefined)).toBe('');
  });

  it('string user-controlled → escapé', () => {
    expect(esc('<x>')).toBe('&lt;x&gt;');
  });
});
