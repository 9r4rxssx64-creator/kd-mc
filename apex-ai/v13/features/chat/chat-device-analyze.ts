/**
 * APEX v13 — chat-device-analyze.ts
 * Analyse d'image d'appareil (Vision IA) depuis une pièce jointe : détecte
 * Broadlink / Smart TV et propose la configuration (modal setup).
 *
 * Extrait de features/chat/index.ts (v13.4.309, refactor monolithe). Aucune
 * dépendance d'état module. autoAnalyzeDeviceImage est injecté à wireAttachments.
 */
import { logger } from '../../core/logger.js';
import { modalSheet } from '../../ui/modal-sheet.js';
import { toast } from '../../ui/toast.js';

import { escapeHtml } from './chat-markdown.js';

export async function autoAnalyzeDeviceImage(file: File, rootEl: HTMLElement): Promise<void> {
  if (!file.type.startsWith('image/')) return;
  /* Skip si pas de clé Anthropic (vision indispo) */
  try {
    const key = localStorage.getItem('ax_anthropic_key') ?? '';
    if (!key) return;
  } catch { return; }
  try {
    const { visionDeviceAnalyze } = await import('../../services/ai/vision-device-analyze.js');
    /* Toast info "🔍 Apex analyse l'image..." */
    toast.info('🔍 Apex analyse ton image...', { duration: 3000 });
    const result = await visionDeviceAnalyze.autoDetectAndAnalyze({ imageBlob: file });
    logger.info('chat', 'autoAnalyzeDeviceImage', {
      type: result.type,
      confidence: result.generic.confidence,
    });
    if (result.type === 'broadlink_account' && result.broadlink && result.broadlink.confidence >= 0.5) {
      await proposeBroadlinkSetup(result.broadlink, rootEl);
    } else if (result.type === 'smart_tv' && result.smartTv && result.smartTv.confidence >= 0.5) {
      await proposeSmartTVSetup(result.smartTv, rootEl);
    } else if (result.generic.confidence >= 0.5) {
      /* Generic device detected mais pas un type qu'on sait piloter */
      toast.info(
        `📱 Image analysée : ${result.generic.type}. Pas encore d'intégration directe — Apex peut t'aider à configurer manuellement.`,
        { duration: 5000 },
      );
    }
  } catch (err: unknown) {
    logger.warn('chat', 'autoAnalyzeDeviceImage failed', { err });
  }
}

/**
 * Propose configuration Broadlink 1-clic après extraction vision.
 */
async function proposeBroadlinkSetup(
  result: import('../../services/ai/vision-device-analyze.js').BroadlinkAccountAnalysis,
  rootEl: HTMLElement,
): Promise<void> {
  const hasToken = !!result.token;
  const devicesCount = result.devices?.length ?? 0;
  const summary = hasToken
    ? `✅ Token détecté + ${devicesCount} device(s)`
    : `📋 ${devicesCount} device(s) détecté(s) (token non visible)`;
  const sheet = modalSheet.open({
    title: '🔌 Compte Broadlink détecté',
    content:
      `<div class="ax-gs-126">` +
      `<p class="ax-gs-353"><strong>Apex a reconnu un compte Broadlink dans ton image.</strong></p>` +
      `<p class="ax-gs-354">${escapeHtml(summary)}</p>` +
      (result.email ? `<p class="ax-gs-355">📧 <strong>Email</strong> : ${escapeHtml(result.email)}</p>` : '') +
      (devicesCount > 0
        ? `<p class="ax-gs-355">📱 <strong>Devices</strong> :</p>` +
          `<ul style="margin:0 0 12px;padding-left:20px;font-size:13px;color:var(--ax-text-muted)">` +
          (result.devices ?? []).slice(0, 5).map((d) => `<li>${escapeHtml(d.name ?? d.id ?? '?')}${d.mac ? ` <code>${escapeHtml(d.mac)}</code>` : ''}</li>`).join('') +
          `</ul>`
        : '') +
      `<div class="ax-gs-127">` +
      (hasToken
        ? `<button class="ax-btn ax-btn-primary ax-gs-356" id="ax-bl-setup-token">⚡ Configurer Broadlink (1-clic)</button>`
        : `<button class="ax-btn ax-btn-primary ax-gs-356" id="ax-bl-login">🔑 Me connecter à Broadlink</button>`) +
      `<button class="ax-btn ax-gs-357" id="ax-bl-open-setup">⚙️ Ouvrir vue Configuration Broadlink</button>` +
      `<button class="ax-btn" id="ax-bl-cancel" style="width:100%;padding:10px;color:var(--ax-text-muted)">Annuler</button>` +
      `</div>` +
      `</div>`,
  });
  void rootEl; /* anti unused-warn */
  setTimeout(() => {
    document.querySelector<HTMLButtonElement>('#ax-bl-setup-token')?.addEventListener('click', () => {
      void (async () => {
        if (!result.token) return;
        const { broadlinkBridge } = await import('../../services/integrations/broadlink-bridge.js');
        const r = await broadlinkBridge.setToken(result.token, result.email);
        if (r.ok) {
          toast.success('✅ Token Broadlink configuré + chiffré dans Coffre');
          location.hash = '#/broadlink-setup';
        } else {
          toast.error('Échec setup token');
        }
        sheet.close();
      })();
    });
    document.querySelector<HTMLButtonElement>('#ax-bl-login')?.addEventListener('click', () => {
      sheet.close();
      location.hash = '#/broadlink-setup';
    });
    document.querySelector<HTMLButtonElement>('#ax-bl-open-setup')?.addEventListener('click', () => {
      sheet.close();
      location.hash = '#/broadlink-setup';
    });
    document.querySelector<HTMLButtonElement>('#ax-bl-cancel')?.addEventListener('click', () => sheet.close());
  }, 60);
}

