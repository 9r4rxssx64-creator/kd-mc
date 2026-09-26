/**
 * APEX v13.3.58 — Companion app detection (Kevin 2026-05-08).
 *
 * Démasque la stratégie B (Capacitor wrapper iOS Companion).
 *
 * Quand Apex tourne DANS l'app Companion native iOS (Capacitor) :
 * - `window.Capacitor` est défini
 * - `window.Capacitor.isNativePlatform()` retourne true
 * - Apex peut accéder à Bluetooth/NFC/USB via plugins natifs
 *
 * Quand Apex tourne DANS Safari iOS standalone :
 * - `window.Capacitor` undefined
 * - Apex doit fallback sur Strategies A/C/D/E/F (Worker, Shortcuts, Pushcut, etc.)
 *
 * Ce service expose un helper unifié pour le reste du code Apex.
 */

import { logger } from '../../core/logger.js';

/* ============================================================================
 * Types
 * ============================================================================ */

export interface CompanionInfo {
  /** True si Apex tourne dans Capacitor wrapper native */
  isCompanion: boolean;
  /** Plateforme : 'ios', 'android', 'web' */
  platform: 'ios' | 'android' | 'web';
  /** Si Companion : capacités exposées (BT/NFC/USB) */
  capabilities: {
    bluetooth: boolean;
    nfc: boolean;
    usb: boolean;
    backgroundFetch: boolean;
  };
  /** Version Companion app si dispo */
  version?: string;
}

interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  Plugins?: Record<string, unknown>;
}

interface WindowWithCapacitor extends Window {
  Capacitor?: CapacitorGlobal;
}

/* ============================================================================
 * Service
 * ============================================================================ */

class CompanionDetect {
  private cache: CompanionInfo | null = null;

  /**
   * Détecte si on est dans Companion app.
   * Cache le résultat (ne change pas en runtime).
   */
  detect(): CompanionInfo {
    if (this.cache) return this.cache;

    const w = (typeof window !== 'undefined' ? window : {}) as WindowWithCapacitor;
    const cap = w.Capacitor;

    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
      this.cache = {
        isCompanion: false,
        platform: 'web',
        capabilities: {
          bluetooth: false,
          nfc: false,
          usb: false,
          backgroundFetch: false,
        },
      };
      return this.cache;
    }

    const platform = (cap.getPlatform?.() ?? 'web') as 'ios' | 'android' | 'web';
    const plugins = cap.Plugins ?? {};

    this.cache = {
      isCompanion: true,
      platform,
      capabilities: {
        bluetooth: 'ApexBluetooth' in plugins,
        nfc: 'ApexNFC' in plugins,
        usb: 'ApexUSB' in plugins,
        backgroundFetch: platform === 'ios' || platform === 'android',
      },
    };

    logger.info('companion-detect', 'Companion app detected', this.cache as unknown as Record<string, unknown>);
    return this.cache;
  }

  /**
   * Helper : true si Companion + capability spécifique disponible.
   */
  hasCapability(cap: 'bluetooth' | 'nfc' | 'usb' | 'backgroundFetch'): boolean {
    const info = this.detect();
    return info.isCompanion && info.capabilities[cap];
  }

  /**
   * Reset cache (tests).
   */
  reset(): void {
    this.cache = null;
  }
}

export const companionDetect = new CompanionDetect();
