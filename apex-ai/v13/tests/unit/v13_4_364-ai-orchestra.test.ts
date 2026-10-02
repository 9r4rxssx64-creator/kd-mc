/**
 * v13.4.364 — Orchestre d'IA (Kevin « Utilise toutes les ia dispo. Orchestre d'ia… va plus loin »).
 *
 * Prouve :
 *  1. BUG FIXÉ : chaque expert du crew appelle SON provider (avant : aiRouter.stream
 *     = chaîne de failover → tous les experts tapaient la MÊME IA).
 *  2. availableProviders = TOUTES les IA dispo (proxy ON par défaut), Anthropic en tête.
 *  3. Orchestrateur : fan-out → synthèse chef d'orchestre (Anthropic) streamée,
 *     divergences citées, done final émis.
 *  4. Fail-open : 0 réponse experte → fallback aiRouter.stream (jamais de blocage).
 *  5. shouldOrchestrate : mots-clés gros travail, off via flag, force one-shot /orchestre.
 *  6. Commande /orchestre présente dans SLASH_COMMANDS.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { store } from '../../core/store.js';

/* Mock aiRouter : streamSingle répond un texte DISTINCT par provider (traçable),
 * stream (fallback) est un spy. */
const singleCalls: string[] = [];
let failAllSingles = false;
const streamSpy = vi.fn(async (
  _m: unknown, _s: string,
  onChunk: (c: { text?: string; done?: boolean; provider?: string }) => void,
): Promise<void> => {
  onChunk({ text: 'fallback-route', done: false, provider: 'anthropic' });
  onChunk({ text: '', done: true, provider: 'anthropic' });
});

vi.mock('../../services/ai/ai-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ai/ai-router.js')>();
  return {
    ...actual,
    aiRouter: new Proxy(actual.aiRouter, {
      get(target, prop, receiver) {
        if (prop === 'streamSingle') {
          return async (
            provider: string, _m: unknown, _s: string,
            onChunk: (c: { text?: string; done?: boolean }) => void,
          ) => {
            singleCalls.push(provider);
            if (failAllSingles) return { ok: false, error: 'HTTP 503', provider };
            const text = `réponse-${provider}`;
            onChunk({ text, done: false });
            return { ok: true, text, provider };
          };
        }
        if (prop === 'stream') return streamSpy;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    }),
  };
});

