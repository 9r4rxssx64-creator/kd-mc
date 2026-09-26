/**
 * APEX v13 — Tests Recherche approfondie (Deep Research).
 * Couvre la logique déterministe (décomposition, normalisation, dédup, orchestration,
 * résilience) via injection de dépendances. Le comportement live (Brave/Tavily + LLM)
 * s'exécute en prod — ici on prouve le squelette agentique.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  parseSubQuestions,
  normalizeResult,
  dedupeSources,
  runDeepResearch,
  type DeepResearchDeps,
  type DeepResearchProgress,
} from '../../services/ai/deep-research.js';

describe('deep-research — parseSubQuestions', () => {
  it('parse un tableau JSON', () => {
    const out = parseSubQuestions('["Q1","Q2","Q3"]', 'fb', 4);
    expect(out).toEqual(['Q1', 'Q2', 'Q3']);
  });
  it('parse JSON noyé dans du texte / fences', () => {
    const out = parseSubQuestions('Voici :\n```json\n["A","B"]\n```', 'fb', 4);
    expect(out).toEqual(['A', 'B']);
  });
  it('repli lignes numérotées si pas de JSON', () => {
    const out = parseSubQuestions('1. Première question longue\n2. Deuxième question longue', 'fb', 4);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('Première');
  });
  it('repli sur fallback si vide', () => {
    expect(parseSubQuestions('', 'ma question', 4)).toEqual(['ma question']);
  });
  it('dédoublonne + respecte max', () => {
    const out = parseSubQuestions('["Q","Q","R","S","T"]', 'fb', 3);
    expect(out).toEqual(['Q', 'R', 'S']);
  });
});

describe('deep-research — normalizeResult', () => {
  it('normalise un résultat Brave {title,url,description}', () => {
    const n = normalizeResult({ title: 'T', url: 'https://x.com', description: 'desc' });
    expect(n).toEqual({ title: 'T', url: 'https://x.com', snippet: 'desc' });
  });
  it('normalise un résultat Tavily {title,url,content}', () => {
    const n = normalizeResult({ title: 'T', url: 'https://y.com', content: 'body' });
    expect(n!.snippet).toBe('body');
  });
  it('rejette un résultat sans url http(s)', () => {
    expect(normalizeResult({ title: 'T', url: 'ftp://z' })).toBeNull();
    expect(normalizeResult({ title: 'T' })).toBeNull();
    expect(normalizeResult(null)).toBeNull();
  });
  it('title par défaut = url', () => {
    const n = normalizeResult({ url: 'https://z.com' });
    expect(n!.title).toBe('https://z.com');
  });
});

describe('deep-research — dedupeSources', () => {
  it('dédoublonne par URL normalisée (query/hash/slash ignorés) + numérote', () => {
    const out = dedupeSources([
      { title: 'A', url: 'https://x.com/p', snippet: '' },
      { title: 'A2', url: 'https://x.com/p/', snippet: '' },
      { title: 'A3', url: 'https://x.com/p?utm=1', snippet: '' },
      { title: 'B', url: 'https://y.com', snippet: '' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.n).toBe(1);
    expect(out[1]!.n).toBe(2);
  });
});

function mkDeps(overrides: Partial<DeepResearchDeps> = {}): DeepResearchDeps {
  return {
    ask: vi.fn(async (prompt: string) =>
      prompt.includes('Décompose') ? '["sous q1","sous q2"]' : 'Rapport [1][2].',
    ),
    search: vi.fn(async (q: string) => ({
      results: [{ title: 'S-' + q, url: 'https://s.com/' + encodeURIComponent(q), description: 'x' }],
      provider: 'mock',
    })),
    ...overrides,
  };
}

describe('deep-research — runDeepResearch (orchestration)', () => {
  it('décompose → recherche → synthétise, retourne rapport + sources', async () => {
    const deps = mkDeps();
    const res = await runDeepResearch('sujet', {}, deps);
    expect(res.subQuestions).toEqual(['sous q1', 'sous q2']);
    expect(res.sources).toHaveLength(2);
    expect(res.report).toContain('Rapport');
    /* 1 ask plan + 1 ask synthèse = 2 ; 1 search par sous-question = 2 */
    expect(deps.ask).toHaveBeenCalledTimes(2);
    expect(deps.search).toHaveBeenCalledTimes(2);
  });

  it('émet la séquence de phases planning→searching→synthesizing→done', async () => {
    const phases: string[] = [];
    const onProgress = (p: DeepResearchProgress): void => {
      phases.push(p.phase);
    };
    await runDeepResearch('sujet', { onProgress }, mkDeps());
    expect(phases[0]).toBe('planning');
    expect(phases).toContain('searching');
    expect(phases).toContain('synthesizing');
    expect(phases[phases.length - 1]).toBe('done');
  });

  it('query vide → phase error + résultat vide', async () => {
    const res = await runDeepResearch('  ', {}, mkDeps());
    expect(res.report).toBe('');
    expect(res.sources).toHaveLength(0);
  });

  it('plan qui throw → repli sur la question seule (1 recherche)', async () => {
    const deps = mkDeps({
      ask: vi.fn(async (prompt: string) => {
        if (prompt.includes('Décompose')) throw new Error('llm down');
        return 'Rapport de repli';
      }),
    });
    const res = await runDeepResearch('ma question', {}, deps);
    expect(res.subQuestions).toEqual(['ma question']);
    expect(deps.search).toHaveBeenCalledTimes(1);
    expect(res.report).toBe('Rapport de repli');
  });

  it('search qui throw sur une sous-question → continue (résilient)', async () => {
    const deps = mkDeps({
      search: vi.fn(async (q: string) => {
        if (q === 'sous q1') throw new Error('brave 429');
        return { results: [{ title: 'ok', url: 'https://ok.com', description: '' }], provider: 'mock' };
      }),
    });
    const res = await runDeepResearch('sujet', {}, deps);
    expect(res.sources).toHaveLength(1);
    expect(res.report).toContain('Rapport');
  });

  it('synthèse qui throw → rapport de repli listant les sources', async () => {
    const deps = mkDeps({
      ask: vi.fn(async (prompt: string) => {
        if (prompt.includes('Décompose')) return '["q1"]';
        throw new Error('synth down');
      }),
    });
    const res = await runDeepResearch('sujet', {}, deps);
    expect(res.report).toContain('synthèse a échoué');
    expect(res.report).toContain('https://s.com');
  });

  it('respecte maxSubQuestions', async () => {
    const deps = mkDeps({ ask: vi.fn(async () => '["a","b","c","d","e","f"]') });
    const res = await runDeepResearch('sujet', { maxSubQuestions: 2 }, deps);
    expect(res.subQuestions).toHaveLength(2);
  });

  it('abort signal stoppe les recherches', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const deps = mkDeps();
    const res = await runDeepResearch('sujet', { signal: ctrl.signal }, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(res.sources).toHaveLength(0);
  });
});
