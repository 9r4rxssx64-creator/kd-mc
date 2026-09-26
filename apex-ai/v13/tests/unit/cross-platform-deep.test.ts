/**
 * APEX v13 — Tests deep services/cross-platform
 *
 * Couvre les branches "feature dispo" et "fallback" pour CHAQUE wrapper :
 *  - share (avec/sans Web Share, AbortError, files canShare)
 *  - vibrate / wakeLock / battery / network
 *  - bluetooth / NFC / barcode / fileSystem / contacts
 *  - iOS Apple pass + Siri Shortcuts
 *  - Android intent
 *  - requestAllPermissions (notif/geo/camera/mic) avec mocks navigator
 *
 * Méthode : vi.mock deviceDetect + Object.defineProperty sur navigator/window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/integrations/device-detect.js', () => {
  /* État mutable par test : on switch capabilities et os via setters */
  const state = {
    caps: {
      hasShare: false,
      hasVibration: false,
      hasWakeLock: false,
      hasBattery: false,
      hasWebBluetooth: false,
      hasWebNFC: false,
      hasFileSystemAccess: false,
      hasContactPicker: false,
      hasBarcodeDetector: false,
      hasGetUserMedia: false,
      hasGeolocation: false,
    } as Record<string, boolean>,
    os: 'unknown' as string,
    info: {
      isOnline: true,
      effectiveType: '4g',
      saveData: false,
      downlink: 10,
      os: 'unknown',
    },
  };
  return {
    deviceDetect: {
      has: vi.fn((feat: string) => Boolean(state.caps[feat])),
      detect: vi.fn(() => ({ ...state.info, os: state.os })),
      __setCap: (feat: string, val: boolean) => {
        state.caps[feat] = val;
      },
      __setOS: (os: string) => {
        state.os = os;
        state.info.os = os;
      },
      __reset: () => {
        for (const k of Object.keys(state.caps)) state.caps[k] = false;
        state.os = 'unknown';
        state.info.os = 'unknown';
      },
    },
  };
});

vi.mock('../../ui/toast.js', () => ({
  toast: { show: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { crossPlatform } from '../../services/core-svc/cross-platform.js';
import { deviceDetect } from '../../services/integrations/device-detect.js';
import { toast } from '../../ui/toast.js';

interface DDExtras {
  __setCap: (f: string, v: boolean) => void;
  __setOS: (os: string) => void;
  __reset: () => void;
}
const dd = deviceDetect as unknown as DDExtras;

beforeEach(() => {
  vi.clearAllMocks();
  dd.__reset();
});

afterEach(() => {
  /* Cleanup navigator stubs */
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { vibrate?: unknown }).vibrate;
  delete (navigator as { bluetooth?: unknown }).bluetooth;
  delete (navigator as { contacts?: unknown }).contacts;
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (navigator as { getBattery?: unknown }).getBattery;
  delete (window as { NDEFReader?: unknown }).NDEFReader;
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
});

describe('crossPlatform.share()', () => {
  it('fallback clipboard si Web Share API absent', async () => {
    const writeMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      configurable: true,
    });
    const r = await crossPlatform.share({ url: 'https://x.test' });
    expect(r.ok).toBe(true);
    expect(r.fallback).toBe('clipboard');
    expect(writeMock).toHaveBeenCalledWith('https://x.test');
  });

  it('appel navigator.share si hasShare=true', async () => {
    dd.__setCap('hasShare', true);
    const shareMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    const r = await crossPlatform.share({ title: 't', text: 'x' });
    expect(r.ok).toBe(true);
    expect(shareMock).toHaveBeenCalled();
  });

  it('user_cancel si AbortError', async () => {
    dd.__setCap('hasShare', true);
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
      configurable: true,
    });
    const r = await crossPlatform.share({ text: 'a' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('user_cancel');
  });

  it('share files : fallback si canShare retourne false', async () => {
    dd.__setCap('hasShare', true);
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => false),
      configurable: true,
    });
    /* Stub clipboard pour fallback */
    const writeMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      configurable: true,
    });
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    const r = await crossPlatform.share({ files: [file], url: 'https://x.test' });
    expect(r.fallback).toBe('clipboard');
  });

  it('share files OK si canShare=true', async () => {
    dd.__setCap('hasShare', true);
    const shareMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    const r = await crossPlatform.share({ files: [file] });
    expect(r.ok).toBe(true);
  });

  it('fallback retourne clipboard_unavailable si pas clipboard', async () => {
    /* Stub clipboard absent */
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const r = await crossPlatform.share({ url: '' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('clipboard_unavailable');
  });

  it('fallback clipboard_denied si writeText rejette', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('nope'))) },
      configurable: true,
    });
    const r = await crossPlatform.share({ url: 'https://a.b' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('clipboard_denied');
  });
});

