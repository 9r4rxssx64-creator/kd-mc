/**
 * APEX v13.3.58 — iOS Shortcuts integration (Kevin 2026-05-08).
 *
 * Demande Kevin : "Ajoute toi des outils ou fonctions dédiés pour débloquer ou
 * faire autrement sur iOS. Cherche, pousse plus loin"
 *
 * STRATÉGIE C — Apple Shortcuts (Siri) automation
 *
 * iOS Safari PWA peut ouvrir des shortcuts iOS via URL scheme :
 *   shortcuts://run-shortcut?name=<NAME>&input=<TEXT>
 *   shortcuts://x-callback-url/run-shortcut?name=X&x-success=apex-ios://...
 *
 * Pourquoi c'est CRITIQUE pour Apex :
 * - iOS Safari bloque Web Bluetooth, Web NFC, Web USB, Web Serial
 * - MAIS l'app Shortcuts native Apple expose toutes ces capacités natives
 * - Kevin peut donc déléguer scan BT / lecture NFC / accès devices à Shortcuts
 * - Apex envoie shortcut + input → résultat retour via x-callback-url
 *
 * Sécurité :
 * - URL scheme `shortcuts://` est légitime Apple (pas un risque)
 * - Apex ne stocke aucun input sensible dans l'URL (logs masqués)
 * - Kevin doit créer les shortcuts une seule fois (procédure step-by-step doc)
 *
 * 8 shortcuts pré-définis :
 *   1. apex_tv_on        → IR Broadlink "TV Power"
 *   2. apex_tv_off       → IR Broadlink "TV Power" (toggle)
 *   3. apex_bt_scan      → Lance scan Bluetooth natif
 *   4. apex_nfc_read     → Lit tag NFC (NFC Reader app)
 *   5. apex_battery      → Retourne niveau batterie + charging
 *   6. apex_vibrate      → Vibration courte
 *   7. apex_wifi_scan    → Scan WiFi via Network framework
 *   8. apex_lights_on    → Hue / matter / homekit
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

/* ============================================================================
 * Types
 * ============================================================================ */

export type ShortcutName =
  | 'apex_tv_on'
  | 'apex_tv_off'
  | 'apex_bt_scan'
  | 'apex_nfc_read'
  | 'apex_battery'
  | 'apex_vibrate'
  | 'apex_wifi_scan'
  | 'apex_lights_on'
  | 'apex_lights_off'
  | 'apex_play_music';

export interface ShortcutDefinition {
  name: ShortcutName;
  label: string;
  description: string;
  /** Action native iOS associée (utile doc Kevin pour créer shortcut) */
  iosAction: string;
  /** Input attendu (ou null si pas de paramètre) */
  inputType: 'none' | 'text' | 'json';
  /** Catégorie pour UI groupement */
  category: 'tv' | 'lights' | 'audio' | 'sensor' | 'system' | 'connectivity';
  /** Si true, renvoie un résultat via x-callback-url */
  returnsResult: boolean;
}

export interface RunShortcutOptions {
  /** Texte/JSON envoyé en input du shortcut */
  input?: string;
  /** Si true, attend un retour via x-callback-url (timeout 10s par défaut) */
  awaitResult?: boolean;
  /** Timeout custom (ms) */
  timeoutMs?: number;
}

export interface RunShortcutResult {
  ok: boolean;
  /** True si l'URL a été ouverte (pas de garantie d'exécution sans callback) */
  launched: boolean;
  /** Résultat retourné si awaitResult=true et shortcut configuré x-callback */
  result?: string;
  error?: string;
  reason?:
    | 'not_ios'
    | 'shortcuts_not_installed'
    | 'invalid_name'
    | 'timeout'
    | 'user_cancelled'
    | 'launch_failed';
}

/* ============================================================================
 * Constantes
 * ============================================================================ */

