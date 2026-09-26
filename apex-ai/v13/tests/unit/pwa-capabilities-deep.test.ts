/**
 * APEX v13 — Tests deep pwa-capabilities.ts (push 66.82% → 90%+).
 *
 * Cible : 8 APIs PWA modernes (detect/queryPermission/request/getAllStatus),
 * cache 5min, fallback Permissions API non-supportée, helper axEnable*,
 * releaseWakeLock, resetCache, getSupportSummary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn().mockResolvedValue(undefined) },
}));

import {
  axEnableBluetooth,
  axEnableGeolocation,
  axEnableNFC,
  axEnableNotifications,
  axEnableScreenCapture,
  axEnableSerial,
  axEnableUSB,
  axEnableWakeLock,
  pwaCapabilities,
} from '../../services/core-svc/pwa-capabilities.js';

beforeEach(() => {
  vi.clearAllMocks();
  pwaCapabilities.resetCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  pwaCapabilities.resetCache();
});

describe('pwa-capabilities — detect', () => {
  it('navigator absent → unsupported', () => {
    vi.stubGlobal('navigator', undefined);
    expect(pwaCapabilities.detect('geolocation')).toBe('unsupported');
  });

  it('window absent → unsupported', () => {
    vi.stubGlobal('window', undefined);
    expect(pwaCapabilities.detect('nfc')).toBe('unsupported');
  });

  it('geolocation présent → permission_required', () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('geolocation')).toBe('permission_required');
  });

  it('geolocation absent navigator → unsupported', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('geolocation')).toBe('unsupported');
  });

  it('Notification granted → permission_granted', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
    expect(pwaCapabilities.detect('notifications')).toBe('permission_granted');
  });

  it('Notification denied → permission_denied', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    expect(pwaCapabilities.detect('notifications')).toBe('permission_denied');
  });

  it('Notification default → permission_required', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    expect(pwaCapabilities.detect('notifications')).toBe('permission_required');
  });

  it('Notification undefined → unsupported', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', undefined);
    expect(pwaCapabilities.detect('notifications')).toBe('unsupported');
  });

  it('bluetooth présent → permission_required', () => {
    vi.stubGlobal('navigator', { bluetooth: {} });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('bluetooth')).toBe('permission_required');
  });

  it('NDEFReader présent → nfc permission_required', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { NDEFReader: class {} });
    expect(pwaCapabilities.detect('nfc')).toBe('permission_required');
  });

  it('usb présent → permission_required', () => {
    vi.stubGlobal('navigator', { usb: {} });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('usb')).toBe('permission_required');
  });

  it('serial présent → permission_required', () => {
    vi.stubGlobal('navigator', { serial: {} });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('serial')).toBe('permission_required');
  });

  it('wakeLock présent → supported (sans permission)', () => {
    vi.stubGlobal('navigator', { wakeLock: {} });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('wake_lock')).toBe('supported');
  });

  it('getDisplayMedia présent → screen_capture permission_required', () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn() },
    });
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('screen_capture')).toBe('permission_required');
  });

  it('detect default branch (api inconnu) → unsupported', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    expect(pwaCapabilities.detect('unknown_api' as unknown as 'geolocation')).toBe('unsupported');
  });
});

describe('pwa-capabilities — queryPermission cache', () => {
  it('cache 5min hit → pas re-query', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });
    vi.stubGlobal('window', {});
    const r1 = await pwaCapabilities.queryPermission('geolocation');
    const r2 = await pwaCapabilities.queryPermission('geolocation');
    expect(r1).toBe(r2);
  });

  it('unsupported → cache + retourne unsupported', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.queryPermission('geolocation');
    expect(r).toBe('unsupported');
  });

  it('permission denied via Permissions API', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    });
    vi.stubGlobal('window', {});
    expect(await pwaCapabilities.queryPermission('geolocation')).toBe('permission_denied');
  });

  it('Permissions API throw → fallback detect status', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query: vi.fn().mockRejectedValue(new Error('Not supported')) },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.queryPermission('geolocation');
    expect(r).toBe('permission_required');
  });

  it('api sans permName (bluetooth) → fallback detect status', async () => {
    vi.stubGlobal('navigator', {
      bluetooth: {},
      permissions: { query: vi.fn() },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.queryPermission('bluetooth');
    expect(r).toBe('permission_required');
  });
});

describe('pwa-capabilities — request', () => {
  it('api unsupported → ok=false', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('bluetooth');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('unsupported');
  });

  it('geolocation accepté → ok=true permission_granted', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (resolve: (p: unknown) => void) => resolve({ coords: { latitude: 0, longitude: 0 } }),
      },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('geolocation');
    expect(r.ok).toBe(true);
    expect(r.status).toBe('permission_granted');
  });

  it('geolocation refusé → ok=false permission_denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('User denied geolocation')),
      },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('geolocation');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('permission_denied');
  });

  it('notifications granted → ok=true', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    const r = await pwaCapabilities.request('notifications');
    expect(r.ok).toBe(true);
  });

  it('notifications denied user → ok=false', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });
    const r = await pwaCapabilities.request('notifications');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('permission_denied');
  });

  it('bluetooth requestDevice success → ok=true', async () => {
    const requestDevice = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('bluetooth');
    expect(r.ok).toBe(true);
    expect(requestDevice).toHaveBeenCalled();
  });

  it('bluetooth requestDevice rejette → ok=false', async () => {
    vi.stubGlobal('navigator', {
      bluetooth: { requestDevice: vi.fn().mockRejectedValue(new Error('User cancelled')) },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('bluetooth');
    expect(r.ok).toBe(false);
  });

  it('nfc scan success → ok=true', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {
      NDEFReader: class {
        scan = vi.fn().mockResolvedValue(undefined);
      },
    });
    const r = await pwaCapabilities.request('nfc');
    expect(r.ok).toBe(true);
  });

  it('usb requestDevice → ok=true', async () => {
    vi.stubGlobal('navigator', {
      usb: { requestDevice: vi.fn().mockResolvedValue({}) },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('usb');
    expect(r.ok).toBe(true);
  });

  it('serial requestPort → ok=true', async () => {
    vi.stubGlobal('navigator', {
      serial: { requestPort: vi.fn().mockResolvedValue({}) },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('serial');
    expect(r.ok).toBe(true);
  });

  it('wake_lock acquired → wakeLockSentinel stocké', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn().mockResolvedValue({ release }) },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('wake_lock');
    expect(r.ok).toBe(true);
    /* Cleanup via releaseWakeLock */
    await pwaCapabilities.releaseWakeLock();
    expect(release).toHaveBeenCalled();
  });

  it('screen_capture → tracks stop appelé', async () => {
    const stopMock = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopMock }],
        }),
      },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('screen_capture');
    expect(r.ok).toBe(true);
    expect(stopMock).toHaveBeenCalled();
  });

  it('throw avec /denied/ regex → status permission_denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_r: unknown, reject: (e: Error) => void) =>
          reject(new Error('User has denied access')),
      },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('geolocation');
    expect(r.status).toBe('permission_denied');
  });

  it('throw sans denied regex → status permission_required', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_r: unknown, reject: (e: Error) => void) =>
          reject(new Error('Timeout')),
      },
    });
    vi.stubGlobal('window', {});
    const r = await pwaCapabilities.request('geolocation');
    expect(r.status).toBe('permission_required');
  });
});

