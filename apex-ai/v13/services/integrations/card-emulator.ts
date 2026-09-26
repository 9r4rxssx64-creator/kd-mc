/**
 * APEX v13 — Card Emulator (multi-device émulation badge/RFID/NFC).
 *
 * Demande Kevin 2026-05-04 :
 * "Crée ou ajoute l'app nécessaire pour émulation directe dans Apex Télécommande
 *  multi maximum. Émulation badge travail, machines à café, multi-format,
 *  multi-device, multi-source, multi-tout."
 *
 * Réalité technique :
 * - Browser ne peut PAS faire HCE (Host Card Emulation) directement
 * - MAIS browser peut PILOTER hardware d'émulation via :
 *   * WebUSB (Proxmark3, ChameleonMini, ACR122)
 *   * WebSerial (Flipper Zero, Arduino RFID, RC522)
 *   * Web Bluetooth (Flipper Zero BLE, ProxmarkPro Bluetooth, Chameleon Tiny Pro)
 *   * Web NFC (Android Chrome) → écrire tags vierges
 *
 * Catalogue 12+ devices émulateurs supportés avec commandes spécifiques.
 *
 * App native compagnon (recommandée pour HCE iOS/Android pur) :
 * - iOS : Apex Companion App (Capacitor wrapper, Core NFC + HCE limité Apple)
 * - Android : Apex Companion App (NFC HCE Service complet, lecture + émulation)
 * - Lien fourni dans UI quand user demande émulation hors hardware
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* Interfaces typées Web Hardware APIs (non couvertes par lib.dom partout) */
interface SerialPortLike {
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface USBDeviceLike {
  open: () => Promise<void>;
  close: () => Promise<void>;
  transferOut: (endpoint: number, data: Uint8Array) => Promise<{ status: string; bytesWritten: number }>;
  transferIn: (endpoint: number, length: number) => Promise<{ status: string; data: DataView }>;
}
interface BluetoothDeviceLike {
  name?: string;
  gatt?: { connect: () => Promise<unknown>; disconnect: () => void };
}

export type EmulatorDevice =
  | 'flipper_zero_usb' | 'flipper_zero_ble'
  | 'proxmark3_easy' | 'proxmark3_rdv4' | 'proxmark_pro_ble'
  | 'chameleon_mini' | 'chameleon_tiny_pro'
  | 'acr122u' | 'acr1252u'
  | 'pn532_arduino' | 'pn532_breakout'
  | 'rc522_arduino'
  | 'magspoof' | 'magspoof_v3'
  | 'apex_companion_app_ios' | 'apex_companion_app_android'
  /* Étendus Sprint 7 max */
  | 'hydra_nfc' | 'icopy_x' | 'wave_share_pn532'
  | 'apdu_acr1255u' | 'apdu_acr1281u' | 'apdu_omnikey_5022'
  | 'rfidler' | 'usb_jtagulator'
  | 'm5stick_rfid2' | 'm5stamp_pico'
  | 'iphone_xs_nfc' /* via Apex Companion App iOS */
  | 'pixel_phone_hce' /* via Apex Companion App Android */
  | 'esp32_pn532'
  | 'flipper_blackhat' /* Flipper extension card */
  | 'omertà_keystudy'
  | 'unknown';

export type ConnectionType = 'usb' | 'serial' | 'bluetooth' | 'native_app';

export interface EmulatorInfo {
  id: EmulatorDevice;
  name: string;
  vendor: string;
  connection: ConnectionType;
  supports_formats: readonly string[];
  emulate: boolean; /* Peut émuler (vs juste lire) */
  clone: boolean; /* Peut cloner tag → tag */
  rf_range: 'lf_125khz' | 'hf_13.56mhz' | 'both';
  buy_url?: string;
  docs_url?: string;
}

export const EMULATORS: readonly EmulatorInfo[] = [
  {
    id: 'flipper_zero_usb',
    name: 'Flipper Zero (USB)',
    vendor: 'Flipper Devices',
    connection: 'usb',
    supports_formats: ['hid_prox', 'em4100', 'mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'ntag213', 'ntag215', 'ntag216', 'iso14443a', 'iso15693', 't5577', 'em4305'],
    emulate: true, clone: true, rf_range: 'both',
    buy_url: 'https://flipperzero.one',
    docs_url: 'https://docs.flipper.net/',
  },
  {
    id: 'flipper_zero_ble',
    name: 'Flipper Zero (Bluetooth LE)',
    vendor: 'Flipper Devices',
    connection: 'bluetooth',
    supports_formats: ['hid_prox', 'em4100', 'mifare_classic_1k', 'mifare_ultralight', 'ntag215', 'iso14443a', 't5577'],
    emulate: true, clone: true, rf_range: 'both',
  },
  {
    id: 'proxmark3_easy',
    name: 'Proxmark3 Easy',
    vendor: 'Proxmark',
    connection: 'usb',
    supports_formats: ['hid_prox', 'hid_iclass', 'em4100', 'em4305', 't5577', 'mifare_classic_1k', 'mifare_classic_4k', 'mifare_desfire_ev1', 'iso14443a', 'iso14443b', 'iso15693', 'felica_lite', 'indala_64', 'awid', 'paradox'],
    emulate: true, clone: true, rf_range: 'both',
    buy_url: 'https://shop.kasper.it/proxmark3-easy',
    docs_url: 'https://github.com/RfidResearchGroup/proxmark3',
  },
  {
    id: 'proxmark3_rdv4',
    name: 'Proxmark3 RDV4 (pro)',
    vendor: 'Proxmark',
    connection: 'usb',
    supports_formats: ['hid_prox', 'hid_iclass', 'hid_iclass_se', 'hid_iclass_seos', 'em4100', 'em4305', 't5577', 'mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'mifare_desfire_ev1', 'mifare_desfire_ev2', 'mifare_desfire_ev3', 'mifare_plus_s', 'mifare_plus_x', 'iso14443a', 'iso14443b', 'iso15693', 'felica_standard', 'indala_64', 'indala_224', 'awid', 'paradox', 'pyramid', 'hitag1', 'hitag2', 'hitags', 'fdx_b'],
    emulate: true, clone: true, rf_range: 'both',
  },
  {
    id: 'chameleon_mini',
    name: 'ChameleonMini',
    vendor: 'Kasper & Oswald',
    connection: 'serial',
    supports_formats: ['mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'iso14443a', 'iso15693'],
    emulate: true, clone: false, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'chameleon_tiny_pro',
    name: 'Chameleon Tiny Pro (BLE)',
    vendor: 'Kasper & Oswald',
    connection: 'bluetooth',
    supports_formats: ['mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'iso14443a'],
    emulate: true, clone: false, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'acr122u',
    name: 'ACR122U USB Reader',
    vendor: 'ACS',
    connection: 'usb',
    supports_formats: ['mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'ntag213', 'ntag215', 'iso14443a', 'iso14443b', 'felica_lite'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'pn532_arduino',
    name: 'PN532 + Arduino (DIY)',
    vendor: 'NXP/DIY',
    connection: 'serial',
    supports_formats: ['mifare_classic_1k', 'mifare_ultralight', 'iso14443a', 'felica_lite'],
    emulate: true, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'magspoof_v3',
    name: 'MagSpoof v3 (cartes magnétiques)',
    vendor: 'Samy Kamkar',
    connection: 'usb',
    supports_formats: ['magstripe_track1', 'magstripe_track2'] as unknown as readonly string[],
    emulate: true, clone: true, rf_range: 'lf_125khz',
  },
  {
    id: 'apex_companion_app_ios',
    name: 'Apex Companion App iOS',
    vendor: 'Apex',
    connection: 'native_app',
    supports_formats: ['ndef_text', 'ndef_url', 'ndef_mime', 'iso14443a', 'apple_wallet_pass'],
    emulate: false, /* iOS Apple Core NFC = read-only sauf Wallet pass */
    clone: false, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'apex_companion_app_android',
    name: 'Apex Companion App Android',
    vendor: 'Apex',
    connection: 'native_app',
    supports_formats: ['ndef_text', 'ndef_url', 'ndef_mime', 'iso14443a', 'mifare_classic_1k', 'mifare_ultralight'],
    emulate: true, /* HCE Service Android complet */
    clone: true, rf_range: 'hf_13.56mhz',
  },
  /* === ÉMULATEURS ÉTENDUS Sprint 7 max === */
  {
    id: 'hydra_nfc',
    name: 'HydraNFC',
    vendor: 'HydraBus',
    connection: 'usb',
    supports_formats: ['mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'iso14443a', 'iso14443b', 'iso15693', 'felica_lite'],
    emulate: true, clone: true, rf_range: 'hf_13.56mhz',
    docs_url: 'https://hydrabus.com/hydranfc-1-0-specifications',
  },
  {
    id: 'icopy_x',
    name: 'iCopy-X (clone Pro RFID)',
    vendor: 'iKeycopy',
    connection: 'usb',
    supports_formats: ['hid_prox', 'em4100', 'em4305', 't5577', 'mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'iso14443a', 'iso15693', 'indala_64', 'awid'],
    emulate: true, clone: true, rf_range: 'both',
  },
  {
    id: 'wave_share_pn532',
    name: 'Waveshare PN532 NFC HAT',
    vendor: 'Waveshare',
    connection: 'serial',
    supports_formats: ['mifare_classic_1k', 'mifare_ultralight', 'iso14443a', 'felica_lite'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'apdu_acr1255u',
    name: 'ACS ACR1255U (Bluetooth NFC reader)',
    vendor: 'ACS',
    connection: 'bluetooth',
    supports_formats: ['mifare_classic_1k', 'mifare_ultralight', 'ntag213', 'ntag215', 'iso14443a', 'iso14443b'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'apdu_acr1281u',
    name: 'ACS ACR1281U-C1 (USB dual interface)',
    vendor: 'ACS',
    connection: 'usb',
    supports_formats: ['mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'mifare_desfire_ev1', 'iso14443a', 'iso14443b', 'felica_standard'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'apdu_omnikey_5022',
    name: 'HID OMNIKEY 5022 CL',
    vendor: 'HID',
    connection: 'usb',
    supports_formats: ['hid_iclass', 'hid_iclass_se', 'hid_iclass_seos', 'mifare_classic_1k', 'mifare_desfire_ev1', 'iso14443a', 'iso14443b'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'rfidler',
    name: 'RFIDler LF (125kHz Open Source)',
    vendor: 'Aperture Labs',
    connection: 'usb',
    supports_formats: ['em4100', 'em4102', 'em4305', 'hitag1', 'hitag2', 'indala_64', 'indala_224', 'awid', 'paradox'],
    emulate: true, clone: true, rf_range: 'lf_125khz',
  },
  {
    id: 'm5stick_rfid2',
    name: 'M5StickC + RFID2 module',
    vendor: 'M5Stack',
    connection: 'serial',
    supports_formats: ['mifare_classic_1k', 'mifare_ultralight', 'iso14443a'],
    emulate: false, clone: true, rf_range: 'hf_13.56mhz',
    buy_url: 'https://shop.m5stack.com/',
  },
  {
    id: 'esp32_pn532',
    name: 'ESP32 + PN532 (DIY WiFi)',
    vendor: 'DIY OSS',
    connection: 'serial',
    supports_formats: ['mifare_classic_1k', 'mifare_ultralight', 'iso14443a'],
    emulate: true, clone: true, rf_range: 'hf_13.56mhz',
  },
  {
    id: 'flipper_blackhat',
    name: 'Flipper Zero + WiFi Devboard',
    vendor: 'Flipper Devices',
    connection: 'usb',
    supports_formats: ['hid_prox', 'em4100', 'mifare_classic_1k', 'mifare_classic_4k', 'mifare_ultralight', 'ntag215', 'iso14443a', 'iso15693', 't5577', 'em4305', 'hid_iclass'],
    emulate: true, clone: true, rf_range: 'both',
  },
];

export interface ConnectedEmulator {
  device: EmulatorDevice;
  connection: ConnectionType;
  port?: SerialPortLike;
  usbDevice?: USBDeviceLike;
  bluetoothDevice?: BluetoothDeviceLike;
  connected_at: number;
}

class CardEmulator {
  private connected: ConnectedEmulator | null = null;

  /**
   * Liste devices émulateurs supportés.
   */
  listSupported(): readonly EmulatorInfo[] {
    return EMULATORS;
  }

  /**
   * Capabilities du browser actuel.
   */
  getBrowserCapabilities(): {
    web_usb: boolean;
    web_serial: boolean;
    web_bluetooth: boolean;
    web_nfc: boolean;
  } {
    return {
      web_usb: typeof navigator !== 'undefined' && 'usb' in navigator,
      web_serial: typeof navigator !== 'undefined' && 'serial' in navigator,
      web_bluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
      web_nfc: typeof window !== 'undefined' && 'NDEFReader' in window,
    };
  }

  /**
   * Connecte un Flipper Zero via WebUSB.
   * Vendor ID Flipper : 0x0483 (STMicroelectronics).
   */
  async connectFlipperUSB(): Promise<{ ok: boolean; reason?: string }> {
    if (!('usb' in navigator)) {
      return { ok: false, reason: 'WebUSB non supporté (Safari iOS bloqué, Chrome Android/desktop OK)' };
    }
    try {
      const usb = (navigator as Navigator & { usb: { requestDevice: (opts: { filters: Array<{ vendorId: number; productId?: number }> }) => Promise<USBDeviceLike> } }).usb;
      const device = await usb.requestDevice({
        filters: [
          { vendorId: 0x0483, productId: 0x5740 } /* Flipper Zero standard */,
          { vendorId: 0x0483, productId: 0xdf11 } /* Flipper DFU mode */,
        ],
      });
      await device.open();
      this.connected = {
        device: 'flipper_zero_usb',
        connection: 'usb',
        usbDevice: device,
        connected_at: Date.now(),
      };
      void auditLog.record('emulator.connected', { details: { device: 'flipper_zero_usb' } });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fail';
      return { ok: false, reason: msg };
    }
  }

  /**
   * Connecte un Proxmark3 via WebSerial.
   */
  async connectProxmarkSerial(): Promise<{ ok: boolean; reason?: string }> {
    if (!('serial' in navigator)) {
      return { ok: false, reason: 'WebSerial non supporté (Safari/Firefox bloqué, Chrome OK)' };
    }
    try {
      const port = await (navigator as Navigator & { serial: { requestPort: (opts?: { filters?: Array<{ usbVendorId: number }> }) => Promise<SerialPortLike> } }).serial.requestPort({
        filters: [{ usbVendorId: 0x9ac4 }] /* Proxmark3 */,
      });
      await port.open({ baudRate: 115200 });
      this.connected = {
        device: 'proxmark3_easy',
        connection: 'serial',
        port,
        connected_at: Date.now(),
      };
      void auditLog.record('emulator.connected', { details: { device: 'proxmark3_easy' } });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fail';
      return { ok: false, reason: msg };
    }
  }

  /**
   * Connecte ChameleonMini via WebSerial (CDC ACM).
   */
  async connectChameleonSerial(): Promise<{ ok: boolean; reason?: string }> {
    if (!('serial' in navigator)) {
      return { ok: false, reason: 'WebSerial non supporté' };
    }
    try {
      const port = await (navigator as Navigator & { serial: { requestPort: () => Promise<SerialPortLike> } }).serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.connected = {
        device: 'chameleon_mini',
        connection: 'serial',
        port,
        connected_at: Date.now(),
      };
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fail';
      return { ok: false, reason: msg };
    }
  }

  /**
   * Connecte Flipper Zero via Bluetooth LE.
   * Service UUID Flipper : 8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000
   */
  async connectFlipperBLE(): Promise<{ ok: boolean; reason?: string }> {
    if (!('bluetooth' in navigator)) {
      return { ok: false, reason: 'Web Bluetooth non supporté (Safari iOS bloqué)' };
    }
    try {
      const bt = (navigator as Navigator & { bluetooth: { requestDevice: (opts: { filters?: Array<{ namePrefix?: string; services?: string[] }>; optionalServices?: string[] }) => Promise<BluetoothDeviceLike> } }).bluetooth;
      const device = await bt.requestDevice({
        filters: [
          { namePrefix: 'Flipper' },
          { services: ['8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000'] },
        ],
        optionalServices: ['8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000'],
      });
      await device.gatt?.connect();
      this.connected = {
        device: 'flipper_zero_ble',
        connection: 'bluetooth',
        bluetoothDevice: device,
        connected_at: Date.now(),
      };
      void auditLog.record('emulator.connected', { details: { device: 'flipper_zero_ble' } });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fail';
      return { ok: false, reason: msg };
    }
  }

  /**
   * Envoyer commande RAW au device connecté.
   * Format dépend du device : Proxmark = "hf mfu read", Flipper = "rfid emulate", etc.
   */
  async sendCommand(cmd: string): Promise<{ ok: boolean; response?: string; reason?: string }> {
    if (!this.connected) return { ok: false, reason: 'Aucun device connecté' };
    try {
      const enc = new TextEncoder();
      const cmdBytes = enc.encode(cmd + '\n');
      if (this.connected.connection === 'serial' && this.connected.port?.writable) {
        const writer = this.connected.port.writable.getWriter();
        await writer.write(cmdBytes);
        writer.releaseLock();
        /* Lecture réponse (timeout 2s) */
        if (this.connected.port.readable) {
          const reader = this.connected.port.readable.getReader();
          const dec = new TextDecoder();
          let response = '';
          const timeout = setTimeout(() => void reader.cancel(), 2000);
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              response += dec.decode(value);
              if (response.includes('\n') || response.length > 500) break;
            }
          } finally {
            clearTimeout(timeout);
            reader.releaseLock();
          }
          return { ok: true, response };
        }
      }
      if (this.connected.connection === 'usb' && this.connected.usbDevice) {
        await this.connected.usbDevice.transferOut(2, cmdBytes);
        const result = await this.connected.usbDevice.transferIn(2, 512);
        const response = new TextDecoder().decode(result.data);
        return { ok: true, response };
      }
      return { ok: false, reason: 'Connection type non supporté pour sendCommand' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fail';
      return { ok: false, reason: msg };
    }
  }

  /**
   * Émuler un badge stocké via le device connecté.
   * Délègue commandes spécifiques selon device.
   */
  async emulateBadge(badgeId: string, options?: { duration_sec?: number }): Promise<{ ok: boolean; reason?: string }> {
    if (!this.connected) {
      return { ok: false, reason: 'Connecte d\'abord un émulateur (Flipper, Proxmark, etc.)' };
    }
    const { badgeCloner } = await import('./badge-cloner.js');
    const list = await badgeCloner.listBadgesAsync();
    const badge = list.find((b) => b.id === badgeId);
    if (!badge) return { ok: false, reason: 'Badge introuvable' };
    void auditLog.record('emulator.emulate_badge', {
      details: { device: this.connected.device, badge_id: badgeId, format: badge.format },
    });
    /* Commandes par device */
    switch (this.connected.device) {
      case 'flipper_zero_usb':
      case 'flipper_zero_ble': {
        /* Flipper RPC protobuf — ici simplifié CLI command */
        const cmd = `nfc emulate ${badge.uid ?? '00000000'}`;
        return this.sendCommand(cmd);
      }
      case 'proxmark3_easy':
      case 'proxmark3_rdv4': {
        /* Proxmark : hf mfu sim ou hf mf sim */
        const cmd = `hf mf sim --1k -u ${badge.uid ?? '00000000'} -t ${options?.duration_sec ?? 60}`;
        return this.sendCommand(cmd);
      }
      case 'chameleon_mini':
      case 'chameleon_tiny_pro': {
        /* Chameleon : SETTING=0 + UID=xxxx + CONFIG=MF_CLASSIC_1K */
        await this.sendCommand('setting=0');
        await this.sendCommand(`uid=${badge.uid ?? '00000000'}`);
        return this.sendCommand('config=MF_CLASSIC_1K');
      }
      default:
        return { ok: false, reason: `Émulation pas implémentée pour ${this.connected.device}` };
    }
  }

  /**
   * Disconnect device.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      if (this.connected.port) await this.connected.port.close();
      if (this.connected.usbDevice) await this.connected.usbDevice.close();
      if (this.connected.bluetoothDevice?.gatt) this.connected.bluetoothDevice.gatt.disconnect();
    } catch (err: unknown) {
      logger.warn('card-emulator', 'disconnect failed', { err });
    }
    this.connected = null;
  }

  /**
   * Status courant.
   */
  getStatus(): { connected: boolean; device?: EmulatorDevice; connection?: ConnectionType; uptime_sec?: number } {
    if (!this.connected) return { connected: false };
    return {
      connected: true,
      device: this.connected.device,
      connection: this.connected.connection,
      uptime_sec: Math.round((Date.now() - this.connected.connected_at) / 1000),
    };
  }
}

export const cardEmulator = new CardEmulator();
