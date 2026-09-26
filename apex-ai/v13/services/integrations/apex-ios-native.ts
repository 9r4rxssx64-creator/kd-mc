/**
 * APEX v13.4.122 — Bridge iOS native (Kevin "On passe en native iOS").
 *
 * Détecte si Apex tourne dans le wrapper Capacitor iOS natif ou en PWA Safari.
 * Si natif → utilise APIs natives (Keychain, Photos, Notifications APNs,
 * Filesystem iCloud Drive). Si PWA → fallback Web APIs (localStorage, Web
 * Share, Web Push, FileReader).
 *
 * RÈGLE Kevin "95% du code TypeScript existant préservé" : ce service est
 * la SEULE couche d'abstraction. Tout le reste d'Apex (vault, chat, IA) ne
 * change PAS. Il appelle ce service qui choisit native vs Web automatiquement.
 *
 * NON-BLOQUANT : si Capacitor n'est pas chargé (mode PWA), tous les helpers
 * retournent un fallback Web ou null. Aucune exception levée.
 */

import { logger } from '../../core/logger.js';

interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => 'ios' | 'android' | 'web';
  Plugins: Record<string, unknown>;
}

interface PreferencesPlugin {
  get: (opts: { key: string }) => Promise<{ value: string | null }>;
  set: (opts: { key: string; value: string }) => Promise<void>;
  remove: (opts: { key: string }) => Promise<void>;
  keys: () => Promise<{ keys: string[] }>;
  clear: () => Promise<void>;
}

interface FilesystemPlugin {
  writeFile: (opts: {
    path: string;
    data: string;
    directory?: string;
    encoding?: string;
  }) => Promise<{ uri: string }>;
  readFile: (opts: { path: string; directory?: string; encoding?: string }) => Promise<{ data: string }>;
}

interface SharePlugin {
  share: (opts: { title?: string; text?: string; url?: string; files?: string[] }) => Promise<void>;
}

interface PushNotificationsPlugin {
  register: () => Promise<void>;
  requestPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  addListener: (event: string, callback: (data: unknown) => void) => Promise<{ remove: () => Promise<void> }>;
}

interface DevicePlugin {
  getInfo: () => Promise<{
    model: string;
    platform: string;
    operatingSystem: string;
    osVersion: string;
    manufacturer: string;
    isVirtual: boolean;
    name?: string;
  }>;
  getId: () => Promise<{ identifier: string }>;
}

function getCapacitor(): CapacitorGlobal | null {
  const w = window as unknown as { Capacitor?: CapacitorGlobal };
  return w.Capacitor ?? null;
}

function isNative(): boolean {
  const cap = getCapacitor();
  return cap?.isNativePlatform() ?? false;
}

function getPlatform(): 'ios' | 'android' | 'web' {
  const cap = getCapacitor();
  return cap?.getPlatform() ?? 'web';
}

/**
 * Storage natif (iOS Keychain via Preferences plugin avec App Group).
 * Survit reinstall app (Keychain iOS persistant cross-install).
 * Fallback : localStorage (PWA).
 */
async function secureStore(key: string, value: string): Promise<{ ok: boolean; native: boolean }> {
  if (!isNative()) {
    try {
      localStorage.setItem(key, value);
      return { ok: true, native: false };
    } catch (err: unknown) {
      logger.warn('ios-native', 'localStorage fail', { err });
      return { ok: false, native: false };
    }
  }
  try {
    const cap = getCapacitor();
    const prefs = cap?.Plugins?.['Preferences'] as PreferencesPlugin | undefined;
    if (!prefs) return { ok: false, native: true };
    await prefs.set({ key, value });
    logger.info('ios-native', `secureStore key=${key} OK Keychain iOS`);
    return { ok: true, native: true };
  } catch (err: unknown) {
    logger.warn('ios-native', 'Keychain set fail', { err });
    return { ok: false, native: true };
  }
}

async function secureRead(key: string): Promise<{ value: string | null; native: boolean }> {
  if (!isNative()) {
    return { value: localStorage.getItem(key), native: false };
  }
  try {
    const cap = getCapacitor();
    const prefs = cap?.Plugins?.['Preferences'] as PreferencesPlugin | undefined;
    if (!prefs) return { value: null, native: true };
    const r = await prefs.get({ key });
    return { value: r.value, native: true };
  } catch (err: unknown) {
    logger.warn('ios-native', 'Keychain get fail', { err });
    return { value: null, native: true };
  }
}

async function secureRemove(key: string): Promise<{ ok: boolean; native: boolean }> {
  if (!isNative()) {
    localStorage.removeItem(key);
    return { ok: true, native: false };
  }
  try {
    const cap = getCapacitor();
    const prefs = cap?.Plugins?.['Preferences'] as PreferencesPlugin | undefined;
    if (!prefs) return { ok: false, native: true };
    await prefs.remove({ key });
    return { ok: true, native: true };
  } catch (err: unknown) {
    logger.warn('ios-native', 'Keychain remove fail', { err });
    return { ok: false, native: true };
  }
}