const SHORTCUT_LIBRARY: Record<ShortcutName, ShortcutDefinition> = {
  apex_tv_on: {
    name: 'apex_tv_on',
    label: 'Allumer TV',
    description: 'Envoie commande IR via Broadlink/Apple Home pour allumer la TV',
    iosAction: 'Trigger Scene "TV On" OR Send IR Command',
    inputType: 'none',
    category: 'tv',
    returnsResult: false,
  },
  apex_tv_off: {
    name: 'apex_tv_off',
    label: 'Éteindre TV',
    description: 'Envoie commande IR pour éteindre la TV',
    iosAction: 'Trigger Scene "TV Off"',
    inputType: 'none',
    category: 'tv',
    returnsResult: false,
  },
  apex_bt_scan: {
    name: 'apex_bt_scan',
    label: 'Scanner Bluetooth',
    description: 'Liste les appareils Bluetooth à proximité (capacité native iOS)',
    iosAction: 'Get Bluetooth Devices → Format List → Return',
    inputType: 'none',
    category: 'connectivity',
    returnsResult: true,
  },
  apex_nfc_read: {
    name: 'apex_nfc_read',
    label: 'Lire tag NFC',
    description: 'Lit un tag NFC (URL, texte, vCard) via Core NFC',
    iosAction: 'Scan Tag → Get Payload → Return',
    inputType: 'none',
    category: 'connectivity',
    returnsResult: true,
  },
  apex_battery: {
    name: 'apex_battery',
    label: 'État batterie',
    description: 'Retourne niveau batterie (0-100) + charging (true/false)',
    iosAction: 'Get Battery Level → Get Charging Status → JSON → Return',
    inputType: 'none',
    category: 'sensor',
    returnsResult: true,
  },
  apex_vibrate: {
    name: 'apex_vibrate',
    label: 'Vibration',
    description: 'Vibre l\'iPhone (haptique court)',
    iosAction: 'Vibrate Device',
    inputType: 'none',
    category: 'system',
    returnsResult: false,
  },
  apex_wifi_scan: {
    name: 'apex_wifi_scan',
    label: 'Scan WiFi',
    description: 'Liste réseaux WiFi détectés (capacité Network framework)',
    iosAction: 'Get Wi-Fi Networks → Format → Return',
    inputType: 'none',
    category: 'connectivity',
    returnsResult: true,
  },
  apex_lights_on: {
    name: 'apex_lights_on',
    label: 'Allumer lumières',
    description: 'Allume scène HomeKit/Hue configurée',
    iosAction: 'Control Home → Turn On Lights',
    inputType: 'text',
    category: 'lights',
    returnsResult: false,
  },
  apex_lights_off: {
    name: 'apex_lights_off',
    label: 'Éteindre lumières',
    description: 'Éteint scène HomeKit/Hue configurée',
    iosAction: 'Control Home → Turn Off Lights',
    inputType: 'text',
    category: 'lights',
    returnsResult: false,
  },
  apex_play_music: {
    name: 'apex_play_music',
    label: 'Jouer musique',
    description: 'Lance morceau Apple Music ou Spotify via input',
    iosAction: 'Play Song from Input → Apple Music',
    inputType: 'text',
    category: 'audio',
    returnsResult: false,
  },
};

const STORAGE_INSTALLED = 'ax_ios_shortcuts_installed';
const STORAGE_RESULT_PREFIX = 'ax_ios_shortcut_result_';
const DEFAULT_TIMEOUT = 10_000;

/* ============================================================================
 * Helpers
 * ============================================================================ */

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  /* iPhone/iPad/iPod Safari (and PWA standalone) */
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  /* iPadOS 13+ se déclare desktop : check maxTouchPoints */
  const isiPadOS = /Mac/.test(ua) && navigator.maxTouchPoints > 1;
  return isiOS || isiPadOS;
}

