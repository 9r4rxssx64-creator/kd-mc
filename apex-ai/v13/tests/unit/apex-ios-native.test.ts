/**
 * Tests apex-ios-native v13.4.123 (Kevin "passe en native iOS").
 *
 * Vérifie :
 *  - Mode PWA (pas de window.Capacitor) : fallback Web fonctionne
 *  - Mode natif simulé (mock window.Capacitor) : plugins appelés correctement
 *  - diagnose retourne shape correcte
 *  - Sentinelle ios-native-watch : PWA = ok, natif sans plugin = escalade
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apexIosNative } from '../../services/integrations/apex-ios-native.js';

vi.mock('../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

interface CapacitorMockShape {
  isNativePlatform: () => boolean;
  getPlatform: () => 'ios' | 'android' | 'web';
  Plugins: Record<string, unknown>;
}

function installCapacitorMock(opts: {
  native?: boolean;
  platform?: 'ios' | 'android' | 'web';
  plugins?: Record<string, unknown>;
}): void {
  const mock: CapacitorMockShape = {
    isNativePlatform: () => opts.native ?? true,
    getPlatform: () => opts.platform ?? 'ios',
    Plugins: opts.plugins ?? {},
  };
  (window as unknown as { Capacitor?: CapacitorMockShape }).Capacitor = mock;
}

function uninstallCapacitorMock(): void {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
}

describe('apex-ios-native (Kevin v13.4.122 port iOS natif)', () => {
  beforeEach(() => {
    localStorage.clear();
    uninstallCapacitorMock();
  });

  afterEach(() => {
    uninstallCapacitorMock();
  });

  describe('Mode PWA (window.Capacitor absent)', () => {
    it('isNative() retourne false', () => {
      expect(apexIosNative.isNative()).toBe(false);
    });

    it('getPlatform() retourne "web"', () => {
      expect(apexIosNative.getPlatform()).toBe('web');
    });

    it('secureStore fallback localStorage', async () => {
      const r = await apexIosNative.secureStore('test_key', 'test_value');
      expect(r.ok).toBe(true);
      expect(r.native).toBe(false);
      expect(localStorage.getItem('test_key')).toBe('test_value');
    });

    it('secureRead fallback localStorage', async () => {
      localStorage.setItem('existing_key', 'existing_value');
      const r = await apexIosNative.secureRead('existing_key');
      expect(r.value).toBe('existing_value');
      expect(r.native).toBe(false);
    });

    it('secureRead retourne null si clé absente', async () => {
      const r = await apexIosNative.secureRead('inexistant');
      expect(r.value).toBeNull();
    });

    it('secureRemove fallback localStorage', async () => {
      localStorage.setItem('to_remove', 'v');
      const r = await apexIosNative.secureRemove('to_remove');
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('to_remove')).toBeNull();
    });

    it('diagnose retourne { is_native:false, platform:"web", capacitor_loaded:false }', () => {
      const d = apexIosNative.diagnose();
      expect(d.is_native).toBe(false);
      expect(d.platform).toBe('web');
      expect(d.capacitor_loaded).toBe(false);
      expect(d.plugins_available).toEqual([]);
    });

    it('getDeviceInfo retourne platform:"web" + native:false', async () => {
      const info = await apexIosNative.getDeviceInfo();
      expect(info.platform).toBe('web');
      expect(info.native).toBe(false);
      expect(info.model).toBeTruthy();
    });
  });

  describe('Mode natif iOS (window.Capacitor mocké)', () => {
    it('isNative() retourne true', () => {
      installCapacitorMock({ native: true, platform: 'ios' });
      expect(apexIosNative.isNative()).toBe(true);
    });

    it('getPlatform() retourne "ios"', () => {
      installCapacitorMock({ native: true, platform: 'ios' });
      expect(apexIosNative.getPlatform()).toBe('ios');
    });

    it('secureStore appelle Preferences.set (Keychain App Group)', async () => {
      const setSpy = vi.fn().mockResolvedValue(undefined);
      installCapacitorMock({
        native: true,
        plugins: {
          Preferences: { set: setSpy, get: vi.fn(), remove: vi.fn() },
        },
      });
      const r = await apexIosNative.secureStore('vault_key', 'AXENC1:xxx');
      expect(r.ok).toBe(true);
      expect(r.native).toBe(true);
      expect(setSpy).toHaveBeenCalledWith({ key: 'vault_key', value: 'AXENC1:xxx' });
    });

    it('secureRead appelle Preferences.get', async () => {
      const getSpy = vi.fn().mockResolvedValue({ value: 'AXENC1:zzz' });
      installCapacitorMock({
        native: true,
        plugins: {
          Preferences: { set: vi.fn(), get: getSpy, remove: vi.fn() },
        },
      });
      const r = await apexIosNative.secureRead('vault_key');
      expect(r.value).toBe('AXENC1:zzz');
      expect(r.native).toBe(true);
      expect(getSpy).toHaveBeenCalledWith({ key: 'vault_key' });
    });

    it('secureStore retourne ok:false si Preferences plugin absent', async () => {
      installCapacitorMock({ native: true, plugins: {} });
      const r = await apexIosNative.secureStore('key', 'value');
      expect(r.ok).toBe(false);
      expect(r.native).toBe(true);
    });

    it('writeFileToIcloud appelle Filesystem.writeFile (DOCUMENTS dir)', async () => {
      const writeSpy = vi.fn().mockResolvedValue({ uri: 'file:///iCloud/Apex/backup.json' });
      installCapacitorMock({
        native: true,
        plugins: {
          Filesystem: { writeFile: writeSpy, readFile: vi.fn() },
        },
      });
      const r = await apexIosNative.writeFileToIcloud('backup.json', '{}');
      expect(r.ok).toBe(true);
      expect(r.native).toBe(true);
      expect(r.uri).toContain('iCloud');
      expect(writeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'backup.json',
          directory: 'DOCUMENTS',
          encoding: 'utf8',
        }),
      );
    });

    it('shareNative appelle Share.share (UIActivityViewController)', async () => {
      const shareSpy = vi.fn().mockResolvedValue(undefined);
      installCapacitorMock({
        native: true,
        plugins: { Share: { share: shareSpy } },
      });
      const r = await apexIosNative.shareNative({ title: 'Backup', text: 'Vault QR' });
      expect(r.ok).toBe(true);
      expect(r.native).toBe(true);
      expect(shareSpy).toHaveBeenCalledWith({ title: 'Backup', text: 'Vault QR' });
    });

    it('requestPushPermission retourne granted si APNs accepte', async () => {
      const requestSpy = vi.fn().mockResolvedValue({ receive: 'granted' });
      const registerSpy = vi.fn().mockResolvedValue(undefined);
      installCapacitorMock({
        native: true,
        plugins: {
          PushNotifications: {
            requestPermissions: requestSpy,
            register: registerSpy,
            addListener: vi.fn(),
          },
        },
      });
      const r = await apexIosNative.requestPushPermission();
      expect(r.granted).toBe(true);
      expect(r.native).toBe(true);
      expect(registerSpy).toHaveBeenCalled();
    });

    it('getDeviceInfo retourne modèle + version iOS', async () => {
      installCapacitorMock({
        native: true,
        platform: 'ios',
        plugins: {
          Device: {
            getInfo: vi.fn().mockResolvedValue({
              model: 'iPhone16,2',
              platform: 'ios',
              operatingSystem: 'ios',
              osVersion: '18.2',
              manufacturer: 'Apple',
              isVirtual: false,
            }),
            getId: vi.fn().mockResolvedValue({ identifier: 'ABC-123' }),
          },
        },
      });
      const info = await apexIosNative.getDeviceInfo();
      expect(info.platform).toBe('ios');
      expect(info.model).toBe('iPhone16,2');
      expect(info.osVersion).toBe('18.2');
      expect(info.identifier).toBe('ABC-123');
      expect(info.native).toBe(true);
    });

    it('diagnose liste plugins dispo', () => {
      installCapacitorMock({
        native: true,
        plugins: {
          Preferences: {},
          Filesystem: {},
          Share: {},
        },
      });
      const d = apexIosNative.diagnose();
      expect(d.is_native).toBe(true);
      expect(d.plugins_available).toContain('Preferences');
      expect(d.plugins_available).toContain('Filesystem');
      expect(d.plugins_available).toContain('Share');
    });
  });
});
