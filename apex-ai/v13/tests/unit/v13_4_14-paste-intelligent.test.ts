/**
 * Test régression v13.4.14 — Paste intelligent (Kevin "visuel de tout ce que je colle").
 *
 * Bug Kevin fixé : "Je veux un visuel de tout ce que je copie colle ou intègre
 * dans apex (photos, doc, codes, liens etc) intelligemment. Codes dans un dossier
 * dans le coffre et sinon dans le chat etc."
 *
 * Avant v13.4.14 : paste handler existant gérait juste credentials → vault.autoStoreBulk
 * et URLs → multiSourceAnalyze. Pas de visuel uniforme, pas de routing code → coffre.
 *
 * Après v13.4.14 :
 * - detectPasteKind(text) → 'credential' | 'code' | 'url' | 'planning' | 'text'
 * - pushPasteCard(root, type, preview, actions) → card visuelle dans chat
 * - saveCodeSnippet(code, lang?) → localStorage dossier coffre 'Codes'
 *
 * Tests purs (sans DOM) sur detectPasteKind et saveCodeSnippet.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { detectPasteKind, saveCodeSnippet } from '../../features/chat/index.js';

describe('v13.4.14 detectPasteKind', () => {
  it("backtick block multi-line → 'code'", () => {
    expect(detectPasteKind("```js\nfunction hello() { return 1; }\n```")).toBe('code');
    expect(detectPasteKind("```python\ndef foo(): pass\n```")).toBe('code');
  });

  it("3+ lignes avec 2+ keywords code → 'code'", () => {
    expect(detectPasteKind(
      "const x = 1;\nlet y = 2;\nfunction sum(a, b) { return a + b; }",
    )).toBe('code');
    expect(detectPasteKind(
      "import React from 'react';\nexport const App = () => {};\nclass Foo {}",
    )).toBe('code');
  });

  it("JSON multi-line structuré → 'code'", () => {
    expect(detectPasteKind('{\n  "name": "apex",\n  "version": "13"\n}')).toBe('code');
    expect(detectPasteKind('[\n  1,\n  2,\n  3\n]')).toBe('code');
  });

  it("HTML doc → 'code'", () => {
    expect(detectPasteKind('<!DOCTYPE html>\n<html>\n<body>Hi</body>\n</html>')).toBe('code');
    expect(detectPasteKind('<script>\nconsole.log("x");\n</script>')).toBe('code');
  });

  it("URL pure → 'url'", () => {
    expect(detectPasteKind('https://anthropic.com')).toBe('url');
    expect(detectPasteKind('http://localhost:3000/path?x=1')).toBe('url');
  });

  it("URL avec texte autour → PAS 'url' (fallback text)", () => {
    expect(detectPasteKind('check this https://anthropic.com please')).toBe('text');
  });

  it("texte normal → 'text'", () => {
    expect(detectPasteKind('bonjour comment vas-tu ?')).toBe('text');
    expect(detectPasteKind('Une seule ligne sans code')).toBe('text');
  });

  it("texte vide → 'text'", () => {
    expect(detectPasteKind('')).toBe('text');
    expect(detectPasteKind('   \n\n   ')).toBe('text');
  });

  it("1 ligne avec keyword mais pas 3 lignes → 'text' (sécurité anti-faux-positif)", () => {
    expect(detectPasteKind('const x = 1')).toBe('text');
    expect(detectPasteKind('function')).toBe('text');
  });

  it("3 lignes mais juste 1 keyword → 'text' (seuil 2 minimum)", () => {
    expect(detectPasteKind('bonjour\ncomment\nfunction')).toBe('text');
  });
});

describe('v13.4.14 saveCodeSnippet', () => {
  beforeEach(() => {
    /* Reset localStorage */
    if (typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('apex_v13_code_') || k === 'apex_v13_code_snippets_index')) {
          keys.push(k);
        }
      }
      for (const k of keys) localStorage.removeItem(k);
    }
  });

  it('sauvegarde un snippet et retourne ok + key', async () => {
    const r = await saveCodeSnippet('function foo() { return 1; }', 'js');
    expect(r.ok).toBe(true);
    expect(r.key).toBeDefined();
    expect(r.key).toMatch(/^apex_v13_code_\d+_[a-z0-9]+$/);
  });

  it('stocke le code en JSON dans localStorage', async () => {
    const r = await saveCodeSnippet('const x = 42;', 'typescript');
    expect(r.ok).toBe(true);
    const raw = localStorage.getItem(r.key as string);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw as string) as { code: string; lang: string; lines: number };
    expect(parsed.code).toBe('const x = 42;');
    expect(parsed.lang).toBe('typescript');
    expect(parsed.lines).toBe(1);
  });

  it('lang default "unknown" si non fourni', async () => {
    const r = await saveCodeSnippet('xyz');
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(localStorage.getItem(r.key as string) as string) as { lang: string };
    expect(parsed.lang).toBe('unknown');
  });

  it('compte les lignes correctement', async () => {
    const r = await saveCodeSnippet('a\nb\nc\nd\ne');
    const parsed = JSON.parse(localStorage.getItem(r.key as string) as string) as { lines: number };
    expect(parsed.lines).toBe(5);
  });

  it("index 'apex_v13_code_snippets_index' enregistre les keys", async () => {
    await saveCodeSnippet('one');
    await saveCodeSnippet('two');
    const idx = JSON.parse(localStorage.getItem('apex_v13_code_snippets_index') as string) as string[];
    expect(idx).toHaveLength(2);
    /* Plus récent en premier (unshift) */
    expect(idx[0]).toMatch(/^apex_v13_code_/);
    expect(idx[1]).toMatch(/^apex_v13_code_/);
  });

  it('cap index à 100 snippets max', async () => {
    /* Pre-populate avec 99 keys fictifs */
    const fakeIdx = Array.from({ length: 99 }, (_, i) => `apex_v13_code_fake_${i}`);
    localStorage.setItem('apex_v13_code_snippets_index', JSON.stringify(fakeIdx));
    /* Ajoute 5 nouveaux → doit cap à 100 */
    await saveCodeSnippet('a');
    await saveCodeSnippet('b');
    await saveCodeSnippet('c');
    await saveCodeSnippet('d');
    await saveCodeSnippet('e');
    const idx = JSON.parse(localStorage.getItem('apex_v13_code_snippets_index') as string) as string[];
    expect(idx).toHaveLength(100);
  });

  it('XSS protection : code avec <script> stocké tel quel (lecture via JSON.parse, pas innerHTML)', async () => {
    const malicious = '<script>alert("xss")</script>';
    const r = await saveCodeSnippet(malicious, 'html');
    const parsed = JSON.parse(localStorage.getItem(r.key as string) as string) as { code: string };
    expect(parsed.code).toBe(malicious); /* Stocké brut : c'est l'affichage qui doit escape (textContent dans pushPasteCard) */
  });
});
