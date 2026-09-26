/**
 * APEX v13 — Device Detect (cross-platform iOS + Android + Desktop).
 *
 * Demande Kevin (CLAUDE.md règle "TOUS NAVIGATEURS + TOUTES PLATEFORMES") :
 * "Toujours pousser au max" + "100/100 réel chaque axe" + commercialisation
 *  doit marcher iOS Safari PWA + Android Chrome + Desktop tous browsers.
 *
 * Ce service :
 * 1. Détecte 30+ Web APIs disponibles (feature detection, pas UA sniffing aveugle)
 * 2. Identifie OS/browser/PWA mode pour adapter UX
 * 3. Donne recommandedFeatures() pour activer tools device-specific
 * 4. Estimate quotas storage / cores / memory
 * 5. Network connectivity (4G/3G/Save-Data)
 *
 * Anti-pattern Kevin :
 * - Pas de UA regex aveugle (sniff = casse-gueule)
 * - Feature detection en priorité (`'NDEFReader' in window`)
 * - UA juste pour OS/browser identification (pas pour features)
 * - Cache résultat par session (détection coûteuse pas répétée)
 *
 * Source : APPLE_IOS_SKILLS.md + ANDROID_SKILLS.md + AUTOMATION_HUB.md
 */

import { logger } from '../../core/logger.js';

export type OS = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'chromeos' | 'unknown';
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'unknown';
export type EffectiveType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

export interface DeviceCapabilities {
  /* === IDENTIFICATION === */
  os: OS;
  os_version: string;
  browser: Browser;
  browser_version: string;
  isPWA: boolean;
  isStandalone: boolean;
  hasTouch: boolean;
  isMobile: boolean;
  isTablet: boolean;

  /* === HARDWARE === */
  hasWebBluetooth: boolean;
  hasWebNFC: boolean;
  hasNDEF: boolean;
  hasWebUSB: boolean;
  hasWebSerial: boolean;
  hasWebMIDI: boolean;
  hasWebHID: boolean;
  hasWebGPU: boolean;
  hasGyro: boolean;
  hasMotion: boolean;
  hasGeolocation: boolean;
  hasVibration: boolean;

  /* === STORAGE / FS === */
  hasFileSystemAccess: boolean;
  hasOPFS: boolean;
  hasIndexedDB: boolean;
  hasLocalStorage: boolean;

  /* === MEDIA === */
  hasShare: boolean;
  hasShareTarget: boolean;
  hasMediaSession: boolean;
  hasMediaCapabilities: boolean;
  hasGetUserMedia: boolean;
  hasBarcodeDetector: boolean;
  hasFaceDetector: boolean;
  hasImageCapture: boolean;
  hasScreenCapture: boolean;

  /* === LIFE / POWER === */
  hasWakeLock: boolean;
  hasBattery: boolean;
  hasIdleDetection: boolean;
  hasContactPicker: boolean;

  /* === IDENTITY / PAYMENT === */
  hasWebAuthn: boolean;
  hasCredentialsAPI: boolean;
  hasPaymentRequest: boolean;
  hasApplePay: boolean;
  hasGooglePay: boolean;

  /* === NOTIF / PUSH === */
  hasNotifications: boolean;
  hasPushAPI: boolean;
  hasBackgroundSync: boolean;
  hasPeriodicBackgroundSync: boolean;
  hasBadging: boolean;

  /* === CONNECTIVITY === */
  isOnline: boolean;
  effectiveType: EffectiveType;
  saveData: boolean;
  downlink: number;
  rtt: number;

  /* === LIMITS === */
  storageQuotaMB: number;
  cpuCores: number;
  memoryGB: number;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;

  /* === LOCALE === */
  language: string;
  languages: readonly string[];
  timezone: string;

  /* === SECURITY === */
  isSecureContext: boolean;
  hasCSP: boolean;
}

class DeviceDetect {
  private cache: DeviceCapabilities | null = null;

  /**
   * Détecte toutes les capacités de l'appareil. Cache par session.
   */
  detect(forceRefresh = false): DeviceCapabilities {
    if (this.cache && !forceRefresh) return this.cache;
    const caps = this.computeCapabilities();
    this.cache = caps;
    logger.info('device-detect', `${caps.os}/${caps.browser} PWA=${caps.isPWA}`, {
      features: this.activeFeatureCount(caps),
    });
    return caps;
  }