describe('crossPlatform.vibrate()', () => {
  it('false si hasVibration absent', () => {
    expect(crossPlatform.vibrate(100)).toBe(false);
  });

  it('appelle navigator.vibrate si feature dispo', () => {
    dd.__setCap('hasVibration', true);
    const vibMock = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibMock, configurable: true });
    expect(crossPlatform.vibrate([100, 50, 100])).toBe(true);
    expect(vibMock).toHaveBeenCalledWith([100, 50, 100]);
  });

  it('false si vibrate throws', () => {
    dd.__setCap('hasVibration', true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(() => {
        throw new Error('no');
      }),
      configurable: true,
    });
    expect(crossPlatform.vibrate(100)).toBe(false);
  });
});

describe('crossPlatform.acquireWakeLock / releaseWakeLock', () => {
  it('wakelock_unavailable si pas dispo', async () => {
    const r = await crossPlatform.acquireWakeLock();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wakelock_unavailable');
  });

  it('acquire OK si feature présent', async () => {
    dd.__setCap('hasWakeLock', true);
    const sentinel = { release: vi.fn(() => Promise.resolve()) };
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(() => Promise.resolve(sentinel)) },
      configurable: true,
    });
    const r = await crossPlatform.acquireWakeLock();
    expect(r.ok).toBe(true);
    /* release ensuite */
    await crossPlatform.releaseWakeLock();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('acquire denied → ok=false reason wakelock_denied', async () => {
    dd.__setCap('hasWakeLock', true);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(() => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    const r = await crossPlatform.acquireWakeLock();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wakelock_denied');
  });

  it('releaseWakeLock no-op si rien acquis (sans crash)', async () => {
    await expect(crossPlatform.releaseWakeLock()).resolves.toBeUndefined();
  });

  it('releaseWakeLock tolère release qui throw', async () => {
    dd.__setCap('hasWakeLock', true);
    const sentinel = { release: vi.fn(() => Promise.reject(new Error('x'))) };
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(() => Promise.resolve(sentinel)) },
      configurable: true,
    });
    await crossPlatform.acquireWakeLock();
    await expect(crossPlatform.releaseWakeLock()).resolves.toBeUndefined();
  });
});

describe('crossPlatform.getBattery()', () => {
  it('battery_unavailable si pas dispo', async () => {
    const r = await crossPlatform.getBattery();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('battery_unavailable');
  });

  it('OK avec data {level, charging}', async () => {
    dd.__setCap('hasBattery', true);
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn(() => Promise.resolve({ level: 0.55, charging: true })),
      configurable: true,
    });
    const r = await crossPlatform.getBattery();
    expect(r.ok).toBe(true);
    expect(r.data?.level).toBe(55);
    expect(r.data?.charging).toBe(true);
  });

  it('battery_error si throw', async () => {
    dd.__setCap('hasBattery', true);
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn(() => Promise.reject(new Error('fail'))),
      configurable: true,
    });
    const r = await crossPlatform.getBattery();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('battery_error');
  });
});

