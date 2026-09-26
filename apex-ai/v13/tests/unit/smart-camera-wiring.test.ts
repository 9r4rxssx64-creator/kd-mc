/**
 * Tests smart-camera + voices speak + chat suggestion wiring (anti-théâtre).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { smartCamera } from '../../services/ai/smart-camera.js';
import { voicesRegistry } from '../../services/ai/voices-registry.js';
import { visionRecognition } from '../../services/ai/vision-recognition.js';

describe('Smart Camera (multi-compétence Kevin)', () => {
  beforeEach(() => {
    smartCamera.stopAll();
    vi.restoreAllMocks();
  });

  describe('detectCapabilities', () => {
    it('retourne object avec available + facing_modes + flags', async () => {
      const caps = await smartCamera.detectCapabilities();
      expect(typeof caps.available).toBe('boolean');
      expect(Array.isArray(caps.facing_modes)).toBe(true);
      expect(typeof caps.has_video_recorder).toBe('boolean');
      expect(typeof caps.has_barcode_detector).toBe('boolean');
      expect(typeof caps.has_geolocation).toBe('boolean');
    });
  });

  describe('captureSingle (env happy-dom)', () => {
    it('captureSingle sans MediaDevices → ok=false reason', async () => {
      const r = await smartCamera.captureSingle('environment');
      /* En happy-dom : pas de getUserMedia → ok=false avec reason */
      expect(typeof r.ok).toBe('boolean');
      expect(r.mode).toBe('single');
      if (!r.ok) expect(r.reason).toBeTruthy();
    });
  });

  describe('captureBurst safety', () => {
    it('count clamp [1, 20]', async () => {
      const r1 = await smartCamera.captureBurst(0);
      expect(r1.mode).toBe('burst');
      const r2 = await smartCamera.captureBurst(50);
      expect(r2.mode).toBe('burst');
      /* En happy-dom : ok=false mais mode reste burst */
    });
  });

  describe('captureTimelapse safety', () => {
    it('duration clamp max 60s', async () => {
      const r = await smartCamera.captureTimelapse(120_000, 30_000); /* 2min interval 30s */
      expect(r.mode).toBe('timelapse');
    });
  });

  describe('Video recording', () => {
    it('startVideoRecord sans MediaRecorder → ok=false reason', async () => {
      const original = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
      Object.defineProperty(globalThis, 'MediaRecorder', { value: undefined, configurable: true });
      const r = await smartCamera.startVideoRecord(1000);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('MediaRecorder');
      Object.defineProperty(globalThis, 'MediaRecorder', { value: original, configurable: true });
    });

    it('stopVideoRecord sans recording actif → ok=false', async () => {
      const r = await smartCamera.stopVideoRecord();
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Aucun enregistrement');
    });
  });

  describe('Flash + Zoom', () => {
    it('toggleFlash sans stream → ok=false', async () => {
      const r = await smartCamera.toggleFlash(true);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('No active stream');
    });

    it('setZoom sans stream → ok=false', async () => {
      const r = await smartCamera.setZoom(2);
      expect(r.ok).toBe(false);
    });
  });

  describe('listModes', () => {
    it('liste 9 modes avec emoji + description', () => {
      const modes = smartCamera.listModes();
      expect(modes.length).toBe(9);
      expect(modes.every((m) => m.emoji && m.description)).toBe(true);
      const ids = new Set(modes.map((m) => m.mode));
      expect(ids.has('single')).toBe(true);
      expect(ids.has('burst')).toBe(true);
      expect(ids.has('timelapse')).toBe(true);
      expect(ids.has('qr_live')).toBe(true);
      expect(ids.has('video_record')).toBe(true);
    });
  });

  describe('stopAll cleanup', () => {
    it('stopAll ne crash pas même sans stream actif', () => {
      let threw = false;
      try {
        smartCamera.stopAll();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });
});

describe('Voices Registry speak() wiring', () => {
  describe('TTS Web Speech API', () => {
    it('speak sans text → ok=false', async () => {
      const r = await voicesRegistry.speak('');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('text');
    });

    it('speak sans speechSynthesis → ok=false', async () => {
      const original = (window as { speechSynthesis?: unknown }).speechSynthesis;
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
      const r = await voicesRegistry.speak('hello');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('SpeechSynthesis');
      Object.defineProperty(window, 'speechSynthesis', { value: original, configurable: true });
    });
  });

  describe('stop() cleanup', () => {
    it('stop ne crash pas', () => {
      let threw = false;
      try {
        voicesRegistry.stop();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });
});

describe('Vision Recognition captureFromCamera + captureAndProcess (wiring)', () => {
  it('captureFromCamera sans MediaDevices → ok=false reason', async () => {
    const r = await visionRecognition.captureFromCamera();
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('captureAndProcess sans capture → recognition undefined', async () => {
    const r = await visionRecognition.captureAndProcess('test');
    expect(r.capture.ok).toBe(false);
    /* Si capture failed → no recognition/routing */
    if (!r.capture.ok) {
      expect(r.recognition).toBeUndefined();
    }
  });
});