  /**
   * Compte le nombre de features actives (sur ~40+).
   */
  activeFeatureCount(caps?: DeviceCapabilities): number {
    const c = caps ?? this.detect();
    let count = 0;
    for (const v of Object.values(c)) {
      if (v === true) count++;
    }
    return count;
  }

  /**
   * Helpers OS rapides.
   */
  isiOS(): boolean {
    return this.detect().os === 'ios';
  }

  isAndroid(): boolean {
    return this.detect().os === 'android';
  }

  isMacOS(): boolean {
    return this.detect().os === 'macos';
  }

  isWindows(): boolean {
    return this.detect().os === 'windows';
  }

  isPWA(): boolean {
    return this.detect().isPWA;
  }

  isMobile(): boolean {
    return this.detect().isMobile;
  }

  isDesktop(): boolean {
    const c = this.detect();
    return !c.isMobile && !c.isTablet;
  }

  /**
   * Liste des features recommandées pour cet appareil.
   * Pour vue admin "Mes capacités" et activation auto.
   */
  recommendedFeatures(): string[] {
    const c = this.detect();
    const features: string[] = [];

    /* Multi-platform must-have */
    if (c.hasNotifications) features.push('Notifications push');
    if (c.hasGeolocation) features.push('Géolocalisation');
    if (c.hasShare) features.push('Web Share API');
    if (c.hasWebAuthn) features.push('WebAuthn FaceID/TouchID');
    if (c.hasGetUserMedia) features.push('Caméra + micro');

    /* iOS specific */
    if (c.os === 'ios') {
      if (!c.isPWA) features.push('Add to Home Screen (PWA install)');
      if (c.hasApplePay) features.push('Apple Pay');
      features.push('Siri Shortcuts (apex-ai:// deep link)');
      features.push('Apple Wallet pkpass (via worker)');
      if (c.hasShare) features.push('Partage iOS natif');
    }

    /* Android specific */
    if (c.os === 'android') {
      if (c.hasWebBluetooth) features.push('Web Bluetooth (devices BLE)');
      if (c.hasWebNFC) features.push('Web NFC (tags read/write)');
      if (c.hasWebUSB) features.push('Web USB (Yubikey, Arduino)');
      if (c.hasWebSerial) features.push('Web Serial (devices dev)');
      if (c.hasWebMIDI) features.push('Web MIDI (musique studio)');
      if (c.hasGooglePay) features.push('Google Pay');
      features.push('Intent URLs (Tasker, autres apps)');
      if (c.hasContactPicker) features.push('Contact Picker');
    }

    /* Desktop specific */
    if (this.isDesktop()) {
      if (c.hasFileSystemAccess) features.push('File System Access (gros fichiers)');
      if (c.hasWebHID) features.push('Web HID (gamepad, clavier custom)');
      if (c.hasWebGPU) features.push('WebGPU (calcul ML local)');
      if (c.hasScreenCapture) features.push('Capture d\'écran');
    }

    /* Universel utiles */
    if (c.hasBattery) features.push('Battery API');
    if (c.hasWakeLock) features.push('Wake Lock (écran allumé)');
    if (c.hasIdleDetection) features.push('Idle Detection');
    if (c.hasBarcodeDetector) features.push('Barcode/QR Detector natif');
    if (c.hasVibration) features.push('Vibration haptic feedback');
    if (c.hasOPFS) features.push('OPFS (stockage 50 MB+)');
    if (c.hasPushAPI) features.push('Push API');
    if (c.hasBackgroundSync) features.push('Background Sync');

    return features;
  }

  /**
   * Liste des features INDISPONIBLES (avec raison).
   */
  unavailableFeatures(): { feature: string; reason: string }[] {
    const c = this.detect();
    const list: { feature: string; reason: string }[] = [];

    if (!c.hasWebBluetooth) {
      list.push({
        feature: 'Web Bluetooth',
        reason: c.os === 'ios' ? 'Non supporté sur iOS Safari' : 'Browser ne supporte pas',
      });
    }
    if (!c.hasWebNFC) {
      list.push({
        feature: 'Web NFC',
        reason: c.os === 'ios' ? 'Non supporté sur iOS' : 'Chrome Android uniquement',
      });
    }
    if (!c.hasWebUSB) {
      list.push({
        feature: 'Web USB',
        reason: 'Chromium-based browsers uniquement (pas Firefox/Safari)',
      });
    }
    if (!c.hasFileSystemAccess) {
      list.push({
        feature: 'File System Access',
        reason: 'Chrome/Edge desktop uniquement',
      });
    }
    if (!c.hasWebGPU) {
      list.push({
        feature: 'WebGPU',
        reason: 'Browsers récents uniquement (Chrome 113+, Safari 18+)',
      });
    }
    if (!c.hasNotifications) {
      list.push({
        feature: 'Notifications',
        reason: c.os === 'ios' && !c.isPWA ? 'iOS requiert PWA installée (16.4+)' : 'Browser ne supporte pas',
      });
    }
    if (!c.hasIdleDetection) {
      list.push({
        feature: 'Idle Detection',
        reason: 'Chromium uniquement, requires permission',
      });
    }

    return list;
  }