describe('crossPlatform.getNetworkInfo()', () => {
  it('retourne object complet', () => {
    const info = crossPlatform.getNetworkInfo();
    expect(info).toMatchObject({
      online: expect.any(Boolean) as unknown,
      type: expect.any(String) as unknown,
      saveData: expect.any(Boolean) as unknown,
      downlink: expect.any(Number) as unknown,
    });
  });
});

describe('crossPlatform.scanBluetooth()', () => {
  it('unsupported sans hasWebBluetooth', async () => {
    const r = await crossPlatform.scanBluetooth();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bluetooth_unsupported');
    expect(r.fallback).toBe('manual_pairing');
    expect(toast.show).toHaveBeenCalled();
  });

  it('OK si Web Bluetooth dispo', async () => {
    dd.__setCap('hasWebBluetooth', true);
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: vi.fn(() => Promise.resolve({ id: 'd1', name: 'X' })) },
      configurable: true,
    });
    const r = await crossPlatform.scanBluetooth();
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe('d1');
  });

  it('utilise filters custom si fournis', async () => {
    dd.__setCap('hasWebBluetooth', true);
    const reqMock = vi.fn(() => Promise.resolve({ id: 'x' }));
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: reqMock },
      configurable: true,
    });
    await crossPlatform.scanBluetooth([{ name: 'MyDevice' }]);
    expect(reqMock).toHaveBeenCalled();
  });

  it('denied si requestDevice throw', async () => {
    dd.__setCap('hasWebBluetooth', true);
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: vi.fn(() => Promise.reject(new Error('user cancel'))) },
      configurable: true,
    });
    const r = await crossPlatform.scanBluetooth();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bluetooth_denied');
  });
});

describe('crossPlatform.readNFC()', () => {
  it('unsupported sans hasWebNFC', async () => {
    const r = await crossPlatform.readNFC();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nfc_unsupported');
  });

  it('OK : timeout 30s déclenche fallback', async () => {
    vi.useFakeTimers();
    dd.__setCap('hasWebNFC', true);
    /* Stub NDEFReader */
    const listeners: Array<(ev: { message: { records: unknown[] } }) => void> = [];
    (window as unknown as { NDEFReader: unknown }).NDEFReader = vi.fn(() => ({
      scan: vi.fn(() => Promise.resolve()),
      addEventListener: (_: string, cb: (ev: { message: { records: unknown[] } }) => void) => {
        listeners.push(cb);
      },
    })) as unknown;
    const promise = crossPlatform.readNFC();
    /* Avancer >30s pour timeout */
    await vi.advanceTimersByTimeAsync(31000);
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nfc_timeout');
    vi.useRealTimers();
  });

  it('nfc_error si scan throws', async () => {
    dd.__setCap('hasWebNFC', true);
    (window as unknown as { NDEFReader: unknown }).NDEFReader = vi.fn(() => ({
      scan: vi.fn(() => Promise.reject(new Error('denied'))),
      addEventListener: vi.fn(),
    })) as unknown;
    const r = await crossPlatform.readNFC();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nfc_error');
  });
});

describe('crossPlatform.pickFile()', () => {
  it('fallback input si pas File System Access', () => {
    const promise = crossPlatform.pickFile();
    /* On simule no_file (pas de fichier choisi) */
    const inp = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(inp).toBeTruthy();
    /* trigger change vide */
    inp!.dispatchEvent(new Event('change'));
    return promise.then((r) => {
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_file');
    });
  });

  it('OK avec showOpenFilePicker dispo', async () => {
    dd.__setCap('hasFileSystemAccess', true);
    const fakeFile = new File(['hi'], 'x.txt');
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi.fn(() =>
      Promise.resolve([{ getFile: () => Promise.resolve(fakeFile) }]),
    ) as unknown;
    const r = await crossPlatform.pickFile();
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('x.txt');
  });

  it('no_file si handles vide', async () => {
    dd.__setCap('hasFileSystemAccess', true);
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi.fn(() =>
      Promise.resolve([]),
    ) as unknown;
    const r = await crossPlatform.pickFile();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_file');
  });

  it('fallback input si showOpenFilePicker throws', async () => {
    dd.__setCap('hasFileSystemAccess', true);
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi.fn(() =>
      Promise.reject(new Error('cancel')),
    ) as unknown;
    /* fallback input file → trigger no_file */
    const promise = crossPlatform.pickFile();
    /* Attendre que le fallback ajoute l'input */
    await new Promise((r) => setTimeout(r, 5));
    const inp = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (inp) inp.dispatchEvent(new Event('change'));
    const r = await promise;
    expect(r.ok).toBe(false);
  });
});

