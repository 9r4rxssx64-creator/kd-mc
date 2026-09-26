/**
 * companion-detect — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : cache, window undefined (:{}) , cap natif sans getPlatform/Plugins (?? web, ?? {}).
 * Reset le cache du singleton entre tests (anti-fuite #84).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { companionDetect } from '../../services/integrations/companion-detect.js';

const cd = companionDetect as unknown as { cache: unknown };

beforeEach(() => { vi.clearAllMocks(); cd.cache = null; delete (window as unknown as Record<string, unknown>).Capacitor; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cd.cache = null; delete (window as unknown as Record<string, unknown>).Capacitor; });

describe('companion-detect — detect', () => {
  it('pas de Capacitor → web non-companion', () => {
    const info = companionDetect.detect();
    expect(info.isCompanion).toBe(false);
    expect(info.platform).toBe('web');
  });

  it('cache : 2e appel retourne le même objet', () => {
    const a = companionDetect.detect();
    const b = companionDetect.detect();
    expect(a).toBe(b);
  });

  it('window undefined → branche {} → web', () => {
    vi.stubGlobal('window', undefined);
    const info = companionDetect.detect();
    expect(info.platform).toBe('web');
  });

  it('Capacitor natif SANS getPlatform ni Plugins → ?? web + ?? {}', () => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      // pas de getPlatform, pas de Plugins
    };
    const info = companionDetect.detect();
    expect(info.isCompanion).toBe(true);
    expect(info.platform).toBe('web'); // getPlatform?.() undefined ?? 'web'
    expect(info.capabilities.bluetooth).toBe(false); // Plugins ?? {} → 'ApexBluetooth' in {} false
  });

  it('Capacitor natif AVEC getPlatform ios + plugins → capabilities détectées', () => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { ApexBluetooth: {}, ApexNFC: {} },
    };
    const info = companionDetect.detect();
    expect(info.platform).toBe('ios');
    expect(info.capabilities.bluetooth).toBe(true);
    expect(info.capabilities.nfc).toBe(true);
  });

  it('Capacitor présent mais isNativePlatform false → web', () => {
    (window as unknown as Record<string, unknown>).Capacitor = { isNativePlatform: () => false };
    expect(companionDetect.detect().isCompanion).toBe(false);
  });
});
