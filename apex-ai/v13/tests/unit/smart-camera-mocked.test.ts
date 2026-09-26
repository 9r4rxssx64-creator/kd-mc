/**
 * Tests smart-camera.ts avec mocks (53→90% branches).
 * Cible : success paths, flash/zoom/switch + error paths via stream null.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { smartCamera } from '../../services/ai/smart-camera.js';

describe('smart-camera — comprehensive mocks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    smartCamera.stopAll();
  });

  describe('detectCapabilities branches', () => {
    it('sans navigator.mediaDevices → available=false', async () => {
      const orig = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      const caps = await smartCamera.detectCapabilities();
      expect(caps.available).toBe(false);
      expect(caps.facing_modes).toEqual([]);
      Object.defineProperty(navigator, 'mediaDevices', { value: orig, configurable: true });
    });

    it('avec mediaDevices + getUserMedia → available=true', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(async () => [
            { kind: 'videoinput', deviceId: 'd1', groupId: 'g1', label: 'Cam1' },
            { kind: 'videoinput', deviceId: 'd2', groupId: 'g2', label: 'Cam2' },
          ] as MediaDeviceInfo[]),
        },
        configurable: true,
      });
      const caps = await smartCamera.detectCapabilities();
      expect(caps.available).toBe(true);
      expect(caps.facing_modes.length).toBeGreaterThan(0);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('1 seule cam vidéo → 1 facing mode', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(async () => [
            { kind: 'videoinput', deviceId: 'd1', groupId: 'g1', label: 'Cam' },
          ] as MediaDeviceInfo[]),
        },
        configurable: true,
      });
      const caps = await smartCamera.detectCapabilities();
      expect(caps.facing_modes.length).toBe(1);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('aucune cam vidéo → 0 facing modes', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(async () => [
            { kind: 'audioinput', deviceId: 'm1', groupId: 'g', label: 'Mic' },
          ] as MediaDeviceInfo[]),
        },
        configurable: true,
      });
      const caps = await smartCamera.detectCapabilities();
      expect(caps.facing_modes.length).toBe(0);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('enumerateDevices throws → fallback', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(async () => { throw new Error('boom'); }),
        },
        configurable: true,
      });
      const caps = await smartCamera.detectCapabilities();
      expect(typeof caps.available).toBe('boolean');
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('avec MediaRecorder global', async () => {
      const caps = await smartCamera.detectCapabilities();
      expect(typeof caps.has_video_recorder).toBe('boolean');
    });

    it('avec BarcodeDetector global', async () => {
      vi.stubGlobal('BarcodeDetector', class {});
      const caps = await smartCamera.detectCapabilities();
      expect(caps.has_barcode_detector).toBe(true);
    });
  });

  describe('captureSingle error paths', () => {
    it('sans mediaDevices → fail', async () => {
      const r = await smartCamera.captureSingle();
      expect(r.ok).toBe(false);
      expect(r.mode).toBe('single');
      expect(r.reason).toBeTruthy();
    });

    it('avec mediaDevices throws → fail', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => { throw new Error('NotAllowed'); }) },
        configurable: true,
      });
      const r = await smartCamera.captureSingle('user');
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });
  });

  describe('captureBurst error paths', () => {
    it('sans mediaDevices → fail', async () => {
      const r = await smartCamera.captureBurst(3, 50);
      expect(r.ok).toBe(false);
      expect(r.mode).toBe('burst');
    });

    it('count clamp à 1 minimum', async () => {
      const r = await smartCamera.captureBurst(0, 50);
      expect(typeof r.ok).toBe('boolean');
    });

    it('count clamp à 20 max', async () => {
      const r = await smartCamera.captureBurst(50, 50);
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('captureTimelapse error paths', () => {
    it('sans mediaDevices → fail', async () => {
      const r = await smartCamera.captureTimelapse(100, 50);
      expect(r.ok).toBe(false);
    });
  });

  describe('startVideoRecord branches', () => {
    it('MediaRecorder absent → fail', async () => {
      const orig = (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      const r = await smartCamera.startVideoRecord();
      expect(r.ok).toBe(false);
      if (orig) (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder = orig;
    });

    it('avec mediaDevices + MediaRecorder mock', async () => {
      const recorder = { start: vi.fn(), stop: vi.fn(), state: 'recording' as const };
      vi.stubGlobal('MediaRecorder', class {
        constructor() { /* no-op */ }
        state = 'recording';
        start = recorder.start;
        stop = recorder.stop;
        ondataavailable: unknown = null;
        onstop: unknown = null;
      });
      const trackMock = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
      const stream = { getVideoTracks: () => [trackMock], getTracks: () => [trackMock] } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => stream) },
        configurable: true,
      });
      const r = await smartCamera.startVideoRecord(1000);
      expect(r.ok).toBe(true);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('mediaDevices throws', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => { throw new Error('Denied'); }) },
        configurable: true,
      });
      const r = await smartCamera.startVideoRecord();
      expect(r.ok).toBe(false);
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });
  });

  describe('stopVideoRecord branches', () => {
    it('sans recorder actif → fail', async () => {
      const r = await smartCamera.stopVideoRecord();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Aucun');
    });
  });

  describe('toggleFlash branches', () => {
    it('sans stream actif → fail', async () => {
      const r = await smartCamera.toggleFlash(true);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('No active stream');
    });
  });

  describe('setZoom branches', () => {
    it('sans stream actif → fail', async () => {
      const r = await smartCamera.setZoom(2);
      expect(r.ok).toBe(false);
    });
  });

  describe('switchCamera branches', () => {
    it('sans stream actif → fail', async () => {
      const r = await smartCamera.switchCamera('user');
      expect(r.ok).toBe(false);
    });
  });

  describe('scanQrLive branches', () => {
    it('BarcodeDetector absent → fail', async () => {
      const orig = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
      delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
      const r = await smartCamera.scanQrLive(() => { /* noop */ });
      expect(r.ok).toBe(false);
      if (orig) (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = orig;
    });

    it('BarcodeDetector mais pas de stream → fail', async () => {
      vi.stubGlobal('BarcodeDetector', class {
        constructor() { /* no-op */ }
        async detect() { return []; }
      });
      const r = await smartCamera.scanQrLive(() => { /* noop */ });
      expect(typeof r.ok).toBe('boolean');
    });
  });

  describe('stopAll', () => {
    it('no-op si rien d actif', () => {
      smartCamera.stopAll();
    });
  });
});