describe('crossPlatform.pickContacts()', () => {
  it('unsupported sans hasContactPicker', async () => {
    const r = await crossPlatform.pickContacts();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('contacts_unsupported');
    expect(r.fallback).toBe('manual_input');
  });

  it('OK avec data si contacts.select résout', async () => {
    dd.__setCap('hasContactPicker', true);
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: vi.fn(() =>
          Promise.resolve([{ name: ['Kevin'], tel: ['+33...'], email: ['k@k'] }]),
        ),
      },
      configurable: true,
    });
    const r = await crossPlatform.pickContacts();
    expect(r.ok).toBe(true);
    expect(r.data?.[0]?.name[0]).toBe('Kevin');
  });

  it('denied si contacts.select throws', async () => {
    dd.__setCap('hasContactPicker', true);
    Object.defineProperty(navigator, 'contacts', {
      value: { select: vi.fn(() => Promise.reject(new Error('no'))) },
      configurable: true,
    });
    const r = await crossPlatform.pickContacts();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('contacts_denied');
  });
});

describe('crossPlatform.detectBarcode()', () => {
  it('unsupported sans hasBarcodeDetector', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const r = await crossPlatform.detectBarcode(canvas as unknown as ImageBitmapSource);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('barcode_unsupported');
    expect(r.fallback).toBe('use_zxing_lib');
  });

  it('OK si BarcodeDetector dispo (mock)', async () => {
    dd.__setCap('hasBarcodeDetector', true);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi.fn(() => ({
      detect: vi.fn(() => Promise.resolve([{ rawValue: 'X', format: 'qr_code' }])),
    })) as unknown;
    const canvas = document.createElement('canvas');
    const r = await crossPlatform.detectBarcode(canvas as unknown as ImageBitmapSource);
    expect(r.ok).toBe(true);
    expect(r.data?.[0]?.rawValue).toBe('X');
  });

  it('barcode_error si detect throw', async () => {
    dd.__setCap('hasBarcodeDetector', true);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi.fn(() => ({
      detect: vi.fn(() => Promise.reject(new Error('boom'))),
    })) as unknown;
    const canvas = document.createElement('canvas');
    const r = await crossPlatform.detectBarcode(canvas as unknown as ImageBitmapSource);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('barcode_error');
  });
});