/**
 * Écrit fichier sur iCloud Drive (Documents directory natif).
 * Fallback : download via Blob + a.click() (PWA).
 */
async function writeFileToIcloud(
  filename: string,
  content: string,
  mimeType = 'application/json',
): Promise<{ ok: boolean; uri?: string; native: boolean; error?: string }> {
  if (!isNative()) {
    /* PWA fallback : déclenche download via Blob */
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      return { ok: true, native: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, native: false, error: msg };
    }
  }
  try {
    const cap = getCapacitor();
    const fs = cap?.Plugins?.['Filesystem'] as FilesystemPlugin | undefined;
    if (!fs) return { ok: false, native: true, error: 'Filesystem plugin missing' };
    const r = await fs.writeFile({
      path: filename,
      data: content,
      directory: 'DOCUMENTS', /* iCloud Drive si app a iCloud capability */
      encoding: 'utf8',
    });
    logger.info('ios-native', `writeFile ${filename} → ${r.uri}`);
    return { ok: true, uri: r.uri, native: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('ios-native', 'Filesystem write fail', { err });
    return { ok: false, native: true, error: msg };
  }
}

/**
 * Partage natif iOS (share sheet UIActivityViewController).
 * Fallback : Web Share API (Safari iOS 15+).
 */
async function shareNative(opts: {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
}): Promise<{ ok: boolean; native: boolean; error?: string }> {
  if (!isNative()) {
    /* PWA fallback : Web Share API */
    const nav = navigator as unknown as { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        const shareData: ShareData = {};
        if (opts.title !== undefined) shareData.title = opts.title;
        if (opts.text !== undefined) shareData.text = opts.text;
        if (opts.url !== undefined) shareData.url = opts.url;
        await nav.share(shareData);
        return { ok: true, native: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, native: false, error: msg };
      }
    }
    return { ok: false, native: false, error: 'Web Share API non disponible' };
  }
  try {
    const cap = getCapacitor();
    const share = cap?.Plugins?.['Share'] as SharePlugin | undefined;
    if (!share) return { ok: false, native: true, error: 'Share plugin missing' };
    await share.share(opts);
    return { ok: true, native: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, native: true, error: msg };
  }
}

/**
 * Demande permission Push Notifications APNs (iOS natif).
 * Fallback : Web Push API + Notification.requestPermission (PWA).
 */
async function requestPushPermission(): Promise<{
  granted: boolean;
  native: boolean;
  token?: string;
}> {
  if (!isNative()) {
    if (typeof Notification === 'undefined') return { granted: false, native: false };
    const perm = await Notification.requestPermission();
    return { granted: perm === 'granted', native: false };
  }
  try {
    const cap = getCapacitor();
    const push = cap?.Plugins?.['PushNotifications'] as PushNotificationsPlugin | undefined;
    if (!push) return { granted: false, native: true };
    const r = await push.requestPermissions();
    if (r.receive !== 'granted') return { granted: false, native: true };
    await push.register();
    /* Token APNs arrive via listener 'registration' */
    return { granted: true, native: true };
  } catch (err: unknown) {
    logger.warn('ios-native', 'push permission fail', { err });
    return { granted: false, native: true };
  }
}

/**
 * Info device natif (modèle iPhone, iOS version) pour télémétrie + fingerprint.
 */
async function getDeviceInfo(): Promise<{
  platform: 'ios' | 'android' | 'web';
  model: string;
  osVersion: string;
  identifier?: string;
  native: boolean;
}> {
  if (!isNative()) {
    return {
      platform: 'web',
      model: navigator.userAgent.slice(0, 80),
      osVersion: 'web',
      native: false,
    };
  }
  try {
    const cap = getCapacitor();
    const device = cap?.Plugins?.['Device'] as DevicePlugin | undefined;
    if (!device) return { platform: 'ios', model: 'unknown', osVersion: 'unknown', native: true };
    const info = await device.getInfo();
    const id = await device.getId();
    return {
      platform: info.platform as 'ios' | 'android',
      model: info.model,
      osVersion: info.osVersion,
      identifier: id.identifier,
      native: true,
    };
  } catch (err: unknown) {
    logger.warn('ios-native', 'device info fail', { err });
    return { platform: 'ios', model: 'unknown', osVersion: 'unknown', native: true };
  }
}

/**
 * Diagnostic complet : disponibilité Capacitor + plugins.
 * Affiché dans vue admin pour debug Kevin.
 */
function diagnose(): {
  is_native: boolean;
  platform: 'ios' | 'android' | 'web';
  capacitor_loaded: boolean;
  plugins_available: string[];
} {
  const cap = getCapacitor();
  const plugins = cap?.Plugins ?? {};
  return {
    is_native: isNative(),
    platform: getPlatform(),
    capacitor_loaded: cap !== null,
    plugins_available: Object.keys(plugins),
  };
}

export const apexIosNative = {
  isNative,
  getPlatform,
  secureStore,
  secureRead,
  secureRemove,
  writeFileToIcloud,
  shareNative,
  requestPushPermission,
  getDeviceInfo,
  diagnose,
};
