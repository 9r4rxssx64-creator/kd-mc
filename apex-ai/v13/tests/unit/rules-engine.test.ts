/**
 * Tests rules-engine.ts (Kevin v13.4.3 — TikTok IA IRL #3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { rulesEngine } from '../../services/core-svc/rules-engine.js';

vi.mock('../../core/memory.js', () => {
  const mockClaudeMd = `
# CLAUDE.md test

Some intro.

## 🔍 RÈGLE PERMANENTE — Test règle 1 (Kevin 2026-05-09)

> **"Quote Kevin règle 1"** — Kevin

Body règle 1, premiers détails. Doit être détectée.

## 🚀 RÈGLE ABSOLUE — Test règle 2 (Kevin 2026-05-08)

> **"Quote Kevin règle 2"**

Body règle 2 avec mot-clé spécial: workflow.

## Section non-règle

Pas matchée.

## 🤖 RÈGLE PERMANENTE — Règle workflow (Kevin 2026-05-07)

> **"Le workflow doit suivre des étapes"**

Body règle workflow.
`;
  return {
    memory: {
      getDocsContext: () => ({
        'CLAUDE.md': { content: mockClaudeMd, ts: Date.now(), size: mockClaudeMd.length },
      }),
    },
  };
});

describe('Rules Engine (IA IRL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parse les règles permanentes du CLAUDE.md', () => {
    const rules = rulesEngine.list();
    expect(rules.length).toBeGreaterThanOrEqual(2);
    const titles = rules.map((r) => r.title);
    expect(titles.some((t) => t.includes('Test règle 1'))).toBe(true);
  });

  it('top(N) retourne max N règles', () => {
    const top2 = rulesEngine.top(2);
    expect(top2.length).toBeLessThanOrEqual(2);
  });

  it('filter par mot-clé', () => {
    const matched = rulesEngine.filter('workflow');
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched.some((r) => r.title.toLowerCase().includes('workflow') || r.bodyExcerpt.toLowerCase().includes('workflow'))).toBe(true);
  });

  it('renderMarkdown formate les règles', () => {
    const rules = rulesEngine.top(3);
    const md = rulesEngine.renderMarkdown(rules);
    expect(md).toContain('### Règles permanentes Apex');
    expect(md).toContain('**1.');
  });

  it('renderMarkdown gère liste vide', () => {
    const md = rulesEngine.renderMarkdown([]);
    expect(md).toContain('Aucune règle');
  });
});
