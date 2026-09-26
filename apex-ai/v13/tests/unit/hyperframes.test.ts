/**
 * Tests hyperframes.ts (Kevin v13.4.3 — Shubham Skill #1).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { hyperframes } from '../../services/core-svc/hyperframes.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"frames":5,"duration":167,"html":"<div data-composition-id=\\"x\\" style=\\"width:300px\\">Frame 0<script>window.__timelines={};window.__timelines[\\"x\\"]={fps:30,frames:5,duration:167};</script></div>"}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('HyperFrames (Shubham Skill)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('compose une animation depuis prompt', async () => {
    const comp = await hyperframes.compose('logo qui pulse');
    expect(comp.frames).toBe(5);
    expect(comp.html).toContain('data-composition-id');
    expect(comp.html).toContain('window.__timelines');
    expect(comp.id).toMatch(/^apex-comp-/);
  });

  it('refuse prompt vide', async () => {
    await expect(hyperframes.compose('')).rejects.toThrow(/vide/);
  });

  it('buildPreviewSrcdoc retourne HTML complet', async () => {
    const comp = await hyperframes.compose('test');
    const srcdoc = hyperframes.buildPreviewSrcdoc(comp);
    expect(srcdoc).toContain('<!DOCTYPE html>');
    expect(srcdoc).toContain(comp.html);
  });
});
