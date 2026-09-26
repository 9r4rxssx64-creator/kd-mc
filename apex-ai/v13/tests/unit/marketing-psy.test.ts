/**
 * Tests marketing-psy.ts (Kevin v13.4.3 — Shubham Skill #3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { marketingPsy } from '../../services/integrations/marketing-psy.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"copy":"Rejoins 5000+ pros qui font confiance à Apex","trigger":"social-proof","rationale":"Le chiffre concret rassure."}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('Marketing Psy (Shubham Skill)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('génère une copie marketing avec trigger', async () => {
    const out = await marketingPsy.generate({
      product: 'Apex AI',
      audience: 'Développeurs freelance',
      trigger: 'social-proof',
    });
    expect(out.copy).toContain('5000');
    expect(out.trigger).toBe('social-proof');
    expect(out.rationale.length).toBeGreaterThan(0);
    expect(out.id).toMatch(/^mkt_/);
  });

  it('refuse spec sans produit ou audience', async () => {
    await expect(marketingPsy.generate({ product: '', audience: 'X' })).rejects.toThrow(/Produit/);
    await expect(marketingPsy.generate({ product: 'X', audience: '' })).rejects.toThrow(/Audience/);
  });

  it('listTriggers retourne les 7 triggers Cialdini', () => {
    const triggers = marketingPsy.listTriggers();
    expect(triggers.length).toBe(7);
    const ids = triggers.map((t) => t.id);
    expect(ids).toContain('reciprocity');
    expect(ids).toContain('scarcity');
    expect(ids).toContain('unity');
  });
});
