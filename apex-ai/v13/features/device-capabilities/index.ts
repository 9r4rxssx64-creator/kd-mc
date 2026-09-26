/**
 * APEX v13 — Vue Device Capabilities (cross-platform iOS / Android / Desktop).
 *
 * Demande Kevin : "100% réel toujours, pousse au max" — admin Kevin doit
 * voir d'un coup d'œil quelles features marchent sur chaque device de chaque
 * client (iPhone Safari PWA / Android Chrome / Desktop / iPad / etc.).
 *
 * Vue dashboard #device :
 * - Section identité (OS / browser / PWA mode)
 * - Section ✅ features actives (~30+)
 * - Section ❌ features indisponibles (avec raison)
 * - Section 💡 recommandations device
 * - Bouton "Demander toutes permissions" 1-clic
 * - Bouton "Tester chaque feature" diagnostic
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Listener scope cleanup
 * - Pas d'auto-permission au load (user gesture)
 */

import { escapeHtml } from '../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { crossPlatform } from '../../services/core-svc/cross-platform.js';
import { deviceDetect, type DeviceCapabilities } from '../../services/integrations/device-detect.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

/**
 * Groupes features pour affichage UI.
 */
const FEATURE_GROUPS: { title: string; emoji: string; keys: (keyof DeviceCapabilities)[] }[] = [
  {
    title: 'Hardware',
    emoji: '🔌',
    keys: ['hasWebBluetooth', 'hasWebNFC', 'hasWebUSB', 'hasWebSerial', 'hasWebMIDI', 'hasWebHID', 'hasWebGPU', 'hasGyro', 'hasMotion', 'hasGeolocation', 'hasVibration'],
  },
  {
    title: 'Storage',
    emoji: '💾',
    keys: ['hasFileSystemAccess', 'hasOPFS', 'hasIndexedDB', 'hasLocalStorage'],
  },
  {
    title: 'Media',
    emoji: '📷',
    keys: ['hasShare', 'hasShareTarget', 'hasMediaSession', 'hasGetUserMedia', 'hasBarcodeDetector', 'hasFaceDetector', 'hasImageCapture', 'hasScreenCapture'],
  },
  {
    title: 'Life / Power',
    emoji: '🔋',
    keys: ['hasWakeLock', 'hasBattery', 'hasIdleDetection', 'hasContactPicker'],
  },
  {
    title: 'Identity / Payment',
    emoji: '💳',
    keys: ['hasWebAuthn', 'hasCredentialsAPI', 'hasPaymentRequest', 'hasApplePay', 'hasGooglePay'],
  },
  {
    title: 'Notif / Push',
    emoji: '🔔',
    keys: ['hasNotifications', 'hasPushAPI', 'hasBackgroundSync', 'hasPeriodicBackgroundSync', 'hasBadging'],
  },
];

/**
 * Labels lisibles pour clés DeviceCapabilities.
 */
const FEATURE_LABELS: Partial<Record<keyof DeviceCapabilities, string>> = {
  hasWebBluetooth: 'Web Bluetooth',
  hasWebNFC: 'Web NFC',
  hasWebUSB: 'Web USB',
  hasWebSerial: 'Web Serial',
  hasWebMIDI: 'Web MIDI',
  hasWebHID: 'Web HID',
  hasWebGPU: 'WebGPU',
  hasGyro: 'Gyroscope',
  hasMotion: 'DeviceMotion',
  hasGeolocation: 'Géolocalisation',
  hasVibration: 'Vibration',
  hasFileSystemAccess: 'File System Access',
  hasOPFS: 'OPFS (50 MB+)',
  hasIndexedDB: 'IndexedDB',
  hasLocalStorage: 'localStorage',
  hasShare: 'Web Share',
  hasShareTarget: 'Share Target',
  hasMediaSession: 'Media Session',
  hasGetUserMedia: 'Caméra/Micro',
  hasBarcodeDetector: 'Barcode Detector',
  hasFaceDetector: 'Face Detector',
  hasImageCapture: 'ImageCapture',
  hasScreenCapture: 'Screen Capture',
  hasWakeLock: 'Wake Lock',
  hasBattery: 'Battery API',
  hasIdleDetection: 'Idle Detection',
  hasContactPicker: 'Contact Picker',
  hasWebAuthn: 'WebAuthn (FaceID/TouchID)',
  hasCredentialsAPI: 'Credentials API',
  hasPaymentRequest: 'Payment Request',
  hasApplePay: 'Apple Pay',
  hasGooglePay: 'Google Pay',
  hasNotifications: 'Notifications',
  hasPushAPI: 'Push API',
  hasBackgroundSync: 'Background Sync',
  hasPeriodicBackgroundSync: 'Periodic Background Sync',
  hasBadging: 'App Badging',
};

