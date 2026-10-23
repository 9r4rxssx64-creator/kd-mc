/**
 * 23.10.2026 — mesuré dans un vrai Chromium iPhone (390×844) sur l'Apex Chat de test : sur chaque onglet le lien « ← KDMC »
 * faisait 71×23 px, et sur « Chats » le bouton 🔍 40 px de large et le champ de recherche 41 px de haut (règle : toucher ≥ 44 px).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.CLIENT_INDEX_PATH || resolve(ICI, '../../index.html');
const html = readFileSync(SRC, 'utf8');
const style = (re) => { const m = html.match(re); return m ? m[0] : ''; };
const min44 = (s) => /min-height:\s*44px/.test(s) && /min-width:\s*44px/.test(s);

describe('Apex Chat : cibles tactiles ≥ 44 px', () => {
  it('le lien « ← KDMC » (retour au portail) fait au moins 44×44', () => {
    const tag = style(/<a id="kdmc-portal-link"[^>]*>/);
    expect(tag).not.toBe('');
    expect(min44(tag)).toBe(true);
  });
  it('le bouton 🔍 de la liste des conversations fait au moins 44×44', () => {
    const tag = style(/<button[^>]*K\._openGlobalSearch\(\)[^>]*>/);
    expect(tag).not.toBe('');
    expect(min44(tag)).toBe(true);
  });
  it('le champ de recherche des conversations fait au moins 44 px de haut', () => {
    const tag = style(/<input id="conv-search-input"[\s\S]*?>/);
    expect(tag).not.toBe('');
    expect(/min-height:\s*44px/.test(tag)).toBe(true);
  });
});
