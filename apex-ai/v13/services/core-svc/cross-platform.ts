/**
 * APEX v13 — Cross-platform wrappers (auto-adapt iOS / Android / Desktop).
 *
 * Demande Kevin :
 * "Pareil pour Apex. Pareil pour CMCteams. Pareil pour tous mes autres projets et les futurs.
 *  Cross-platform iOS+Android+Desktop systématique."
 *
 * Wrappers safe pour APIs device-spécifiques :
 * - Si feature dispo → exécute
 * - Si feature absente → fallback gracieux (toast info, pas erreur)
 * - Permissions toujours sur user gesture (pas auto-boot)
 *
 * Pattern : `if (deviceDetect.has('hasWebBluetooth')) { ... } else { fallback }`
 *
 * Anti-pattern Kevin : ne JAMAIS appeler navigator.bluetooth.* sans guard → crash
 */

import { logger } from '../../core/logger.js';
import { toast } from '../../ui/toast.js';
import { deviceDetect } from '../integrations/device-detect.js';

export interface CrossPlatformResult<T = unknown> {
  ok: boolean;
  data?: T;
  reason?: string;
  fallback?: string;
}

class CrossPlatform {
  /* === SHARE === */

  /**
   * Web Share API (iOS Safari / Android Chrome / Edge).
   * Fallback : copy to clipboard.
   */
  async share(data: { title?: string; text?: string; url?: string; files?: File[] }): Promise<CrossPlatformResult> {
    if (!deviceDetect.has('hasShare')) {
      return this.fallbackClipboard(data);
    }
    try {
      if (data.files && data.files.length > 0) {
        if (!('canShare' in navigator) || !navigator.canShare?.({ files: data.files })) {
          return this.fallbackClipboard(data);
        }
      }
      await navigator.share(data);
      return { ok: true };
    } catch (err: unknown) {
      logger.warn('cross-platform', 'share failed', { err });
      /* User abort = pas une erreur */
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, reason: 'user_cancel' };
      }
      return this.fallbackClipboard(data);
    }
  }

  private async fallbackClipboard(data: { url?: string; text?: string }): Promise<CrossPlatformResult> {
    const txt = data.url ?? data.text ?? '';
    if (!txt || typeof navigator === 'undefined' || !navigator.clipboard) {
      return { ok: false, reason: 'clipboard_unavailable', fallback: 'copy_manual' };
    }
    try {
      await navigator.clipboard.writeText(txt);
      toast.show('Copié dans presse-papiers', 'success');
      return { ok: true, fallback: 'clipboard' };
    } catch {
      return { ok: false, reason: 'clipboard_denied' };
    }
  }

  /* === VIBRATION === */

  vibrate(pattern: number | number[]): boolean {
    if (!deviceDetect.has('hasVibration')) return false;
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }

  /* === WAKE LOCK === */

  private wakeLockSentinel: WakeLockSentinel | null = null;

  async acquireWakeLock(): Promise<CrossPlatformResult> {
    if (!deviceDetect.has('hasWakeLock')) {
      return { ok: false, reason: 'wakelock_unavailable' };
    }
    try {
      this.wakeLockSentinel = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } })
        .wakeLock.request('screen');
      return { ok: true };
    } catch (err: unknown) {
      logger.warn('cross-platform', 'wakeLock request failed', { err });
      return { ok: false, reason: 'wakelock_denied' };
    }
  }

  async releaseWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {
        /* ignore */
      }
      this.wakeLockSentinel = null;
    }
  }

  /* === BATTERY === */

  async getBattery(): Promise<CrossPlatformResult<{ level: number; charging: boolean }>> {
    if (!deviceDetect.has('hasBattery')) {
      return { ok: false, reason: 'battery_unavailable' };
    }
    try {
      const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> }).getBattery();
      return {
        ok: true,
        data: {
          level: Math.round(battery.level * 100),
          charging: battery.charging,
        },
      };
    } catch {
      return { ok: false, reason: 'battery_error' };
    }
  }

  /* === NETWORK === */

  getNetworkInfo(): { online: boolean; type: string; saveData: boolean; downlink: number } {
    const c = deviceDetect.detect();
    return {
      online: c.isOnline,
      type: c.effectiveType,
      saveData: c.saveData,
      downlink: c.downlink,
    };
  }

  /* === BLUETOOTH (Android Chrome) === */

  async scanBluetooth(filters?: BluetoothLEScanFilter[]): Promise<CrossPlatformResult<BluetoothDevice>> {
    if (!deviceDetect.has('hasWebBluetooth')) {
      toast.show('Bluetooth pas dispo sur ce navigateur', 'warn');
      return { ok: false, reason: 'bluetooth_unsupported', fallback: 'manual_pairing' };
    }
    try {
      const device = await (navigator as unknown as { bluetooth: { requestDevice: (opts: object) => Promise<BluetoothDevice> } })
        .bluetooth.requestDevice({
          filters: filters ?? [{ services: ['battery_service'] }],
          optionalServices: ['battery_service', 'device_information'],
        });
      return { ok: true, data: device };
    } catch (err: unknown) {
      logger.warn('cross-platform', 'bluetooth scan failed', { err });
      return { ok: false, reason: 'bluetooth_denied' };
    }
  }

  /* === NFC (Android Chrome) === */

  async readNFC(): Promise<CrossPlatformResult<{ records: unknown[] }>> {
    if (!deviceDetect.has('hasWebNFC')) {
      toast.show('NFC dispo sur Chrome Android uniquement', 'warn');
      return { ok: false, reason: 'nfc_unsupported' };
    }
    try {
      const NDEFReader = (window as { NDEFReader?: new () => { scan: () => Promise<void>; addEventListener: (e: string, cb: (ev: { message: { records: unknown[] } }) => void) => void } }).NDEFReader;
      if (!NDEFReader) return { ok: false, reason: 'nfc_unsupported' };
      const reader = new NDEFReader();
      await reader.scan();
      return new Promise((resolve) => {
        reader.addEventListener('reading', (event) => {
          resolve({ ok: true, data: { records: event.message.records } });
        });
        setTimeout(() => resolve({ ok: false, reason: 'nfc_timeout' }), 30000);
      });
    } catch (err: unknown) {
      logger.warn('cross-platform', 'NFC read failed', { err });
      return { ok: false, reason: 'nfc_error' };
    }
  }

  /* === FILE SYSTEM ACCESS (Desktop Chrome/Edge) === */

  async pickFile(options?: { types?: { description: string; accept: Record<string, string[]> }[] }): Promise<CrossPlatformResult<File>> {
    if (deviceDetect.has('hasFileSystemAccess')) {
      try {
        const showOpenFilePicker = (window as { showOpenFilePicker?: (opts?: object) => Promise<{ getFile: () => Promise<File> }[]> }).showOpenFilePicker;
        if (!showOpenFilePicker) return this.fallbackInputFile();
        const handles = await showOpenFilePicker(options ?? {});
        if (handles.length === 0) return { ok: false, reason: 'no_file' };
        const file = await handles[0]!.getFile();
        return { ok: true, data: file };
      } catch (err: unknown) {
        logger.warn('cross-platform', 'pickFile failed', { err });
        return this.fallbackInputFile();
      }
    }
    return this.fallbackInputFile();
  }

  private fallbackInputFile(): Promise<CrossPlatformResult<File>> {
    return new Promise((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        input.addEventListener('change', () => {
          const f = input.files?.[0];
          if (f) resolve({ ok: true, data: f, fallback: 'input_file' });
          else resolve({ ok: false, reason: 'no_file' });
          input.remove();
        });
        document.body.appendChild(input);
        input.click();
      } catch {
        resolve({ ok: false, reason: 'input_unavailable' });
      }
    });
  }

  /* === CONTACT PICKER (Android Chrome) === */

  async pickContacts(): Promise<CrossPlatformResult<{ name: string[]; tel: string[]; email: string[] }[]>> {
    if (!deviceDetect.has('hasContactPicker')) {
      return { ok: false, reason: 'contacts_unsupported', fallback: 'manual_input' };
    }
    try {
      const contacts = await (navigator as unknown as { contacts: { select: (props: string[], opts?: object) => Promise<{ name: string[]; tel: string[]; email: string[] }[]> } })
        .contacts.select(['name', 'tel', 'email'], { multiple: true });
      return { ok: true, data: contacts };
    } catch (err: unknown) {
      logger.warn('cross-platform', 'contacts pick failed', { err });
      return { ok: false, reason: 'contacts_denied' };
    }
  }

  /* === BARCODE / QR DETECTOR === */

  async detectBarcode(image: ImageBitmapSource): Promise<CrossPlatformResult<{ rawValue: string; format: string }[]>> {
    if (!deviceDetect.has('hasBarcodeDetector')) {
      return { ok: false, reason: 'barcode_unsupported', fallback: 'use_zxing_lib' };
    }
    try {
      const BarcodeDetector = (window as { BarcodeDetector?: new (opts?: object) => { detect: (img: ImageBitmapSource) => Promise<{ rawValue: string; format: string }[]> } }).BarcodeDetector;
      if (!BarcodeDetector) return { ok: false, reason: 'barcode_unsupported' };
      const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] });
      const codes = await detector.detect(image);
      return { ok: true, data: codes };
    } catch (err: unknown) {
      logger.warn('cross-platform', 'barcode detect failed', { err });
      return { ok: false, reason: 'barcode_error' };
    }
  }

  /* === iOS SPECIFIC === */

  /**
   * Génère un Apple Wallet pkpass via worker. iOS only.
   */
  async generateApplePass(_data: object): Promise<CrossPlatformResult<{ pkpassUrl: string }>> {
    if (deviceDetect.detect().os !== 'ios') {
      return { ok: false, reason: 'apple_pass_ios_only' };
    }
    /* Génération réelle via Cloudflare Worker (signed pkpass) */
    /* Stub : prêt à wire avec service worker apex-pkpass-worker */
    return { ok: false, reason: 'apple_pass_worker_pending', fallback: 'qr_code' };
  }

  /**
   * Deep link Siri Shortcuts. iOS only.
   */
  openSiriShortcut(action: string, params: Record<string, string> = {}): boolean {
    if (deviceDetect.detect().os !== 'ios') return false;
    try {
      const url = new URL(`apex-ai://shortcut/${encodeURIComponent(action)}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      window.location.href = url.toString();
      return true;
    } catch {
      return false;
    }
  }

  /* === ANDROID SPECIFIC === */

  /**
   * Intent URL pour lancer app Android (Tasker, Maps, etc.).
   */
  openAndroidIntent(intent: { package: string; action?: string; extras?: Record<string, string> }): boolean {
    if (deviceDetect.detect().os !== 'android') return false;
    try {
      let url = `intent://${intent.action ?? ''}#Intent;package=${intent.package};`;
      if (intent.extras) {
        for (const [k, v] of Object.entries(intent.extras)) {
          url += `S.${k}=${encodeURIComponent(v)};`;
        }
      }
      url += 'end';
      window.location.href = url;
      return true;
    } catch {
      return false;
    }
  }

  /* === BATCH PERMISSIONS REQUEST === */

  /**
   * Demande plusieurs permissions en parallèle (1-clic Kevin règle).
   * Toujours sur user gesture (caller responsable).
   */
  async requestAllPermissions(features: ('notifications' | 'geolocation' | 'camera' | 'microphone')[]): Promise<Record<string, PermissionState | 'unsupported'>> {
    const results: Record<string, PermissionState | 'unsupported'> = {};

    await Promise.all(
      features.map(async (f) => {
        try {
          if (f === 'notifications') {
            if (typeof Notification === 'undefined') {
              results[f] = 'unsupported';
              return;
            }
            const r = await Notification.requestPermission();
            results[f] = r as PermissionState;
            return;
          }
          if (f === 'geolocation' && deviceDetect.has('hasGeolocation')) {
            await new Promise<void>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                () => { results[f] = 'granted'; resolve(); },
                (err) => { results[f] = err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'; resolve(); },
                { timeout: 8000 },
              );
            });
            return;
          }
          if (f === 'camera' || f === 'microphone') {
            if (!deviceDetect.has('hasGetUserMedia')) {
              results[f] = 'unsupported';
              return;
            }
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: f === 'camera',
                audio: f === 'microphone',
              });
              stream.getTracks().forEach((t) => t.stop());
              results[f] = 'granted';
            } catch {
              results[f] = 'denied';
            }
            return;
          }
          results[f] = 'unsupported';
        } catch (err: unknown) {
          logger.warn('cross-platform', `permission ${f} failed`, { err });
          results[f] = 'denied';
        }
      }),
    );

    return results;
  }
}

export const crossPlatform = new CrossPlatform();

/* Type declarations for browser APIs not in standard lib.dom.d.ts */
interface BluetoothLEScanFilter {
  services?: string[];
  name?: string;
  namePrefix?: string;
}
interface BluetoothDevice {
  id: string;
  name?: string;
}
interface WakeLockSentinel {
  release(): Promise<void>;
}
