/**
 * Tests superpowers-methodology.ts (Yury Plugin équivalent #4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { superpowersMethodology } from '../../services/ai/superpowers-methodology.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({ text: 'Mock IA output for current step' });
      return Promise.resolve();
    }),
  },
}));

describe('Superpowers Methodology (Yury Plugin équivalent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('crée une session avec sessionId unique', () => {
      const id1 = superpowersMethodology.start('refactor auth');
      const id2 = superpowersMethodology.start('add darkmode');
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^sp_/);
    });

    it('session démarre au step brainstorm', () => {
      const id = superpowersMethodology.start('test task');
      const state = superpowersMethodology.getState(id);
      expect(state?.currentStep).toBe('brainstorm');
      expect(state?.status).toBe('active');
    });
  });

  describe('advance', () => {
    it('avance la session step par step', async () => {
      const id = superpowersMethodology.start('test');
      const out1 = await superpowersMethodology.advance(id);
      expect(out1?.step).toBe('brainstorm');
      const state1 = superpowersMethodology.getState(id);
      expect(state1?.currentStep).toBe('plan');

      const out2 = await superpowersMethodology.advance(id);
      expect(out2?.step).toBe('plan');
    });

    it('passe status=completed après les 7 steps', async () => {
      const id = superpowersMethodology.start('full cycle');
      for (let i = 0; i < 7; i++) {
        await superpowersMethodology.advance(id);
      }
      const state = superpowersMethodology.getState(id);
      expect(state?.status).toBe('completed');
      expect(state?.completedSteps).toHaveLength(7);
    });

    it('advance sur sessionId inexistant retourne null', async () => {
      const out = await superpowersMethodology.advance('inexistant');
      expect(out).toBeNull();
    });
  });

  describe('listSessions / cancel', () => {
    it('liste toutes les sessions créées', () => {
      const id1 = superpowersMethodology.start('A');
      const id2 = superpowersMethodology.start('B');
      const list = superpowersMethodology.listSessions();
      expect(list.length).toBeGreaterThanOrEqual(2);
      const ids = list.map((s) => s.sessionId);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('cancel une session active', () => {
      const id = superpowersMethodology.start('to cancel');
      const ok = superpowersMethodology.cancel(id);
      expect(ok).toBe(true);
      const state = superpowersMethodology.getState(id);
      expect(state?.status).toBe('cancelled');
    });

    it('cancel sur session déjà cancelled retourne false', () => {
      const id = superpowersMethodology.start('test');
      superpowersMethodology.cancel(id);
      const ok = superpowersMethodology.cancel(id);
      expect(ok).toBe(false);
    });
  });
});