function buildShortcutURL(name: ShortcutName, opts: RunShortcutOptions): string {
  const base = 'shortcuts://run-shortcut';
  const params = new URLSearchParams();
  params.set('name', name);
  if (opts.input) params.set('input', opts.input);
  if (opts.awaitResult) {
    /* x-callback-url permet retour de résultat */
    const callbackBase = typeof location !== 'undefined' ? location.origin + location.pathname : '';
    const successUrl = `${callbackBase}#shortcut-result?name=${name}`;
    params.set('x-success', successUrl);
    params.set('x-cancel', `${callbackBase}#shortcut-cancelled?name=${name}`);
    params.set('x-error', `${callbackBase}#shortcut-error?name=${name}`);
    return `shortcuts://x-callback-url/run-shortcut?${params.toString()}`;
  }
  return `${base}?${params.toString()}`;
}

/* ============================================================================
 * Service
 * ============================================================================ */

class IOSShortcutsService {
  /**
   * Vérifie si on tourne sur iOS Safari (PWA ou navigateur).
   * Sur autre plateforme → no-op avec reason='not_ios'.
   */
  isAvailable(): boolean {
    return isIOSSafari();
  }

  /**
   * Liste de tous les shortcuts pré-définis.
   */
  list(): ShortcutDefinition[] {
    return Object.values(SHORTCUT_LIBRARY);
  }

  /**
   * Détails d'un shortcut spécifique.
   */
  get(name: ShortcutName): ShortcutDefinition | null {
    return SHORTCUT_LIBRARY[name] ?? null;
  }

  /**
   * Filtre par catégorie (UI groupement).
   */
  byCategory(category: ShortcutDefinition['category']): ShortcutDefinition[] {
    return this.list().filter((s) => s.category === category);
  }

  /**
   * Lance un shortcut iOS.
   *
   * Sur iOS : ouvre l'URL `shortcuts://` qui déclenche l'app Shortcuts native.
   * Sur autre OS : retourne reason='not_ios'.
   *
   * Si awaitResult=true : écoute hashchange jusqu'au timeout pour récupérer
   * le résultat via x-callback-url. Le shortcut DOIT être configuré pour
   * appeler "Open URL" avec l'URL apex#shortcut-result + résultat.
   */
  async run(name: ShortcutName, opts: RunShortcutOptions = {}): Promise<RunShortcutResult> {
    if (!this.isAvailable()) {
      return { ok: false, launched: false, reason: 'not_ios', error: 'iOS uniquement' };
    }
    const def = this.get(name);
    if (!def) {
      return { ok: false, launched: false, reason: 'invalid_name', error: `Shortcut ${name} inconnu` };
    }
    const url = buildShortcutURL(name, opts);
    void auditLog.record('ios_shortcuts.run', { details: { name, hasInput: !!opts.input, awaitResult: !!opts.awaitResult } });

    /* Tentative ouverture URL scheme. Pas de Promise navigator.app sur Safari iOS,
     * on utilise window.location.assign qui déclenche le scheme. */
    try {
      if (typeof window !== 'undefined' && window.location) {
        window.location.assign(url);
      }
    } catch (e) {
      logger.warn('ios-shortcuts', `launch failed for ${name}`, { err: String(e) });
      return { ok: false, launched: false, reason: 'launch_failed', error: String(e) };
    }

    if (!opts.awaitResult || !def.returnsResult) {
      return { ok: true, launched: true };
    }

    /* Wait for hashchange callback */
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    const result = await this.awaitCallback(name, timeoutMs);
    if (result === null) {
      return { ok: false, launched: true, reason: 'timeout', error: `Pas de retour après ${timeoutMs}ms` };
    }
    return { ok: true, launched: true, result };
  }

  /**
   * Helpers shortcut spécifiques pour code-completion ergonomique.
   */
  async tvOn(): Promise<RunShortcutResult> {
    return this.run('apex_tv_on');
  }

  async tvOff(): Promise<RunShortcutResult> {
    return this.run('apex_tv_off');
  }

  async scanBluetooth(): Promise<RunShortcutResult> {
    return this.run('apex_bt_scan', { awaitResult: true, timeoutMs: 15_000 });
  }

  async readNFC(): Promise<RunShortcutResult> {
    return this.run('apex_nfc_read', { awaitResult: true, timeoutMs: 30_000 });
  }

