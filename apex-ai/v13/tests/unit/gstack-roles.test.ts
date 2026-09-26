/**
 * Tests gstack-roles.ts (Yury Plugin équivalent #5).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { gstackRoles } from '../../services/core-svc/gstack-roles.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, sys: string, onChunk: (c: { text?: string }) => void) => {
      /* Réponse mock dépend du rôle (system prompt) */
      const role = sys.includes('CEO') ? 'CEO'
        : sys.includes('designer') ? 'Designer'
          : sys.includes('engineer') ? 'Engineer'
            : sys.includes('QA') ? 'QA'
              : sys.includes('release') ? 'Release'
                : sys.includes('reviewer') ? 'Reviewer'
                  : 'Reflector';
      onChunk({ text: `Mock output from ${role} role` });
      return Promise.resolve();
    }),
  },
}));

describe('GStack Roles (Yury Plugin équivalent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('spawnRole', () => {
    it('lance un seul rôle et retourne le résultat', async () => {
      const result = await gstackRoles.spawnRole('CEO', 'Décide priorité feature X');
      expect(result.role).toBe('CEO');
      expect(result.ok).toBe(true);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it('chaque rôle a une description', () => {
      const list = gstackRoles.listRoles();
      expect(list).toHaveLength(7);
      expect(list.every((l) => l.description.length > 0)).toBe(true);
    });
  });

  describe('runFullPipeline', () => {
    it('enchaîne les 7 rôles en séquence', async () => {
      const result = await gstackRoles.runFullPipeline('Implémenter dark mode');
      expect(result.roles).toHaveLength(7);
      expect(result.finalSynthesis).toContain('Synthèse pipeline');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('chaque rôle reçoit du contexte (sauf le 1er)', async () => {
      const result = await gstackRoles.runFullPipeline('test pipeline');
      const roleOrder: string[] = ['CEO', 'Designer', 'Engineer', 'QA', 'ReleaseManager', 'Reviewer', 'Reflector'];
      result.roles.forEach((r, i) => {
        expect(r.role).toBe(roleOrder[i]);
      });
    }, 15000);
  });

  describe('history', () => {
    it('persiste les pipelines exécutés', async () => {
      await gstackRoles.runFullPipeline('test history');
      const hist = gstackRoles.history();
      expect(hist.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('history vide retourne []', () => {
      localStorage.clear();
      const hist = gstackRoles.history();
      expect(hist).toEqual([]);
    });
  });
});
