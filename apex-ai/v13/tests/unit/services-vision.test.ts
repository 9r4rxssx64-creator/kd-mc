/**
 * Tests services/vision.ts — multimodal Claude Vision (Kevin v13.1.0).
 *
 * Couvre :
 * - prepareForClaude : format Anthropic ({ type: 'base64', media_type, data })
 * - compressImage : skip si déjà sous threshold
 * - analyze : fail si pas d'input, success mock fetch
 * - analyze : fallback Tesseract OCR si Claude indispo
 * - ocr : retourne placeholder en happy-dom (pas de Tesseract réel)
 * - detectObjects : retourne [] sans canvas/img réel
 * - Reject Image trop grande (> 5 MB)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { vision } from '../../services/ai/vision.js';

/* Helper : crée un Blob image fake avec la taille et le type voulus */
function makeBlob(sizeBytes: number, type = 'image/jpeg'): Blob {
  const bytes = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) bytes[i] = i % 256;
  return new Blob([bytes], { type });
}

describe('vision service (Kevin v13.1.0 multimodal)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prepareForClaude', () => {
    it('format conforme Anthropic { type, media_type, data }', async () => {
      const blob = makeBlob(1024, 'image/jpeg');
      const block = await vision.prepareForClaude(blob);
      expect(block.type).toBe('base64');
      expect(block.media_type).toBe('image/jpeg');
      expect(typeof block.data).toBe('string');
      expect(block.data.length).toBeGreaterThan(0);
    });

    it('détecte media_type PNG', async () => {
      const blob = makeBlob(512, 'image/png');
      const block = await vision.prepareForClaude(blob);
      expect(block.media_type).toBe('image/png');
    });

    it('détecte media_type WebP', async () => {
      const blob = makeBlob(512, 'image/webp');
      const block = await vision.prepareForClaude(blob);
      expect(block.media_type).toBe('image/webp');
    });

    it('rejette image trop grande (> 5 MB)', async () => {
      const blob = makeBlob(6 * 1024 * 1024, 'image/jpeg');
      await expect(vision.prepareForClaude(blob)).rejects.toThrow(/trop grande|too large/i);
    });

    it('default media_type → image/jpeg si type inconnu', async () => {
      const blob = new Blob([new Uint8Array(100)], { type: 'application/octet-stream' });
      const block = await vision.prepareForClaude(blob);
      expect(block.media_type).toBe('image/jpeg');
    });
  });

  describe('compressImage', () => {
    it('retourne blob inchangé si déjà sous threshold', async () => {
      const blob = makeBlob(500); /* < 1 MB */
      const out = await vision.compressImage(blob);
      expect(out.size).toBe(blob.size);
    });

    it('accepte maxSize custom', async () => {
      const blob = makeBlob(2000);
      const out = await vision.compressImage(blob, 5000);
      expect(out.size).toBe(blob.size); /* sous 5000 → inchangé */
    });

    it('retourne blob (fallback safe) si pas de Image API', async () => {
      const blob = makeBlob(2 * 1024 * 1024);
      /* En happy-dom Image existe mais canvas.toBlob peut renvoyer null → fallback safe */
      const out = await vision.compressImage(blob);
      expect(out).toBeDefined();
      expect(out.size).toBeGreaterThan(0);
    });
  });

  describe('analyze', () => {
    it('fail si aucun input fourni', async () => {
      await expect(vision.analyze({})).rejects.toThrow(/imageBase64|imageUrl|imageBlob/i);
    });

    it('success via fetch mock Anthropic', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Une image montrant un chat noir.' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const blob = makeBlob(2048);
      const result = await vision.analyze({ imageBlob: blob, prompt: 'Décris.' });
      expect(result.ai_provider).toBe('anthropic');
      expect(result.description).toMatch(/chat noir/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fallback OCR Tesseract si pas de clé Anthropic', async () => {
      const blob = makeBlob(512);
      /* Le service tente Anthropic, échoue sur clé manquante, puis fallback Tesseract.
       * En happy-dom Tesseract retourne placeholder → description "(échec analyse, OCR uniquement)" */
      const r = await vision.analyze({ imageBlob: blob });
      expect(r.ai_provider).toBe('tesseract');
      expect(r.description).toBeTruthy();
    });

    it('parse data URL avec préfixe data:image/png;base64,...', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 }),
      );
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await vision.analyze({ imageBase64: dataUrl });
      expect(result.ai_provider).toBe('anthropic');
    });

    it('http error 429 → fallback Tesseract OCR (résilience)', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('quota exceeded', { status: 429 }),
      );
      const blob = makeBlob(512);
      /* Le service catche l'erreur Claude HTTP 429 et tente fallback Tesseract.
       * Si Tesseract dispo → result OCR. Sinon → relance l'erreur Anthropic. */
      try {
        const r = await vision.analyze({ imageBlob: blob });
        expect(r.ai_provider).toBe('tesseract');
      } catch (err) {
        expect(String(err)).toMatch(/HTTP 429|429/);
      }
    });

    it('imageBase64 brut (sans data: prefix) accepté', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 }),
      );
      const result = await vision.analyze({ imageBase64: 'rawbase64data' });
      expect(result.description).toBe('ok');
    });
  });

  describe('ocr', () => {
    it('retourne placeholder vide en happy-dom (Tesseract non chargé)', async () => {
      const blob = makeBlob(512);
      const r = await vision.ocr(blob);
      expect(r.text).toBe('');
      expect(typeof r.confidence).toBe('number');
      expect(typeof r.lang).toBe('string');
    });
  });

  describe('detectObjects', () => {
    it('retourne [] sans COCO-SSD chargé', async () => {
      const fakeImg = {} as HTMLImageElement;
      const r = await vision.detectObjects(fakeImg);
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBe(0);
    });
  });
});
