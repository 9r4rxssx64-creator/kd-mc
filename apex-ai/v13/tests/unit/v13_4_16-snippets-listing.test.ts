/**
 * Test régression v13.4.16 — Listing et suppression snippets coffre.
 *
 * Boucle la feature v13.4.14 paste intelligent (Kevin "Codes dans un dossier
 * dans le coffre") en ajoutant lecture + delete.
 *
 * Helpers testés :
 * - listCodeSnippets() → retourne array depuis index localStorage
 * - deleteCodeSnippet(key) → retire entry + update index
 *
 * Commande slash /snippets ajoutée dans services/slash-commands.ts +
 * features/chat/index.ts (testée manuellement par Kevin dans le chat).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCodeSnippet,
  listCodeSnippets,
  deleteCodeSnippet,
} from '../../features/chat/index.js';

describe('v13.4.16 listCodeSnippets', () => {
  beforeEach(() => {
    /* Reset localStorage entries paste intelligent */
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('apex_v13_code_') || k === 'apex_v13_code_snippets_index')) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  });

  it("retourne [] si aucun snippet sauvé (index absent)", () => {
    expect(listCodeSnippets()).toEqual([]);
  });

  it("retourne [] si index présent mais vide", () => {
    localStorage.setItem('apex_v13_code_snippets_index', '[]');
    expect(listCodeSnippets()).toEqual([]);
  });

  it('liste 1 snippet sauvé via saveCodeSnippet', async () => {
    await saveCodeSnippet('const x = 1;', 'typescript');
    const list = listCodeSnippets();
    expect(list).toHaveLength(1);
    expect(list[0]?.code).toBe('const x = 1;');
    expect(list[0]?.lang).toBe('typescript');
    expect(list[0]?.lines).toBe(1);
  });

  it('liste N snippets dans l\'ordre de l\'index (plus récent en premier)', async () => {
    await saveCodeSnippet('one', 'js');
    await saveCodeSnippet('two', 'py');
    await saveCodeSnippet('three', 'ts');
    const list = listCodeSnippets();
    expect(list).toHaveLength(3);
    /* Index unshift → ordre desc (plus récent en premier) */
    expect(list[0]?.code).toBe('three');
    expect(list[1]?.code).toBe('two');
    expect(list[2]?.code).toBe('one');
  });

  it("ignore entries orphelines (index pointe vers clé localStorage absente)", () => {
    localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(['apex_v13_code_ghost_xyz', 'apex_v13_code_real_abc']));
    localStorage.setItem('apex_v13_code_real_abc', JSON.stringify({
      code: 'real code',
      lang: 'js',
      created: 12345,
      lines: 1,
      size: 9,
    }));
    /* ghost_xyz n'existe pas */
    const list = listCodeSnippets();
    expect(list).toHaveLength(1);
    expect(list[0]?.code).toBe('real code');
  });

  it("ignore entries JSON corrompues (parse fail)", () => {
    localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(['apex_v13_code_bad_xyz']));
    localStorage.setItem('apex_v13_code_bad_xyz', 'NOT_JSON_AT_ALL{');
    const list = listCodeSnippets();
    expect(list).toEqual([]);
  });

  it("ignore index JSON corrompu (retourne [])", () => {
    localStorage.setItem('apex_v13_code_snippets_index', 'NOT_JSON_INDEX');
    const list = listCodeSnippets();
    expect(list).toEqual([]);
  });
});

describe('v13.4.16 deleteCodeSnippet', () => {
  beforeEach(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('apex_v13_code_') || k === 'apex_v13_code_snippets_index')) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  });

  it("supprime un snippet existant + update index", async () => {
    const r = await saveCodeSnippet('to delete', 'js');
    expect(listCodeSnippets()).toHaveLength(1);
    const ok = deleteCodeSnippet(r.key as string);
    expect(ok).toBe(true);
    expect(listCodeSnippets()).toHaveLength(0);
    expect(localStorage.getItem(r.key as string)).toBeNull();
  });

  it("garde les autres snippets après delete", async () => {
    await saveCodeSnippet('keep', 'ts');
    const r2 = await saveCodeSnippet('remove', 'py');
    await saveCodeSnippet('keep2', 'js');
    expect(listCodeSnippets()).toHaveLength(3);
    deleteCodeSnippet(r2.key as string);
    const remaining = listCodeSnippets();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((s) => s.code).sort()).toEqual(['keep', 'keep2']);
  });

  it("retourne false (sécurité) si clé n'a PAS le préfixe apex_v13_code_", () => {
    /* Empêche arbitrary localStorage delete via cette fonction */
    expect(deleteCodeSnippet('apex_v13_user')).toBe(false);
    expect(deleteCodeSnippet('apex_v13_pin')).toBe(false);
    expect(deleteCodeSnippet('any_other_key')).toBe(false);
    expect(deleteCodeSnippet('')).toBe(false);
  });

  it("delete sur clé inexistante retourne true (idempotent, ne crash pas)", () => {
    expect(deleteCodeSnippet('apex_v13_code_ghost_123')).toBe(true);
  });
});