  /**
   * Vérifie un feature flag par son nom (pour wrappers cross-platform).
   */
  has(featureName: keyof DeviceCapabilities): boolean {
    const c = this.detect();
    return Boolean(c[featureName]);
  }

  /**
   * Estime la qualité réseau pour adapter qualité IA (text-only si 2G).
   */
  networkQuality(): 'high' | 'medium' | 'low' {
    const c = this.detect();
    if (c.saveData) return 'low';
    if (c.effectiveType === '4g' && c.downlink >= 5) return 'high';
    if (c.effectiveType === '4g' || c.effectiveType === '3g') return 'medium';
    return 'low';
  }

  /* ============== PRIVATE COMPUTATION ============== */

  private computeCapabilities(): DeviceCapabilities {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
    const os = this.detectOS(ua, platform);
    const browser = this.detectBrowser(ua);

    return {
      /* Identification */
      os,
      os_version: this.detectOSVersion(ua, os),
      browser,
      browser_version: this.detectBrowserVersion(ua, browser),
      isPWA: this.detectPWA(),
      isStandalone: this.detectStandalone(),
      hasTouch: this.detectTouch(),
      isMobile: this.detectMobile(ua, os),
      isTablet: this.detectTablet(ua, os),

      /* Hardware */
      hasWebBluetooth: this.hasAPI('bluetooth', navigator),
      hasWebNFC: this.hasAPI('NDEFReader', window),
      hasNDEF: this.hasAPI('NDEFReader', window),
      hasWebUSB: this.hasAPI('usb', navigator),
      hasWebSerial: this.hasAPI('serial', navigator),
      hasWebMIDI: this.hasMethod(navigator, 'requestMIDIAccess'),
      hasWebHID: this.hasAPI('hid', navigator),
      hasWebGPU: this.hasAPI('gpu', navigator),
      hasGyro: this.hasAPI('Gyroscope', window),
      hasMotion: this.hasAPI('DeviceMotionEvent', window),
      hasGeolocation: this.hasAPI('geolocation', navigator),
      hasVibration: this.hasMethod(navigator, 'vibrate'),

      /* Storage / FS */
      hasFileSystemAccess: this.hasAPI('showOpenFilePicker', window),
      hasOPFS: this.hasOPFSSupport(),
      hasIndexedDB: this.hasAPI('indexedDB', window),
      hasLocalStorage: this.hasAPI('localStorage', window),

      /* Media */
      hasShare: this.hasMethod(navigator, 'share'),
      hasShareTarget: this.detectShareTarget(),
      hasMediaSession: this.hasAPI('mediaSession', navigator),
      hasMediaCapabilities: this.hasAPI('mediaCapabilities', navigator),
      hasGetUserMedia: this.hasMethod(navigator.mediaDevices ?? {}, 'getUserMedia'),
      hasBarcodeDetector: this.hasAPI('BarcodeDetector', window),
      hasFaceDetector: this.hasAPI('FaceDetector', window),
      hasImageCapture: this.hasAPI('ImageCapture', window),
      hasScreenCapture: this.hasMethod(navigator.mediaDevices ?? {}, 'getDisplayMedia'),

      /* Life / power */
      hasWakeLock: this.hasAPI('wakeLock', navigator),
      hasBattery: this.hasMethod(navigator, 'getBattery'),
      hasIdleDetection: this.hasAPI('IdleDetector', window),
      hasContactPicker: this.hasMethod((navigator as unknown as { contacts?: unknown }).contacts ?? {}, 'select'),

      /* Identity / payment */
      hasWebAuthn: this.hasAPI('PublicKeyCredential', window),
      hasCredentialsAPI: this.hasAPI('credentials', navigator),
      hasPaymentRequest: this.hasAPI('PaymentRequest', window),
      hasApplePay: this.detectApplePay(os),
      hasGooglePay: this.detectGooglePay(),

      /* Notif / push */
      hasNotifications: this.hasAPI('Notification', window),
      hasPushAPI: this.detectPushAPI(),
      hasBackgroundSync: this.detectBackgroundSync(),
      hasPeriodicBackgroundSync: this.detectPeriodicBackgroundSync(),
      hasBadging: this.hasMethod(navigator, 'setAppBadge'),

      /* Connectivity */
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      effectiveType: this.detectEffectiveType(),
      saveData: this.detectSaveData(),
      downlink: this.detectDownlink(),
      rtt: this.detectRTT(),

      /* Limits */
      storageQuotaMB: this.estimateStorageQuota(),
      cpuCores: this.detectCPUCores(),
      memoryGB: this.detectMemory(),
      pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
      screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,

      /* Locale */
      language: typeof navigator !== 'undefined' ? navigator.language : 'fr',
      languages: typeof navigator !== 'undefined' ? [...navigator.languages] : ['fr'],
      timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',

      /* Security */
      isSecureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
      hasCSP: this.detectCSP(),
    };
  }

