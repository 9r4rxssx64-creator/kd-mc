/**
 * Tests frontend-design.ts (Yury Plugin équivalent #3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { frontendDesign } from '../../services/core-svc/frontend-design.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"html": "<button class=\\"ax-cta\\">Clique</button>", "css": ".ax-cta{font-family:Inter;color:#007bff;padding:12px 24px;border-radius:14px}", "js": "console.log(\'ok\')"}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('Frontend Design Generator (Yury Plugin équivalent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('génère un composant vanilla depuis prompt', async () => {
      const output = await frontendDesign.generate({
        prompt: 'bouton CTA premium',
        framework: 'vanilla',
      });
      expect(output.html).toContain('button');
      expect(output.framework).toBe('vanilla');
      expect(output.generatedAt).toBeGreaterThan(0);
    });

    it('applique anti-slop : remplace Inter → Georgia', async () => {
      const output = await frontendDesign.generate({
        prompt: 'card produit',
      });
      expect(output.css).not.toContain('Inter');
      expect(output.css).toContain('Georgia');
    });

    it('applique anti-slop : remplace #007bff Bootstrap → brand', async () => {
      const output = await frontendDesign.generate({ prompt: 'lien' });
      expect(output.css).not.toContain('#007bff');
      expect(output.css).toContain('#c9a227');
    });
  });

  describe('buildPreviewSrcdoc', () => {
    it('construit un srcdoc HTML complet pour iframe sandbox', async () => {
      const output = await frontendDesign.generate({ prompt: 'test' });
      const srcdoc = frontendDesign.buildPreviewSrcdoc(output);
      expect(srcdoc).toContain('<!DOCTYPE html>');
      expect(srcdoc).toContain('<style>');
      expect(srcdoc).toContain('<script');
    });

    it('inclut React runtime si framework=react', async () => {
      const output = await frontendDesign.generate({ prompt: 'comp', framework: 'react' });
      const srcdoc = frontendDesign.buildPreviewSrcdoc(output);
      expect(srcdoc).toContain('react@18');
    });
  });

  describe('applyAntiSlop', () => {
    it('remplace plusieurs patterns slop dans CSS', () => {
      const cssIn = 'body{font-family:"Inter";color:#007bff} h1{font-family:Roboto}';
      const cssOut = frontendDesign.applyAntiSlop(cssIn);
      expect(cssOut).not.toContain('Inter');
      expect(cssOut).not.toContain('Roboto');
      expect(cssOut).not.toContain('#007bff');
    });
  });

  describe('history', () => {
    it('persiste les designs générés', async () => {
      await frontendDesign.generate({ prompt: 'test 1' });
      const hist = frontendDesign.history();
      expect(hist.length).toBeGreaterThanOrEqual(1);
    });
  });
});
