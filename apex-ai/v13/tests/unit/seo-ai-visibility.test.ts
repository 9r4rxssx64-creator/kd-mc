import { describe, it, expect, vi, beforeEach } from 'vitest';

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));
vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: { stream: streamMock },
}));

import { seoAiVisibility } from '../../services/integrations/seo-ai-visibility.js';

/* Simule une réponse IA qui mentionne certaines marques. */
function mockAnswer(text: string): void {
  streamMock.mockImplementation(
    async (
      _m: unknown,
      _s: unknown,
      onChunk: (c: { text?: string; provider?: string }) => void,
    ) => {
      onChunk({ text, provider: 'anthropic' });
    },
  );
}

describe('seoAiVisibility.analyze (remplaçant gratuit Profound)', () => {
  beforeEach(() => { streamMock.mockReset(); });

  it('détecte la marque citée et calcule présence + SoV vs concurrents', async () => {
    mockAnswer('Pour ce besoin, CMCteams est une bonne option. Concurrent Planday existe aussi.');
    const r = await seoAiVisibility.analyze({
      brand: 'CMCteams',
      queries: ['meilleur outil planning casino', 'alternatives planning équipes'],
      competitors: ['Planday', 'Skello'],
    });
    expect(r.ok).toBe(true);
    expect(r.presenceRate).toBe(100); // citée dans les 2 réponses
    expect(r.engine).toBe('anthropic');
    const planday = r.competitors.find((c) => c.name === 'Planday');
    expect(planday?.mentions).toBe(2);
    // SoV = brand(2) / (brand 2 + Planday 2 + Skello 0) = 50%
    expect(r.shareOfVoice).toBe(50);
    expect(r.perQuery[0]?.brandMentioned).toBe(true);
  });

  it('marque jamais citée → présence 0 + reco GEO', async () => {
    mockAnswer('Je recommande Planday et Skello pour ça.');
    const r = await seoAiVisibility.analyze({
      brand: 'CMCteams',
      queries: ['logiciel planning'],
      competitors: ['Planday'],
    });
    expect(r.presenceRate).toBe(0);
    expect(r.shareOfVoice).toBe(0);
    expect(r.recommendations.join(' ')).toMatch(/jamais citée|llms\.txt|E-E-A-T/i);
  });

  it('rejette sans marque', async () => {
    const r = await seoAiVisibility.analyze({ brand: '' });
    expect(r.ok).toBe(false);
  });

  it('ne matche pas une sous-chaîne accidentelle (mot entier)', async () => {
    mockAnswer('Le mot CMCteamsXYZ ne doit pas compter comme la marque.');
    const r = await seoAiVisibility.analyze({ brand: 'CMCteams', queries: ['test'] });
    expect(r.presenceRate).toBe(0);
  });
});
