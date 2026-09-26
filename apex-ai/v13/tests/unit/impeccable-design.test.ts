/**
 * Tests impeccable-design.ts (Kevin v13.4.3 — Shubham Skill #4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { impeccableDesign, IMPECCABLE_COMMANDS } from '../../services/core-svc/impeccable-design.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"revisedDesign":"<button class=\\"premium\\">CTA</button><style>.premium{font-family:Georgia;color:#c9a227;padding:14px 28px}</style>","changes":[{"type":"typography","before":"Inter","after":"Georgia"},{"type":"color","before":"#007bff","after":"#c9a227"}]}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('Impeccable Design (Shubham Skill)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('applique une commande sur un design', async () => {
    const r = await impeccableDesign.applyCommand('make-it-pop', '<button>CTA</button>');
    expect(r.command).toBe('make-it-pop');
    expect(r.revisedDesign).toContain('premium');
    expect(r.changes.length).toBeGreaterThanOrEqual(2);
    expect(r.id).toMatch(/^imp_/);
  });

  it('refuse une commande inconnue', async () => {
    await expect(impeccableDesign.applyCommand('not-a-real-command', '<div></div>')).rejects.toThrow(/inconnue/);
  });

  it('listCommands retourne les 23 commandes', () => {
    const cmds = impeccableDesign.listCommands();
    expect(cmds.length).toBe(23);
    expect(cmds.length).toBe(IMPECCABLE_COMMANDS.length);
  });
});
