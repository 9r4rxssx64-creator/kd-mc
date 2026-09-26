/**
 * APEX v13 — Device Context (fingerprint + geolocation + notifications + CGU).
 *
 * Demande Kevin (2026-05-03) :
 * "Reconnaître les appareils de tout le monde, intégré la géolocalisation,
 *  les notifications qui travaillent toujours même en arrière-plan sur n'importe
 *  quel appareil, le CGU, toutes ces choses."
 *
 * Centralise :
 * 1. Device fingerprint (UA + screen + timezone + langs + canvas hash)
 * 2. Geolocation (Permissions API + cooldown 5 min CLAUDE.md règle)
 * 3. Notifications background (Service Worker push)
 * 4. CGU consent universel (rgpd-compliant, opt-in tracé)
 *
 * Anti-pattern Kevin :
 * - Pas de cookie tracker tiers (privacy-first)
 * - Cooldown permissions (5 min entre demandes)
 * - Ne re-demande JAMAIS si déjà accepté/refusé (state persisté)
 * - Bannière CGU une seule fois par device
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export interface DeviceFingerprint {
  device_id: string;
  user_agent: string;
  platform: string;
  screen: string;
  timezone: string;
  languages: readonly string[];
  is_mobile: boolean;
  is_pwa: boolean;
  canvas_hash: string;
  first_seen: number;
  last_seen: number;
}

export interface ConsentRecord {
  feature: string;
  accepted: boolean;
  ts: number;
  device_id: string;
  ttl_days?: number;
}

class DeviceContext {
  /* === DEVICE FINGERPRINT === */

  /**
   * Génère/récupère device ID stable pour cet appareil (PWA-friendly).
   */
  getDeviceId(): string {
    try {
      let id = localStorage.getItem('apex_v13_device_id');
      if (!id) {
        id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        localStorage.setItem('apex_v13_device_id', id);
      }
      return id;
    } catch {
      return 'dev_anonymous';
    }
  }

  /**
   * Calcule fingerprint complet de l'appareil.
   */
  getFingerprint(): DeviceFingerprint {
    const id = this.getDeviceId();
    const stored = this.loadFingerprint(id);
    const now = Date.now();
    const fp: DeviceFingerprint = {
      device_id: id,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
      platform: typeof navigator !== 'undefined' ? navigator.platform : '',
      screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
      timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
      languages: typeof navigator !== 'undefined' ? [...navigator.languages] : [],
      is_mobile: this.detectMobile(),
      is_pwa: this.detectPwa(),
      canvas_hash: this.computeCanvasHash(),
      first_seen: stored?.first_seen ?? now,
      last_seen: now,
    };
    this.persistFingerprint(fp);
    return fp;
  }

  /**
   * Liste tous appareils connus de ce user (admin dashboard).
   */
  listKnownDevices(): DeviceFingerprint[] {
    try {
      const raw = localStorage.getItem('apex_v13_known_devices');
      if (!raw) return [];
      return JSON.parse(raw) as DeviceFingerprint[];
    } catch {
      return [];
    }
  }

  /**
   * Marque un device comme trusted (admin Kevin only).
   */
  trustDevice(deviceId: string): boolean {
    try {
      const trusted = JSON.parse(localStorage.getItem('apex_v13_trusted_devices') ?? '[]') as string[];
      if (!trusted.includes(deviceId)) trusted.push(deviceId);
      localStorage.setItem('apex_v13_trusted_devices', JSON.stringify(trusted));
      void auditLog.record('device.trust', { details: { deviceId } });
      return true;
    } catch {
      return false;
    }
  }

  isDeviceTrusted(deviceId: string): boolean {
    try {
      const trusted = JSON.parse(localStorage.getItem('apex_v13_trusted_devices') ?? '[]') as string[];
      return trusted.includes(deviceId);
    } catch {
      return false;
    }
  }

  /* === GEOLOCATION (CLAUDE.md règle 5 min cooldown) === */

  /**
   * Demande geolocation avec cooldown anti-spam (5 min).
   */
  async getLocation(): Promise<{ lat: number; lon: number; accuracy: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    /* Cooldown 5 min */
    try {
      const last = Number(localStorage.getItem('apex_v13_last_geo_ask') ?? '0');
      if (Date.now() - last < 5 * 60 * 1000) {
        /* Retourne dernier connu si trop tôt */
        const cached = localStorage.getItem('apex_v13_last_location');
        if (cached) return JSON.parse(cached) as { lat: number; lon: number; accuracy: number };
      }
    } catch {
      /* ignore */
    }
    /* Permissions API check (anti-prompt-spam si denied) */
    if (typeof navigator.permissions !== 'undefined') {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') return null;
      } catch {
        /* fall through */
      }
    }
    /* Demande position */
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          try {
            localStorage.setItem('apex_v13_last_location', JSON.stringify(loc));
            localStorage.setItem('apex_v13_last_geo_ask', String(Date.now()));
          } catch {
            /* ignore */
          }
          resolve(loc);
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
      );
    });
  }

  /* === NOTIFICATIONS BACKGROUND === */

  /**
   * Demande permission notifications (cooldown 5 min).
   */
  async requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') return 'unsupported';
    /* Cooldown 5 min */
    try {
      const last = Number(localStorage.getItem('apex_v13_last_notif_ask') ?? '0');
      if (Date.now() - last < 5 * 60 * 1000) return Notification.permission;
    } catch {
      /* ignore */
    }
    /* Si déjà refusé → ne pas re-demander (anti-spam Kevin règle) */
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    try {
      const result = await Notification.requestPermission();
      try {
        localStorage.setItem('apex_v13_last_notif_ask', String(Date.now()));
      } catch {
        /* ignore */
      }
      return result;
    } catch {
      return 'denied';
    }
  }

  /**
   * Send notification (foreground + Service Worker pour background).
   */
  async sendNotification(
    title: string,
    options: { body?: string; icon?: string; tag?: string; requireInteraction?: boolean } = {},
  ): Promise<boolean> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    /* Visible si app pas focus (background) */
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
    try {
      /* Préfère Service Worker (background-friendly) si dispo */
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, options);
          return true;
        }
      }
      /* Fallback Notification API directe */
      new Notification(title, options);
      return true;
    } catch (err: unknown) {
      logger.warn('device-context', 'sendNotification failed', { err });
      return false;
    }
  }

  /* === CGU CONSENT === */

  /**
   * CGU universel : check + ask si pas déjà donné.
   * (CLAUDE.md règle CGU universel v9.448)
   */
  async askConsent(feature: string, options: { ttlDays?: number; description?: string } = {}): Promise<boolean> {
    const consents = this.loadConsents();
    const existing = consents.find((c) => c.feature === feature);
    /* Already accepted within TTL */
    if (existing?.accepted) {
      if (!existing.ttl_days) return true;
      const age = (Date.now() - existing.ts) / (24 * 60 * 60 * 1000);
      if (age <= existing.ttl_days) return true;
    }
    /* Already refused */
    if (existing?.accepted === false) return false;

    /* Wire admin-prompt modal-sheet (anti-pattern Kevin : pas confirm() natif iPhone PWA) */
    const desc = options.description ?? `Apex demande accès à ${feature}.`;
    let accepted = false;
    try {
      const { adminPrompt } = await import('../admin/admin-prompt.js');
      accepted = await adminPrompt.askConfirm({
        title: `Accès ${feature}`,
        message: desc,
        primaryLabel: 'Accepter',
        cancelLabel: 'Refuser',
      });
    } catch {
      /* Fallback ultime si admin-prompt échoue (env test/SSR) : window.confirm */
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        accepted = window.confirm(`${desc}\n\nAccepter ?`);
      }
    }
    this.recordConsent(feature, accepted, options.ttlDays);
    return accepted;
  }

  /**
   * Vérifie consent sans demander.
   */
  hasConsent(feature: string): boolean {
    const consents = this.loadConsents();
    const existing = consents.find((c) => c.feature === feature);
    if (!existing?.accepted) return false;
    if (existing.ttl_days) {
      const age = (Date.now() - existing.ts) / (24 * 60 * 60 * 1000);
      if (age > existing.ttl_days) return false;
    }
    return true;
  }

  /**
   * Récolte consent explicite (admin/programmatic).
   */
  recordConsent(feature: string, accepted: boolean, ttlDays?: number): void {
    const consents = this.loadConsents();
    const existingIdx = consents.findIndex((c) => c.feature === feature);
    const record: ConsentRecord = {
      feature,
      accepted,
      ts: Date.now(),
      device_id: this.getDeviceId(),
      ...(ttlDays && { ttl_days: ttlDays }),
    };
    if (existingIdx >= 0) consents[existingIdx] = record;
    else consents.push(record);
    try {
      localStorage.setItem('apex_v13_consents', JSON.stringify(consents));
      void auditLog.record('consent.recorded', { details: { feature, accepted } });
    } catch (err: unknown) {
      logger.warn('device-context', 'recordConsent persist failed', { err });
    }
  }

  /**
   * Révoque un consent (RGPD Art. 7-3).
   */
  revokeConsent(feature: string): void {
    this.recordConsent(feature, false);
  }

  /**
   * Liste tous consents donnés (RGPD dashboard).
   */
  listConsents(): readonly ConsentRecord[] {
    return this.loadConsents();
  }

  /* === Private helpers === */

  private loadFingerprint(deviceId: string): DeviceFingerprint | null {
    try {
      const all = this.listKnownDevices();
      return all.find((d) => d.device_id === deviceId) ?? null;
    } catch {
      return null;
    }
  }

  private persistFingerprint(fp: DeviceFingerprint): void {
    try {
      const all = this.listKnownDevices();
      const idx = all.findIndex((d) => d.device_id === fp.device_id);
      if (idx >= 0) all[idx] = fp;
      else all.push(fp);
      /* Cap 10 max per user */
      const trimmed = all.length > 10 ? all.slice(-10) : all;
      localStorage.setItem('apex_v13_known_devices', JSON.stringify(trimmed));
    } catch {
      /* ignore */
    }
  }

  private detectMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  private detectPwa(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    /* iOS PWA check */
    return Boolean((window.navigator as { standalone?: boolean }).standalone);
  }

  private computeCanvasHash(): string {
    /* Light fingerprint via canvas (privacy-preserving — pas un tracker tiers) */
    if (typeof document === 'undefined') return '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#abc';
      ctx.fillRect(0, 0, 80, 30);
      ctx.fillStyle = '#000';
      ctx.fillText('apex', 2, 2);
      const data = canvas.toDataURL().slice(-50);
      /* Simple hash DJB2 */
      let hash = 5381;
      for (let i = 0; i < data.length; i++) hash = ((hash << 5) + hash + data.charCodeAt(i)) | 0;
      return (hash >>> 0).toString(16);
    } catch {
      return '';
    }
  }

  private loadConsents(): ConsentRecord[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_consents') ?? '[]') as ConsentRecord[];
    } catch {
      return [];
    }
  }
}

export const deviceContext = new DeviceContext();
