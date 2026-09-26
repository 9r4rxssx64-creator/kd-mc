/**
 * Tests ui/markdown — Apex v13.3.48 Chat Max
 * Demande Kevin "chat niveau Claude.ai/ChatGPT".
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { renderMarkdownEnriched, escapeHtml, wireMarkdownActions } from '../../ui/markdown.js';

describe('ui/markdown — renderMarkdownEnriched', () => {
  describe('escape sécurité (anti-XSS)', () => {
    it('escape les balises HTML', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escape les guillemets', () => {
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('texte avec script ne génère pas de HTML exécutable', () => {
      const html = renderMarkdownEnriched('Bonjour <script>alert(1)</script>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('headings', () => {
    it('render h1', () => {
      const html = renderMarkdownEnriched('# Titre 1');
      expect(html).toContain('<h1');
      expect(html).toContain('Titre 1');
    });

    it('render h3', () => {
      const html = renderMarkdownEnriched('### Titre 3');
      expect(html).toContain('<h3');
    });
  });

  describe('listes', () => {
    it('render liste non-ordonnée', () => {
      const html = renderMarkdownEnriched('- Item 1\n- Item 2\n- Item 3');
      expect(html).toContain('<ul');
      expect(html).toContain('<li>Item 1</li>');
      expect(html).toContain('<li>Item 3</li>');
    });

    it('render liste ordonnée', () => {
      const html = renderMarkdownEnriched('1. Premier\n2. Second\n3. Troisième');
      expect(html).toContain('<ol');
      expect(html).toContain('<li>Premier</li>');
    });
  });

  describe('blockquotes', () => {
    it('render blockquote', () => {
      const html = renderMarkdownEnriched('> Citation importante');
      expect(html).toContain('<blockquote');
      expect(html).toContain('Citation importante');
    });

    it('peut être désactivé via opts', () => {
      const html = renderMarkdownEnriched('> Citation', { noQuotes: true });
      expect(html).not.toContain('<blockquote');
    });
  });

  describe('code blocks', () => {
    it('render code block avec langage détecté', () => {
      const html = renderMarkdownEnriched('```js\nconst x = 1;\n```');
      expect(html).toContain('ax-codeblock');
      expect(html).toContain('js');
      expect(html).toContain('const x = 1;');
    });

    it('render code block plain (pas de langage)', () => {
      const html = renderMarkdownEnriched('```\nplain text\n```');
      expect(html).toContain('plain');
      expect(html).toContain('plain text');
    });

    it('inclut bouton copy', () => {
      const html = renderMarkdownEnriched('```py\nprint(1)\n```');
      expect(html).toContain('ax-codeblock-copy');
      expect(html).toContain('Copier');
    });

    it('escape le contenu du code', () => {
      const html = renderMarkdownEnriched('```\n<script>alert(1)</script>\n```');
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('tables', () => {
    it('render table standard', () => {
      const md = '| Col1 | Col2 |\n| --- | --- |\n| A | B |\n| C | D |';
      const html = renderMarkdownEnriched(md);
      expect(html).toContain('<table');
      expect(html).toContain('<th');
      expect(html).toContain('Col1');
      expect(html).toContain('<td');
      expect(html).toContain('A');
    });

    it('peut être désactivé', () => {
      const md = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
      const html = renderMarkdownEnriched(md, { noTables: true });
      expect(html).not.toContain('<table');
    });
  });

  describe('inline formatting', () => {
    it('render bold', () => {
      const html = renderMarkdownEnriched('Texte **important**');
      expect(html).toContain('<strong>important</strong>');
    });

    it('render italic', () => {
      const html = renderMarkdownEnriched('Texte *italique*');
      expect(html).toContain('<em>italique</em>');
    });

    it('render code inline', () => {
      const html = renderMarkdownEnriched('Variable `x` ici');
      expect(html).toContain('ax-code-inline');
      expect(html).toContain('x');
    });

    it('render strikethrough', () => {
      const html = renderMarkdownEnriched('Mot ~~biffé~~');
      expect(html).toContain('<del>biffé</del>');
    });

    it('render link http', () => {
      const html = renderMarkdownEnriched('[Google](https://google.com)');
      expect(html).toContain('href="https://google.com"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it('refuse javascript: links (sécu)', () => {
      const html = renderMarkdownEnriched('[evil](javascript:alert(1))');
      expect(html).not.toContain('href="javascript:');
    });

    it('render footnotes [N]', () => {
      const html = renderMarkdownEnriched('Selon Larousse [1] et CNRS [2].');
      expect(html).toContain('ax-footnote');
      expect(html).toContain('data-footnote="1"');
      expect(html).toContain('data-footnote="2"');
    });
  });

  describe('horizontal rule', () => {
    it('render hr ---', () => {
      const html = renderMarkdownEnriched('Avant\n\n---\n\nAprès');
      expect(html).toContain('<hr');
    });
  });

  describe('paragraphes', () => {
    it('regroupe lignes consécutives en un paragraphe', () => {
      const html = renderMarkdownEnriched('Première ligne\nDeuxième ligne');
      expect(html).toContain('<p');
      expect(html).toContain('Première ligne Deuxième ligne');
    });

    it('sépare par double newline', () => {
      const html = renderMarkdownEnriched('Para 1\n\nPara 2');
      const matches = html.match(/<p /g);
      expect(matches?.length).toBe(2);
    });
  });

  describe('vide / null', () => {
    it('retourne vide pour string vide', () => {
      expect(renderMarkdownEnriched('')).toBe('');
    });

    it('gère undefined safely', () => {
      expect(renderMarkdownEnriched(null as unknown as string)).toBe('');
    });
  });

  describe('wireMarkdownActions', () => {
    let container: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = '<div id="root"></div>';
      container = document.getElementById('root')!;
    });

    it('idempotent (peut être appelé 2× sans double-wire)', () => {
      container.innerHTML = renderMarkdownEnriched('```js\ntest\n```');
      wireMarkdownActions(container);
      expect(container.dataset['markdownWired']).toBe('1');
      wireMarkdownActions(container);
      expect(container.dataset['markdownWired']).toBe('1');
    });
  });
});
