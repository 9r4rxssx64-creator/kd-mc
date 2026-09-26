/**
 * Tests card-emulator.ts (v13.0.59 — Sprint 7 max).
 * Cible : 54% → 90%+ branches sur USB/Serial/BLE connect + sendCommand + emulateBadge.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { badgeCloner } from '../../services/integrations/badge-cloner.js';
import { cardEmulator } from '../../services/integrations/card-emulator.js';

describe('card-emulator — listSupported / capabilities', () => {
  it('listSupported retourne le catalogue 18+', () => {
    const list = cardEmulator.listSupported();
    expect(list.length).toBeGreaterThanOrEqual(18);
    /* Vérifie présence des principaux */
    expect(list.find((e) => e.id === 'flipper_zero_usb')).toBeDefined();
    expect(list.find((e) => e.id === 'proxmark3_easy')).toBeDefined();
    expect(list.find((e) => e.id === 'chameleon_mini')).toBeDefined();
    expect(list.find((e) => e.id === 'apex_companion_app_ios')).toBeDefined();
    expect(list.find((e) => e.id === 'apex_companion_app_android')).toBeDefined();
  });

  it('chaque emulator a name + vendor + connection', () => {
    for (const e of cardEmulator.listSupported()) {
      expect(typeof e.name).toBe('string');
      expect(typeof e.vendor).toBe('string');
      expect(['usb', 'serial', 'bluetooth', 'native_app']).toContain(e.connection);
      expect(['lf_125khz', 'hf_13.56mhz', 'both']).toContain(e.rf_range);
      expect(typeof e.emulate).toBe('boolean');
      expect(typeof e.clone).toBe('boolean');
      expect(Array.isArray(e.supports_formats)).toBe(true);
    }
  });
});

describe('card-emulator — getBrowserCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as unknown as { usb?: unknown }).usb;
    delete (navigator as unknown as { serial?: unknown }).serial;
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    delete (window as unknown as { NDEFReader?: unknown }).NDEFReader;
  });

  it('aucune API → toutes capabilities false', () => {
    delete (navigator as unknown as { usb?: unknown }).usb;
    delete (navigator as unknown as { serial?: unknown }).serial;
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    delete (window as unknown as { NDEFReader?: unknown }).NDEFReader;
    const c = cardEmulator.getBrowserCapabilities();
    expect(c.web_usb).toBe(false);
    expect(c.web_serial).toBe(false);
    expect(c.web_bluetooth).toBe(false);
    expect(c.web_nfc).toBe(false);
  });

  it('navigator.usb present → web_usb true', () => {
    Object.defineProperty(navigator, 'usb', { value: {}, configurable: true });
    expect(cardEmulator.getBrowserCapabilities().web_usb).toBe(true);
  });

  it('navigator.serial present → web_serial true', () => {
    Object.defineProperty(navigator, 'serial', { value: {}, configurable: true });
    expect(cardEmulator.getBrowserCapabilities().web_serial).toBe(true);
  });

  it('navigator.bluetooth present → web_bluetooth true', () => {
    Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true });
    expect(cardEmulator.getBrowserCapabilities().web_bluetooth).toBe(true);
  });

  it('window.NDEFReader present → web_nfc true', () => {
    vi.stubGlobal('NDEFReader', class {});
    expect(cardEmulator.getBrowserCapabilities().web_nfc).toBe(true);
  });
});

describe('card-emulator — connectFlipperUSB', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { usb?: unknown }).usb;
  });

  it('sans navigator.usb → ok=false reason WebUSB', async () => {
    delete (navigator as unknown as { usb?: unknown }).usb;
    const r = await cardEmulator.connectFlipperUSB();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('WebUSB');
  });

  it('connectFlipperUSB requestDevice rejette', async () => {
    Object.defineProperty(navigator, 'usb', {
      value: { requestDevice: vi.fn(async () => { throw new Error('User cancel'); }) },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperUSB();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('User cancel');
  });

  it('connectFlipperUSB success → status connecté', async () => {
    const openMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: openMock,
          close: vi.fn(),
          transferOut: vi.fn(),
          transferIn: vi.fn(),
        })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperUSB();
    expect(r.ok).toBe(true);
    expect(openMock).toHaveBeenCalled();
    const status = cardEmulator.getStatus();
    expect(status.connected).toBe(true);
    expect(status.device).toBe('flipper_zero_usb');
    expect(status.connection).toBe('usb');
    expect(typeof status.uptime_sec).toBe('number');
  });

  it('connectFlipperUSB open rejette → fail', async () => {
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => { throw new Error('USB busy'); }),
          close: vi.fn(),
          transferOut: vi.fn(),
          transferIn: vi.fn(),
        })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperUSB();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('USB busy');
  });
});