  private detectOS(ua: string, platform: string): OS {
    if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && this.detectTouch())) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Win/i.test(platform) || /Windows/.test(ua)) return 'windows';
    if (/Mac/i.test(platform) && !this.detectTouch()) return 'macos';
    if (/CrOS/.test(ua)) return 'chromeos';
    if (/Linux/i.test(platform)) return 'linux';
    return 'unknown';
  }

  private detectOSVersion(ua: string, os: OS): string {
    try {
      if (os === 'ios') {
        const m = /OS (\d+)_(\d+)(?:_(\d+))?/.exec(ua);
        if (m) return `${m[1]}.${m[2]}${m[3] ? `.${m[3]}` : ''}`;
      }
      if (os === 'android') {
        const m = /Android (\d+(?:\.\d+)?)/.exec(ua);
        if (m) return m[1] ?? '';
      }
      if (os === 'macos') {
        const m = /Mac OS X (\d+[._]\d+(?:[._]\d+)?)/.exec(ua);
        if (m && m[1]) return m[1].replace(/_/g, '.');
      }
      if (os === 'windows') {
        const m = /Windows NT (\d+\.\d+)/.exec(ua);
        if (m) return m[1] ?? '';
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  private detectBrowser(ua: string): Browser {
    /* Order matters : Edge avant Chrome (Edge inclut "Chrome" dans UA) */
    if (/Edg\//.test(ua)) return 'edge';
    if (/SamsungBrowser/.test(ua)) return 'samsung';
    if (/OPR\/|Opera/.test(ua)) return 'opera';
    if (/Firefox/.test(ua)) return 'firefox';
    if (/Chrome/.test(ua) && !/Chromium/.test(ua)) return 'chrome';
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari';
    return 'unknown';
  }

  private detectBrowserVersion(ua: string, browser: Browser): string {
    try {
      const map: Record<Browser, RegExp | null> = {
        chrome: /Chrome\/(\d+\.\d+)/,
        edge: /Edg\/(\d+\.\d+)/,
        firefox: /Firefox\/(\d+\.\d+)/,
        safari: /Version\/(\d+\.\d+)/,
        samsung: /SamsungBrowser\/(\d+\.\d+)/,
        opera: /OPR\/(\d+\.\d+)/,
        unknown: null,
      };
      const re = map[browser];
      if (re) {
        const m = re.exec(ua);
        if (m) return m[1] ?? '';
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  private detectPWA(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    /* iOS PWA standalone navigator flag */
    return Boolean((window.navigator as { standalone?: boolean }).standalone);
  }

  private detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  }

  private detectTouch(): boolean {
    if (typeof navigator === 'undefined') return false;
    if ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) return true;
    if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
    return false;
  }

  private detectMobile(ua: string, os: OS): boolean {
    if (os === 'ios') return /iPhone|iPod/.test(ua);
    if (os === 'android') return /Mobile/.test(ua);
    return /Mobi|Android|iPhone/.test(ua);
  }

  private detectTablet(ua: string, os: OS): boolean {
    if (os === 'ios') return /iPad/.test(ua);
    if (os === 'android') return /Android/.test(ua) && !/Mobile/.test(ua);
    return /Tablet/.test(ua);
  }

  private hasAPI(key: string, target: unknown): boolean {
    if (target === undefined || target === null) return false;
    try {
      return key in (target as object);
    } catch {
      return false;
    }
  }

  private hasMethod(target: unknown, method: string): boolean {
    if (target === undefined || target === null) return false;
    try {
      return typeof (target as Record<string, unknown>)[method] === 'function';
    } catch {
      return false;
    }
  }

  private hasOPFSSupport(): boolean {
    try {
      return typeof navigator !== 'undefined'
        && 'storage' in navigator
        && typeof navigator.storage.getDirectory === 'function';
    } catch {
      return false;
    }
  }

  private detectShareTarget(): boolean {
    /* Web Share Target = manifest.json action — détectable côté config, pas runtime */
    /* On retourne true si Web Share API + PWA installable (heuristique) */
    return this.hasMethod(navigator, 'share') && this.detectPWA();
  }

  private detectApplePay(os: OS): boolean {
    if (os !== 'ios' && os !== 'macos') return false;
    try {
      return typeof window !== 'undefined' && 'ApplePaySession' in window
        && Boolean((window as { ApplePaySession?: { canMakePayments?: () => boolean } }).ApplePaySession?.canMakePayments?.());
    } catch {
      return false;
    }
  }

  private detectGooglePay(): boolean {
    /* Google Pay via PaymentRequest — disponible si PaymentRequest API présente */
    /* Détection précise nécessite google.payments.api.PaymentsClient (script chargé) */
    return this.hasAPI('PaymentRequest', window);
  }

  private detectPushAPI(): boolean {
    if (typeof window === 'undefined') return false;
    /* Push API requiert Service Worker + PushManager */
    return 'PushManager' in window && 'serviceWorker' in navigator;
  }

  private detectBackgroundSync(): boolean {
    if (typeof window === 'undefined') return false;
    /* Background Sync = ServiceWorkerRegistration.sync */
    return 'serviceWorker' in navigator && 'SyncManager' in window;
  }

  private detectPeriodicBackgroundSync(): boolean {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PeriodicSyncManager' in window;
  }

  private detectEffectiveType(): EffectiveType {
    try {
      const conn = (navigator as { connection?: { effectiveType?: string } }).connection;
      if (conn?.effectiveType) {
        const t = conn.effectiveType;
        if (t === '4g' || t === '3g' || t === '2g' || t === 'slow-2g') return t;
      }
    } catch {
      /* ignore */
    }
    return 'unknown';
  }

  private detectSaveData(): boolean {
    try {
      const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
      return Boolean(conn?.saveData);
    } catch {
      return false;
    }
  }

  private detectDownlink(): number {
    try {
      const conn = (navigator as { connection?: { downlink?: number } }).connection;
      return conn?.downlink ?? 0;
    } catch {
      return 0;
    }
  }

  private detectRTT(): number {
    try {
      const conn = (navigator as { connection?: { rtt?: number } }).connection;
      return conn?.rtt ?? 0;
    } catch {
      return 0;
    }
  }

  private estimateStorageQuota(): number {
    /* Estimation basée sur OS + browser (vraie API navigator.storage.estimate() async) */
    const c = { os: this.detectOS(typeof navigator !== 'undefined' ? navigator.userAgent : '', typeof navigator !== 'undefined' ? navigator.platform : '') };
    /* iOS Safari : ~5 MB localStorage, ~50 MB IDB */
    if (c.os === 'ios') return 50;
    /* Android Chrome : 80% disk free */
    if (c.os === 'android') return 500;
    /* Desktop : généreux */
    return 1000;
  }

  private detectCPUCores(): number {
    if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
      return navigator.hardwareConcurrency || 1;
    }
    return 1;
  }

  private detectMemory(): number {
    /* Device Memory API (Chrome only, approximation 0.25/0.5/1/2/4/8 GB) */
    try {
      const mem = (navigator as { deviceMemory?: number }).deviceMemory;
      return mem ?? 4; /* Fallback raisonnable */
    } catch {
      return 4;
    }
  }

  private detectCSP(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return Boolean(meta);
    } catch {
      return false;
    }
  }
}

export const deviceDetect = new DeviceDetect();
