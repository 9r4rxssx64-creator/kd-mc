/**
 * Tests apex-ios-native-watch v13.4.149 (Kevin "100/100 réel").
 *
 * Module : services/apex-ios-native-watch.ts (138 lines, 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockApexIosNative, mockClaudeBridge } = vi.hoisted(() => ({
  mockApexIosNative: {
    diagnose: vi.fn(),
    secureStore: vi.fn(),
    secureRead: vi.fn(),
    secureRemove: vi.fn(),
    getDeviceInfo: vi.fn(),
  },
  mockClaudeBridge: { pushTodo: vi.fn() },
}));

vi.mock('../../services/integrations/apex-ios-native.js', () => ({ apexIosNative: mockApexIosNative }));
vi.mock('../../services/ai/claude-bridge.js', () => ({ claudeBridge: mockClaudeBridge }));

import { iosNativeWatch } from '../../services/sentinels/apex-ios-native-watch.js';

describe('apex-ios-native-watch (v13.4.149 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeBridge.pushTodo.mockResolvedValue({ id: 'todo_x' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('iosNativeWatch metadata', () => {
    it('expose id/name/interval', () => {
      expect(iosNativeWatch.id).toBe('ios-native-watch');
      expect(iosNativeWatch.name).toContain('iOS Native');
      expect(iosNativeWatch.interval).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('check (mode web PWA)', () => {
    it('retourne ok=true si pas natif (web PWA)', async () => {
      mockApexIosNative.diagnose.mockReturnValue({
        is_native: false,
        platform: 'web',
        capacitor_loaded: false,
        plugins_available: [],
      });
      const r = await iosNativeWatch.check();
      expect(r.ok).toBe(true);
      expect(r.details.is_native).toBe(false);
      expect(r.details.platform).toBe('web');
    });
  });

  describe('check (mode natif iOS)', () => {
    beforeEach(() => {
      mockApexIosNative.diagnose.mockReturnValue({
        is_native: true,
        platform: 'ios',
        capacitor_loaded: true,
        plugins_available: ['Preferences', 'Filesystem', 'Share', 'PushNotifications', 'Device'],
      });
      mockApexIosNative.secureStore.mockResolvedValue({ ok: true, native: true });
      mockApexIosNative.secureRead.mockImplementation(async () => ({
        value: mockApexIosNative.secureStore.mock.calls[0]?.[1],
      }));
      mockApexIosNative.secureRemove.mockResolvedValue({ ok: true });
      mockApexIosNative.getDeviceInfo.mockResolvedValue({
        model: 'iPhone 14 Pro',
        osVersion: '17.0',
      });
    });

    it('retourne ok=true si tous plugins + keychain OK', async () => {
      const r = await iosNativeWatch.check();
      expect(r.ok).toBe(true);
      expect(r.details.keychain_test_passed).toBe(true);
      expect(r.details.device_info?.model).toBe('iPhone 14 Pro');
    });

    it('retourne ok=false si plugins manquants', async () => {
      mockApexIosNative.diagnose.mockReturnValue({
        is_native: true,
        platform: 'ios',
        capacitor_loaded: true,
        plugins_available: ['Preferences'], /* Manque 4 plugins */
      });
      const r = await iosNativeWatch.check();
      expect(r.ok).toBe(false);
      expect(r.details.plugins_missing.length).toBeGreaterThan(0);
    });

    it('retourne ok=false si keychain test fail (mismatch)', async () => {
      mockApexIosNative.secureRead.mockResolvedValue({ value: 'wrong_value' });
      const r = await iosNativeWatch.check();
      expect(r.ok).toBe(false);
      expect(r.details.keychain_test_passed).toBe(false);
    });

    it('retourne ok=false si secureStore throw', async () => {
      mockApexIosNative.secureStore.mockRejectedValue(new Error('keychain fail'));
      const r = await iosNativeWatch.check();
      expect(r.ok).toBe(false);
    });

    it('escalade via claudeBridge si broken', async () => {
      mockApexIosNative.diagnose.mockReturnValue({
        is_native: true,
        platform: 'ios',
        capacitor_loaded: true,
        plugins_available: [],
      });
      await iosNativeWatch.check();
      expect(mockClaudeBridge.pushTodo).toHaveBeenCalled();
    });

    it('PAS d\'escalade si tout OK', async () => {
      await iosNativeWatch.check();
      expect(mockClaudeBridge.pushTodo).not.toHaveBeenCalled();
    });
  });

  describe('runHealthCheck export direct', () => {
    it('exposé pour debug HUD', () => {
      expect(typeof iosNativeWatch.runHealthCheck).toBe('function');
    });
  });
});