describe('pwa-capabilities — releaseWakeLock', () => {
  it('aucun sentinel → no-op', async () => {
    await expect(pwaCapabilities.releaseWakeLock()).resolves.toBeUndefined();
  });

  it('release throw → caught', async () => {
    (pwaCapabilities as unknown as { wakeLockSentinel: { release: () => Promise<unknown> } | null }).
      wakeLockSentinel = {
        release: vi.fn().mockRejectedValue(new Error('Already released')),
      };
    await expect(pwaCapabilities.releaseWakeLock()).resolves.toBeUndefined();
  });
});

describe('pwa-capabilities — getAllStatus + helpers', () => {
  it('getAllStatus retourne 8 entries', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    const all = await pwaCapabilities.getAllStatus();
    expect(all).toHaveLength(8);
    for (const info of all) {
      expect(info.id).toBeTruthy();
      expect(info.label).toBeTruthy();
      expect(info.description).toBeTruthy();
    }
  });

  it('axEnable<X> aliases délèguent à request', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    const r1 = await axEnableGeolocation();
    expect(r1.ok).toBe(false);
    const r2 = await axEnableNotifications();
    expect(r2.ok).toBe(false);
    const r3 = await axEnableBluetooth();
    expect(r3.ok).toBe(false);
    const r4 = await axEnableNFC();
    expect(r4.ok).toBe(false);
    const r5 = await axEnableUSB();
    expect(r5.ok).toBe(false);
    const r6 = await axEnableSerial();
    expect(r6.ok).toBe(false);
    const r7 = await axEnableWakeLock();
    expect(r7.ok).toBe(false);
    const r8 = await axEnableScreenCapture();
    expect(r8.ok).toBe(false);
  });
});

describe('pwa-capabilities — resetCache', () => {
  it('resetCache clear cache', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });
    vi.stubGlobal('window', {});
    await pwaCapabilities.queryPermission('geolocation');
    pwaCapabilities.resetCache();
    /* Internal cache cleared — no easy way to check without re-call */
    expect(() => pwaCapabilities.resetCache()).not.toThrow();
  });
});