export async function render(rootEl: HTMLElement): Promise<void> {
  /* Cleanup ancien scope */
  activeScope?.cleanup();
  activeScope = createCleanupScope('device-capabilities');

  const caps = deviceDetect.detect(true);
  const recommended = deviceDetect.recommendedFeatures();
  const unavailable = deviceDetect.unavailableFeatures();
  const activeCount = deviceDetect.activeFeatureCount(caps);

  const networkQuality = deviceDetect.networkQuality();
  const networkColor = networkQuality === 'high' ? '#22cc77' : networkQuality === 'medium' ? '#ffaa00' : '#ff8c42';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-376">
      <h1 class="ax-gs-365">📱 Mes capacités device</h1>
      <p class="ax-gs-377">
        ${activeCount} fonctionnalités actives sur ${countTotalFeatures()} possibles.
      </p>

      <!-- IDENTITÉ -->
      <div class="ax-gs-42">
        <h2 class="ax-gs-378">🔍 Identité</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:13px">
          ${row('OS', `${osFlag(caps.os)} ${escapeHtml(caps.os)} ${caps.os_version ? escapeHtml(caps.os_version) : ''}`)}
          ${row('Browser', `${escapeHtml(caps.browser)} ${caps.browser_version ? escapeHtml(caps.browser_version) : ''}`)}
          ${row('Mode PWA', caps.isPWA ? '✅ Installée' : '⚠️ Browser')}
          ${row('Tactile', caps.hasTouch ? '✅ Oui' : '❌ Non')}
          ${row('Type', caps.isMobile ? '📱 Mobile' : caps.isTablet ? '📱 Tablette' : '💻 Desktop')}
          ${row('Langue', escapeHtml(caps.language))}
          ${row('Timezone', escapeHtml(caps.timezone))}
          ${row('Écran', `${caps.screenWidth}×${caps.screenHeight} (${caps.pixelRatio}x)`)}
          ${row('CPU', `${caps.cpuCores} cores`)}
          ${row('RAM', `~${caps.memoryGB} GB`)}
          ${row('Storage', `~${caps.storageQuotaMB} MB`)}
          ${row('Secure', caps.isSecureContext ? '🔒 HTTPS' : '⚠️ HTTP')}
        </div>
      </div>

      <!-- RÉSEAU -->
      <div class="ax-gs-42">
        <h2 class="ax-gs-378">🌐 Réseau</h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
          <span>${caps.isOnline ? '🟢 En ligne' : '🔴 Hors ligne'}</span>
          <span>Type : <strong style="color:${networkColor}">${escapeHtml(caps.effectiveType)}</strong></span>
          <span>Qualité : <strong style="color:${networkColor}">${networkQuality}</strong></span>
          ${caps.saveData ? '<span class="ax-gs-61">💾 Save-Data ON</span>' : ''}
          ${caps.downlink > 0 ? `<span>Débit : ${caps.downlink} Mbps</span>` : ''}
          ${caps.rtt > 0 ? `<span>RTT : ${caps.rtt}ms</span>` : ''}
        </div>
      </div>

      <!-- FEATURES PAR GROUPE -->
      ${FEATURE_GROUPS.map((g) => featureGroup(g, caps)).join('')}

      <!-- INDISPONIBLES -->
      ${unavailable.length > 0 ? `
        <div style="background:rgba(255,140,66,0.1);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid rgba(255,140,66,0.3)">
          <h2 style="margin:0 0 12px;font-size:16px;color:#ff8c42">❌ Non disponibles (${unavailable.length})</h2>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7">
            ${unavailable.map((u) => `<li><strong>${escapeHtml(u.feature)}</strong> — <span class="ax-gs-10">${escapeHtml(u.reason)}</span></li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- RECOMMANDATIONS -->
      ${recommended.length > 0 ? `
        <div style="background:rgba(34,204,119,0.1);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid rgba(34,204,119,0.3)">
          <h2 style="margin:0 0 12px;font-size:16px;color:#22cc77">💡 Recommandations pour ce device (${recommended.length})</h2>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;columns:2;column-gap:24px">
            ${recommended.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- ACTIONS -->
      <div class="ax-gs-42">
        <h2 class="ax-gs-378">🚀 Actions</h2>
        <div class="ax-gs-7">
          <button class="ax-btn ax-btn-primary" id="ax-dev-perm-all" type="button">🔓 Demander toutes permissions</button>
          <button class="ax-btn ax-btn-secondary" id="ax-dev-test-share" type="button">📤 Tester partage</button>
          <button class="ax-btn ax-btn-secondary" id="ax-dev-test-vibrate" type="button">📳 Tester vibration</button>
          <button class="ax-btn ax-btn-secondary" id="ax-dev-test-battery" type="button">🔋 Voir batterie</button>
          <button class="ax-btn ax-btn-secondary" id="ax-dev-refresh" type="button">🔄 Re-détecter</button>
        </div>
        <div id="ax-dev-action-result" style="margin-top:12px;font-size:13px;color:var(--ax-text-dim)"></div>
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;

  wireActions(rootEl);
}

function row(label: string, value: string): string {
  return `
    <div>
      <div style="font-size:11px;color:var(--ax-text-dim);text-transform:uppercase;letter-spacing:0.5px">${escapeHtml(label)}</div>
      <div style="font-size:14px;color:var(--ax-text);margin-top:2px">${value}</div>
    </div>
  `;
}

function featureGroup(g: { title: string; emoji: string; keys: (keyof DeviceCapabilities)[] }, caps: DeviceCapabilities): string {
  const items = g.keys.map((k) => {
    const val = Boolean(caps[k]);
    const label = FEATURE_LABELS[k] ?? k;
    const color = val ? '#22cc77' : '#888';
    const icon = val ? '✅' : '⚪';
    return `<li style="padding:4px 0;color:${color}"><span style="display:inline-block;min-width:24px">${icon}</span> ${escapeHtml(label)}</li>`;
  }).join('');
  return `
    <div class="ax-gs-42">
      <h2 style="margin:0 0 8px;font-size:15px;color:#c9a227">${g.emoji} ${escapeHtml(g.title)}</h2>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;columns:2;column-gap:16px">
        ${items}
      </ul>
    </div>
  `;
}

function osFlag(os: string): string {
  return ({
    ios: '🍎',
    macos: '🍎',
    android: '🤖',
    windows: '🪟',
    linux: '🐧',
    chromeos: '🌐',
  } as Record<string, string>)[os] ?? '❓';
}

function countTotalFeatures(): number {
  return FEATURE_GROUPS.reduce((acc, g) => acc + g.keys.length, 0);
}

function setActionResult(rootEl: HTMLElement, msg: string, ok = true): void {
  const out = rootEl.querySelector<HTMLElement>('#ax-dev-action-result');
  if (!out) return;
  out.style.color = ok ? '#22cc77' : '#ff8c42';
  out.textContent = msg;
}

function wireActions(rootEl: HTMLElement): void {
  if (!activeScope) return;

  /* Demander toutes permissions */
  const permBtn = rootEl.querySelector<HTMLButtonElement>('#ax-dev-perm-all');
  if (permBtn) {
    activeScope.bind(permBtn, 'click', () => {
      void (async () => {
        try {
          const r = await crossPlatform.requestAllPermissions(['notifications', 'geolocation', 'camera', 'microphone']);
          const grantedCount = Object.values(r).filter((v) => v === 'granted').length;
          const total = Object.keys(r).length;
          setActionResult(rootEl, `✅ ${grantedCount}/${total} permissions accordées`, grantedCount > 0);
          toast.show(`${grantedCount}/${total} permissions OK`, 'success');
        } catch (err: unknown) {
          logger.warn('device-capabilities', 'permissions request failed', { err });
          setActionResult(rootEl, 'Erreur demande permissions', false);
        }
      })();
    });
  }

  /* Tester partage */
  const shareBtn = rootEl.querySelector<HTMLButtonElement>('#ax-dev-test-share');
  if (shareBtn) {
    activeScope.bind(shareBtn, 'click', () => {
      void (async () => {
        const r = await crossPlatform.share({
          title: 'Apex AI v13',
          text: 'Test du partage cross-platform',
          url: window.location.href,
        });
        setActionResult(rootEl, r.ok ? `✅ Partagé via ${r.fallback ?? 'native'}` : `❌ ${r.reason}`, r.ok);
      })();
    });
  }

  /* Vibration */
  const vibBtn = rootEl.querySelector<HTMLButtonElement>('#ax-dev-test-vibrate');
  if (vibBtn) {
    activeScope.bind(vibBtn, 'click', () => {
      const ok = crossPlatform.vibrate([100, 50, 100]);
      setActionResult(rootEl, ok ? '✅ Vibration déclenchée' : '❌ Vibration non supportée', ok);
    });
  }

  /* Battery */
  const batBtn = rootEl.querySelector<HTMLButtonElement>('#ax-dev-test-battery');
  if (batBtn) {
    activeScope.bind(batBtn, 'click', () => {
      void (async () => {
        const r = await crossPlatform.getBattery();
        if (r.ok && r.data) {
          setActionResult(rootEl, `🔋 ${r.data.level}% ${r.data.charging ? '⚡ en charge' : ''}`, true);
        } else {
          setActionResult(rootEl, '❌ Battery API indisponible', false);
        }
      })();
    });
  }

  /* Refresh */
  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-dev-refresh');
  if (refreshBtn) {
    activeScope.bind(refreshBtn, 'click', () => {
      void render(rootEl);
    });
  }
}