  async getBattery(): Promise<RunShortcutResult> {
    return this.run('apex_battery', { awaitResult: true, timeoutMs: 5_000 });
  }

  async vibrate(): Promise<RunShortcutResult> {
    return this.run('apex_vibrate');
  }

  async scanWiFi(): Promise<RunShortcutResult> {
    return this.run('apex_wifi_scan', { awaitResult: true, timeoutMs: 10_000 });
  }

  async lightsOn(scene = 'all'): Promise<RunShortcutResult> {
    return this.run('apex_lights_on', { input: scene });
  }

  async lightsOff(scene = 'all'): Promise<RunShortcutResult> {
    return this.run('apex_lights_off', { input: scene });
  }

  async playMusic(query: string): Promise<RunShortcutResult> {
    return this.run('apex_play_music', { input: query });
  }

  /**
   * Marquer un shortcut comme installé (Kevin a suivi la doc et créé le shortcut).
   * Permet à l'UI d'afficher 🟢 vs ⚪.
   */
  markInstalled(name: ShortcutName, installed = true): void {
    try {
      const raw = localStorage.getItem(STORAGE_INSTALLED);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      map[name] = installed;
      localStorage.setItem(STORAGE_INSTALLED, JSON.stringify(map));
    } catch {
      /* quota */
    }
  }

  /**
   * Retourne map { name: installed }.
   */
  getInstallStatus(): Record<ShortcutName, boolean> {
    const out = {} as Record<ShortcutName, boolean>;
    for (const k of Object.keys(SHORTCUT_LIBRARY) as ShortcutName[]) out[k] = false;
    try {
      const raw = localStorage.getItem(STORAGE_INSTALLED);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, boolean>;
        for (const k of Object.keys(map)) {
          if (k in out) out[k as ShortcutName] = !!map[k];
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  /**
   * Documentation step-by-step pour Kevin (création shortcut iOS).
   * Retourne instructions HTML pour affichage UI.
   */
  getInstallDocs(name: ShortcutName): { title: string; steps: string[]; iosVersion: string } | null {
    const def = this.get(name);
    if (!def) return null;
    return {
      title: `Créer le shortcut "${def.label}" sur iOS`,
      iosVersion: 'iOS 14+',
      steps: [
        '1. Ouvre l\'app "Raccourcis" (Shortcuts) sur ton iPhone',
        '2. Touche le bouton "+" en haut à droite',
        `3. Touche "Nom du raccourci" et tape EXACTEMENT : ${def.name}`,
        `4. Ajoute l'action : ${def.iosAction}`,
        def.returnsResult
          ? '5. Ajoute action "Ouvrir URL" → tape : apex-ios-callback?result=[Résultat]'
          : '5. Touche "OK"',
        '6. Reviens dans Apex → Réglages → iOS Shortcuts → Marquer comme installé',
        '7. Test : reviens ici et tape le bouton ▶️ pour vérifier que ça marche',
      ],
    };
  }

  /* ----- Private helpers ----- */

  private awaitCallback(name: ShortcutName, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const onHash = (): void => {
        if (done) return;
        const hash = location.hash || '';
        if (hash.includes(`shortcut-result`) && hash.includes(`name=${name}`)) {
          done = true;
          window.removeEventListener('hashchange', onHash);
          /* Extract result query param from hash */
          const queryStart = hash.indexOf('?');
          const result = queryStart >= 0
            ? new URLSearchParams(hash.slice(queryStart + 1)).get('result') ?? ''
            : '';
          /* Cache résultat (audit + retry) */
          try {
            localStorage.setItem(`${STORAGE_RESULT_PREFIX}${name}`, result);
          } catch { /* quota */ }
          resolve(result);
        } else if (hash.includes('shortcut-cancelled') || hash.includes('shortcut-error')) {
          done = true;
          window.removeEventListener('hashchange', onHash);
          resolve(null);
        }
      };
      window.addEventListener('hashchange', onHash);
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('hashchange', onHash);
        resolve(null);
      }, timeoutMs);
    });
  }
}

export const iosShortcuts = new IOSShortcutsService();
