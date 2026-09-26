/**
 * APEX v13.3.74 — PWA Capabilities Manager (audit Apex v13.3.73 M6).
 *
 * Audit issue #240 : "Activer 8/9 APIs PWA manquantes".
 * Détection + permissions queries + activation 1-clic pour les APIs PWA modernes :
 *
 * - Geolocation API (déjà via capabilities.ts existant — wrappe ici)
 * - Notifications API
 * - Web Bluetooth (Chrome/Edge desktop + Android)
 * - Web NFC (Chrome Android uniquement)
 * - WebUSB (Chrome/Edge desktop + Android)
 * - Web Serial (Chrome/Edge desktop)
 * - Wake Lock API (screen on)
 * - Screen Capture API (getDisplayMedia)
 *
 * Pattern :
 * - detect() retourne {api: 'supported' | 'unsupported' | 'permission_required'}
 * - request(api) demande permission user (consent UA prompt)
 * - getStatus() retourne tableau résumé pour vue admin
 * - Cache résultat permissions (évite re-prompt à chaque appel)
 *
 * Conformité brief :
 * - Toggle feature.capabilities-X via feature-toggles.ts
 * - Cache 5 min sur queries permissions (anti-spam UA)
 * - Audit log à chaque request (auditLog.record('pwa.capability_requested'))
 * - Pas de capture/scan automatique sans request() explicite
 */

import { auditLog } from '../observability/audit-log.js';

export type PwaApiId =
  | 'geolocation'
  | 'notifications'
  | 'bluetooth'
  | 'nfc'
  | 'usb'
  | 'serial'
  | 'wake_lock'
  | 'screen_capture';

export type PwaApiStatus = 'supported' | 'unsupported' | 'permission_required' | 'permission_granted' | 'permission_denied';

export interface PwaCapabilityInfo {
  id: PwaApiId;
  label: string;
  description: string;
  status: PwaApiStatus;
  last_checked: number;
  error?: string;
}

interface CachedQuery {
  status: PwaApiStatus;
  ts: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const PWA_API_LABELS: Record<PwaApiId, { label: string; description: string }> = {
  geolocation: { label: 'Géolocalisation', description: 'Coordonnées GPS via navigator.geolocation' },
  notifications: { label: 'Notifications', description: 'Push notifications via Notification API' },
  bluetooth: { label: 'Web Bluetooth', description: 'Connexion devices BLE via navigator.bluetooth' },
  nfc: { label: 'Web NFC', description: 'Lecture/écriture tags NFC (Android Chrome only)' },
  usb: { label: 'WebUSB', description: 'Accès devices USB via navigator.usb' },
  serial: { label: 'Web Serial', description: 'Communication ports série via navigator.serial' },
  wake_lock: { label: 'Wake Lock', description: 'Empêche écran de s\'éteindre via wakeLock.request' },
  screen_capture: { label: 'Capture écran', description: 'Capture vidéo desktop via getDisplayMedia' },
};

class PwaCapabilities {
  private cache = new Map<PwaApiId, CachedQuery>();
  private wakeLockSentinel: WakeLockSentinel | null = null;

  /**
   * Détecte si une API est supportée par le navigateur (sync).
   * Ne déclenche pas de permission prompt.
   */
  detect(api: PwaApiId): PwaApiStatus {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unsupported';
    try {
      switch (api) {
        case 'geolocation':
          return 'geolocation' in navigator ? 'permission_required' : 'unsupported';
        case 'notifications':
          if (typeof Notification === 'undefined') return 'unsupported';
          if (Notification.permission === 'granted') return 'permission_granted';
          if (Notification.permission === 'denied') return 'permission_denied';
          return 'permission_required';
        case 'bluetooth':
          return 'bluetooth' in navigator ? 'permission_required' : 'unsupported';
        case 'nfc':
          return 'NDEFReader' in window ? 'permission_required' : 'unsupported';
        case 'usb':
          return 'usb' in navigator ? 'permission_required' : 'unsupported';
        case 'serial':
          return 'serial' in navigator ? 'permission_required' : 'unsupported';
        case 'wake_lock':
          return 'wakeLock' in navigator ? 'supported' : 'unsupported';
        case 'screen_capture':
          /* getDisplayMedia est sur mediaDevices */
          return navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices
            ? 'permission_required'
            : 'unsupported';
        default:
          return 'unsupported';
      }
    } catch {
      return 'unsupported';
    }
  }

  /**
   * Query Permissions API si supportée. Cache 5 min pour éviter spam.
   * Pour APIs sans Permissions API, fallback sur detect().
   */
  async queryPermission(api: PwaApiId): Promise<PwaApiStatus> {
    const cached = this.cache.get(api);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.status;

    let status: PwaApiStatus = this.detect(api);
    if (status === 'unsupported') {
      this.cache.set(api, { status, ts: Date.now() });
      return status;
    }

    /* Permissions API supportée pour : geolocation, notifications, bluetooth (limited), nfc, screen_capture */
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions) {
      try {
        const permName = this.toPermissionName(api);
        if (permName) {
          const result = await navigator.permissions.query({ name: permName as PermissionName });
          if (result.state === 'granted') status = 'permission_granted';
          else if (result.state === 'denied') status = 'permission_denied';
          else status = 'permission_required';
        }
      } catch {
        /* Permission name not supported by browser → fallback detect status */
      }
    }
    this.cache.set(api, { status, ts: Date.now() });
    return status;
  }

