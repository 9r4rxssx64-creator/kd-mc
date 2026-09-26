/**
 * Tests services/image-transform.ts (Kevin "polyvalent créatif" 2026-05-07).
 * Mock Replicate API + vault.readKey.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { imageTransform } from '../../services/core-svc/image-transform.js';
import { vault } from '../../services/vault/vault.js';

describe('image-transform service', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe('isValidImageUrl', () => {
    it('https:// → valide', () => {
      expect(imageTransform.isValidImageUrl('https://example.com/photo.jpg')).toBe(true);
    });
    it('data:image/ → valide', () => {
      expect(imageTransform.isValidImageUrl('data:image/png;base64,abc')).toBe(true);
    });
    it('blob: → valide', () => {
      expect(imageTransform.isValidImageUrl('blob:https://example.com/abc')).toBe(true);
    });
    it('http:// → invalide', () => {
      expect(imageTransform.isValidImageUrl('http://insecure.example.com/x.jpg')).toBe(false);
    });
    it('file:// → invalide', () => {
      expect(imageTransform.isValidImageUrl('file:///etc/passwd')).toBe(false);
    });
    it('chaîne vide → invalide', () => {
      expect(imageTransform.isValidImageUrl('')).toBe(false);
    });
  });

  describe('isValidTransformType', () => {
    it('cartoon valide', () => {
      expect(imageTransform.isValidTransformType('cartoon')).toBe(true);
    });
    it('anime valide', () => {
      expect(imageTransform.isValidTransformType('anime')).toBe(true);
    });
    it('video valide', () => {
      expect(imageTransform.isValidTransformType('video')).toBe(true);
    });
    it('remove-bg valide', () => {
      expect(imageTransform.isValidTransformType('remove-bg')).toBe(true);
    });
    it('stylize valide', () => {
      expect(imageTransform.isValidTransformType('stylize')).toBe(true);
    });
    it('unknown invalide', () => {
      expect(imageTransform.isValidTransformType('unknown')).toBe(false);
    });
    it('vide invalide', () => {
      expect(imageTransform.isValidTransformType('')).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('cartoon a coût et secondes', () => {
      const r = imageTransform.estimateCost('cartoon');
      expect(r.cost_eur).toBeGreaterThan(0);
      expect(r.estimatedSeconds).toBeGreaterThan(0);
    });
    it('video plus coûteux qu\'image', () => {
      expect(imageTransform.estimateCost('video').cost_eur).toBeGreaterThan(
        imageTransform.estimateCost('cartoon').cost_eur,
      );
    });
    it('remove-bg le moins cher', () => {
      expect(imageTransform.estimateCost('remove-bg').cost_eur).toBeLessThanOrEqual(
        imageTransform.estimateCost('cartoon').cost_eur,
      );
    });
  });

  describe('cartoonify (mock Replicate)', () => {
    it('échoue si pas de clé Replicate', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('');
      const r = await imageTransform.cartoonify('https://example.com/photo.jpg');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/replicate|Coffre/i);
    });

    it('succès quand Replicate retourne outputUrl', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test_key_12345');
      let callCount = 0;
      globalThis.fetch = vi.fn(() => {
        callCount += 1;
        /* 1er call : POST predictions → renvoie id starting */
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve({ id: 'pred_123', status: 'starting' }),
          } as Response);
        }
        /* 2e+ : GET predictions/id → succeeded */
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: 'pred_123',
            status: 'succeeded',
            output: 'https://replicate.delivery/output.png',
          }),
        } as Response);
      }) as unknown as typeof fetch;

      const r = await imageTransform.cartoonify('https://example.com/photo.jpg');
      expect(r.success).toBe(true);
      expect(r.outputUrl).toBe('https://replicate.delivery/output.png');
      expect(r.cost_eur).toBeGreaterThan(0);
      expect(r.predictionId).toBe('pred_123');
    });

    it('échoue si Replicate retourne 401', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_invalid');
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Unauthorized' }),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.cartoonify('https://example.com/photo.jpg');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/401|invalide/i);
    });

    it('échoue si Replicate retourne 402 (crédit épuisé)', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_no_credit');
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 402,
        json: () => Promise.resolve({}),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.cartoonify('https://example.com/photo.jpg');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/crédit|recharge|épuis/i);
    });

    it('échoue si URL invalide', async () => {
      const r = await imageTransform.cartoonify('http://insecure.example.com/x.jpg');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/invalide|url/i);
    });
  });

  describe('animeStyle / animateToVideo / removeBg', () => {
    beforeEach(() => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
    });

    it('animeStyle propage URL vers Replicate', async () => {
      const fetchMock = vi.fn(() => Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'p1', status: 'succeeded', output: 'https://out.com/anime.png' }),
      } as Response));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const r = await imageTransform.animeStyle('https://example.com/photo.jpg');
      expect(r.success).toBe(true);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const body = JSON.parse(((firstCall![1] as RequestInit).body) as string) as { input: { image: string } };
      expect(body.input.image).toBe('https://example.com/photo.jpg');
    });

    it('animateToVideo utilise input_image', async () => {
      const fetchMock = vi.fn(() => Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'p2', status: 'succeeded', output: 'https://out.com/anim.mp4' }),
      } as Response));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const r = await imageTransform.animateToVideo('https://example.com/photo.jpg');
      expect(r.success).toBe(true);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const body = JSON.parse(((firstCall![1] as RequestInit).body) as string) as { input: { input_image: string } };
      expect(body.input.input_image).toBe('https://example.com/photo.jpg');
    });

    it('removeBg succès', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'p3', status: 'succeeded', output: ['https://out.com/nobg.png'] }),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.removeBg('https://example.com/photo.jpg');
      expect(r.success).toBe(true);
      expect(r.outputUrl).toBe('https://out.com/nobg.png');
    });

    it('output array → utilise premier élément', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'p4', status: 'succeeded', output: ['https://out.com/a.png', 'https://out.com/b.png'] }),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.cartoonify('https://example.com/x.jpg');
      expect(r.outputUrl).toBe('https://out.com/a.png');
    });
  });

  describe('stylize', () => {
    it('échoue si prompt vide', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      const r = await imageTransform.stylize('https://example.com/x.jpg', '');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/prompt/i);
    });

    it('échoue si prompt whitespace only', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      const r = await imageTransform.stylize('https://example.com/x.jpg', '   ');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/prompt/i);
    });

    it('passe prompt + strength à Replicate', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      const fetchMock = vi.fn(() => Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'p5', status: 'succeeded', output: 'https://out.com/styled.png' }),
      } as Response));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const r = await imageTransform.stylize('https://example.com/x.jpg', 'huile sur toile');
      expect(r.success).toBe(true);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const body = JSON.parse(((firstCall![1] as RequestInit).body) as string) as { input: { prompt: string; strength: number } };
      expect(body.input.prompt).toBe('huile sur toile');
      expect(body.input.strength).toBe(0.6);
    });
  });

  describe('uploadToTempStorage', () => {
    it('rejette si > 10 MB', async () => {
      const huge = new Blob([new Uint8Array(11 * 1024 * 1024)]);
      await expect(imageTransform.uploadToTempStorage(huge)).rejects.toThrow(/10 MB|R2|S3/);
    });

    it('retourne data URL pour blob valide', async () => {
      const blob = new Blob(['hello'], { type: 'image/png' });
      const url = await imageTransform.uploadToTempStorage(blob);
      expect(url).toMatch(/^data:image\/png/);
    });
  });

  describe('pollUntilComplete', () => {
    it('échec si pas de clé', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('');
      const r = await imageTransform.pollUntilComplete('p_xyz', 1);
      expect(r.success).toBe(false);
    });

    it('renvoie failed si Replicate failed', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'p_fail', status: 'failed', error: 'OOM GPU' }),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.pollUntilComplete('p_fail', 5);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/OOM/);
    });

    it('renvoie canceled', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'p_cancel', status: 'canceled' }),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.pollUntilComplete('p_cancel', 5);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/canceled/);
    });

    it('échec si HTTP non-OK', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.pollUntilComplete('p_500', 1);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/500/);
    });
  });

  /* === v13.4.350 — generateImage (texte→image FLUX, audit amélioration Top #3) === */
  describe('generateImage', () => {
    it('prompt vide → erreur claire, 0 fetch', async () => {
      const spy = vi.fn();
      globalThis.fetch = spy as unknown as typeof fetch;
      const r = await imageTransform.generateImage('   ');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Prompt vide/);
      expect(spy).not.toHaveBeenCalled();
    });

    it('pas de clé Replicate → message actionnable vers le Coffre', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('');
      const r = await imageTransform.generateImage('un chat astronaute');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/ax_replicate_key/);
    });

    it('succès : POST endpoint modèles flux-schnell puis poll → outputUrl', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      const calls: string[] = [];
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        calls.push(String(url));
        if (String(url).includes('/models/black-forest-labs/flux-schnell/predictions')) {
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 'p_gen', status: 'starting' }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'p_gen', status: 'succeeded', output: ['https://replicate.delivery/img.webp'] }) } as Response);
      }) as unknown as typeof fetch;
      const r = await imageTransform.generateImage('a cat astronaut');
      expect(r.success).toBe(true);
      expect(r.outputUrl).toBe('https://replicate.delivery/img.webp');
      expect(calls[0]).toContain('black-forest-labs/flux-schnell');
    });

    it('402 crédit épuisé → message recharge (fail-open, jamais throw)', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('r8_test');
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({}) } as Response)) as unknown as typeof fetch;
      const r = await imageTransform.generateImage('x y z');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Crédit Replicate/);
    });
  });
});
