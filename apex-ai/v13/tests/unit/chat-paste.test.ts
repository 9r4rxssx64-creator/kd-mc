/**
 * Tests chat-paste v13.4.167 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression vs ancienne implémentation in-place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectPasteKind,
  pushPasteCard,
  type PasteKind,
} from '../../features/chat/chat-paste.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('chat-paste extracted module (v13.4.167)', () => {
  describe('detectPasteKind', () => {
    it('chaîne vide → text', () => {
      expect(detectPasteKind('')).toBe('text');
      expect(detectPasteKind('   ')).toBe('text');
    });

    it('texte simple → text', () => {
      expect(detectPasteKind('Hello world')).toBe('text');
    });

    it('backtick block multi-line → code', () => {
      expect(detectPasteKind('```\nfoo\n```')).toBe('code');
      expect(detectPasteKind('```js\nconst x=1\n```')).toBe('code');
    });

    it('code multi-line avec keywords → code', () => {
      expect(detectPasteKind('function foo() {\n  const x = 1;\n  return x;\n}')).toBe('code');
    });

    it('JSON multi-line → code', () => {
      expect(detectPasteKind('{\n  "key": "value",\n  "x": 1\n}')).toBe('code');
    });

    it('HTML multi-line → code', () => {
      expect(detectPasteKind('<!DOCTYPE html>\n<html>\n<body></body></html>')).toBe('code');
    });

    it('URL pure → url', () => {
      expect(detectPasteKind('https://anthropic.com/api')).toBe('url');
      expect(detectPasteKind('http://localhost:3000')).toBe('url');
    });

    it('URL avec autre texte → text (pas url)', () => {
      expect(detectPasteKind('Voir https://anthropic.com pour info')).toBe('text');
    });

    it('2 lignes texte → text (pas code)', () => {
      expect(detectPasteKind('ligne 1\nligne 2')).toBe('text');
    });

    it('3 lignes sans keywords → text', () => {
      expect(detectPasteKind('a\nb\nc')).toBe('text');
    });
  });

  describe('pushPasteCard', () => {
    let rootEl: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = '';
      rootEl = document.createElement('div');
      const scroll = document.createElement('div');
      scroll.className = 'ax-chat-scroll';
      Object.defineProperty(scroll, 'scrollTo', { value: vi.fn(), writable: true });
      rootEl.appendChild(scroll);
      document.body.appendChild(rootEl);
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('retourne null si .ax-chat-scroll absent', () => {
      const empty = document.createElement('div');
      expect(pushPasteCard(empty, 'code', 'foo')).toBeNull();
    });

    it('crée card pour code avec icône 💻', () => {
      const card = pushPasteCard(rootEl, 'code', 'const x = 1;');
      expect(card).not.toBeNull();
      expect(card?.className).toContain('ax-paste-card');
      expect(card?.textContent).toContain('💻');
      expect(card?.textContent).toContain('const x = 1');
    });

    it('crée card pour url avec icône 🔗', () => {
      const card = pushPasteCard(rootEl, 'url', 'https://x.com');
      expect(card?.textContent).toContain('🔗');
      expect(card?.textContent).toContain('https://x.com');
    });

    it('crée card pour credential avec icône 🔑', () => {
      const card = pushPasteCard(rootEl, 'credential', 'sk-ant-xxxx');
      expect(card?.textContent).toContain('🔑');
    });

    it('crée card pour planning avec icône 📋', () => {
      const card = pushPasteCard(rootEl, 'planning', 'planning data');
      expect(card?.textContent).toContain('📋');
    });

    it('tronque preview > 500 chars', () => {
      const long = 'x'.repeat(800);
      const card = pushPasteCard(rootEl, 'text', long);
      const pre = card?.querySelector('pre');
      expect(pre?.textContent?.length).toBeLessThanOrEqual(501); /* 500 + ellipsis */
      expect(pre?.textContent).toContain('…');
    });

    it('XSS-safe : HTML dans preview reste textContent (pas innerHTML)', () => {
      const xss = '<script>alert(1)</script>';
      const card = pushPasteCard(rootEl, 'text', xss);
      expect(card?.querySelector('script')).toBeNull(); /* Pas exécuté */
      expect(card?.textContent).toContain('<script>');
    });

    it('crée action buttons fonctionnels', () => {
      const onClickSpy = vi.fn();
      const card = pushPasteCard(rootEl, 'code', 'foo', [
        { label: 'Sauver', onClick: onClickSpy, primary: true },
      ]);
      const btn = card?.querySelector('button');
      expect(btn?.textContent).toBe('Sauver');
      expect(btn?.className).toContain('ax-btn-primary');
      btn?.click();
      expect(onClickSpy).toHaveBeenCalled();
    });

    it('action button disable après click (anti-double-trigger)', () => {
      const card = pushPasteCard(rootEl, 'code', 'foo', [
        { label: 'A', onClick: vi.fn() },
        { label: 'B', onClick: vi.fn() },
      ]);
      const btns = card?.querySelectorAll('button');
      (btns?.[0] as HTMLButtonElement).click();
      btns?.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    });

    it('action onClick throw → log warn (pas crash)', () => {
      const card = pushPasteCard(rootEl, 'code', 'foo', [
        { label: 'Bad', onClick: () => { throw new Error('boom'); } },
      ]);
      expect(() => card?.querySelector('button')?.click()).not.toThrow();
    });

    it('PasteKind type accepte les 5 valeurs', () => {
      const kinds: PasteKind[] = ['credential', 'code', 'url', 'planning', 'text'];
      for (const k of kinds) {
        const card = pushPasteCard(rootEl, k, 'X');
        expect(card).not.toBeNull();
      }
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte detectPasteKind + pushPasteCard', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.detectPasteKind).toBe('function');
      expect(typeof chatModule.pushPasteCard).toBe('function');
    });
  });
});