describe('card-emulator — connectProxmarkSerial', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { serial?: unknown }).serial;
  });

  it('sans navigator.serial → fail WebSerial', async () => {
    delete (navigator as unknown as { serial?: unknown }).serial;
    const r = await cardEmulator.connectProxmarkSerial();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('WebSerial');
  });

  it('connectProxmarkSerial succès status connecté', async () => {
    const openMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: openMock,
          close: vi.fn(),
          readable: null,
          writable: null,
        })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectProxmarkSerial();
    expect(r.ok).toBe(true);
    expect(openMock).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(cardEmulator.getStatus().device).toBe('proxmark3_easy');
  });

  it('connectProxmarkSerial requestPort throws → fail', async () => {
    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: vi.fn(async () => { throw new Error('No port'); }) },
      configurable: true,
    });
    const r = await cardEmulator.connectProxmarkSerial();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('No port');
  });
});

describe('card-emulator — connectChameleonSerial', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { serial?: unknown }).serial;
  });

  it('sans navigator.serial → fail', async () => {
    delete (navigator as unknown as { serial?: unknown }).serial;
    const r = await cardEmulator.connectChameleonSerial();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('WebSerial');
  });

  it('connectChameleonSerial succès', async () => {
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(),
          readable: null,
          writable: null,
        })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectChameleonSerial();
    expect(r.ok).toBe(true);
    expect(cardEmulator.getStatus().device).toBe('chameleon_mini');
  });

  it('connectChameleonSerial throws', async () => {
    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: vi.fn(async () => { throw new Error('cancel'); }) },
      configurable: true,
    });
    const r = await cardEmulator.connectChameleonSerial();
    expect(r.ok).toBe(false);
  });
});

describe('card-emulator — connectFlipperBLE', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });

  it('sans navigator.bluetooth → fail', async () => {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    const r = await cardEmulator.connectFlipperBLE();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Bluetooth');
  });

  it('connectFlipperBLE succès', async () => {
    const connectMock = vi.fn(async () => ({}));
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice: vi.fn(async () => ({
          name: 'Flipper-X',
          gatt: { connect: connectMock, disconnect: vi.fn() },
        })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperBLE();
    expect(r.ok).toBe(true);
    expect(connectMock).toHaveBeenCalled();
    expect(cardEmulator.getStatus().device).toBe('flipper_zero_ble');
    expect(cardEmulator.getStatus().connection).toBe('bluetooth');
  });

  it('connectFlipperBLE requestDevice rejette → fail', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: vi.fn(async () => { throw new Error('User cancel'); }) },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperBLE();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('User cancel');
  });

  it('connectFlipperBLE sans gatt → ok=true (gatt optional)', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice: vi.fn(async () => ({ name: 'Flipper-Y' })),
      },
      configurable: true,
    });
    const r = await cardEmulator.connectFlipperBLE();
    expect(r.ok).toBe(true);
  });
});

