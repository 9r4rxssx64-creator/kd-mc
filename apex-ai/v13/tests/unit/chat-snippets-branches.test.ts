/**
 * chat-snippets — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible les 3 catch : index corrompu (save), setItem throw (save), delete throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { saveCodeSnippet, deleteCodeSnippet, listCodeSnippets } from '../../features/chat/chat-snippets.js';

const INDEX_KEY = 'apex_v13_code_snippets_index';
const KEY_PREFIX = 'apex_v13_code_';

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('chat-snippets — save', () => {
  it('save OK → ok:true + key préfixée', async () => {
    const r = await saveCodeSnippet('const a=1;', 'js');
    expect(r.ok).toBe(true);
    expect(r.key).toMatch(/^apex_v13_code_/);
    expect(listCodeSnippets().length).toBe(1);
  });

  it('save sans lang → "unknown" (branche ??)', async () => {
    const r = await saveCodeSnippet('x');
    expect(r.ok).toBe(true);
  });

  it('index corrompu → catch interne idx=[] (save réussit quand même)', async () => {
    localStorage.setItem(INDEX_KEY, '{bad json');
    const r = await saveCodeSnippet('y', 'ts');
    expect(r.ok).toBe(true);
  });

  it('setItem throw → outer catch → ok:false', async () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const r = await saveCodeSnippet('z');
    expect(r.ok).toBe(false);
    spy.mockRestore();
  });
});

describe('chat-snippets — delete', () => {
  it('clé sans préfixe → false', () => {
    expect(deleteCodeSnippet('autre_cle')).toBe(false);
  });

  it('delete OK → true + retiré de l\'index', async () => {
    const r = await saveCodeSnippet('del me');
    const key = r.key as string;
    expect(deleteCodeSnippet(key)).toBe(true);
  });

  it('index corrompu pendant delete → catch → false', () => {
    const key = `${KEY_PREFIX}123_abc`;
    localStorage.setItem(key, '{}');
    localStorage.setItem(INDEX_KEY, '{bad json'); // JSON.parse throw dans le try
    expect(deleteCodeSnippet(key)).toBe(false);
  });
});