describe('crossPlatform iOS-specific', () => {
  it('generateApplePass → ok=false sur non-iOS', async () => {
    const r = await crossPlatform.generateApplePass({ x: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('apple_pass_ios_only');
  });

  it('generateApplePass → ok=false (worker_pending) sur iOS', async () => {
    dd.__setOS('ios');
    const r = await crossPlatform.generateApplePass({ x: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('apple_pass_worker_pending');
  });

  it('openSiriShortcut → false sur non-iOS', () => {
    expect(crossPlatform.openSiriShortcut('foo')).toBe(false);
  });

  it('openSiriShortcut → true sur iOS avec params', () => {
    dd.__setOS('ios');
    /* Stub location.href setter (jsdom-friendly) */
    const orig = window.location.href;
    Object.defineProperty(window, 'location', {
      value: { href: orig, toString: () => orig },
      configurable: true,
      writable: true,
    });
    const ok = crossPlatform.openSiriShortcut('myAction', { foo: 'bar' });
    expect(ok).toBe(true);
  });
});

describe('crossPlatform Android-specific', () => {
  it('openAndroidIntent → false si pas Android', () => {
    expect(crossPlatform.openAndroidIntent({ package: 'com.x' })).toBe(false);
  });

  it('openAndroidIntent → true sur Android avec extras', () => {
    dd.__setOS('android');
    Object.defineProperty(window, 'location', {
      value: { href: '', toString: () => '' },
      configurable: true,
      writable: true,
    });
    const ok = crossPlatform.openAndroidIntent({
      package: 'com.x',
      action: 'view',
      extras: { key: 'val' },
    });
    expect(ok).toBe(true);
  });
});

describe('crossPlatform.requestAllPermissions', () => {
  it('renvoie un result par feature', async () => {
    const r = await crossPlatform.requestAllPermissions(['notifications', 'geolocation']);
    expect(r).toHaveProperty('notifications');
    expect(r).toHaveProperty('geolocation');
  });

  it('notifications=unsupported si Notification absent', async () => {
    /* Force Notification undef */
    const orig = (globalThis as { Notification?: unknown }).Notification;
    (globalThis as { Notification?: unknown }).Notification = undefined;
    const r = await crossPlatform.requestAllPermissions(['notifications']);
    expect(r['notifications']).toBe('unsupported');
    (globalThis as { Notification?: unknown }).Notification = orig;
  });

  it('notifications=granted si Notification.requestPermission resolve', async () => {
    (globalThis as unknown as { Notification: unknown }).Notification = {
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    } as unknown;
    const r = await crossPlatform.requestAllPermissions(['notifications']);
    expect(r['notifications']).toBe('granted');
    delete (globalThis as { Notification?: unknown }).Notification;
  });

  it('geolocation=granted si getCurrentPosition success', async () => {
    dd.__setCap('hasGeolocation', true);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: (p: unknown) => void) => {
          success({ coords: { latitude: 1, longitude: 2 } });
        },
      },
      configurable: true,
    });
    const r = await crossPlatform.requestAllPermissions(['geolocation']);
    expect(r['geolocation']).toBe('granted');
  });

  it('geolocation=denied si error.code === PERMISSION_DENIED', async () => {
    dd.__setCap('hasGeolocation', true);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_s: unknown, fail: (e: { code: number; PERMISSION_DENIED: number }) => void) => {
          fail({ code: 1, PERMISSION_DENIED: 1 });
        },
      },
      configurable: true,
    });
    const r = await crossPlatform.requestAllPermissions(['geolocation']);
    expect(r['geolocation']).toBe('denied');
  });

  it('geolocation=prompt si autre erreur', async () => {
    dd.__setCap('hasGeolocation', true);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_s: unknown, fail: (e: { code: number; PERMISSION_DENIED: number }) => void) => {
          fail({ code: 2, PERMISSION_DENIED: 1 });
        },
      },
      configurable: true,
    });
    const r = await crossPlatform.requestAllPermissions(['geolocation']);
    expect(r['geolocation']).toBe('prompt');
  });

  it('camera/microphone=unsupported sans getUserMedia', async () => {
    const r = await crossPlatform.requestAllPermissions(['camera', 'microphone']);
    expect(r['camera']).toBe('unsupported');
    expect(r['microphone']).toBe('unsupported');
  });

  it('camera=granted si getUserMedia resolve avec tracks', async () => {
    dd.__setCap('hasGetUserMedia', true);
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() =>
          Promise.resolve({ getTracks: () => [{ stop }, { stop }] }),
        ),
      },
      configurable: true,
    });
    const r = await crossPlatform.requestAllPermissions(['camera']);
    expect(r['camera']).toBe('granted');
    expect(stop).toHaveBeenCalled();
  });

  it('microphone=denied si getUserMedia rejette', async () => {
    dd.__setCap('hasGetUserMedia', true);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => Promise.reject(new Error('no'))) },
      configurable: true,
    });
    const r = await crossPlatform.requestAllPermissions(['microphone']);
    expect(r['microphone']).toBe('denied');
  });

  it('inconnu → unsupported', async () => {
    const r = await crossPlatform.requestAllPermissions(['inconnu' as 'notifications']);
    expect(r['inconnu']).toBe('unsupported');
  });
});
