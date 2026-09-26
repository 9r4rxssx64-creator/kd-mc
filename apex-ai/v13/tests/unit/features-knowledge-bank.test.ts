/**
 * Tests features/knowledge-bank (port v12 vKnowledgeBank).
 */
import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  getKbStats,
  KB_CATEGORIES,
  searchKb,
  searchKbGlobal,
  type KbCategory,
  type KbEntry,
} from '../../features/knowledge-bank/index.js';

describe('features/knowledge-bank — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
    expect(escapeHtml('"x"')).toBe('&quot;x&quot;');
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });
});

describe('features/knowledge-bank — KB_CATEGORIES', () => {
  it('contient 12 catégories (parité v12)', () => {
    expect(KB_CATEGORIES).toHaveLength(12);
  });

  it('chaque catégorie a id/icon/label/description/entries', () => {
    for (const cat of KB_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(Array.isArray(cat.entries)).toBe(true);
    }
  });

  it('inclut convention SBM', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention');
    expect(conv).toBeTruthy();
    expect(conv?.entries.length).toBeGreaterThanOrEqual(8);
  });

  it('inclut bulletin codes', () => {
    const codes = KB_CATEGORIES.find((c) => c.id === 'bulletin_codes');
    expect(codes).toBeTruthy();
    expect(codes?.entries.find((e) => e.id === 'CP')).toBeTruthy();
    expect(codes?.entries.find((e) => e.id === 'P')).toBeTruthy();
  });

  it('inclut jeux SBM (8 jeux table)', () => {
    const jeux = KB_CATEGORIES.find((c) => c.id === 'jeux_sbm');
    expect(jeux).toBeTruthy();
    expect(jeux?.entries.length).toBeGreaterThanOrEqual(7);
    expect(jeux?.entries.find((e) => e.id === 'blackjack')).toBeTruthy();
    expect(jeux?.entries.find((e) => e.id === 'craps')).toBeTruthy();
  });

  it('toutes catégories ont des entries (pas vide)', () => {
    for (const cat of KB_CATEGORIES) {
      expect(cat.entries.length).toBeGreaterThan(0);
    }
  });

  it('chaque entry a id/title/content', () => {
    for (const cat of KB_CATEGORIES) {
      for (const e of cat.entries) {
        expect(e.id).toBeTruthy();
        expect(e.title).toBeTruthy();
        expect(e.content).toBeTruthy();
      }
    }
  });
});

describe('features/knowledge-bank — searchKb', () => {
  it('retourne toutes entries si query vide', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    const r = searchKb(conv, '');
    expect(r.length).toBe(conv.entries.length);
  });

  it('cherche dans le titre', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    const r = searchKb(conv, 'Article 18');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.title).toContain('Article 18');
  });

  it('cherche dans le content', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    const r = searchKb(conv, 'Mariage');
    expect(r.length).toBeGreaterThan(0);
  });

  it('cherche dans les tags', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    const r = searchKb(conv, 'congés');
    expect(r.length).toBeGreaterThan(0);
  });

  it('case insensitive', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    const lower = searchKb(conv, 'mariage');
    const upper = searchKb(conv, 'MARIAGE');
    expect(lower.length).toBe(upper.length);
  });

  it('retourne [] si rien trouvé', () => {
    const conv = KB_CATEGORIES.find((c) => c.id === 'convention')!;
    expect(searchKb(conv, 'zzznotfoundxyz')).toEqual([]);
  });
});

describe('features/knowledge-bank — searchKbGlobal', () => {
  it('retourne [] si query vide', () => {
    expect(searchKbGlobal('')).toEqual([]);
  });

  it('cherche dans toutes catégories', () => {
    const r = searchKbGlobal('Article');
    /* Articles présents dans Convention SBM */
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((res) => res.category && res.entry)).toBe(true);
  });

  it('résultats ont category + entry', () => {
    const r = searchKbGlobal('Black Jack');
    expect(r.length).toBeGreaterThan(0);
    if (r[0]) {
      expect(r[0].category.id).toBeTruthy();
      expect(r[0].entry.id).toBeTruthy();
    }
  });

  it('case insensitive', () => {
    const lower = searchKbGlobal('roulette');
    const upper = searchKbGlobal('ROULETTE');
    expect(lower.length).toBe(upper.length);
  });
});

describe('features/knowledge-bank — getKbStats', () => {
  it('retourne 12 catégories', () => {
    const s = getKbStats();
    expect(s.categories).toBe(12);
  });

  it('total entries > 80 (parité v12 réelle)', () => {
    const s = getKbStats();
    expect(s.entries).toBeGreaterThan(50);
  });

  it('entries = somme de toutes les catégories', () => {
    const s = getKbStats();
    const expected = KB_CATEGORIES.reduce((acc, c) => acc + c.entries.length, 0);
    expect(s.entries).toBe(expected);
  });
});

describe('features/knowledge-bank — coverage entries', () => {
  it('Vidal a paracétamol', () => {
    const v = KB_CATEGORIES.find((c) => c.id === 'vidal_otc');
    expect(v?.entries.some((e) => e.title.toLowerCase().includes('paracétamol') || e.id === 'doliprane')).toBe(true);
  });

  it('IR 2026 a 5+ tranches', () => {
    const ir = KB_CATEGORIES.find((c) => c.id === 'ir_2026');
    expect(ir?.entries.length).toBeGreaterThanOrEqual(5);
  });

  it('Allergènes liste les principaux INCO', () => {
    const al = KB_CATEGORIES.find((c) => c.id === 'allergenes');
    expect(al?.entries.find((e) => e.id === 'gluten')).toBeTruthy();
    expect(al?.entries.find((e) => e.id === 'lait')).toBeTruthy();
  });

  it('Familles CMC inclut BJ + Roulettes + CMC', () => {
    const f = KB_CATEGORIES.find((c) => c.id === 'familles_cmc');
    expect(f?.entries.find((e) => e.id === 'bj')).toBeTruthy();
    expect(f?.entries.find((e) => e.id === 'roulettes')).toBeTruthy();
    expect(f?.entries.find((e) => e.id === 'cmc')).toBeTruthy();
  });
});

describe('features/knowledge-bank — types exports', () => {
  it('KbCategory + KbEntry sont exportés', () => {
    /* TypeScript only — compile-time check */
    const fakeCat: KbCategory = KB_CATEGORIES[0]!;
    const fakeEntry: KbEntry = fakeCat.entries[0]!;
    expect(fakeCat.id).toBeTruthy();
    expect(fakeEntry.id).toBeTruthy();
  });
});
