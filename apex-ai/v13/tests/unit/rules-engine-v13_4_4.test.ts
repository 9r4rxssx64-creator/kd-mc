/**
 * APEX v13.4.4 — Tests rules-engine (étendu).
 *
 * Couvre :
 *  - parsing top 50 règles (RÈGLE PERMANENTE / ABSOLUE / SUPRÊME)
 *  - parsing top 55 erreurs documentées
 *  - markErrorApplied / unmarkErrorApplied / isErrorApplied
 *  - buildSystemPromptInjection (cap 8000 chars + sections présentes)
 *  - getInjectedCount
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { rulesEngine } from '../../services/core-svc/rules-engine.js';

const FAKE_CLAUDE_MD = `# CLAUDE.md

## 🔍 RÈGLE PERMANENTE — Test règle permanente (Kevin 2026-05-09, ABSOLUE)

> **"Quote test rule one."** — Kevin

Body of the first rule.

## 🚀 RÈGLE ABSOLUE — Autre règle critique (Kevin 2026-05-08)

> **"Quote test rule two."**

Body for second rule.

## Erreurs connues à NE PAS reproduire

1. **Erreur title 1** — leçon importante 1 ❌
2. **Erreur title 2** (vX.Y, Kevin date) — leçon 2 lessons ❌→✅
3. Erreur sans bold — leçon basique ✅

## Autre section
`;

function seedDocsCache(): void {
  const cache = {
    'CLAUDE.md': { content: FAKE_CLAUDE_MD, ts: Date.now(), size: FAKE_CLAUDE_MD.length },
  };
  localStorage.setItem('apex_v13_docs_cache', JSON.stringify(cache));
}

describe('rules-engine v13.4.4 — parsing étendu', () => {
  beforeEach(() => {
    /* Clear agressif : certains tests précédents peuvent avoir laissé des entries stale */
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    /* Force clear keys spécifiques */
    try {
      localStorage.removeItem('apex_v13_docs_cache');
      localStorage.removeItem('apex_v13_errors_applied');
    } catch {
      /* ignore */
    }
  });

  it('liste les règles (RÈGLE PERMANENTE + ABSOLUE)', () => {
    seedDocsCache();
    const rules = rulesEngine.list();
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules[0]?.title).toMatch(/Test règle permanente/);
    expect(rules[1]?.title).toMatch(/Autre règle critique/);
    expect(rules[1]?.severity).toBe('high'); /* ABSOLUE → high */
  });

  it('top(N) limite le nombre', () => {
    seedDocsCache();
    expect(rulesEngine.top(1).length).toBe(1);
  });

  it('extrait quote du blockquote', () => {
    seedDocsCache();
    const r = rulesEngine.list();
    expect(r[0]?.quote).toMatch(/Quote test rule one/);
  });

  it('parse les erreurs documentées', () => {
    seedDocsCache();
    const errs = rulesEngine.listErrors();
    expect(errs.length).toBeGreaterThanOrEqual(2);
    expect(errs[0]?.num).toBe(1);
    expect(errs[0]?.title).toMatch(/Erreur title 1/);
  });

  it('markErrorApplied + isErrorApplied + unmark', () => {
    seedDocsCache();
    expect(rulesEngine.isErrorApplied(1)).toBe(false);
    rulesEngine.markErrorApplied(1);
    expect(rulesEngine.isErrorApplied(1)).toBe(true);
    rulesEngine.unmarkErrorApplied(1);
    expect(rulesEngine.isErrorApplied(1)).toBe(false);
  });

  it('buildSystemPromptInjection contient sections critiques + cap', () => {
    seedDocsCache();
    const inj = rulesEngine.buildSystemPromptInjection(8000);
    expect(inj.length).toBeLessThanOrEqual(8000);
    expect(inj).toMatch(/Top règles permanentes/);
    expect(inj).toMatch(/Top 10 erreurs/);
    expect(inj).toMatch(/Méthode de travail/);
  });

  it('getInjectedCount renvoie compteurs cohérents', () => {
    seedDocsCache();
    const c = rulesEngine.getInjectedCount();
    expect(c.rules).toBeGreaterThanOrEqual(2);
    expect(c.errorsTotal).toBeGreaterThanOrEqual(2);
    expect(c.errorsApplied).toBeGreaterThanOrEqual(0);
  });

  it('renderMarkdown gère le cas vide', () => {
    /* localStorage clear → cache vide */
    const md = rulesEngine.renderMarkdown([]);
    expect(md).toMatch(/Aucune règle/);
  });

  it('filter case-insensitive sur titre', () => {
    seedDocsCache();
    const matches = rulesEngine.filter('PERMANENTE');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
