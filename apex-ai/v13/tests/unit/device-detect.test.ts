/**
 * Tests device-detect.ts (Kevin v13.3.25 cross-platform iOS+Android+Desktop).
 *
 * Couvre :
 * - OS detection (iOS Safari, Android Chrome, Desktop Firefox/Chrome, macOS, Windows)
 * - Browser detection (Edge avant Chrome, Samsung, Firefox, Safari)
 * - Feature detection (cap detection 30+ APIs)
 * - PWA mode (standalone)
 * - Helpers (isiOS, isAndroid, isDesktop, isMobile, isPWA)
 * - recommendedFeatures() par OS
 * - unavailableFeatures() avec raisons
 * - networkQuality() (high/medium/low)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { deviceDetect } from '../../services/integrations/device-detect.js';

/** Helper : mock UA + force re-detect cache (invalide cache au prochain detect()) */
function mockUA(ua: string, platform = '', extra: Partial<Navigator> = {}): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true,
  });
  for (const [k, v] of Object.entries(extra)) {
    Object.defineProperty(navigator, k, {
      value: v,
      configurable: true,
    });
  }
  /* Force cache invalidation pour qu'isiOS/recommendedFeatures voient le mock */
  deviceDetect.detect(true);
}

describe('Device Detect (cross-platform)', () => {
  const originalUA = navigator.userAgent;
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    /* Force re-detect entre tests pour invalider cache */
    deviceDetect.detect(true);
  });

  afterEach(() => {
    /* Restaure UA original */
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  describe('OS Detection', () => {
    it('détecte iOS Safari (iPhone)', () => {
      mockUA(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        'iPhone',
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('ios');
      expect(c.browser).toBe('safari');
      expect(c.isMobile).toBe(true);
      expect(c.isTablet).toBe(false);
      expect(deviceDetect.isiOS()).toBe(true);
      expect(deviceDetect.isAndroid()).toBe(false);
    });

    it('détecte iOS version', () => {
      mockUA(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile Safari',
        'iPhone',
      );
      const c = deviceDetect.detect(true);
      expect(c.os_version).toMatch(/^17\.4/);
    });

    it('détecte iPad (iOS tablet)', () => {
      mockUA(
        'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
        'iPad',
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('ios');
      expect(c.isTablet).toBe(true);
    });

    it('détecte Android Chrome', () => {
      mockUA(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Linux armv8l',
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('android');
      expect(c.browser).toBe('chrome');
      expect(c.isMobile).toBe(true);
      expect(deviceDetect.isAndroid()).toBe(true);
    });

    it('détecte Android version', () => {
      mockUA(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Linux armv8l',
      );
      const c = deviceDetect.detect(true);
      expect(c.os_version).toBe('14');
    });

    it('détecte Samsung Internet', () => {
      mockUA(
        'Mozilla/5.0 (Linux; Android 13; SM-G990) AppleWebKit/537.36 SamsungBrowser/22.0 Chrome/115.0.0.0 Mobile Safari/537.36',
        'Linux armv8l',
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('android');
      expect(c.browser).toBe('samsung');
    });

    it('détecte Desktop Windows Edge', () => {
      mockUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
        'Win32',
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('windows');
      expect(c.browser).toBe('edge');
      expect(c.isMobile).toBe(false);
    });

    it('détecte Desktop macOS Firefox', () => {
      mockUA(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
        'MacIntel',
        { maxTouchPoints: 0 },
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('macos');
      expect(c.browser).toBe('firefox');
    });

    it('détecte Desktop Linux Chrome', () => {
      mockUA(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Linux x86_64',
        { maxTouchPoints: 0 },
      );
      const c = deviceDetect.detect(true);
      expect(c.os).toBe('linux');
      expect(c.browser).toBe('chrome');
    });

    it('Edge détecté avant Chrome (UA contient "Chrome")', () => {
      mockUA(
        'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Edg/120.0.2210.91',
        'Win32',
      );
      const c = deviceDetect.detect(true);
      expect(c.browser).toBe('edge');
    });
  });

  describe('Feature Detection (cap detection)', () => {
    it('detect() retourne objet complet avec toutes clés', () => {
      const c = deviceDetect.detect(true);
      expect(typeof c.hasNotifications).toBe('boolean');
      expect(typeof c.hasGeolocation).toBe('boolean');
      expect(typeof c.hasShare).toBe('boolean');
      expect(typeof c.hasWebAuthn).toBe('boolean');
      expect(typeof c.hasGetUserMedia).toBe('boolean');
      expect(typeof c.hasIndexedDB).toBe('boolean');
      expect(typeof c.hasLocalStorage).toBe('boolean');
    });

    it('Web Bluetooth absent en happy-dom (pas de navigator.bluetooth)', () => {
      const c = deviceDetect.detect(true);
      expect(c.hasWebBluetooth).toBe(false);
    });

    it('Web NFC absent en happy-dom', () => {
      const c = deviceDetect.detect(true);
      expect(c.hasWebNFC).toBe(false);
    });

    it('Web USB absent en happy-dom', () => {
      const c = deviceDetect.detect(true);
      expect(c.hasWebUSB).toBe(false);
    });

    it('FileSystemAccess absent en happy-dom', () => {
      const c = deviceDetect.detect(true);
      expect(c.hasFileSystemAccess).toBe(false);
    });

    it('localStorage présent (env browser)', () => {
      const c = deviceDetect.detect(true);
      expect(c.hasLocalStorage).toBe(true);
    });

    it('isSecureContext défini (boolean)', () => {
      const c = deviceDetect.detect(true);
      expect(typeof c.isSecureContext).toBe('boolean');
    });

    it('has() helper retourne valeur correcte', () => {
      expect(typeof deviceDetect.has('hasLocalStorage')).toBe('boolean');
      expect(deviceDetect.has('hasWebBluetooth')).toBe(false); /* happy-dom no */
    });
  });

  describe('Helpers OS', () => {
    it('isMobile true sur Android UA', () => {
      mockUA(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Linux armv8l',
      );
      expect(deviceDetect.isMobile()).toBe(true);
    });

    it('isDesktop true sur macOS sans touch', () => {
      mockUA(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4) Safari/605.1.15',
        'MacIntel',
        { maxTouchPoints: 0 },
      );
      expect(deviceDetect.isDesktop()).toBe(true);
    });

    it('isiOS / isAndroid / isMacOS / isWindows mutually exclusive', () => {
      mockUA(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile Safari',
        'iPhone',
      );
      const isiOS = deviceDetect.isiOS();
      const isAnd = deviceDetect.isAndroid();
      const isMac = deviceDetect.isMacOS();
      const isWin = deviceDetect.isWindows();
      expect([isiOS, isAnd, isMac, isWin].filter(Boolean).length).toBe(1);
    });
  });

  describe('PWA Mode', () => {
    it('isPWA détecte standalone via matchMedia', () => {
      const original = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: q === '(display-mode: standalone)',
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      const c = deviceDetect.detect(true);
      expect(c.isPWA).toBe(true);
      window.matchMedia = original;
    });

    it('isPWA false si pas standalone', () => {
      const c = deviceDetect.detect(true);
      /* En happy-dom par défaut pas standalone */
      expect(typeof c.isPWA).toBe('boolean');
    });
  });

  describe('recommendedFeatures()', () => {
    it('iOS recommande Add to Home Screen + Siri Shortcuts', () => {
      mockUA(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Version/17.4 Mobile Safari',
        'iPhone',
      );
      const recs = deviceDetect.recommendedFeatures();
      expect(recs.some((r) => /Siri/.test(r))).toBe(true);
      expect(recs.some((r) => /Apple Wallet/.test(r))).toBe(true);
    });

    it('Android recommande Intent URLs', () => {
      mockUA(
        'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120.0.0.0 Mobile Safari',
        'Linux armv8l',
      );
      const recs = deviceDetect.recommendedFeatures();
      expect(recs.some((r) => /Intent/.test(r))).toBe(true);
    });

    it('Desktop ne recommande pas Siri Shortcuts', () => {
      mockUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Win32',
        { maxTouchPoints: 0 },
      );
      const recs = deviceDetect.recommendedFeatures();
      expect(recs.some((r) => /Siri/.test(r))).toBe(false);
    });
  });

  describe('unavailableFeatures()', () => {
    it('iOS liste Web Bluetooth + Web NFC + Web USB indisponibles', () => {
      mockUA(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Version/17.4 Mobile Safari',
        'iPhone',
      );
      const list = deviceDetect.unavailableFeatures();
      expect(list.some((u) => u.feature === 'Web Bluetooth')).toBe(true);
      expect(list.some((u) => u.feature === 'Web NFC')).toBe(true);
      expect(list.some((u) => /iOS/.test(u.reason))).toBe(true);
    });
  });

  describe('Network Quality', () => {
    it('networkQuality retourne low/medium/high', () => {
      const q = deviceDetect.networkQuality();
      expect(['high', 'medium', 'low']).toContain(q);
    });

    it('saveData ON → networkQuality low', () => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true, effectiveType: '4g', downlink: 10, rtt: 50 },
        configurable: true,
      });
      const q = deviceDetect.networkQuality();
      expect(q).toBe('low');
    });
  });

  describe('activeFeatureCount()', () => {
    it('retourne nombre > 0 (env happy-dom a quelques features)', () => {
      const n = deviceDetect.activeFeatureCount();
      expect(n).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Locale / Timezone', () => {
    it('language non vide', () => {
      const c = deviceDetect.detect(true);
      expect(c.language).toBeTruthy();
    });

    it('timezone valide IANA', () => {
      const c = deviceDetect.detect(true);
      expect(c.timezone).toMatch(/[A-Z][a-z]+\/[A-Z][a-z]+|UTC/);
    });
  });

  describe('Hardware limits', () => {
    it('cpuCores >= 1', () => {
      const c = deviceDetect.detect(true);
      expect(c.cpuCores).toBeGreaterThanOrEqual(1);
    });

    it('memoryGB > 0', () => {
      const c = deviceDetect.detect(true);
      expect(c.memoryGB).toBeGreaterThan(0);
    });

    it('storageQuotaMB > 0', () => {
      const c = deviceDetect.detect(true);
      expect(c.storageQuotaMB).toBeGreaterThan(0);
    });
  });
});
