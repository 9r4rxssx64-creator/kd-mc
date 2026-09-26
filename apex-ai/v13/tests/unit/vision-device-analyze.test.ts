/**
 * APEX v13.3.51 — Tests Vision Device Analyze (Kevin 2026-05-07).
 *
 * Couvre :
 * - analyzeBroadlinkAccount : parse JSON pur depuis Claude
 * - analyzeBroadlinkAccount : parse JSON dans markdown ```json ... ```
 * - analyzeSmartTV : extract MAC, IP, brand, model
 * - analyzeDeviceInfo : auto-detect type (broadlink/smart_tv/unknown)
 * - autoDetectAndAnalyze : enchaîne generic + spécifique
 * - failure : pas de clé Anthropic → confidence=0 raw_text vide
 * - failure : description non-JSON → fallback raw_text
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { visionDeviceAnalyze } from '../../services/ai/vision-device-analyze.js';
import { vision } from '../../services/ai/vision.js';

describe('vision-device-analyze — extraction structurée images device', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeBroadlinkAccount()', () => {
    it('parse JSON pur retourné par Claude Vision', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({
          email: 'kevin@example.com',
          token: 'tok_visible_xyz',
          devices: [
            { id: 'd1', name: 'Salon TV', mac: 'AA:BB:CC:11:22:33', type: 'rm_pro' },
          ],
          raw_text: 'Compte Broadlink — Email: kevin@example.com',
          confidence: 0.92,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({ imageBase64: 'fake' });
      expect(r.email).toBe('kevin@example.com');
      expect(r.token).toBe('tok_visible_xyz');
      expect(r.devices).toHaveLength(1);
      expect(r.devices?.[0]?.mac).toBe('AA:BB:CC:11:22:33');
      expect(r.confidence).toBe(0.92);
    });

    it('parse JSON dans bloc markdown ```json ... ```', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: '```json\n{"email":"a@b.c","confidence":0.5,"raw_text":"x"}\n```',
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({ imageBase64: 'fake' });
      expect(r.email).toBe('a@b.c');
      expect(r.confidence).toBe(0.5);
    });

    it('fallback raw_text si description pas du JSON parseable', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: 'Cette image montre un compte Broadlink mais format inattendu',
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({ imageBase64: 'fake' });
      expect(r.confidence).toBe(0);
      expect(r.raw_text).toContain('Broadlink');
      expect(r.token).toBeUndefined();
    });

    it('retourne confidence=0 si vision.analyze throw', async () => {
      vi.spyOn(vision, 'analyze').mockRejectedValue(new Error('No Anthropic key'));
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({ imageBase64: 'fake' });
      expect(r.confidence).toBe(0);
    });
  });

  describe('analyzeSmartTV()', () => {
    it('extrait MAC, IP, brand, model', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({
          mac: 'A4:DA:32:11:22:33',
          ip: '192.168.1.50',
          ssid: 'KevinHome',
          brand: 'Clayton',
          model: 'CL55UHD22',
          raw_text: 'Info réseau Smart TV',
          confidence: 0.88,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeSmartTV({ imageBase64: 'fake' });
      expect(r.mac).toBe('A4:DA:32:11:22:33');
      expect(r.ip).toBe('192.168.1.50');
      expect(r.brand).toBe('Clayton');
      expect(r.model).toBe('CL55UHD22');
      expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('omet champs manquants', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({ brand: 'Samsung', confidence: 0.7, raw_text: 'x' }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeSmartTV({ imageBase64: 'fake' });
      expect(r.brand).toBe('Samsung');
      expect(r.mac).toBeUndefined();
      expect(r.model).toBeUndefined();
    });
  });

  describe('analyzeDeviceInfo() — auto-detect type', () => {
    it('détecte type=broadlink_account', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({
          type: 'broadlink_account',
          extracted_fields: { email: 'a@b.c' },
          raw_text: 'x',
          confidence: 0.9,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeDeviceInfo({ imageBase64: 'fake' });
      expect(r.type).toBe('broadlink_account');
      expect(r.extracted_fields['email']).toBe('a@b.c');
    });

    it('détecte type=smart_tv', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({
          type: 'smart_tv',
          extracted_fields: { brand: 'LG' },
          raw_text: 'x',
          confidence: 0.8,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeDeviceInfo({ imageBase64: 'fake' });
      expect(r.type).toBe('smart_tv');
      expect(r.extracted_fields['brand']).toBe('LG');
    });

    it('fallback type=unknown si type invalide', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({
          type: 'invalid_xyz',
          extracted_fields: {},
          raw_text: 'x',
          confidence: 0.3,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeDeviceInfo({ imageBase64: 'fake' });
      expect(r.type).toBe('unknown');
    });
  });

  describe('autoDetectAndAnalyze() — pipeline 2-passes', () => {
    it('si type=broadlink + confidence>=0.5 → ajoute broadlink details', async () => {
      const spy = vi.spyOn(vision, 'analyze');
      /* 1ère call : detect generic */
      spy.mockResolvedValueOnce({
        description: JSON.stringify({
          type: 'broadlink_account',
          extracted_fields: { email: 'k@x.c' },
          raw_text: 'x',
          confidence: 0.85,
        }),
        ai_provider: 'anthropic',
      });
      /* 2ème call : detail broadlink */
      spy.mockResolvedValueOnce({
        description: JSON.stringify({
          email: 'k@x.c',
          token: 'tok_xx',
          devices: [{ id: 'd1', name: 'TV' }],
          raw_text: 'x',
          confidence: 0.9,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.autoDetectAndAnalyze({ imageBase64: 'fake' });
      expect(r.type).toBe('broadlink_account');
      expect(r.broadlink).toBeDefined();
      expect(r.broadlink?.token).toBe('tok_xx');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('si type=smart_tv + confidence>=0.5 → ajoute smartTv details', async () => {
      const spy = vi.spyOn(vision, 'analyze');
      spy.mockResolvedValueOnce({
        description: JSON.stringify({
          type: 'smart_tv',
          extracted_fields: { brand: 'Clayton' },
          raw_text: 'x',
          confidence: 0.7,
        }),
        ai_provider: 'anthropic',
      });
      spy.mockResolvedValueOnce({
        description: JSON.stringify({
          mac: 'AA:BB',
          brand: 'Clayton',
          model: 'CL55',
          raw_text: 'x',
          confidence: 0.8,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.autoDetectAndAnalyze({ imageBase64: 'fake' });
      expect(r.type).toBe('smart_tv');
      expect(r.smartTv).toBeDefined();
      expect(r.smartTv?.model).toBe('CL55');
    });

    it('si confidence trop faible → ne lance pas 2ème call', async () => {
      const spy = vi.spyOn(vision, 'analyze');
      spy.mockResolvedValueOnce({
        description: JSON.stringify({
          type: 'broadlink_account',
          extracted_fields: {},
          raw_text: 'x',
          confidence: 0.2,
        }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.autoDetectAndAnalyze({ imageBase64: 'fake' });
      expect(r.type).toBe('broadlink_account');
      expect(r.broadlink).toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('input variants', () => {
    it('accepte imageDataUrl (data:image/...;base64,...)', async () => {
      vi.spyOn(vision, 'analyze').mockResolvedValue({
        description: JSON.stringify({ confidence: 0.5, raw_text: 'x' }),
        ai_provider: 'anthropic',
      });
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({
        imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      });
      expect(r.confidence).toBe(0.5);
    });

    it('retourne confidence=0 si aucun input fourni', async () => {
      const r = await visionDeviceAnalyze.analyzeBroadlinkAccount({});
      expect(r.confidence).toBe(0);
    });
  });
});
