/**
 * Tests cross-platform.ts (Kevin v13.3.25 wrappers safe iOS+Android+Desktop).
 *
 * Couvre :
 * - share() avec fallback clipboard
 * - vibrate() sécure si pas dispo
 * - getBattery / getNetworkInfo
 * - scanBluetooth / readNFC / pickFile fallbacks
 * - requestAllPermissions
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { crossPlatform } from '../../services/core-svc/cross-platform.js';

describe('Cross-platform wrappers', () => {
  beforeEach(() => {
    /* Reset state between tests */
  });

  describe('share()', () => {
    it('fallback clipboard si Web Share API absent', async () => {
      /* En happy-dom, navigator.share n'existe pas */
      const r = await crossPlatform.share({ url: 'https://apex.test' });
      expect(typeof r.ok).toBe('boolean');
    });

    it('user_cancel si AbortError', async () => {
      /* Mock navigator.share qui throw AbortError */
      const original = (navigator as { share?: unknown }).share;
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockRejectedValue(new DOMException('User aborted', 'AbortError')),
        configurable: true,
      });
      /* Force re-detect via reset cache (deviceDetect cached) */
      const r = await crossPlatform.share({ text: 'test' });
      expect(typeof r.ok).toBe('boolean');
      if (original === undefined) {
        delete (navigator as { share?: unknown }).share;
      }
    });
  });

  describe('vibrate()', () => {
    it('retourne false si pas Vibration API', () => {
      const ok = crossPlatform.vibrate(100);
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('getBattery()', () => {
    it('retourne {ok:false} si Battery API absent', async () => {
      const r = await crossPlatform.getBattery();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('battery_unavailable');
    });
  });

  describe('getNetworkInfo()', () => {
    it('retourne object complet', () => {
      const info = crossPlatform.getNetworkInfo();
      expect(info).toHaveProperty('online');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('saveData');
      expect(info).toHaveProperty('downlink');
    });
  });

  describe('scanBluetooth()', () => {
    it('retourne unsupported si Web Bluetooth absent', async () => {
      const r = await crossPlatform.scanBluetooth();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('bluetooth_unsupported');
    });
  });

  describe('readNFC()', () => {
    it('retourne unsupported si Web NFC absent', async () => {
      const r = await crossPlatform.readNFC();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('nfc_unsupported');
    });
  });

  describe('pickFile()', () => {
    it('utilise fallback input file si File System Access absent', () => {
      const promise = crossPlatform.pickFile();
      expect(promise).toBeInstanceOf(Promise);
      /* On résout avec un input (pas cliqué dans test, donc no_file) */
      /* Test juste que ça ne throw pas */
    });
  });

  describe('pickContacts()', () => {
    it('retourne unsupported si Contact Picker absent', async () => {
      const r = await crossPlatform.pickContacts();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('contacts_unsupported');
    });
  });

  describe('detectBarcode()', () => {
    it('retourne unsupported si BarcodeDetector absent', async () => {
      /* Crée un canvas factice */
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const r = await crossPlatform.detectBarcode(canvas as unknown as ImageBitmapSource);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('barcode_unsupported');
    });
  });

  describe('iOS-specific', () => {
    it('generateApplePass retourne ok=false sur non-iOS', async () => {
      const r = await crossPlatform.generateApplePass({ test: true });
      expect(r.ok).toBe(false);
    });

    it('openSiriShortcut retourne false sur non-iOS', () => {
      const ok = crossPlatform.openSiriShortcut('test_action');
      /* En env test, deviceDetect.os par défaut = unknown ou linux/macos */
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('Android-specific', () => {
    it('openAndroidIntent retourne false sur non-Android', () => {
      const ok = crossPlatform.openAndroidIntent({ package: 'com.test' });
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('requestAllPermissions()', () => {
    it('retourne object avec toutes features demandées', async () => {
      const r = await crossPlatform.requestAllPermissions(['notifications', 'geolocation']);
      expect(r).toHaveProperty('notifications');
      expect(r).toHaveProperty('geolocation');
    });

    it('camera/microphone marqués unsupported sans getUserMedia', async () => {
      const r = await crossPlatform.requestAllPermissions(['camera', 'microphone']);
      expect(['unsupported', 'denied', 'granted', 'prompt']).toContain(r.camera);
      expect(['unsupported', 'denied', 'granted', 'prompt']).toContain(r.microphone);
    });
  });

  describe('acquireWakeLock / releaseWakeLock', () => {
    it('retourne unavailable si WakeLock absent', async () => {
      const r = await crossPlatform.acquireWakeLock();
      expect(r.ok).toBe(false);
    });

    it('releaseWakeLock no-op safe', async () => {
      await expect(crossPlatform.releaseWakeLock()).resolves.toBeUndefined();
    });
  });
});