describe('v13.4.364 — Orchestre d\'IA', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    singleCalls.length = 0;
    failAllSingles = false;
    streamSpy.mockClear();
    /* Session admin réelle : le dispatch re-dérive l'admin via auth.isAdminSync()
     * (fail-closed) → sans user kdmc_admin dans le store, llm_council serait refusé. */
    store.init({ appVer: 'v13.4.364' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin', tier: 'admin' });
  });

  it('availableProviders : toutes les IA dispo via proxy (défaut ON), voix gratuites en tete (v13.4.367 concertation), Anthropic présent', async () => {
    const { crewExperts } = await import('../../services/ai/crew-experts.js');
    const provs = crewExperts.availableProviders();
    expect(provs[0]).toBe('qwen'); expect(provs).toContain('anthropic');
    expect(provs.length).toBeGreaterThanOrEqual(5);
    for (const p of ['groq', 'gemini', 'openai', 'mistral', 'cerebras']) {
      expect(provs).toContain(p);
    }
    /* openrouter absent sans clé locale (non proxié) */
    expect(provs).not.toContain('openrouter');
  });

  it('BUG FIXÉ : le crew appelle des providers DISTINCTS (pas N fois la même IA)', async () => {
    const { crewExperts } = await import('../../services/ai/crew-experts.js');
    const result = await crewExperts.run({
      task: 'audit complet de la sécurité',
      systemPrompt: 'sys',
      members: crewExperts.defaultMembers('specialized'),
    });
    const distinct = new Set(singleCalls);
    expect(distinct.size).toBeGreaterThanOrEqual(5);
    expect(result.responses.every((r) => r.ok)).toBe(true);
    /* chaque réponse vient bien de SON provider */
    for (const r of result.responses) {
      expect(r.text).toBe(`réponse-${r.provider}`);
    }
  });

  it('orchestrateur : fan-out + synthèse chef d\'orchestre streamée + done final', async () => {
    const { aiOrchestrator } = await import('../../services/ai/ai-orchestrator.js');
    const chunks: Array<{ text?: string; done?: boolean }> = [];
    await aiOrchestrator.stream(
      [{ role: 'user', content: 'fais un audit complet du planning' }],
      'sys',
      (c) => chunks.push(c),
    );
    const all = chunks.map((c) => c.text ?? '').join('');
    expect(all).toContain('Orchestre d\'IA');
    expect(all).toContain('IA ont répondu');
    /* la synthèse = appel anthropic APRÈS les experts (dernier appel single) */
    expect(singleCalls[singleCalls.length - 1]).toBe('anthropic');
    expect(chunks[chunks.length - 1]?.done).toBe(true);
    expect(streamSpy).not.toHaveBeenCalled(); /* pas de fallback */
  });

  it('fail-open : 0 expert ne répond → fallback aiRouter.stream (jamais bloqué)', async () => {
    failAllSingles = true;
    const { aiOrchestrator } = await import('../../services/ai/ai-orchestrator.js');
    const chunks: Array<{ text?: string; done?: boolean }> = [];
    await aiOrchestrator.stream(
      [{ role: 'user', content: 'audit complet' }],
      'sys',
      (c) => chunks.push(c),
    );
    expect(streamSpy).toHaveBeenCalledTimes(1);
    const all = chunks.map((c) => c.text ?? '').join('');
    expect(all).toContain('fallback-route');
  });

  it('shouldOrchestrate : gros travail OUI, question banale NON, off respecté, force one-shot', async () => {
    const { aiOrchestrator } = await import('../../services/ai/ai-orchestrator.js');
    expect(aiOrchestrator.shouldOrchestrate('fais un audit complet')).toBe(true);
    expect(aiOrchestrator.shouldOrchestrate('salut ça va')).toBe(false);
    aiOrchestrator.setEnabled(false);
    expect(aiOrchestrator.shouldOrchestrate('fais un audit complet')).toBe(false);
    /* force one-shot (/orchestre <question>) passe même désactivé, et se consomme */
    aiOrchestrator.forceNext();
    expect(aiOrchestrator.shouldOrchestrate('question forcée')).toBe(true);
    expect(aiOrchestrator.shouldOrchestrate('question forcée')).toBe(false);
    aiOrchestrator.setEnabled(true);
  });

  it('commande /orchestre déclarée dans SLASH_COMMANDS', async () => {
    const { SLASH_COMMANDS } = await import('../../services/admin/slash-commands.js');
    const cmd = SLASH_COMMANDS.find((c) => c.name === 'orchestre');
    expect(cmd).toBeTruthy();
    expect(cmd!.description).toContain('TOUTES les IA');
  });

  it('tool llm_council : DISPATCHÉ (était déclaré mais mort, #28) → crew réel + synthèse juge', async () => {
    const { apexToolsDispatch } = await import('../../services/core-svc/apex-tools-dispatch.js');
    const exec = await apexToolsDispatch.execute('llm_council', { task: 'quelle architecture choisir ?' }, 'admin');
    expect(exec.ok).toBe(true);
    const r = exec.result as {
      synthesis: string;
      experts: Array<{ ia: string; ok: boolean }>;
      rounds_executed: string[];
    };
    expect(r.synthesis.length).toBeGreaterThan(0);
    expect(r.experts.length).toBeGreaterThanOrEqual(5);
    expect(new Set(r.experts.map((e) => e.ia)).size).toBe(r.experts.length); /* IA distinctes */
    expect(r.rounds_executed).toContain('synthese_juge');
  });

  it('synthèse chef d\'orchestre : fallback naïf si le conducteur échoue (jamais vide)', async () => {
    const { crewExperts } = await import('../../services/ai/crew-experts.js');
    const result = await crewExperts.run({
      task: 'analyse exhaustive',
      systemPrompt: 'sys',
      members: [{ provider: 'groq' }, { provider: 'gemini' }],
    });
    failAllSingles = true; /* le conducteur (anthropic) échoue */
    const final = await crewExperts.conductorSynthesis(result, 'analyse exhaustive');
    expect(final.length).toBeGreaterThan(0);
    expect(final).toBe(result.synthesis); /* fallback naïf préservé */
  });
});