/**
 * Propose configuration Smart TV (stocke device + propose pilotage via Broadlink).
 */
async function proposeSmartTVSetup(
  result: import('../../services/ai/vision-device-analyze.js').SmartTVAnalysis,
  rootEl: HTMLElement,
): Promise<void> {
  void rootEl;
  /* Persist Smart TV info dans ax_smart_devices_external */
  try {
    const raw = localStorage.getItem('ax_smart_devices_external') ?? '[]';
    const list = JSON.parse(raw) as Array<Record<string, string>>;
    const entry: Record<string, string> = {
      type: 'smart_tv',
      added_ts: String(Date.now()),
    };
    if (result.brand) entry['brand'] = result.brand;
    if (result.model) entry['model'] = result.model;
    if (result.mac) entry['mac'] = result.mac;
    if (result.ip) entry['ip'] = result.ip;
    if (result.ssid) entry['ssid'] = result.ssid;
    list.push(entry);
    localStorage.setItem('ax_smart_devices_external', JSON.stringify(list.slice(-50)));
  } catch { /* quota */ }

  const summary = [
    result.brand && `🏷 ${result.brand}`,
    result.model && `📺 ${result.model}`,
    result.mac && `🆔 ${result.mac}`,
    result.ip && `🌐 ${result.ip}`,
  ].filter(Boolean).join(' · ');

  const sheet = modalSheet.open({
    title: '📺 Smart TV détectée',
    content:
      `<div class="ax-gs-126">` +
      `<p class="ax-gs-353"><strong>Apex a reconnu une Smart TV dans ton image.</strong></p>` +
      `<p class="ax-gs-354">${escapeHtml(summary || 'Infos limitées')}</p>` +
      `<p style="margin:0 0 12px;font-size:13px;color:var(--ax-text-muted)">Pour la piloter, Apex utilise ton hub Broadlink (RM Pro / RM Mini). Si pas configuré, configure d'abord ton compte Broadlink.</p>` +
      `<div class="ax-gs-127">` +
      `<button class="ax-btn ax-btn-primary ax-gs-356" id="ax-tv-setup-bl">🔌 Configurer Broadlink pour piloter</button>` +
      `<button class="ax-btn ax-gs-357" id="ax-tv-saved">💾 OK, infos TV sauvegardées</button>` +
      `</div>` +
      `</div>`,
  });
  setTimeout(() => {
    document.querySelector<HTMLButtonElement>('#ax-tv-setup-bl')?.addEventListener('click', () => {
      sheet.close();
      location.hash = '#/broadlink-setup';
    });
    document.querySelector<HTMLButtonElement>('#ax-tv-saved')?.addEventListener('click', () => {
      toast.success('💾 Infos TV sauvegardées dans ax_smart_devices_external');
      sheet.close();
    });
  }, 60);
}
