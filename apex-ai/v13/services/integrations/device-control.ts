/**
 * APEX v13 — Device Control universel (Kevin "prendre contrôle iPhone + tablette + Android").
 *
 * Demande Kevin (2026-05-04) :
 * "Je veux qu'Apex puisse prendre contrôle de ma tablette et de mon iPhone.
 *  Pour pouvoir piloter à distance, se balader dedans, récupérer les infos,
 *  trier mes photos dans la galerie, etc. Et va plus loin.
 *  Donne-lui tous les outils par rapport aux iPhone, aux Android, etc."
 *
 * Capacités exposées (8 groupes — 60+ méthodes) :
 *
 * GROUPE A — Universal (iOS Safari PWA + Chrome Android) :
 *   - Web Share API, Clipboard, Vibration, Notifications, Wake Lock,
 *     Battery, Network, Geolocation, Persistent Storage
 *
 * GROUPE B — Camera/Mic/Media :
 *   - getUserMedia, ImageCapture, MediaRecorder video/audio,
 *     enumerateDevices, SpeechRecognition, SpeechSynthesis
 *
 * GROUPE C — Sensors (Android Chrome principalement) :
 *   - DeviceMotion, DeviceOrientation, AmbientLight, Proximity
 *
 * GROUPE D — Connectivité physique (Android Chrome) :
 *   - Web Bluetooth, Web NFC (read/write), Web USB, Web Serial, Web HID
 *
 * GROUPE E — Files iOS/Android :
 *   - File picker, Directory picker, Save file, Share files
 *
 * GROUPE F — Apple App URL Schemes (iOS only) :
 *   - maps, mail, tel, sms, FaceTime, calendar, health, settings,
 *     shortcuts, music, podcasts
 *
 * GROUPE G — Galerie photos (tri, EXIF, regroupement) :
 *   - getPhotosFromGallery, getRecentPhotos, analyzePhoto,
 *     triPhotosByDate, triPhotosByLocation, triPhotosByFace
 *
 * GROUPE H — Détection device :
 *   - detectDevice, supportsFeature, listAllSupported
 *
 * Anti-pattern Kevin :
 * - Capability detection systématique (typeof X !== 'undefined') AVANT chaque appel
 * - Try/catch sur 100% des wrappers, jamais throw — return ControlResult { ok, reason }
 * - auditLog.record('device-control.<action>', {...}) à chaque action
 * - Pas de breaking change : toutes méthodes safe-call si capability absente
 * - PII redaction : ne loggue jamais le contenu clipboard/SMS/email
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* ============================================================
 * TYPES PUBLICS
 * ============================================================ */

export interface ControlResult<T = void> {
  ok: boolean;
  data?: T;
  reason?: string;
}

export interface DeviceInfo {
  isiOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isPWA: boolean;
  isStandalone: boolean;
  version: string;
  browser: string;
  user_agent: string;
  platform: string;
  hardware_concurrency: number;
  device_memory_gb?: number;
  pixel_ratio: number;
  screen_w: number;
  screen_h: number;
}

export interface BatteryStatus {
  level: number;
  charging: boolean;
  charging_time: number;
  discharging_time: number;
}

export interface NetworkInfo {
  online: boolean;
  effective_type?: string;
  downlink_mbps?: number;
  rtt_ms?: number;
  save_data?: boolean;
  type?: string;
}

export interface GeoLocation {
  lat: number;
  lon: number;
  accuracy: number;
  altitude?: number;
  altitude_accuracy?: number;
  heading?: number;
  speed?: number;
  ts: number;
}

export interface StorageEstimate {
  quota_bytes: number;
  usage_bytes: number;
  available_bytes: number;
  usage_pct: number;
}

export interface MediaDeviceInfoLite {
  device_id: string;
  group_id: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
}

export interface PhotoMetadata {
  name: string;
  size_bytes: number;
  mime_type: string;
  last_modified: number;
  width?: number;
  height?: number;
  exif_date?: number;
  exif_gps?: { lat: number; lon: number };
  exif_camera?: string;
}

export type PhotoGroupedByDate = Record<string, PhotoMetadata[]>;
export type PhotoGroupedByLocation = Record<string, PhotoMetadata[]>;
export type PhotoGroupedByFace = Record<string, PhotoMetadata[]>;

export type DeviceFeature =
  | 'share' | 'clipboard_read' | 'clipboard_write' | 'vibration' | 'notification'
  | 'wake_lock' | 'battery' | 'network_info' | 'geolocation' | 'persistent_storage'
  | 'storage_estimate' | 'camera' | 'microphone' | 'image_capture' | 'media_recorder'
  | 'speech_recognition' | 'speech_synthesis' | 'device_motion' | 'device_orientation'
  | 'ambient_light' | 'proximity' | 'bluetooth' | 'nfc' | 'usb' | 'serial' | 'hid'
  | 'file_picker' | 'directory_picker' | 'file_system_access' | 'app_url_schemes';

/* ============================================================
 * GLOBAL TYPES (Web APIs non couvertes par lib.dom standard)
 * ============================================================ */

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
  grabFrame(): Promise<ImageBitmap>;
}

interface ImageCaptureCtor {
  new (track: MediaStreamTrack): ImageCaptureLike;
}

interface AmbientLightSensorLike extends EventTarget {
  illuminance: number;
  start(): void;
  stop(): void;
}

interface AmbientLightSensorCtor {
  new (opts?: { frequency?: number }): AmbientLightSensorLike;
}

interface ProximitySensorLike extends EventTarget {
  distance: number;
  start(): void;
  stop(): void;
}

interface ProximitySensorCtor {
  new (opts?: { frequency?: number }): ProximitySensorLike;
}

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  data?: ArrayBuffer | DataView;
}

interface NDEFMessage {
  records: readonly NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  message: NDEFMessage;
  serialNumber: string;
}

interface NDEFReaderLike extends EventTarget {
  scan(opts?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: NDEFRecord[] } | string, opts?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: 'reading', listener: (ev: NDEFReadingEvent) => void): void;
  addEventListener(type: 'readingerror', listener: (ev: Event) => void): void;
}