describe('card-emulator — sendCommand', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { usb?: unknown }).usb;
    delete (navigator as unknown as { serial?: unknown }).serial;
  });

  it('sans device connecté → fail', async () => {
    const r = await cardEmulator.sendCommand('test');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Aucun device');
  });

  it('USB sendCommand succès via transferOut/transferIn', async () => {
    const buf = new TextEncoder().encode('OK\n');
    const dv = new DataView(buf.buffer.slice(0));
    const transferIn = vi.fn(async () => ({
      status: 'ok',
      data: dv,
    }));
    const transferOut = vi.fn(async () => ({ status: 'ok', bytesWritten: 5 }));
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          transferOut,
          transferIn,
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    const r = await cardEmulator.sendCommand('hf mfu read');
    expect(r.ok).toBe(true);
    expect(transferOut).toHaveBeenCalled();
    expect(transferIn).toHaveBeenCalled();
  });

  it('USB transferOut throws → fail', async () => {
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          transferOut: vi.fn(async () => { throw new Error('USB write fail'); }),
          transferIn: vi.fn(),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    const r = await cardEmulator.sendCommand('boom');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('USB write fail');
  });

  it('Serial sendCommand avec writable + readable', async () => {
    const writeMock = vi.fn(async () => undefined);
    const releaseLockMock = vi.fn();
    const writable = {
      getWriter: () => ({ write: writeMock, releaseLock: releaseLockMock }),
    };
    let readCount = 0;
    const readable = {
      getReader: () => ({
        read: vi.fn(async () => {
          if (readCount === 0) {
            readCount++;
            return { value: new TextEncoder().encode('OK\n'), done: false };
          }
          return { value: undefined, done: true };
        }),
        cancel: vi.fn(),
        releaseLock: vi.fn(),
      }),
    };
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          readable,
          writable,
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectProxmarkSerial();
    const r = await cardEmulator.sendCommand('hf mf sim');
    expect(r.ok).toBe(true);
    expect(writeMock).toHaveBeenCalled();
    expect(r.response).toContain('OK');
  });

  it('Serial writer throws → fail', async () => {
    const writable = {
      getWriter: () => ({
        write: vi.fn(async () => { throw new Error('Stream broken'); }),
        releaseLock: vi.fn(),
      }),
    };
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          writable,
          readable: null,
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectProxmarkSerial();
    const r = await cardEmulator.sendCommand('cmd');
    expect(r.ok).toBe(false);
  });

  it('Serial sans writable et sans usbDevice → fail "non supporté"', async () => {
    /* Connect Bluetooth qui n'a ni port ni usbDevice */
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice: vi.fn(async () => ({
          name: 'F', gatt: { connect: vi.fn(async () => ({})), disconnect: vi.fn() },
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperBLE();
    const r = await cardEmulator.sendCommand('cmd');
    /* connection = bluetooth, pas serial ni usb branches → "non supporté" */
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('non supporté');
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });
});

describe('card-emulator — emulateBadge', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
    localStorage.clear();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { usb?: unknown }).usb;
    delete (navigator as unknown as { serial?: unknown }).serial;
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });

  it('sans device connecté → fail "Connecte d\'abord"', async () => {
    const r = await cardEmulator.emulateBadge('any_id');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Connecte');
  });

  it('badge introuvable → fail', async () => {
    const emptyDv = new DataView(new ArrayBuffer(0));
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          transferOut: vi.fn(async () => ({ status: 'ok', bytesWritten: 1 })),
          transferIn: vi.fn(async () => ({
            status: 'ok',
            data: emptyDv,
          })),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    const r = await cardEmulator.emulateBadge('does_not_exist');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('introuvable');
  });

  it('Flipper USB emulate badge → cmd "nfc emulate UID"', async () => {
    /* Stocke un badge */
    await badgeCloner.storeBadge({
      id: 'flip_badge', uid: 'AABBCCDD',
      format: 'mifare_classic_1k' as const,
      records: [{ type: 'text', data: 'x' }] as const,
      scanned_at: 0,
    });
    let lastWritten: Uint8Array | null = null;
    const emptyDv = new DataView(new ArrayBuffer(0));
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          transferOut: vi.fn(async (_ep: number, data: Uint8Array) => {
            lastWritten = data;
            return { status: 'ok', bytesWritten: data.length };
          }),
          transferIn: vi.fn(async () => ({
            status: 'ok',
            data: emptyDv,
          })),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    const r = await cardEmulator.emulateBadge('flip_badge');
    expect(r.ok).toBe(true);
    expect(lastWritten).not.toBeNull();
    if (lastWritten !== null) {
      const decoded = new TextDecoder().decode(lastWritten as Uint8Array);
      expect(decoded).toContain('nfc emulate');
      expect(decoded).toContain('AABBCCDD');
    }
  });

  it('Proxmark emulate → cmd "hf mf sim --1k"', async () => {
    await badgeCloner.storeBadge({
      id: 'pm_badge', uid: 'DEAD',
      format: 'mifare_classic_1k' as const,
      records: [{ type: 'text', data: 'x' }] as const,
      scanned_at: 0,
    });
    let written: string | null = null;
    const writable = {
      getWriter: () => ({
        write: vi.fn(async (data: Uint8Array) => {
          written = new TextDecoder().decode(data);
        }),
        releaseLock: vi.fn(),
      }),
    };
    const readable = {
      getReader: () => ({
        read: vi.fn(async () => ({ value: new TextEncoder().encode('OK\n'), done: false })),
        cancel: vi.fn(),
        releaseLock: vi.fn(),
      }),
    };
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          writable,
          readable,
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectProxmarkSerial();
    const r = await cardEmulator.emulateBadge('pm_badge', { duration_sec: 30 });
    expect(r.ok).toBe(true);
    expect(written).toContain('hf mf sim');
    expect(written).toContain('DEAD');
    expect(written).toContain('30');
  });

  it('Chameleon emulate → 3 commandes setting/uid/config', async () => {
    await badgeCloner.storeBadge({
      id: 'cm_badge', uid: 'BEEF',
      format: 'mifare_classic_1k' as const,
      records: [{ type: 'text', data: 'x' }] as const,
      scanned_at: 0,
    });
    const writes: string[] = [];
    const writable = {
      getWriter: () => ({
        write: vi.fn(async (data: Uint8Array) => {
          writes.push(new TextDecoder().decode(data));
        }),
        releaseLock: vi.fn(),
      }),
    };
    const readable = {
      getReader: () => ({
        read: vi.fn(async () => ({ value: new TextEncoder().encode('ack\n'), done: false })),
        cancel: vi.fn(),
        releaseLock: vi.fn(),
      }),
    };
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          writable,
          readable,
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectChameleonSerial();
    const r = await cardEmulator.emulateBadge('cm_badge');
    expect(r.ok).toBe(true);
    expect(writes.length).toBe(3);
    expect(writes[0]).toContain('setting=0');
    expect(writes[1]).toContain('uid=BEEF');
    expect(writes[2]).toContain('config=MF_CLASSIC_1K');
  });

  it('badge sans uid → utilise default 00000000', async () => {
    await badgeCloner.storeBadge({
      id: 'no_uid', format: 'ndef_text' as const,
      records: [{ type: 'text', data: 'x' }] as const,
      scanned_at: 0,
    });
    let written: string | null = null;
    const emptyDv = new DataView(new ArrayBuffer(0));
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          transferOut: vi.fn(async (_e: number, data: Uint8Array) => {
            written = new TextDecoder().decode(data);
            return { status: 'ok', bytesWritten: data.length };
          }),
          transferIn: vi.fn(async () => ({
            status: 'ok',
            data: emptyDv,
          })),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    const r = await cardEmulator.emulateBadge('no_uid');
    expect(r.ok).toBe(true);
    expect(written).toContain('00000000');
  });
});

