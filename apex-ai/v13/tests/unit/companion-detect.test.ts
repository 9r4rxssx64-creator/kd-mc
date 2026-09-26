/**
 * APEX v13.3.58 — Tests Companion app detection (Kevin 2026-05-08).
 *
 * Couvre :
 * - detect() retourne isCompanion=false par défaut (web mode)
 * - detect() avec window.Capacitor mock retourne isCompanion=true
 * - detect() détecte plateforme ios/android
 * - detect() expose capabilities BT/NFC/USB selon plugins
 * - detect() cache résultat
 * - hasCapability helper
 * - reset() invalide cache
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companionDetect } from '../../services/integrations/companion-detect.js';

interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  Plugins?: Record<string, unknown>;
}

interface WindowWithCapacitor {
  Capacitor?: CapacitorGlobal;
}

const winAny = window as unknown as WindowWithCapacitor;

describe('companion-detect — Capacitor wrapper detection', () => {
  beforeEach(() => {
    delete winAny.Capacitor;
    companionDetect.reset();
  });

  afterEach(() => {
    delete winAny.Capacitor;
    companionDetect.reset();
  });

  describe('detect()', () => {
    it('retourne isCompanion=false en mode web (sans Capacitor)', () => {
      const info = companionDetect.detect();
      expect(info.isCompanion).toBe(false);
      expect(info.platform).toBe('web');
      expect(info.capabilities.bluetooth).toBe(false);
      expect(info.capabilities.nfc).toBe(false);
      expect(info.capabilities.usb).toBe(false);
    });

    it('retourne isCompanion=false si Capacitor.isNativePlatform=false', () => {
      winAny.Capacitor = {
        isNativePlatform: (): boolean => false,
        getPlatform: (): string => 'web',
      };
      const info = companionDetect.detect();
      expect(info.isCompanion).toBe(false);
    });

    it('retourne isCompanion=true sur iOS Capacitor + plugins', () => {
      winAny.Capacitor = {
        isNativePlatform: (): boolean => true,
        getPlatform: (): string => 'ios',
        Plugins: {
          ApexBluetooth: {},
          ApexNFC: {},
          ApexUSB: {},
        },
      };
      companionDetect.reset();
      const info = companionDetect.detect();
      expect(info.isCompanion).toBe(true);
      expect(info.platform).toBe('ios');
      expect(info.capabilities.bluetooth).toBe(true);
      expect(info.capabilities.nfc).toBe(true);
      expect(info.capabilities.usb).toBe(true);
      expect(info.capabilities.backgroundFetch).toBe(true);
    });

    it('détecte capabilities partielles (BT mais pas NFC)', () => {
      winAny.Capacitor = {
        isNativePlatform: (): boolean => true,
        getPlatform: (): string => 'ios',
        Plugins: {
          ApexBluetooth: {},
        },
      };
      companionDetect.reset();
      const info = companionDetect.detect();
      expect(info.isCompanion).toBe(true);
      expect(info.capabilities.bluetooth).toBe(true);
      expect(info.capabilities.nfc).toBe(false);
      expect(info.capabilities.usb).toBe(false);
    });

    it('cache résultat (call multiple = même objet)', () => {
      const info1 = companionDetect.detect();
      const info2 = companionDetect.detect();
      expect(info1).toBe(info2);
    });

    it('reset() invalide cache', () => {
      const info1 = companionDetect.detect();
      companionDetect.reset();
      winAny.Capacitor = {
        isNativePlatform: (): boolean => true,
        getPlatform: (): string => 'android',
        Plugins: { ApexBluetooth: {} },
      };
      const info2 = companionDetect.detect();
      expect(info1.isCompanion).toBe(false);
      expect(info2.isCompanion).toBe(true);
      expect(info2.platform).toBe('android');
    });
  });

  describe('hasCapability()', () => {
    it('retourne false si pas Companion', () => {
      expect(companionDetect.hasCapability('bluetooth')).toBe(false);
      expect(companionDetect.hasCapability('nfc')).toBe(false);
    });

    it('retourne true si Companion + capability', () => {
      winAny.Capacitor = {
        isNativePlatform: (): boolean => true,
        getPlatform: (): string => 'ios',
        Plugins: { ApexBluetooth: {}, ApexNFC: {} },
      };
      companionDetect.reset();
      expect(companionDetect.hasCapability('bluetooth')).toBe(true);
      expect(companionDetect.hasCapability('nfc')).toBe(true);
      expect(companionDetect.hasCapability('usb')).toBe(false);
    });
  });
});