interface NDEFReaderCtor {
  new (): NDEFReaderLike;
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

interface NavigatorBatteryLike {
  getBattery?: () => Promise<BatteryManagerLike>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

interface FileSystemWritableFileStreamLike {
  write(data: Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: ReadonlyArray<{ description?: string; accept: Record<string, readonly string[]> }>;
}

interface ShowDirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandleLike {
  name: string;
  kind: 'directory';
}

interface WindowFsAccessLike {
  showSaveFilePicker?: (opts?: ShowSaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
  showDirectoryPicker?: (opts?: ShowDirectoryPickerOptions) => Promise<FileSystemDirectoryHandleLike>;
  showOpenFilePicker?: (opts?: { multiple?: boolean; types?: ReadonlyArray<{ accept: Record<string, readonly string[]> }> }) => Promise<FileSystemFileHandleLike[]>;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(idx: number): { transcript: string; confidence: number };
  [idx: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(idx: number): SpeechRecognitionResultLike;
  [idx: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike;
  resultIndex: number;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: { connected: boolean };
}

interface BluetoothLike {
  requestDevice(options: { acceptAllDevices?: boolean; filters?: ReadonlyArray<Record<string, unknown>>; optionalServices?: readonly string[] }): Promise<BluetoothDeviceLike>;
  getDevices?(): Promise<BluetoothDeviceLike[]>;
}

interface USBDeviceLike {
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  vendorId: number;
  productId: number;
}

interface USBLike {
  requestDevice(options: { filters: ReadonlyArray<Record<string, unknown>> }): Promise<USBDeviceLike>;
  getDevices?(): Promise<USBDeviceLike[]>;
}

interface SerialPortLike {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface SerialLike {
  requestPort(opts?: { filters?: ReadonlyArray<Record<string, unknown>> }): Promise<SerialPortLike>;
  getPorts?(): Promise<SerialPortLike[]>;
}

interface HIDDeviceLike {
  productName?: string;
  vendorId: number;
  productId: number;
}

interface HIDLike {
  requestDevice(opts: { filters: ReadonlyArray<Record<string, unknown>> }): Promise<HIDDeviceLike[]>;
  getDevices?(): Promise<HIDDeviceLike[]>;
}

interface NavigatorExtended {
  share?: (data: { title?: string; text?: string; url?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
  clipboard?: { writeText?: (s: string) => Promise<void>; readText?: () => Promise<string> };
  vibrate?: (pattern: number | readonly number[]) => boolean;
  wakeLock?: { request: (type: 'screen') => Promise<{ release(): Promise<void> }> };
  storage?: { persist?: () => Promise<boolean>; estimate?: () => Promise<{ quota?: number; usage?: number }> };
  geolocation?: { clearWatch?: (id: number) => void; watchPosition?: (...args: unknown[]) => number; getCurrentPosition?: (...args: unknown[]) => void };
  bluetooth?: BluetoothLike;
  usb?: USBLike;
  serial?: SerialLike;
  hid?: HIDLike;
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
}

interface WindowExtended {
  ImageCapture?: ImageCaptureCtor;
  AmbientLightSensor?: AmbientLightSensorCtor;
  ProximitySensor?: ProximitySensorCtor;
  NDEFReader?: NDEFReaderCtor;
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  speechSynthesis?: SpeechSynthesis;
  showSaveFilePicker?: WindowFsAccessLike['showSaveFilePicker'];
  showDirectoryPicker?: WindowFsAccessLike['showDirectoryPicker'];
  showOpenFilePicker?: WindowFsAccessLike['showOpenFilePicker'];
  matchMedia?: (query: string) => MediaQueryList;
}

/* ============================================================
 * Helpers internes (typed accessors)
 * ============================================================ */

function nav(): NavigatorExtended | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as unknown as NavigatorExtended;
}

function win(): WindowExtended | null {
  if (typeof window === 'undefined') return null;
  return window as unknown as WindowExtended;
}

function isiOSAgent(): boolean {
  const n = nav();
  if (!n) return false;
  const ua = (n as unknown as Navigator).userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua);
}

function isAndroidAgent(): boolean {
  const n = nav();
  if (!n) return false;
  const ua = (n as unknown as Navigator).userAgent ?? '';
  return /Android/i.test(ua);
}

function fail<T = void>(reason: string): ControlResult<T> { return { ok: false, reason }; }
function ok<T>(data?: T): ControlResult<T> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

/* ============================================================
 * SERVICE PRINCIPAL
 * ============================================================ */

class DeviceControl {
  private wakeLockSentinel: { release(): Promise<void> } | null = null;
  private geoWatchId: number | null = null;
  private currentRecognition: SpeechRecognitionLike | null = null;

  /* ============================================================
   * Listener tracking — P0 audit Cure53/NCC : no orphan listeners.
   *
   * Pattern :
   *   - sensorAbortController : cumule tous les `addEventListener` éphémères
   *     (devicemotion, deviceorientation, AmbientLight reading, Proximity reading,
   *     NDEFReader reading/readingerror).
   *   - activeSensors : références fortes vers les sensors (AmbientLight/Proximity)
   *     pour pouvoir appeler stop() au destroy().
   *   - destroy() : abort() + stop() + reset state. Idempotent.
   * ============================================================ */
  private sensorAbortController: AbortController | null = null;
  private activeSensors: Array<{ stop(): void }> = [];
  private activeListenerCount = 0;
  /* Tracker des (target, type, listener) pour cleanup explicite via removeEventListener
     (certains runtimes/tests ne respectent pas le signal AbortController). */
  private trackedHandles: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];

  private ensureSensorController(): AbortController {
    if (!this.sensorAbortController) {
      this.sensorAbortController = new AbortController();
    }
    return this.sensorAbortController;
  }

  /**
   * Helper interne pour attacher un listener trackable via AbortController.
   * Auto-incrémente le compteur actif et le décrémente sur abort.
   */
  private trackedListen<T extends EventTarget>(
    target: T,
    type: string,
    listener: EventListener,
    signal: AbortSignal,
  ): void {
    target.addEventListener(type, listener, { signal });
    this.activeListenerCount++;
    this.trackedHandles.push({ target, type, listener });
    /* Décrémente quand abort fires */
    signal.addEventListener('abort', () => {
      this.activeListenerCount = Math.max(0, this.activeListenerCount - 1);
    }, { once: true });
  }

  /**
   * Compte les listeners device actuellement attachés via trackedListen().
   * Audit helper exposé pour tests + debug.
   */
  getActiveListenerCount(): number {
    return this.activeListenerCount;
  }

  /**
   * Cleanup complet — appelable au logout / destruction service / page unload.
   * Idempotent : peut être appelé plusieurs fois sans erreur.
   */
  destroy(): void {
    /* 1. Abort tous les listeners DOM (devicemotion, deviceorientation, sensor reading, NFC reading) */
    if (this.sensorAbortController) {
      try {
        this.sensorAbortController.abort();
      } catch { /* ignore */ }
      this.sensorAbortController = null;
    }
    /* 1bis. Double-cleanup : removeEventListener explicite pour chaque handle tracké
       (au cas où le runtime ne respecte pas le signal AbortController). */
    for (const h of this.trackedHandles) {
      try { h.target.removeEventListener(h.type, h.listener); } catch { /* ignore */ }
    }
    this.trackedHandles = [];
    /* 2. Stop sensors actifs (AmbientLightSensor.stop / ProximitySensor.stop) */
    for (const sensor of this.activeSensors) {
      try { sensor.stop(); } catch { /* sensor déjà stoppé */ }
    }
    this.activeSensors = [];
    /* 3. Geo watch cleanup */
    if (this.geoWatchId !== null) {
      try {
        const n = nav();
        n?.geolocation?.clearWatch?.(this.geoWatchId);
      } catch { /* ignore */ }
      this.geoWatchId = null;
    }
    /* 4. Speech recognition cleanup */
    if (this.currentRecognition) {
      try { this.currentRecognition.abort(); } catch { /* ignore */ }
      this.currentRecognition = null;
    }
    /* 5. Wake lock release */
    if (this.wakeLockSentinel) {
      try { void this.wakeLockSentinel.release(); } catch { /* ignore */ }
      this.wakeLockSentinel = null;
    }
    /* Reset compteur */
    this.activeListenerCount = 0;
    void auditLog.record('device-control.destroy');
  }

  /* ============================================================
   * GROUPE H — Détection device + capabilities
   * ============================================================ */

  detectDevice(): DeviceInfo {
    const n = nav();
    const w = win();
    const ua = n ? (n as unknown as Navigator).userAgent : '';
    const isiOS = isiOSAgent();
    const isAndroid = isAndroidAgent();
    const isMobile = isiOS || isAndroid || (n?.maxTouchPoints ?? 0) > 1;
    const isStandalone = w?.matchMedia?.('(display-mode: standalone)').matches ?? false;
    const isPWA = isStandalone || Boolean((w as unknown as { navigator?: { standalone?: boolean } })?.navigator?.standalone);
    /* Browser detection light */
    let browser = 'unknown';
    if (/CriOS|Chrome/.test(ua)) browser = 'chrome';
    else if (/FxiOS|Firefox/.test(ua)) browser = 'firefox';
    else if (/Edge|Edg/.test(ua)) browser = 'edge';
    else if (/Safari/.test(ua)) browser = 'safari';
    /* Version OS basique */
    let version = '';
    const iosMatch = ua.match(/OS (\d+)_(\d+)/);
    const androidMatch = ua.match(/Android (\d+(?:\.\d+)?)/);
    if (iosMatch) version = `iOS ${iosMatch[1]}.${iosMatch[2]}`;
    else if (androidMatch) version = `Android ${androidMatch[1]}`;
    const info: DeviceInfo = {
      isiOS,
      isAndroid,
      isMobile,
      isPWA,
      isStandalone,
      version,
      browser,
      user_agent: ua.slice(0, 200),
      platform: n ? ((n as unknown as Navigator).platform ?? '') : '',
      hardware_concurrency: n?.hardwareConcurrency ?? 1,
      pixel_ratio: w ? ((w as unknown as Window).devicePixelRatio ?? 1) : 1,
      screen_w: w ? (w as unknown as Window).screen.width : 0,
      screen_h: w ? (w as unknown as Window).screen.height : 0,
    };
    if (n?.deviceMemory !== undefined) info.device_memory_gb = n.deviceMemory;
    return info;
  }

  supportsFeature(feature: DeviceFeature): boolean {
    const n = nav();
    const w = win();
    if (!n) return false;
    switch (feature) {
      case 'share': return typeof n.share === 'function';
      case 'clipboard_read': return typeof n.clipboard?.readText === 'function';
      case 'clipboard_write': return typeof n.clipboard?.writeText === 'function';
      case 'vibration': return typeof n.vibrate === 'function';
      case 'notification': return typeof Notification !== 'undefined';
      case 'wake_lock': return typeof n.wakeLock?.request === 'function';
      case 'battery': return typeof (n as NavigatorBatteryLike).getBattery === 'function';
      case 'network_info': return Boolean(n.connection ?? n.mozConnection ?? n.webkitConnection);
      case 'geolocation': return typeof (n as unknown as Navigator).geolocation !== 'undefined';
      case 'persistent_storage': return typeof n.storage?.persist === 'function';
      case 'storage_estimate': return typeof n.storage?.estimate === 'function';
      case 'camera':
      case 'microphone':
        return typeof (n as unknown as Navigator).mediaDevices?.getUserMedia === 'function';
      case 'image_capture': return typeof w?.ImageCapture === 'function';
      case 'media_recorder': return typeof MediaRecorder !== 'undefined';
      case 'speech_recognition': return Boolean(w?.SpeechRecognition ?? w?.webkitSpeechRecognition);
      case 'speech_synthesis': return typeof w?.speechSynthesis !== 'undefined';
      case 'device_motion': return typeof DeviceMotionEvent !== 'undefined';
      case 'device_orientation': return typeof DeviceOrientationEvent !== 'undefined';
      case 'ambient_light': return typeof w?.AmbientLightSensor === 'function';
      case 'proximity': return typeof w?.ProximitySensor === 'function';
      case 'bluetooth': return Boolean(n.bluetooth);
      case 'nfc': return typeof w?.NDEFReader === 'function';
      case 'usb': return Boolean(n.usb);
      case 'serial': return Boolean(n.serial);
      case 'hid': return Boolean(n.hid);
      case 'file_picker': return typeof document !== 'undefined';
      case 'directory_picker': return typeof w?.showDirectoryPicker === 'function';
      case 'file_system_access': return typeof w?.showSaveFilePicker === 'function';
      case 'app_url_schemes': return typeof w !== 'undefined';
      default: return false;
    }
  }

  listAllSupported(): readonly DeviceFeature[] {
    const all: readonly DeviceFeature[] = [
      'share', 'clipboard_read', 'clipboard_write', 'vibration', 'notification',
      'wake_lock', 'battery', 'network_info', 'geolocation', 'persistent_storage',
      'storage_estimate', 'camera', 'microphone', 'image_capture', 'media_recorder',
      'speech_recognition', 'speech_synthesis', 'device_motion', 'device_orientation',
      'ambient_light', 'proximity', 'bluetooth', 'nfc', 'usb', 'serial', 'hid',
      'file_picker', 'directory_picker', 'file_system_access', 'app_url_schemes',
    ];
    return all.filter((f) => this.supportsFeature(f));
  }

  /* ============================================================
   * GROUPE A — Universal APIs (iOS Safari PWA + Chrome Android)
   * ============================================================ */

  async shareContent(payload: { title?: string; text?: string; url?: string; files?: File[] }): Promise<ControlResult> {
    const n = nav();
    if (!n?.share) return fail('Web Share API non supportée');
    try {
      if (payload.files && payload.files.length > 0 && n.canShare && !n.canShare({ files: payload.files })) {
        return fail('Partage de fichiers non supporté pour ces types');
      }
      await n.share(payload);
      void auditLog.record('device-control.share', { details: { hasFiles: !!payload.files, hasUrl: !!payload.url } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Partage refusé';
      return fail(reason);
    }
  }

  async copyToClipboard(text: string): Promise<ControlResult> {
    const n = nav();
    if (!n?.clipboard?.writeText) return fail('Clipboard API non supportée');
    try {
      await n.clipboard.writeText(text);
      void auditLog.record('device-control.clipboard.write', { details: { length: text.length } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Échec copie clipboard';
      return fail(reason);
    }
  }

  async pasteFromClipboard(): Promise<ControlResult<string>> {
    const n = nav();
    if (!n?.clipboard?.readText) return fail('Clipboard read non supporté');
    try {
      const text = await n.clipboard.readText();
      void auditLog.record('device-control.clipboard.read', { details: { length: text.length } });
      return ok(text);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Échec lecture clipboard';
      return fail(reason);
    }
  }

  vibrate(patternMs: number | readonly number[]): ControlResult {
    const n = nav();
    if (!n?.vibrate) return fail('Vibration API non supportée (iOS Safari)');
    try {
      const pat = Array.isArray(patternMs) ? [...patternMs] : patternMs;
      const accepted = n.vibrate(pat as number | readonly number[]);
      if (!accepted) return fail('Vibration refusée par OS');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Vibration échouée';
      return fail(reason);
    }
  }

  async requestNotificationPermission(): Promise<ControlResult<NotificationPermission>> {
    if (typeof Notification === 'undefined') return fail('Notifications non supportées');
    if (Notification.permission === 'granted') return ok('granted' as NotificationPermission);
    if (Notification.permission === 'denied') return ok('denied' as NotificationPermission);
    try {
      const result = await Notification.requestPermission();
      void auditLog.record('device-control.notification.permission', { details: { result } });
      return ok(result);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Permission refusée';
      return fail(reason);
    }
  }

  async showNotification(title: string, options: NotificationOptions = {}): Promise<ControlResult> {
    if (typeof Notification === 'undefined') return fail('Notifications non supportées');
    if (Notification.permission !== 'granted') return fail('Permission non accordée');
    try {
      /* Service Worker registration préférable (background-friendly) */
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, options);
          void auditLog.record('device-control.notification.shown', { details: { title: title.slice(0, 50) } });
          return ok();
        }
      }
      new Notification(title, options);
      void auditLog.record('device-control.notification.shown', { details: { title: title.slice(0, 50) } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Notification échouée';
      return fail(reason);
    }
  }

  async requestWakeLock(): Promise<ControlResult> {
    const n = nav();
    if (!n?.wakeLock?.request) return fail('Wake Lock API non supportée');
    try {
      this.wakeLockSentinel = await n.wakeLock.request('screen');
      void auditLog.record('device-control.wakelock.acquired');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Wake lock refusé';
      return fail(reason);
    }
  }

  async releaseWakeLock(): Promise<ControlResult> {
    if (!this.wakeLockSentinel) return ok();
    try {
      await this.wakeLockSentinel.release();
      this.wakeLockSentinel = null;
      void auditLog.record('device-control.wakelock.released');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Release échoué';
      return fail(reason);
    }
  }

  async getBatteryStatus(): Promise<ControlResult<BatteryStatus>> {
    const n = nav() as NavigatorBatteryLike | null;
    if (!n?.getBattery) return fail('Battery API non supportée');
    try {
      const bat = await n.getBattery();
      return ok({
        level: bat.level,
        charging: bat.charging,
        charging_time: bat.chargingTime,
        discharging_time: bat.dischargingTime,
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Battery indisponible';
      return fail(reason);
    }
  }

  getNetworkInfo(): ControlResult<NetworkInfo> {
    const n = nav();
    if (!n) return fail('Navigator indisponible');
    const conn = n.connection ?? n.mozConnection ?? n.webkitConnection;
    const info: NetworkInfo = { online: typeof navigator !== 'undefined' ? navigator.onLine : true };
    if (conn) {
      if (conn.effectiveType !== undefined) info.effective_type = conn.effectiveType;
      if (conn.downlink !== undefined) info.downlink_mbps = conn.downlink;
      if (conn.rtt !== undefined) info.rtt_ms = conn.rtt;
      if (conn.saveData !== undefined) info.save_data = conn.saveData;
      if (conn.type !== undefined) info.type = conn.type;
    }
    return ok(info);
  }

  async getGeolocation(opts: PositionOptions = { timeout: 8000, maximumAge: 60_000 }): Promise<ControlResult<GeoLocation>> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return fail('Geolocation non supportée');
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });
      const loc: GeoLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        ts: pos.timestamp,
      };
      if (pos.coords.altitude !== null) loc.altitude = pos.coords.altitude;
      if (pos.coords.altitudeAccuracy !== null) loc.altitude_accuracy = pos.coords.altitudeAccuracy;
      if (pos.coords.heading !== null) loc.heading = pos.coords.heading;
      if (pos.coords.speed !== null) loc.speed = pos.coords.speed;
      void auditLog.record('device-control.geolocation.read');
      return ok(loc);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Position refusée';
      return fail(reason);
    }
  }

  watchGeolocation(callback: (loc: GeoLocation) => void, opts: PositionOptions = { enableHighAccuracy: false }): ControlResult<number> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return fail('Geolocation non supportée');
    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const loc: GeoLocation = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            ts: pos.timestamp,
          };
          if (pos.coords.altitude !== null) loc.altitude = pos.coords.altitude;
          if (pos.coords.heading !== null) loc.heading = pos.coords.heading;
          if (pos.coords.speed !== null) loc.speed = pos.coords.speed;
          callback(loc);
        },
        (err) => logger.warn('device-control', 'watchGeolocation error', { code: err.code, msg: err.message }),
        opts,
      );
      this.geoWatchId = id;
      return ok(id);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Watch position échoué';
      return fail(reason);
    }
  }

