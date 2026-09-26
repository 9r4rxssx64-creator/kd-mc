/**
 * Tests chat-markdown v13.4.165 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression vs ancienne implémentation in-place.
 */
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdownLight } from '../../features/chat/chat-markdown.js';

describe('chat-markdown extracted module (v13.4.165)', () => {
  describe('escapeHtml', () => {
    it('échappe & < > " \'', () => {
      expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
    });

    it('chaîne sans caractères dangereux inchangée', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    it('échappe XSS classique <script>', () => {
      expect(escapeHtml('<script>alert("x")</script>')).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
      );
    });

    it('chaîne vide', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('caractères unicode préservés', () => {
      expect(escapeHtml('Café 🎉 émoji')).toBe('Café 🎉 émoji');
    });
  });

  describe('renderMarkdownLight', () => {
    it('gras **text**', () => {
      expect(renderMarkdownLight('Hello **world**')).toBe('Hello <strong>world</strong>');
    });

    it('italique *text*', () => {
      expect(renderMarkdownLight('Hello *world*')).toBe('Hello <em>world</em>');
    });

    it('code inline `text`', () => {
      expect(renderMarkdownLight('Use `npm test`')).toBe('Use <code class="ax-code-inline">npm test</code>');
    });

    it('code block ```text```', () => {
      const r = renderMarkdownLight('```\nconst x = 1;\n```');
      expect(r).toContain('<pre class="ax-code">');
      expect(r).toContain('const x = 1;');
    });

    it('retour ligne \\n → <br>', () => {
      expect(renderMarkdownLight('Line 1\nLine 2')).toBe('Line 1<br>Line 2');
    });

    it('combine bold + italic + code', () => {
      const r = renderMarkdownLight('**bold** *italic* `code`');
      expect(r).toContain('<strong>bold</strong>');
      expect(r).toContain('<em>italic</em>');
      expect(r).toContain('<code class="ax-code-inline">code</code>');
    });

    it('échappe HTML avant markdown (anti-XSS)', () => {
      const r = renderMarkdownLight('<script>alert(1)</script>');
      expect(r).not.toContain('<script>');
      expect(r).toContain('&lt;script&gt;');
    });

    it('code block préserve indentation', () => {
      const r = renderMarkdownLight('```\n  indented\n```');
      expect(r).toContain('  indented');
    });

    it('chaîne vide', () => {
      expect(renderMarkdownLight('')).toBe('');
    });

    it('texte sans markdown inchangé (sauf escape)', () => {
      expect(renderMarkdownLight('Hello World')).toBe('Hello World');
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte escapeHtml et renderMarkdownLight', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.escapeHtml).toBe('function');
      expect(typeof chatModule.renderMarkdownLight).toBe('function');
    });
  });
});
