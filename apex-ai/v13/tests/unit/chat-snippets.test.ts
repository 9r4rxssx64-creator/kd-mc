/**
 * Tests chat-snippets v13.4.166 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression vs ancienne implémentation in-place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveCodeSnippet,
  listCodeSnippets,
  deleteCodeSnippet,
} from '../../features/chat/chat-snippets.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('chat-snippets extracted module (v13.4.166)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveCodeSnippet', () => {
    it('sauve un snippet et retourne ok+key', async () => {
      const r = await saveCodeSnippet('const x = 1;', 'js');
      expect(r.ok).toBe(true);
      expect(r.key).toMatch(/^apex_v13_code_/);
    });

    it('lang par défaut "unknown" si non fourni', async () => {
      const r = await saveCodeSnippet('foo bar baz');
      expect(r.ok).toBe(true);
      const stored = JSON.parse(localStorage.getItem(r.key ?? '') ?? '{}');
      expect(stored.lang).toBe('unknown');
    });

    it('compte lines + size correctement', async () => {
      const code = 'line1\nline2\nline3';
      const r = await saveCodeSnippet(code);
      const stored = JSON.parse(localStorage.getItem(r.key ?? '') ?? '{}');
      expect(stored.lines).toBe(3);
      expect(stored.size).toBe(code.length);
    });

    it('ajoute à index FIFO (max 100)', async () => {
      const r = await saveCodeSnippet('test', 'js');
      const idx = JSON.parse(localStorage.getItem('apex_v13_code_snippets_index') ?? '[]');
      expect(idx[0]).toBe(r.key);
    });

    it('cap index à 100 snippets', async () => {
      /* Pré-remplit index avec 100 entrées factices */
      const fakeIdx = Array.from({ length: 100 }, (_, i) => `apex_v13_code_${i}`);
      localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(fakeIdx));
      const r = await saveCodeSnippet('new');
      expect(r.ok).toBe(true);
      const idx = JSON.parse(localStorage.getItem('apex_v13_code_snippets_index') ?? '[]');
      expect(idx.length).toBe(100);
      expect(idx[0]).toBe(r.key);
    });
  });

  describe('listCodeSnippets', () => {
    it('retourne [] si aucun snippet', () => {
      expect(listCodeSnippets()).toEqual([]);
    });

    it('liste snippets sauvés', async () => {
      await saveCodeSnippet('s1', 'js');
      await saveCodeSnippet('s2', 'py');
      const list = listCodeSnippets();
      expect(list.length).toBe(2);
      expect(list[0]?.code).toBe('s2'); /* desc order (unshift) */
    });

    it('skip entries orphelines (index pointe vers clé absente)', async () => {
      const fakeIdx = ['apex_v13_code_orphan', 'apex_v13_code_legit'];
      localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(fakeIdx));
      localStorage.setItem(
        'apex_v13_code_legit',
        JSON.stringify({ code: 'X', lang: 'js', created: 1, lines: 1, size: 1 }),
      );
      const list = listCodeSnippets();
      expect(list.length).toBe(1);
      expect(list[0]?.key).toBe('apex_v13_code_legit');
    });

    it('skip entries corrompues (JSON invalide)', () => {
      const fakeIdx = ['apex_v13_code_corrupt'];
      localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(fakeIdx));
      localStorage.setItem('apex_v13_code_corrupt', '{not valid');
      expect(listCodeSnippets()).toEqual([]);
    });

    it('gère index corrompu', () => {
      localStorage.setItem('apex_v13_code_snippets_index', '{not json');
      expect(listCodeSnippets()).toEqual([]);
    });
  });

  describe('deleteCodeSnippet', () => {
    it('supprime entry + retire de index', async () => {
      const r = await saveCodeSnippet('to-delete');
      const ok = deleteCodeSnippet(r.key ?? '');
      expect(ok).toBe(true);
      expect(localStorage.getItem(r.key ?? '')).toBeNull();
      const idx = JSON.parse(localStorage.getItem('apex_v13_code_snippets_index') ?? '[]');
      expect(idx).not.toContain(r.key);
    });

    it('refuse clé sans préfix apex_v13_code_ (security)', () => {
      localStorage.setItem('arbitrary_key', 'sensitive');
      const ok = deleteCodeSnippet('arbitrary_key');
      expect(ok).toBe(false);
      expect(localStorage.getItem('arbitrary_key')).toBe('sensitive');
    });

    it('retourne true même si key déjà absente (idempotent)', () => {
      const ok = deleteCodeSnippet('apex_v13_code_nonexistent_xyz');
      expect(ok).toBe(true);
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte les 3 fonctions', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.saveCodeSnippet).toBe('function');
      expect(typeof chatModule.listCodeSnippets).toBe('function');
      expect(typeof chatModule.deleteCodeSnippet).toBe('function');
    });
  });
});