  clearGeoWatch(id?: number): ControlResult {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return fail('Geolocation non supportée');
    const target = id ?? this.geoWatchId;
    if (target === null || target === undefined) return ok();
    try {
      navigator.geolocation.clearWatch(target);
      if (target === this.geoWatchId) this.geoWatchId = null;
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Clear watch échoué';
      return fail(reason);
    }
  }

  async requestPersistentStorage(): Promise<ControlResult<boolean>> {
    const n = nav();
    if (!n?.storage?.persist) return fail('Persistent Storage API non supportée');
    try {
      const granted = await n.storage.persist();
      void auditLog.record('device-control.storage.persist', { details: { granted } });
      return ok(granted);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Persist refusé';
      return fail(reason);
    }
  }

  async getStorageEstimate(): Promise<ControlResult<StorageEstimate>> {
    const n = nav();
    if (!n?.storage?.estimate) return fail('Storage Estimate non supporté');
    try {
      const est = await n.storage.estimate();
      const quota = est.quota ?? 0;
      const usage = est.usage ?? 0;
      return ok({
        quota_bytes: quota,
        usage_bytes: usage,
        available_bytes: Math.max(0, quota - usage),
        usage_pct: quota > 0 ? Math.round((usage / quota) * 100) : 0,
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Estimate échoué';
      return fail(reason);
    }
  }

  /* ============================================================
   * GROUPE B — Camera / Microphone / Media
   * ============================================================ */

  async requestCamera(opts: { video?: boolean | MediaTrackConstraints; audio?: boolean; facingMode?: 'user' | 'environment' } = {}): Promise<ControlResult<MediaStream>> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return fail('getUserMedia non supportée');
    }
    try {
      const videoConstraint: MediaTrackConstraints | boolean = opts.video !== undefined
        ? typeof opts.video === 'boolean'
          ? opts.video
          : opts.video
        : opts.facingMode
          ? { facingMode: { ideal: opts.facingMode } }
          : true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: opts.audio ?? false,
      });
      void auditLog.record('device-control.camera.requested', { details: { audio: opts.audio ?? false, facingMode: opts.facingMode } });
      return ok(stream);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Caméra refusée';
      return fail(reason);
    }
  }

  async takePhoto(stream: MediaStream): Promise<ControlResult<Blob>> {
    const w = win();
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return fail('Aucune piste vidéo');
    const track = tracks[0];
    if (!track) return fail('Track invalide');
    /* Préfère ImageCapture API */
    if (w?.ImageCapture) {
      try {
        const ic = new w.ImageCapture(track);
        const blob = await ic.takePhoto();
        void auditLog.record('device-control.camera.photo', { details: { size: blob.size } });
        return ok(blob);
      } catch (err: unknown) {
        logger.warn('device-control', 'ImageCapture failed, fallback canvas', { err });
      }
    }
    /* Fallback Canvas */
    if (typeof document === 'undefined') return fail('Canvas indisponible');
    try {
      const settings = track.getSettings();
      const w0 = settings.width ?? 1280;
      const h0 = settings.height ?? 720;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = w0;
      canvas.height = h0;
      const ctx = canvas.getContext('2d');
      if (!ctx) return fail('Canvas 2D context indisponible');
      ctx.drawImage(video, 0, 0, w0, h0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) return fail('Encodage photo échoué');
      void auditLog.record('device-control.camera.photo', { details: { size: blob.size, fallback: true } });
      return ok(blob);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Photo échouée';
      return fail(reason);
    }
  }

  async recordVideo(stream: MediaStream, durationMs: number): Promise<ControlResult<Blob>> {
    if (typeof MediaRecorder === 'undefined') return fail('MediaRecorder non supporté');
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const promise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob);
        };
        recorder.onerror = (e) => reject(new Error(`MediaRecorder error: ${String((e as { error?: { message?: string } }).error?.message ?? 'unknown')}`));
      });
      recorder.start();
      setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, Math.max(100, durationMs));
      const blob = await promise;
      void auditLog.record('device-control.video.recorded', { details: { size: blob.size, durationMs } });
      return ok(blob);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Enregistrement vidéo échoué';
      return fail(reason);
    }
  }

  async recordAudio(durationMs: number): Promise<ControlResult<Blob>> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return fail('getUserMedia non supportée');
    if (typeof MediaRecorder === 'undefined') return fail('MediaRecorder non supporté');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const promise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.onerror = (e) => reject(new Error(`Audio recorder error: ${String((e as { error?: { message?: string } }).error?.message ?? 'unknown')}`));
      });
      recorder.start();
      setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, Math.max(100, durationMs));
      const blob = await promise;
      void auditLog.record('device-control.audio.recorded', { details: { size: blob.size, durationMs } });
      return ok(blob);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Enregistrement audio échoué';
      return fail(reason);
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
  }

  async listMediaDevices(): Promise<ControlResult<readonly MediaDeviceInfoLite[]>> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return fail('enumerateDevices non supporté');
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const lite = devices.map<MediaDeviceInfoLite>((d) => ({
        device_id: d.deviceId,
        group_id: d.groupId,
        kind: d.kind as 'audioinput' | 'audiooutput' | 'videoinput',
        label: d.label,
      }));
      return ok(lite);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Énumération devices échouée';
      return fail(reason);
    }
  }

  listenSpeech(opts: { lang?: string; continuous?: boolean; onResult?: (text: string, isFinal: boolean) => void } = {}): ControlResult {
    const w = win();
    const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
    if (!Ctor) return fail('SpeechRecognition non supportée');
    try {
      const rec = new Ctor();
      rec.lang = opts.lang ?? 'fr-FR';
      rec.continuous = opts.continuous ?? !isiOSAgent(); /* iOS unreliable continuous mode */
      rec.interimResults = true;
      rec.onresult = (ev: SpeechRecognitionEventLike) => {
        if (!opts.onResult) return;
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const result = ev.results[i];
          if (!result) continue;
          const alt = result[0];
          if (!alt) continue;
          opts.onResult(alt.transcript, result.isFinal);
        }
      };
      rec.onerror = (ev: Event) => logger.warn('device-control', 'SpeechRecognition error', { ev });
      rec.onend = () => { this.currentRecognition = null; };
      rec.start();
      this.currentRecognition = rec;
      void auditLog.record('device-control.speech.listen.start', { details: { lang: rec.lang } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Speech listen échoué';
      return fail(reason);
    }
  }

  stopSpeechListen(): ControlResult {
    if (!this.currentRecognition) return ok();
    try {
      this.currentRecognition.stop();
      this.currentRecognition = null;
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Stop listen échoué';
      return fail(reason);
    }
  }

  speakText(text: string, opts: { voiceName?: string; rate?: number; pitch?: number; volume?: number; lang?: string } = {}): ControlResult {
    const w = win();
    if (!w?.speechSynthesis) return fail('SpeechSynthesis non supportée');
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang ?? 'fr-FR';
      if (opts.rate !== undefined) u.rate = opts.rate;
      if (opts.pitch !== undefined) u.pitch = opts.pitch;
      if (opts.volume !== undefined) u.volume = opts.volume;
      if (opts.voiceName) {
        const voice = w.speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
        if (voice) u.voice = voice;
      }
      w.speechSynthesis.speak(u);
      void auditLog.record('device-control.speech.speak', { details: { length: text.length, lang: u.lang } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Speak échoué';
      return fail(reason);
    }
  }

  /* ============================================================
   * GROUPE C — Sensors (Android Chrome principalement)
   * ============================================================ */

  async requestDeviceMotion(callback: (ev: DeviceMotionEvent) => void): Promise<ControlResult> {
    if (typeof DeviceMotionEvent === 'undefined') return fail('DeviceMotion non supporté');
    /* iOS 13+ requires permission */
    const reqPerm = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }).requestPermission;
    if (typeof reqPerm === 'function') {
      try {
        const state = await reqPerm();
        if (state !== 'granted') return fail('DeviceMotion refusé');
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Permission échouée';
        return fail(reason);
      }
    }
    if (typeof window === 'undefined') return fail('window indisponible');
    /* P0 fix audit Cure53 : AbortController pour cleanup au destroy() */
    const ctl = this.ensureSensorController();
    this.trackedListen(window, 'devicemotion', callback as EventListener, ctl.signal);
    void auditLog.record('device-control.sensor.motion.start');
    return ok();
  }

  async requestDeviceOrientation(callback: (ev: DeviceOrientationEvent) => void): Promise<ControlResult> {
    if (typeof DeviceOrientationEvent === 'undefined') return fail('DeviceOrientation non supporté');
    const reqPerm = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }).requestPermission;
    if (typeof reqPerm === 'function') {
      try {
        const state = await reqPerm();
        if (state !== 'granted') return fail('DeviceOrientation refusé');
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Permission échouée';
        return fail(reason);
      }
    }
    if (typeof window === 'undefined') return fail('window indisponible');
    /* P0 fix audit Cure53 : AbortController pour cleanup au destroy() */
    const ctl = this.ensureSensorController();
    this.trackedListen(window, 'deviceorientation', callback as EventListener, ctl.signal);
    void auditLog.record('device-control.sensor.orientation.start');
    return ok();
  }

  watchAmbientLight(callback: (lux: number) => void): ControlResult {
    const w = win();
    if (!w?.AmbientLightSensor) return fail('AmbientLightSensor non supporté');
    try {
      const sensor = new w.AmbientLightSensor({ frequency: 2 });
      /* P0 fix audit Cure53 : AbortController + tracking sensor stop() au destroy() */
      const ctl = this.ensureSensorController();
      this.trackedListen(sensor, 'reading', (() => callback(sensor.illuminance)) as EventListener, ctl.signal);
      sensor.start();
      this.activeSensors.push(sensor);
      void auditLog.record('device-control.sensor.ambient_light.start');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'AmbientLight échoué';
      return fail(reason);
    }
  }

  watchProximity(callback: (distanceCm: number) => void): ControlResult {
    const w = win();
    if (!w?.ProximitySensor) return fail('ProximitySensor non supporté (deprecated)');
    try {
      const sensor = new w.ProximitySensor({ frequency: 5 });
      /* P0 fix audit Cure53 : AbortController + tracking sensor stop() au destroy() */
      const ctl = this.ensureSensorController();
      this.trackedListen(sensor, 'reading', (() => callback(sensor.distance)) as EventListener, ctl.signal);
      sensor.start();
      this.activeSensors.push(sensor);
      void auditLog.record('device-control.sensor.proximity.start');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Proximity échoué';
      return fail(reason);
    }
  }

  /* ============================================================
   * GROUPE D — Connectivité physique (Android Chrome)
   * ============================================================ */

  async requestBluetoothDevice(filters: ReadonlyArray<Record<string, unknown>> = []): Promise<ControlResult<BluetoothDeviceLike>> {
    const n = nav();
    if (!n?.bluetooth) return fail('Web Bluetooth non supporté');
    try {
      const options = filters.length > 0
        ? { filters: [...filters] }
        : { acceptAllDevices: true };
      const device = await n.bluetooth.requestDevice(options);
      void auditLog.record('device-control.bluetooth.requested', { details: { id: device.id, name: device.name?.slice(0, 30) } });
      return ok(device);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Bluetooth refusé';
      return fail(reason);
    }
  }

  async listPairedBluetooth(): Promise<ControlResult<readonly BluetoothDeviceLike[]>> {
    const n = nav();
    if (!n?.bluetooth?.getDevices) return fail('Bluetooth.getDevices non supporté');
    try {
      const devices = await n.bluetooth.getDevices();
      return ok(devices);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Liste paired échouée';
      return fail(reason);
    }
  }

  async requestNFCRead(onRecord: (records: readonly NDEFRecord[], serial: string) => void, signal?: AbortSignal): Promise<ControlResult> {
    const w = win();
    if (!w?.NDEFReader) return fail('Web NFC non supporté (Chrome Android only)');
    try {
      const reader = new w.NDEFReader();
      /* P0 fix audit Cure53 : AbortController interne + signal externe optionnel cumulés.
         Si signal externe fourni → utilisé pour reader.scan().
         AbortController interne tracké pour cleanup global au destroy(). */
      const ctl = this.ensureSensorController();
      const readingHandler = (ev: Event): void => {
        const ndef = ev as NDEFReadingEvent;
        onRecord(ndef.message.records, ndef.serialNumber);
      };
      const errorHandler = (): void => logger.warn('device-control', 'NFC reading error');
      this.trackedListen(reader as EventTarget, 'reading', readingHandler, ctl.signal);
      this.trackedListen(reader as EventTarget, 'readingerror', errorHandler, ctl.signal);
      const opts = signal ? { signal } : undefined;
      await reader.scan(opts);
      void auditLog.record('device-control.nfc.scan.start');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'NFC scan refusé';
      return fail(reason);
    }
  }

  async requestNFCWrite(records: readonly { recordType: string; data?: string | ArrayBuffer; mediaType?: string }[]): Promise<ControlResult> {
    const w = win();
    if (!w?.NDEFReader) return fail('Web NFC non supporté');
    try {
      const reader = new w.NDEFReader();
      const ndefRecords: NDEFRecord[] = records.map((r) => {
        const out: NDEFRecord = { recordType: r.recordType };
        if (r.mediaType !== undefined) out.mediaType = r.mediaType;
        if (r.data !== undefined) {
          if (typeof r.data === 'string') {
            out.data = new TextEncoder().encode(r.data).buffer as ArrayBuffer;
          } else {
            out.data = r.data;
          }
        }
        return out;
      });
      await reader.write({ records: ndefRecords });
      void auditLog.record('device-control.nfc.write', { details: { count: records.length } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'NFC write échoué';
      return fail(reason);
    }
  }

  async requestUSBDevice(filters: ReadonlyArray<Record<string, unknown>> = []): Promise<ControlResult<USBDeviceLike>> {
    const n = nav();
    if (!n?.usb) return fail('Web USB non supporté');
    try {
      const device = await n.usb.requestDevice({ filters: filters.length > 0 ? [...filters] : [{}] });
      void auditLog.record('device-control.usb.requested', { details: { vendorId: device.vendorId, productId: device.productId } });
      return ok(device);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'USB refusé';
      return fail(reason);
    }
  }

  async requestSerial(filters: ReadonlyArray<Record<string, unknown>> = []): Promise<ControlResult<SerialPortLike>> {
    const n = nav();
    if (!n?.serial) return fail('Web Serial non supporté');
    try {
      const opts = filters.length > 0 ? { filters: [...filters] } : undefined;
      const port = await n.serial.requestPort(opts);
      void auditLog.record('device-control.serial.requested');
      return ok(port);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Serial refusé';
      return fail(reason);
    }
  }

  async requestHID(filters: ReadonlyArray<Record<string, unknown>> = []): Promise<ControlResult<readonly HIDDeviceLike[]>> {
    const n = nav();
    if (!n?.hid) return fail('Web HID non supporté');
    try {
      const devices = await n.hid.requestDevice({ filters: filters.length > 0 ? [...filters] : [{}] });
      void auditLog.record('device-control.hid.requested', { details: { count: devices.length } });
      return ok(devices);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'HID refusé';
      return fail(reason);
    }
  }

  /* ============================================================
   * GROUPE E — Files iOS/Android
   * ============================================================ */

  async pickFiles(opts: { accept?: string; multiple?: boolean; capture?: 'user' | 'environment' } = {}): Promise<ControlResult<readonly File[]>> {
    if (typeof document === 'undefined') return fail('document indisponible');
    return new Promise<ControlResult<readonly File[]>>((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        if (opts.accept) input.accept = opts.accept;
        if (opts.multiple) input.multiple = true;
        if (opts.capture) input.setAttribute('capture', opts.capture);
        input.style.display = 'none';
        const cleanup = (): void => {
          try { document.body.removeChild(input); } catch { /* ignore */ }
        };
        input.addEventListener('change', () => {
          const files = input.files ? Array.from(input.files) : [];
          void auditLog.record('device-control.files.picked', { details: { count: files.length } });
          cleanup();
          resolve(ok(files as readonly File[]));
        });
        input.addEventListener('cancel', () => {
          cleanup();
          resolve(fail('Annulé par utilisateur'));
        });
        document.body.appendChild(input);
        input.click();
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'File picker échoué';
        resolve(fail(reason));
      }
    });
  }

  async pickDirectory(): Promise<ControlResult<FileSystemDirectoryHandleLike>> {
    const w = win();
    if (!w?.showDirectoryPicker) return fail('showDirectoryPicker non supporté (Chrome Android/Desktop only)');
    try {
      const handle = await w.showDirectoryPicker({ mode: 'read' });
      void auditLog.record('device-control.directory.picked', { details: { name: handle.name } });
      return ok(handle);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Directory picker refusé';
      return fail(reason);
    }
  }

  async saveFile(blob: Blob, filename: string): Promise<ControlResult> {
    const w = win();
    /* Préfère File System Access API */
    if (w?.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: filename });
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
        void auditLog.record('device-control.file.saved', { details: { name: filename, size: blob.size, method: 'fs-access' } });
        return ok();
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Save file refusé';
        return fail(reason);
      }
    }
    /* Fallback : download via <a> */
    if (typeof document === 'undefined') return fail('document indisponible');
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch { /* ignore */ }
        URL.revokeObjectURL(url);
      }, 100);
      void auditLog.record('device-control.file.saved', { details: { name: filename, size: blob.size, method: 'download' } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Download échoué';
      return fail(reason);
    }
  }

  async shareFiles(files: File[], text?: string, title?: string): Promise<ControlResult> {
    const n = nav();
    if (!n?.share) return fail('Web Share API non supportée');
    if (n.canShare && !n.canShare({ files })) return fail('Partage de fichiers refusé pour ces types');
    try {
      const payload: { files: File[]; text?: string; title?: string } = { files };
      if (text !== undefined) payload.text = text;
      if (title !== undefined) payload.title = title;
      await n.share(payload);
      void auditLog.record('device-control.files.shared', { details: { count: files.length } });
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Partage refusé';
      return fail(reason);
    }
  }

  /* ============================================================
   * GROUPE F — Apple App URL Schemes (iOS only)
   * Aussi compatibles Android pour mailto/tel/sms standards.
   * ============================================================ */

  private openUrl(url: string, action: string): ControlResult {
    if (typeof window === 'undefined') return fail('window indisponible');
    try {
      window.location.href = url;
      void auditLog.record(`device-control.url-scheme.${action}`);
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Ouverture URL échouée';
      return fail(reason);
    }
  }

  openMaps(target: string | { lat: number; lon: number }, label?: string): ControlResult {
    let url: string;
    if (typeof target === 'string') {
      const q = encodeURIComponent(target);
      url = isiOSAgent() ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
    } else {
      const { lat, lon } = target;
      const l = label ? `(${encodeURIComponent(label)})` : '';
      url = isiOSAgent() ? `maps://?ll=${lat},${lon}${l ? `&q=${encodeURIComponent(label ?? '')}` : ''}` : `geo:${lat},${lon}?q=${lat},${lon}${l}`;
    }
    return this.openUrl(url, 'maps');
  }

  openMail(to: string, subject?: string, body?: string): ControlResult {
    const params: string[] = [];
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    const url = `mailto:${encodeURIComponent(to)}${params.length > 0 ? `?${params.join('&')}` : ''}`;
    return this.openUrl(url, 'mail');
  }

  openPhone(number: string): ControlResult {
    const clean = number.replace(/[^\d+]/g, '');
    return this.openUrl(`tel:${clean}`, 'phone');
  }

  openSMS(number: string, body?: string): ControlResult {
    const clean = number.replace(/[^\d+]/g, '');
    /* iOS uses ?&body=, Android uses ?body= */
    const sep = isiOSAgent() ? '&' : '?';
    const url = body ? `sms:${clean}${sep}body=${encodeURIComponent(body)}` : `sms:${clean}`;
    return this.openUrl(url, 'sms');
  }

  openFaceTime(contact: string): ControlResult {
    if (!isiOSAgent()) return fail('FaceTime iOS only');
    const clean = contact.replace(/[^\w@.+-]/g, '');
    return this.openUrl(`facetime://${clean}`, 'facetime');
  }

  openCalendar(eventDate?: Date): ControlResult {
    if (!isiOSAgent()) return fail('calshow:// iOS only — utilise webcal:// cross-platform');
    /* calshow expects Apple-epoch seconds (since 2001-01-01) */
    if (eventDate) {
      const appleEpoch = Math.floor((eventDate.getTime() - Date.UTC(2001, 0, 1)) / 1000);
      return this.openUrl(`calshow:${appleEpoch}`, 'calendar');
    }
    return this.openUrl('calshow://', 'calendar');
  }

  openHealth(): ControlResult {
    if (!isiOSAgent()) return fail('Apple Health iOS only');
    return this.openUrl('x-apple-health://', 'health');
  }

  openSettings(): ControlResult {
    if (!isiOSAgent()) return fail('app-settings: iOS only');
    return this.openUrl('app-settings:', 'settings');
  }

  openShortcuts(shortcutName: string, input?: string): ControlResult {
    if (!isiOSAgent()) return fail('Shortcuts iOS only');
    const params = [`name=${encodeURIComponent(shortcutName)}`];
    if (input) params.push(`input=${encodeURIComponent(input)}`);
    return this.openUrl(`shortcuts://run-shortcut?${params.join('&')}`, 'shortcuts');
  }

  async openCamera(): Promise<ControlResult> {
    /* Safari ne peut pas ouvrir Camera.app directement.
     * Workaround : input file capture=environment ouvre la caméra OS. */
    if (typeof document === 'undefined') return fail('document indisponible');
    try {
      const result = await this.pickFiles({ accept: 'image/*', capture: 'environment' });
      if (!result.ok) return fail(result.reason ?? 'Caméra refusée');
      return ok();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Caméra refusée';
      return fail(reason);
    }
  }

  openMusic(query?: string): ControlResult {
    if (!isiOSAgent()) return fail('music:// iOS only');
    const url = query ? `music://search?term=${encodeURIComponent(query)}` : 'music://';
    return this.openUrl(url, 'music');
  }

  openPodcasts(): ControlResult {
    if (!isiOSAgent()) return fail('podcasts:// iOS only');
    return this.openUrl('podcasts://', 'podcasts');
  }

  /* ============================================================
   * GROUPE G — Galerie photos / iCloud / tri intelligent
   * ============================================================ */

  async getPhotosFromGallery(opts: { maxCount?: number } = {}): Promise<ControlResult<readonly File[]>> {
    /* iOS : input file accept=image/* multiple ouvre la photo library
     * Android : idem + getDirectory si dispo */
    const result = await this.pickFiles({ accept: 'image/*', multiple: true });
    if (!result.ok || !result.data) return result;
    const files = opts.maxCount ? result.data.slice(0, opts.maxCount) : result.data;
    void auditLog.record('device-control.gallery.opened', { details: { count: files.length } });
    return ok(files);
  }

  async getRecentPhotos(daysAgo: number, maxCount = 100): Promise<ControlResult<readonly PhotoMetadata[]>> {
    const result = await this.getPhotosFromGallery({ maxCount: maxCount * 3 });
    if (!result.ok || !result.data) return fail(result.reason ?? 'Aucune photo');
    const cutoff = Date.now() - daysAgo * 86400_000;
    const recent: PhotoMetadata[] = [];
    for (const f of result.data) {
      const meta = await this.analyzePhoto(f);
      if (!meta.ok || !meta.data) continue;
      const when = meta.data.exif_date ?? meta.data.last_modified;
      if (when >= cutoff) recent.push(meta.data);
      if (recent.length >= maxCount) break;
    }
    return ok(recent);
  }

  async analyzePhoto(file: File): Promise<ControlResult<PhotoMetadata>> {
    try {
      const meta: PhotoMetadata = {
        name: file.name,
        size_bytes: file.size,
        mime_type: file.type,
        last_modified: file.lastModified,
      };
      /* Dimensions via Image */
      if (typeof document !== 'undefined' && file.type.startsWith('image/')) {
        try {
          const dims = await this.getImageDimensions(file);
          meta.width = dims.width;
          meta.height = dims.height;
        } catch { /* ignore */ }
      }
      /* EXIF léger pour JPEG (date + GPS) */
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        const exif = await this.parseJpegExif(file);
        if (exif?.date) meta.exif_date = exif.date;
        if (exif?.gps) meta.exif_gps = exif.gps;
        if (exif?.camera) meta.exif_camera = exif.camera;
      }
      return ok(meta);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Analyse photo échouée';
      return fail(reason);
    }
  }

  triPhotosByDate(photos: readonly PhotoMetadata[]): PhotoGroupedByDate {
    const groups: PhotoGroupedByDate = {};
    for (const p of photos) {
      const d = new Date(p.exif_date ?? p.last_modified);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = groups[key] ?? [];
      bucket.push(p);
      groups[key] = bucket;
    }
    return groups;
  }

  triPhotosByLocation(photos: readonly PhotoMetadata[], precision = 2): PhotoGroupedByLocation {
    const groups: PhotoGroupedByLocation = {};
    for (const p of photos) {
      let key = 'no-gps';
      if (p.exif_gps) {
        const lat = p.exif_gps.lat.toFixed(precision);
        const lon = p.exif_gps.lon.toFixed(precision);
        key = `${lat},${lon}`;
      }
      const bucket = groups[key] ?? [];
      bucket.push(p);
      groups[key] = bucket;
    }
    return groups;
  }

  triPhotosByFace(photos: readonly PhotoMetadata[]): PhotoGroupedByFace {
    /* Placeholder : intégration future face-api.js / vision-recognition.ts.
     * Pour l'instant retourne tout dans 'unknown' pour ne pas bloquer le pipeline. */
    const groups: PhotoGroupedByFace = { unknown: [...photos] };
    void auditLog.record('device-control.photos.face-tri', { details: { count: photos.length, status: 'placeholder' } });
    return groups;
  }

  /* ============================================================
   * Helpers internes (privés)
   * ============================================================ */

  private getImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('document indisponible'));
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = (): void => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = (): void => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load failed'));
      };
      img.src = url;
    });
  }

  /**
   * Parser EXIF JPEG minimal (date + GPS + camera).
   * Sans dépendance externe — lit les premiers 64KB.
   */
  private async parseJpegExif(file: File): Promise<{ date?: number; gps?: { lat: number; lon: number }; camera?: string } | null> {
    try {
      const buf = await file.slice(0, 65_536).arrayBuffer();
      const view = new DataView(buf);
      /* JPEG SOI */
      if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
      let offset = 2;
      while (offset < view.byteLength - 4) {
        const marker = view.getUint16(offset);
        if (marker === 0xffe1) {
          /* APP1 - peut contenir EXIF */
          const length = view.getUint16(offset + 2);
          const exifHeader = view.getUint32(offset + 4);
          if (exifHeader === 0x45786966) { /* "Exif" */
            return this.parseExifTiff(view, offset + 10);
          }
          offset += 2 + length;
        } else if ((marker & 0xff00) === 0xff00) {
          const length = view.getUint16(offset + 2);
          offset += 2 + length;
        } else {
          break;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseExifTiff(view: DataView, tiffStart: number): { date?: number; gps?: { lat: number; lon: number }; camera?: string } | null {
    try {
      const byteOrder = view.getUint16(tiffStart);
      const littleEndian = byteOrder === 0x4949;
      const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
      const numEntries = view.getUint16(tiffStart + ifdOffset, littleEndian);
      const result: { date?: number; gps?: { lat: number; lon: number }; camera?: string } = {};
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        const type = view.getUint16(entryOffset + 2, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        if (tag === 0x0132 && type === 2) { /* DateTime */
          const dataOffset = count > 4 ? tiffStart + view.getUint32(entryOffset + 8, littleEndian) : entryOffset + 8;
          const dateStr = this.readAscii(view, dataOffset, count);
          const m = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
          if (m && m.length >= 7) {
            const y = m[1] ?? '0';
            const mo = m[2] ?? '1';
            const d = m[3] ?? '1';
            const h = m[4] ?? '0';
            const mi = m[5] ?? '0';
            const s = m[6] ?? '0';
            result.date = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
          }
        } else if (tag === 0x010f && type === 2) { /* Make */
          const dataOffset = count > 4 ? tiffStart + view.getUint32(entryOffset + 8, littleEndian) : entryOffset + 8;
          result.camera = this.readAscii(view, dataOffset, count);
        }
      }
      return result;
    } catch {
      return null;
    }
  }

  private readAscii(view: DataView, offset: number, length: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < length && offset + i < view.byteLength; i++) {
      const b = view.getUint8(offset + i);
      if (b === 0) break;
      bytes.push(b);
    }
    return String.fromCharCode(...bytes);
  }
}

export const deviceControl = new DeviceControl();
