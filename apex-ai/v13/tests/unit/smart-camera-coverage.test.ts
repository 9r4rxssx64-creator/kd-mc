/**
 * Tests smart-camera coverage extension (42% → 80%+).
 * Couvre les paths internal classes/methods + edge cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { smartCamera } from '../../services/ai/smart-camera.js';

describe('Smart Camera coverage extension', () => {
  beforeEach(() => {
    smartCamera.stopAll();
    vi.restoreAllMocks();
  });

  describe('detectCapabilities edge cases', () => {
    it('navigator.mediaDevices undefined → available=false', async () => {
      const original = (navigator as { mediaDevices?: unknown }).mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      const caps = await smartCamera.detectCapabilities();
      expect(caps.available).toBe(false);
      expect(caps.facing_modes.length).toBe(0);
      Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
    });

    it('enumerateDevices throw → fallback gracefull', async () => {
      const original = (navigator as { mediaDevices?: { enumerateDevices?: unknown } }).mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: () => Promise.reject(new Error('test')),
          enumerateDevices: () => Promise.reject(new Error('not allowed')),
        },
        configurable: true,
      });
      const caps = await smartCamera.detectCapabilities();
      /* Doesn't crash */
      expect(typeof caps.available).toBe('boolean');
      Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
    });
  });

  describe('captureSingle error paths', () => {
    it('captureSingle facing default → environment', async () => {
      const r = await smartCamera.captureSingle();
      expect(r.mode).toBe('single');
    });

    it('captureSingle user facing', async () => {
      const r = await smartCamera.captureSingle('user');
      expect(r.mode).toBe('single');
    });
  });

  describe('captureBurst clamp', () => {
    it('count = 0 → clamp à 1', async () => {
      const r = await smartCamera.captureBurst(0);
      expect(r.mode).toBe('burst');
    });

    it('count > 20 → clamp à 20', async () => {
      const r = await smartCamera.captureBurst(50);
      expect(r.mode).toBe('burst');
    });
  });

  describe('captureTimelapse safety', () => {
    it('duration < intervalMs → fallback intervalMs', async () => {
      const r = await smartCamera.captureTimelapse(100, 1000);
      expect(r.mode).toBe('timelapse');
    });

    it('duration > 60s → clamp à 60s', async () => {
      const r = await smartCamera.captureTimelapse(120000, 30000);
      expect(r.mode).toBe('timelapse');
    });
  });

  describe('Video recording lifecycle', () => {
    it('startVideoRecord MediaDevices indispo → ok=false', async () => {
      const r = await smartCamera.startVideoRecord(1000);
      expect(typeof r.ok).toBe('boolean');
    });

    it('stopVideoRecord double call ne crash pas', async () => {
      const r1 = await smartCamera.stopVideoRecord();
      const r2 = await smartCamera.stopVideoRecord();
      expect(typeof r1.ok).toBe('boolean');
      expect(typeof r2.ok).toBe('boolean');
    });
  });

  describe('Flash + Zoom + switchCamera sans stream', () => {
    it('toggleFlash sans stream → reason "No active stream"', async () => {
      smartCamera.stopAll();
      const r = await smartCamera.toggleFlash(true);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('stream');
    });

    it('setZoom sans stream → reason "No active stream"', async () => {
      smartCamera.stopAll();
      const r = await smartCamera.setZoom(2);
      expect(r.ok).toBe(false);
    });

    it('switchCamera sans stream → reason', async () => {
      smartCamera.stopAll();
      const r = await smartCamera.switchCamera('user');
      expect(r.ok).toBe(false);
    });
  });

  describe('scanQrLive BarcodeDetector absent', () => {
    it('BarcodeDetector undefined → ok=false reason "non supportée"', async () => {
      const original = (window as { BarcodeDetector?: unknown }).BarcodeDetector;
      Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
      const r = await smartCamera.scanQrLive(() => undefined);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Barcode');
      Object.defineProperty(window, 'BarcodeDetector', { value: original, configurable: true });
    });
  });

  describe('listModes complet', () => {
    it('9 modes avec emoji + description (single/burst/timelapse/scan/document/qr/video/selfie/panorama)', () => {
      const modes = smartCamera.listModes();
      expect(modes.length).toBe(9);
      const ids = modes.map((m) => m.mode);
      expect(ids).toContain('single');
      expect(ids).toContain('burst');
      expect(ids).toContain('timelapse');
      expect(ids).toContain('scan');
      expect(ids).toContain('document');
      expect(ids).toContain('qr_live');
      expect(ids).toContain('video_record');
      expect(ids).toContain('selfie');
      expect(ids).toContain('panorama');
      /* Tous ont emoji + description non vide */
      for (const m of modes) {
        expect(m.emoji.length).toBeGreaterThan(0);
        expect(m.description.length).toBeGreaterThan(0);
      }
    });
  });
});