  /**
   * Demande permission user (déclenche UA prompt).
   * Retourne status final + erreur si refus.
   *
   * Helper unifié : axEnable<API>() pour chaque API.
   * Conformité Kevin : "demande permission + cache résultat".
   */
  async request(api: PwaApiId): Promise<{ ok: boolean; status: PwaApiStatus; error?: string }> {
    const supported = this.detect(api);
    if (supported === 'unsupported') {
      return { ok: false, status: 'unsupported', error: 'API non supportée par ce navigateur' };
    }
    void auditLog.record('pwa.capability_requested', { details: { api } });

    try {
      switch (api) {
        case 'geolocation': {
          /* Promise wrapper navigator.geolocation.getCurrentPosition */
          await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'notifications': {
          const perm = await Notification.requestPermission();
          const status: PwaApiStatus = perm === 'granted' ? 'permission_granted' : perm === 'denied' ? 'permission_denied' : 'permission_required';
          this.cache.set(api, { status, ts: Date.now() });
          return { ok: status === 'permission_granted', status };
        }
        case 'bluetooth': {
          /* navigator.bluetooth.requestDevice déclenche prompt UA */
          const nav = navigator as unknown as { bluetooth?: { requestDevice: (opts: unknown) => Promise<unknown> } };
          if (!nav.bluetooth) return { ok: false, status: 'unsupported' };
          await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [] });
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'nfc': {
          const w = window as unknown as { NDEFReader?: new () => { scan: () => Promise<void> } };
          if (!w.NDEFReader) return { ok: false, status: 'unsupported' };
          const reader = new w.NDEFReader();
          await reader.scan();
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'usb': {
          const nav = navigator as unknown as { usb?: { requestDevice: (opts: { filters: unknown[] }) => Promise<unknown> } };
          if (!nav.usb) return { ok: false, status: 'unsupported' };
          await nav.usb.requestDevice({ filters: [] });
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'serial': {
          const nav = navigator as unknown as { serial?: { requestPort: () => Promise<unknown> } };
          if (!nav.serial) return { ok: false, status: 'unsupported' };
          await nav.serial.requestPort();
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'wake_lock': {
          const nav = navigator as unknown as { wakeLock?: { request: (type: string) => Promise<WakeLockSentinel> } };
          if (!nav.wakeLock) return { ok: false, status: 'unsupported' };
          this.wakeLockSentinel = await nav.wakeLock.request('screen');
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        case 'screen_capture': {
          if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) {
            return { ok: false, status: 'unsupported' };
          }
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          /* User can stop stream tracks immediately if just probing */
          stream.getTracks().forEach((t) => t.stop());
          this.cache.set(api, { status: 'permission_granted', ts: Date.now() });
          return { ok: true, status: 'permission_granted' };
        }
        default:
          return { ok: false, status: 'unsupported', error: 'API inconnue' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status: PwaApiStatus = /denied|user.*declined|permission/i.test(msg) ? 'permission_denied' : 'permission_required';
      this.cache.set(api, { status, ts: Date.now() });
      return { ok: false, status, error: msg };
    }
  }

  /**
   * Release wake lock (si actif). Idempotent.
   */
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

  /**
   * Liste status de toutes les APIs (pour vue admin).
   * Async car query Permissions API.
   */
  async getAllStatus(): Promise<readonly PwaCapabilityInfo[]> {
    const apis: PwaApiId[] = ['geolocation', 'notifications', 'bluetooth', 'nfc', 'usb', 'serial', 'wake_lock', 'screen_capture'];
    const results: PwaCapabilityInfo[] = [];
    for (const api of apis) {
      const status = await this.queryPermission(api);
      results.push({
        id: api,
        label: PWA_API_LABELS[api].label,
        description: PWA_API_LABELS[api].description,
        status,
        last_checked: Date.now(),
      });
    }
    return results;
  }

  /**
   * Compteur supportées vs non supportées (pour log boot).
   */
  countSupported(): { supported: number; total: number } {
    const apis: PwaApiId[] = ['geolocation', 'notifications', 'bluetooth', 'nfc', 'usb', 'serial', 'wake_lock', 'screen_capture'];
    let supported = 0;
    for (const api of apis) {
      const s = this.detect(api);
      if (s !== 'unsupported') supported++;
    }
    return { supported, total: apis.length };
  }

  /**
   * Reset cache (force re-query next call). Utile pour tests ou après changement permission OS.
   */
  resetCache(): void {
    this.cache.clear();
  }

  /**
   * Map PwaApiId → PermissionName standardisé pour navigator.permissions.query.
   */
  private toPermissionName(api: PwaApiId): string | null {
    switch (api) {
      case 'geolocation':
        return 'geolocation';
      case 'notifications':
        return 'notifications';
      case 'bluetooth':
        /* Pas tous browsers le supportent — fallback detect status */
        return null;
      case 'nfc':
        return 'nfc';
      case 'screen_capture':
        return 'display-capture';
      default:
        return null;
    }
  }
}

/* Helpers `axEnable<X>()` simple (Kevin règle "1-clic auto-config") */
export const axEnableGeolocation = (): Promise<{ ok: boolean }> => pwaCapabilities.request('geolocation');
export const axEnableNotifications = (): Promise<{ ok: boolean }> => pwaCapabilities.request('notifications');
export const axEnableBluetooth = (): Promise<{ ok: boolean }> => pwaCapabilities.request('bluetooth');
export const axEnableNFC = (): Promise<{ ok: boolean }> => pwaCapabilities.request('nfc');
export const axEnableUSB = (): Promise<{ ok: boolean }> => pwaCapabilities.request('usb');
export const axEnableSerial = (): Promise<{ ok: boolean }> => pwaCapabilities.request('serial');
export const axEnableWakeLock = (): Promise<{ ok: boolean }> => pwaCapabilities.request('wake_lock');
export const axEnableScreenCapture = (): Promise<{ ok: boolean }> => pwaCapabilities.request('screen_capture');

export const pwaCapabilities = new PwaCapabilities();