describe('card-emulator — getStatus / disconnect', () => {
  beforeEach(async () => {
    await cardEmulator.disconnect();
  });

  afterEach(async () => {
    await cardEmulator.disconnect();
    delete (navigator as unknown as { usb?: unknown }).usb;
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });

  it('getStatus initial connected=false', () => {
    const s = cardEmulator.getStatus();
    expect(s.connected).toBe(false);
    expect(s.device).toBeUndefined();
  });

  it('disconnect sans device est noop', async () => {
    /* Pas de throw */
    await expect(cardEmulator.disconnect()).resolves.toBeUndefined();
  });

  it('disconnect ferme USB device', async () => {
    const closeMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: closeMock,
          transferOut: vi.fn(),
          transferIn: vi.fn(),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    await cardEmulator.disconnect();
    expect(closeMock).toHaveBeenCalled();
    expect(cardEmulator.getStatus().connected).toBe(false);
  });

  it('disconnect close throws → silently ignored, état clear', async () => {
    Object.defineProperty(navigator, 'usb', {
      value: {
        requestDevice: vi.fn(async () => ({
          open: vi.fn(async () => undefined),
          close: vi.fn(async () => { throw new Error('boom'); }),
          transferOut: vi.fn(),
          transferIn: vi.fn(),
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperUSB();
    await cardEmulator.disconnect();
    /* Pas de throw — état nettoyé */
    expect(cardEmulator.getStatus().connected).toBe(false);
  });

  it('disconnect Bluetooth gatt.disconnect appelé', async () => {
    const dcMock = vi.fn();
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice: vi.fn(async () => ({
          name: 'Flipper',
          gatt: { connect: vi.fn(async () => ({})), disconnect: dcMock },
        })),
      },
      configurable: true,
    });
    await cardEmulator.connectFlipperBLE();
    await cardEmulator.disconnect();
    expect(dcMock).toHaveBeenCalled();
  });
});
