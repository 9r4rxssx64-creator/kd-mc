/**
 * APEX v13.4.123 — Sentinelle iOS native runtime health (Kevin "passe en native iOS").
 *
 * Vérifie au boot ET 1× / 24h :
 *  - Capacitor est-il chargé (window.Capacitor existe) ?
 *  - Si natif iOS : tous les plugins critiques sont-ils dispo (Preferences,
 *    Filesystem, Share, PushNotifications, Device) ?
 *  - Test fonctionnel : roundtrip Keychain (write/read/delete clé test).
 *
 * Si gap détecté → log warn + escalate Claude Code via ax_claude_todo.
 *
 * NON-BLOQUANT : si on est en PWA Safari (web), retourne ok=true (pas
 * d'attente plugin natif).
 */

import { logger } from '../../core/logger.js';
import { apexIosNative } from '../integrations/apex-ios-native.js';

const REQUIRED_PLUGINS = [
  'Preferences', /* Keychain App Group */
  'Filesystem', /* iCloud Drive Documents */
  'Share', /* UIActivityViewController */
  'PushNotifications', /* APNs */
  'Device', /* UIDevice info */
] as const;

interface IosNativeHealthReport {
  ok: boolean;
  is_native: boolean;
  platform: 'ios' | 'android' | 'web';
  capacitor_loaded: boolean;
  plugins_available: string[];
  plugins_missing: string[];
  keychain_test_passed: boolean;
  device_info?: { model: string; osVersion: string };
  error?: string;
}

async function runHealthCheck(): Promise<IosNativeHealthReport> {
  const diag = apexIosNative.diagnose();

  /* Mode PWA web : ok par défaut, pas de plugin natif requis */
  if (!diag.is_native) {
    return {
      ok: true,
      is_native: false,
      platform: diag.platform,
      capacitor_loaded: diag.capacitor_loaded,
      plugins_available: [],
      plugins_missing: [],
      keychain_test_passed: false,
    };
  }

  /* Mode natif iOS : vérifier plugins requis */
  const plugins_missing = REQUIRED_PLUGINS.filter(
    (p) => !diag.plugins_available.includes(p),
  );

  /* Test roundtrip Keychain : write → read → assert match → cleanup */
  const TEST_KEY = '__apex_ios_native_healthcheck__';
  const TEST_VALUE = 'ok_' + Date.now().toString(36);
  let keychainOk = false;
  try {
    const write = await apexIosNative.secureStore(TEST_KEY, TEST_VALUE);
    if (write.ok && write.native) {
      const read = await apexIosNative.secureRead(TEST_KEY);
      keychainOk = read.value === TEST_VALUE;
      await apexIosNative.secureRemove(TEST_KEY);
    }
  } catch (err: unknown) {
    logger.warn('ios-native-watch', 'keychain test failed', { err });
  }

  let device_info: { model: string; osVersion: string } | undefined;
  try {
    const info = await apexIosNative.getDeviceInfo();
    device_info = { model: info.model, osVersion: info.osVersion };
  } catch { /* ignore */ }

  const ok = plugins_missing.length === 0 && keychainOk;
  const report: IosNativeHealthReport = {
    ok,
    is_native: true,
    platform: diag.platform,
    capacitor_loaded: true,
    plugins_available: diag.plugins_available,
    plugins_missing,
    keychain_test_passed: keychainOk,
  };
  if (device_info) report.device_info = device_info;
  return report;
}

async function escalateIfBroken(report: IosNativeHealthReport): Promise<void> {
  if (report.ok) return;
  /* Lazy import claude-bridge pour éviter circular dep */
  try {
    const { claudeBridge } = await import('../ai/claude-bridge.js');
    const issues: string[] = [];
    if (report.plugins_missing.length > 0) {
      issues.push(`Plugins Capacitor manquants : ${report.plugins_missing.join(', ')}`);
    }
    if (report.is_native && !report.keychain_test_passed) {
      issues.push('Keychain roundtrip a échoué (write/read mismatch)');
    }
    if (issues.length === 0) return;
    await claudeBridge.pushTodo({
      type: 'investigate',
      src: 'apex',
      title: 'iOS native health check failed',
      description: issues.join(' | '),
      severity: 'medium',
      context: {
        platform: report.platform,
        plugins_missing: report.plugins_missing,
        device: report.device_info?.model ?? 'unknown',
        origin: 'ios-native-watch',
      },
    });
  } catch (err: unknown) {
    logger.debug('ios-native-watch', 'escalation skipped', { err });
  }
}

export const iosNativeWatch = {
  id: 'ios-native-watch',
  name: 'iOS Native Runtime Health',
  interval: 24 * 60 * 60 * 1000, /* 1× / 24h */
  async check(): Promise<{ ok: boolean; details: IosNativeHealthReport }> {
    const report = await runHealthCheck();
    if (!report.ok) await escalateIfBroken(report);
    return { ok: report.ok, details: report };
  },
  /* Helpers exposés pour debug HUD admin + tests */
  runHealthCheck,
};
