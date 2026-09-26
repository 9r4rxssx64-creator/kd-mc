/**
 * APEX v13 — Dispatcher exécution outils Apex IA (parité Claude Code).
 *
 * Reçoit un tool_use Anthropic + paramètres, vérifie permissions, exécute,
 * audit log immutable, retourne tool_result.
 *
 * Anti-pattern Kevin :
 * - Pas d'eval, pas de new Function, pas de exec arbitraire
 * - Whitelist stricte de fonctions par tool name
 * - Validation Kevin (escalate_human) avant action niveau C
 * - Audit log obligatoire avant + après exécution
 */

import { logger } from '../../core/logger.js';
import {
  dispatchCodeReview,
  dispatchFuturisticModuleInvoke,
  dispatchGenerateDesignSystem,
  dispatchGenerateDocx,
  dispatchGenerateMarketingCopy,
  dispatchGeneratePdf,
  dispatchGeneratePptx,
  dispatchGenerateXlsx,
  dispatchMcpAlmanacResearch,
  dispatchMcpBofipSearch,
  dispatchMcpLegalSearch,
  dispatchSecurityReview,
  dispatchSeoAiVisibility,
  dispatchSeoAudit,
  dispatchSkillFactoryCreate,
  dispatchVideoComposeHyperframes,
  dispatchVideoEdit,
} from '../apex-tools-dispatch/skills-dispatch.js';
import {
  base64EncodeDecode,
  createTask,
  csvParse,
  detectLanguage,
  hashText,
  jsonValidate,
  jwtDecode,
  mindMapGenerate,
  regexTest,
  summarizeText,
  textDiff,
  uuidGenerate,
  wordCount,
} from '../apex-tools-dispatch/utils-data.js';
import {
  compoundInterest,
  currencyConvert,
  emailValidate,
  financeCalculate,
  phoneValidate,
  vatValidateEu,
  whatsappLink,
} from '../apex-tools-dispatch/utils-finance.js';
import {
  auditSelf,
  backupTrigger,
  cloneSite,
  detectIntent,
  escalateHuman,
  githubSearch,
  imageCompress,
  knowledgeUpdate,
  lessonRecord,
  marketData,
  memoryAdd,
  memoryRecall,
  newsHeadlines,
  osintTools,
  perfMetricsSnapshot,
  projectContinue,
  projectStatus,
  qrGenerate,
  readFile,
  readLogs,
  resolvePhone,
  sanitizeForAudit,
  scrapeUrl,
  searchLatestTools,
  selfImprove,
  sentinelsStatus,
  stackoverflowSearch,
  translate,
  unshortenUrl,
  vaultAction,
  weather,
  webFetch,
  webSearch,
  wikipediaLookup,
  youtubeSearch,
} from '../apex-tools-dispatch/utils-misc.js';
import { guardToolEnabled } from '../auth/feature-guard.js';
import { auditLog } from '../observability/audit-log.js';

import { apexTools, type ApexTool } from './apex-tools.js';
import { orchestrator } from './orchestrator.js';

/**
 * Mapping tool name → feature toggle id (Kevin règle 2026-05-04 — ON/OFF tout).
 * Lorsque le toggle est OFF, le dispatcher refuse l'exécution avec un tool_result d'erreur.
 * Centralisé ici plutôt qu'attacher une métadonnée par tool — les noms restent strings opaques.
 */
const TOOL_TOGGLE_MAP: Record<string, string> = {
  /* Web & search */
  web_search: 'tool.web_search',
  search_web: 'tool.web_search',
  /* Image / vision */
  image_analyze: 'tool.image_analyze',
  analyze_image: 'tool.image_analyze',
  image_generate: 'tool.image_generate',
  generate_image: 'tool.image_generate',
  /* Code / sandbox */
  code_execute: 'tool.code_execute',
  execute_code: 'tool.code_execute',
  /* Météo / calc / unit */
  get_weather: 'tool.weather',
  weather: 'tool.weather',
  calculator: 'tool.calculator',
  calculate: 'tool.calculator',
  unit_convert: 'tool.unit_convert',
  /* Translate */
  translate: 'tool.translate',
  /* QR & barcode */
  qr_generate: 'tool.qr_generate',
  generate_qr: 'tool.qr_generate',
  qr_scan: 'tool.qr_scan',
  scan_qr: 'tool.qr_scan',
  barcode_scan: 'tool.barcode_scan',
  /* OCR / geocode */
  ocr: 'tool.ocr',
  geocode: 'tool.geocode',
  /* Communication */
  send_email: 'tool.send_email',
  send_sms: 'tool.send_sms',
  send_whatsapp: 'tool.send_whatsapp',
  /* Calendrier / contacts / location */
  calendar_create: 'tool.calendar_create',
  create_calendar_event: 'tool.calendar_create',
  calendar_read: 'tool.calendar_read',
  read_calendar: 'tool.calendar_read',
  contacts_read: 'tool.contacts_read',
  read_contacts: 'tool.contacts_read',
  get_location: 'tool.location',
  location: 'tool.location',
  /* Notif / share */
  notif_send: 'tool.notif_send',
  send_notification: 'tool.notif_send',
  share_target: 'tool.share_target',
  /* Hardware Web APIs */
  bluetooth: 'tool.bluetooth',
  nfc_read: 'tool.nfc_read',
  nfc_write: 'tool.nfc_write',
  usb: 'tool.usb',
  midi: 'tool.midi',
  serial: 'tool.serial',
  /* Print / export */
  print: 'tool.print',
  pdf_export: 'tool.pdf_export',
  export_pdf: 'tool.pdf_export',
  markdown: 'tool.markdown',
  timer: 'tool.timer',
};

export interface ToolExecResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  requires_validation?: boolean;
  validation_token?: string;
}

class ApexToolsDispatcher {
  /* P0 fix audit Cure53/NCC : event delegation singleton.
     Au lieu d'attacher un listener par bouton modal (memory leak car les modals
     sont fréquemment ouverts/fermés), on a UN SEUL listener `click` sur document.body
     qui dispatch via data-attribute `data-tool-action`.
     - Pas de cleanup individuel à gérer.
     - 1 listener total, peu importe le nombre de modals ouverts. */
  private delegationInstalled = false;
  private delegationAbort: AbortController | null = null;
  /* Référence vers le listener pour double-cleanup (AbortController + removeEventListener
     explicite — certains environnements browser/test ne respectent pas signal). */
  private delegationListener: EventListener | null = null;
  /* Map d'actions actives → handler. Key = `data-tool-action` value. */
  private toolActionHandlers = new Map<string, (el: Element, ev: Event) => void>();

  /**
   * Installe le listener de délégation unique (idempotent).
   * Appelé lazily à la 1re utilisation d'openUrlModal ou de tout consumer event-delegation.
   */
  private installDelegation(): void {
    if (this.delegationInstalled) return;
    if (typeof document === 'undefined') return;
    this.delegationAbort = new AbortController();
    const listener: EventListener = (ev) => {
      const target = ev.target as Element | null;
      if (!target) return;
      const actionEl = target.closest<HTMLElement>('[data-tool-action]');
      if (!actionEl) return;
      const action = actionEl.dataset['toolAction'];
      if (!action) return;
      const handler = this.toolActionHandlers.get(action);
      if (handler) handler(actionEl, ev);
    };
    this.delegationListener = listener;
    document.body.addEventListener('click', listener, { signal: this.delegationAbort.signal });
    this.delegationInstalled = true;
  }

  /**
   * Enregistre un handler pour un `data-tool-action` donné.
   * Si un handler existait déjà, il est remplacé (no leak).
   * Retourne fonction unregister pour cleanup explicite si voulu.
   */
  private registerToolAction(action: string, handler: (el: Element, ev: Event) => void): () => void {
    this.installDelegation();
    this.toolActionHandlers.set(action, handler);
    return () => {
      const current = this.toolActionHandlers.get(action);
      if (current === handler) this.toolActionHandlers.delete(action);
    };
  }

  /**
   * Cleanup public — appelable au logout/shutdown.
   * Désinstalle le listener de délégation + clear handlers.
   * Double-cleanup : AbortController.abort() + removeEventListener explicite
   * (certains tests/runtimes ne respectent pas le signal automatiquement).
   */
  destroy(): void {
    if (this.delegationAbort) {
      try { this.delegationAbort.abort(); } catch { /* ignore */ }
      this.delegationAbort = null;
    }
    if (this.delegationListener && typeof document !== 'undefined') {
      try { document.body.removeEventListener('click', this.delegationListener); } catch { /* ignore */ }
    }
    this.delegationListener = null;
    this.delegationInstalled = false;
    this.toolActionHandlers.clear();
  }

  /**
   * Audit helper : compte d'actions de délégation enregistrées.
   * Exposé pour tests (vérifier qu'on n'accumule pas de handlers fantômes).
   */
  getActiveDelegationActionCount(): number {
    return this.toolActionHandlers.size;
  }

  /**
   * True si la délégation document est installée (1 seul listener total).
   */
  isDelegationInstalled(): boolean {
    return this.delegationInstalled;
  }

  /**
   * Exécute un tool avec validation tier + audit log + retry.
   * Si tool requires_validation=true, retourne validation_token au lieu d'exécuter.
   * Kevin doit alors appeler validate() avec le token pour confirmer.
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    userTier: ApexTool['minTier'] = 'client_free',
    options: { skipValidation?: boolean } = {},
  ): Promise<ToolExecResult> {
    /* v13.4.246 — Re-vérification admin autoritaire (audit sécurité).
       Le `userTier` reçu de l'appelant n'est PAS fiable : features/chat passe
       un 'admin' hardcodé et resolveUserTier() (ai-router) lit un JSON
       localStorage non signé. On re-dérive l'admin depuis auth.isAdminSync()
       — source unique partagée avec les guards router/UI. Un appelant qui
       réclame 'admin' sans l'être est rétrogradé à 'client_free' (fail-closed)
       → les tools impact-C repassent alors par la validation explicite.
       Limite honnête : app 100% client → un utilisateur avec DevTools peut
       toujours forger `apex_v13_user`. Ce contrôle élimine les chemins
       divergents/hardcodés (vrai bug), pas l'auto-spoof. Les tools réellement
       destructeurs restent protégés par le coffre (PAT chiffré) + validation. */
    if (userTier === 'admin') {
      try {
        const { auth } = await import('../auth/auth.js');
        if (!auth.isAdminSync()) userTier = 'client_free';
      } catch {
        userTier = 'client_free';
      }
    }
    /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout).
       Si le tool est mappé sur un toggle et que toggle = OFF → refuse. */
    const toggleId = TOOL_TOGGLE_MAP[toolName];
    if (toggleId) {
      const guard = guardToolEnabled(toggleId);
      if (guard) {
        await apexTools.logExecution(toolName, userTier, params, false);
        return { ok: false, error: guard.error };
      }
    }
    /* Vérification permissions */
    const check = apexTools.canExecute(toolName, userTier);
    if (!check.allowed) {
      await apexTools.logExecution(toolName, userTier, params, false);
      return { ok: false, error: check.reason ?? 'Refused' };
    }

    /* Validation Kevin obligatoire si impactLevel C */
    if (check.requires_validation && !options.skipValidation) {
      const token = `val_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        const pending = JSON.parse(localStorage.getItem('apex_v13_pending_validations') ?? '[]') as Array<{
          token: string;
          tool: string;
          params: unknown;
          tier: string;
          ts: number;
        }>;
        pending.push({ token, tool: toolName, params, tier: userTier, ts: Date.now() });
        localStorage.setItem('apex_v13_pending_validations', JSON.stringify(pending.slice(-50)));
      } catch {
        /* ignore quota */
      }
      logger.info('apex-tools', `Tool ${toolName} pending validation: ${token}`);
      return { ok: false, requires_validation: true, validation_token: token };
    }

    /* Exécution effective */
    try {
      const result = await this.dispatch(toolName, params);
      await apexTools.logExecution(toolName, userTier, params, true);
      return { ok: true, result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('apex-tools', `Tool ${toolName} failed: ${msg}`);
      await apexTools.logExecution(toolName, userTier, params, false);
      return { ok: false, error: msg };
    }
  }

  /**
   * Valide un token pending (Kevin only) → ré-exécute avec skipValidation=true.
   */
  async validate(token: string): Promise<ToolExecResult> {
    let pending: Array<{ token: string; tool: string; params: Record<string, unknown>; tier: string }> = [];
    try {
      pending = JSON.parse(localStorage.getItem('apex_v13_pending_validations') ?? '[]') as typeof pending;
    } catch {
      return { ok: false, error: 'pending list corrupt' };
    }
    const found = pending.find((p) => p.token === token);
    if (!found) return { ok: false, error: 'Token inconnu ou expiré' };
    /* Retire du pending */
    const remaining = pending.filter((p) => p.token !== token);
    try {
      localStorage.setItem('apex_v13_pending_validations', JSON.stringify(remaining));
    } catch {
      /* ignore */
    }
    return this.execute(found.tool, found.params, found.tier as ApexTool['minTier'], { skipValidation: true });
  }

  /**
   * Liste les validations en attente (admin only).
   */
  listPendingValidations(): Array<{ token: string; tool: string; tier: string; ts: number }> {
    try {
      const pending = JSON.parse(localStorage.getItem('apex_v13_pending_validations') ?? '[]') as Array<{
        token: string;
        tool: string;
        params: unknown;
        tier: string;
        ts: number;
      }>;
      return pending.map(({ token, tool, tier, ts }) => ({ token, tool, tier, ts }));
    } catch {
      return [];
    }
  }

  /**
   * Dispatch effectif vers la fonction implémentation.
   * Whitelist stricte par tool name (anti eval/exec).
   */
  private async dispatch(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'apex_self_audit':
      case 'self_audit':
      case 'audit':
      case 'fais_ton_audit':
      case 'audit_brutal':
      case 'fais_audit_brutal': {
        /* Kevin règle : "fais ton audit" → audit complet 6 axes + auto-fix + escalade
           Mode brutal = checks supplémentaires + sévérité bumpée + 145 vues v12 manquantes */
        const { apexSelfAudit } = await import('../admin/apex-self-audit.js');
        const brutal = toolName === 'audit_brutal' || toolName === 'fais_audit_brutal' || params['brutal'] === true;
        const report = await apexSelfAudit.runFullAudit(brutal);
        return apexSelfAudit.formatReportMarkdown(report);
      }
      case 'open_url':
      case 'open_browser':
      case 'navigate':
      case 'ouvre_url':
      case 'ouvre':
      case 'va_sur': {
        /* Kevin règle CLAUDE.md "1 CLIC + FENÊTRE + BOUTON DIRECT" :
           Ouvre modal pop-up avec lien direct cliquable (pas window.open auto sans confirm) */
        return this.openUrlModal(
          params['url'] as string ?? params['target'] as string ?? '',
          params['label'] as string | undefined,
          params['description'] as string | undefined,
        );
      }
      /* === DEVICE CONTROL TOOLS (61 méthodes iOS/Android — Kevin règle pilotage) === */
      case 'device_share':
      case 'partage_contenu': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const sharePayload: { title?: string; text?: string; url?: string } = {};
        if (typeof params['title'] === 'string') sharePayload.title = params['title'];
        if (typeof params['text'] === 'string') sharePayload.text = params['text'];
        if (typeof params['url'] === 'string') sharePayload.url = params['url'];
        return deviceControl.shareContent(sharePayload);
      }
      case 'device_vibrate':
      case 'vibrer': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.vibrate(params['pattern'] as number | number[] ?? [100, 50, 100]);
      }
      case 'device_geolocation':
      case 'ma_position': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.getGeolocation();
      }
      case 'device_battery':
      case 'batterie': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.getBatteryStatus();
      }
      case 'device_clipboard_read':
      case 'lire_presse_papiers': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.pasteFromClipboard();
      }
      case 'device_clipboard_write':
      case 'copier': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.copyToClipboard(params['text'] as string ?? '');
      }
      case 'device_speak':
      case 'parler':
      case 'tts': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const speakOpts: { voiceName?: string; rate?: number; lang?: string } = {};
        if (typeof params['voice'] === 'string') speakOpts.voiceName = params['voice'];
        if (typeof params['rate'] === 'number') speakOpts.rate = params['rate'];
        if (typeof params['lang'] === 'string') speakOpts.lang = params['lang'];
        return deviceControl.speakText(params['text'] as string ?? '', speakOpts);
      }
      case 'device_open_maps':
      case 'ouvrir_maps':
      case 'plan': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openMaps(params['address'] as string | undefined ?? params['coords'] as string | undefined ?? '');
      }
      case 'device_open_phone':
      case 'appeler': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openPhone(params['number'] as string ?? '');
      }
      case 'device_open_sms':
      case 'sms': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openSMS(params['number'] as string ?? '', params['body'] as string | undefined);
      }
      case 'device_get_photos':
      case 'mes_photos': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const photoOpts: { maxCount?: number } = {};
        if (typeof params['max'] === 'number') photoOpts.maxCount = params['max'];
        return deviceControl.getPhotosFromGallery(photoOpts);
      }
      case 'device_detect':
      case 'detect_device': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return {
          environment: deviceControl.detectDevice(),
          capabilities: deviceControl.listAllSupported(),
        };
      }
      /* === NETWORK SCAN LAN (80+ device probes) === */
      case 'scan_network':
      case 'scan_lan':
      case 'devices_lan': {
        const { networkScan } = await import('../integrations/network-scan.js');
        return await networkScan.scan({ useCache: params['useCache'] !== false });
      }
      case 'local_ip': {
        const { networkScan } = await import('../integrations/network-scan.js');
        const ip = await networkScan.getLocalIP();
        return { ok: ip !== null, local_ip: ip };
      }
      case 'open_lan_device': {
        const { networkScan } = await import('../integrations/network-scan.js');
        const ip = params['ip'] as string ?? '';
        const port = (params['port'] as number | undefined) ?? 80;
        return await networkScan.openDeviceUI({
          ip, port, type: 'unknown', service: 'manual',
          last_seen: Date.now(),
        });
      }
      /* === BADGE CLONER (60+ formats NFC/RFID) === */
      case 'scan_badge':
      case 'badge_scan': {
        const { badgeCloner } = await import('../integrations/badge-cloner.js');
        return await badgeCloner.scanBadge();
      }
      case 'list_badges': {
        const { badgeCloner } = await import('../integrations/badge-cloner.js');
        return await badgeCloner.listBadgesAsync();
      }
      case 'clone_badge_to_tag': {
        const { badgeCloner } = await import('../integrations/badge-cloner.js');
        return await badgeCloner.cloneBadgeToNewTag(params['badge_id'] as string ?? '');
      }
      case 'badge_to_qr': {
        const { badgeCloner } = await import('../integrations/badge-cloner.js');
        return await badgeCloner.generateQRCodeFromBadge(params['badge_id'] as string ?? '');
      }
      /* === CARD EMULATOR (18 hardware devices) === */
      case 'list_emulators': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return {
          supported: cardEmulator.listSupported(),
          capabilities: cardEmulator.getBrowserCapabilities(),
          status: cardEmulator.getStatus(),
        };
      }
      case 'connect_flipper_usb': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return await cardEmulator.connectFlipperUSB();
      }
      case 'connect_flipper_ble': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return await cardEmulator.connectFlipperBLE();
      }
      case 'connect_proxmark': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return await cardEmulator.connectProxmarkSerial();
      }
      case 'connect_chameleon': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return await cardEmulator.connectChameleonSerial();
      }
      case 'emulate_badge': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        const opts = typeof params['duration_sec'] === 'number' ? { duration_sec: params['duration_sec'] } : undefined;
        return await cardEmulator.emulateBadge(params['badge_id'] as string ?? '', opts);
      }
      case 'emulator_command':
      case 'emulator_cmd': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        return await cardEmulator.sendCommand(params['cmd'] as string ?? '');
      }
      case 'emulator_disconnect': {
        const { cardEmulator } = await import('../integrations/card-emulator.js');
        await cardEmulator.disconnect();
        return { ok: true };
      }
      /* === DEVICE TOOLS COMPLETS (49 supplémentaires — Kevin demande TOUS) === */
      case 'device_notification':
      case 'notification': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const titlePerm = params['title'] as string ?? 'Apex';
        const notifOpts: NotificationOptions = {};
        if (typeof params['body'] === 'string') notifOpts.body = params['body'];
        return deviceControl.showNotification(titlePerm, notifOpts);
      }
      case 'device_request_notification':
      case 'permission_notif': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestNotificationPermission();
      }
      case 'device_wake_lock':
      case 'wake_lock': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestWakeLock();
      }
      case 'device_release_wake_lock': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.releaseWakeLock();
      }
      case 'device_network_info':
      case 'reseau': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.getNetworkInfo();
      }
      case 'device_storage_estimate':
      case 'stockage': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.getStorageEstimate();
      }
      case 'device_persistent_storage': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestPersistentStorage();
      }
      case 'device_camera':
      case 'camera': {
        /* Feature toggle studio.camera (Kevin règle ON/OFF, 2026-05-04). */
        const { isFeatureEnabled } = await import('../auth/feature-toggles.js');
        if (!isFeatureEnabled('studio.camera')) {
          return { ok: false, error: 'studio.camera désactivé par admin' };
        }
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestCamera({
          video: true,
          audio: params['audio'] as boolean | undefined ?? false,
        });
      }
      case 'device_listen_speech':
      case 'dictee': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const speechOpts: { lang?: string; continuous?: boolean; onResult?: (text: string, isFinal: boolean) => void } = {};
        if (typeof params['lang'] === 'string') speechOpts.lang = params['lang'];
        if (typeof params['continuous'] === 'boolean') speechOpts.continuous = params['continuous'];
        speechOpts.onResult = (text: string) => logger.info('apex-tools', 'speech', { text: text.slice(0, 100) });
        return deviceControl.listenSpeech(speechOpts);
      }
      case 'device_list_media': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.listMediaDevices();
      }
      case 'device_motion':
      case 'mouvement': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestDeviceMotion((ev) => logger.info('apex-tools', 'motion', { x: ev.acceleration?.x, y: ev.acceleration?.y, z: ev.acceleration?.z }));
      }
      case 'device_orientation':
      case 'orientation': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestDeviceOrientation((ev) => logger.info('apex-tools', 'orientation', { alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma }));
      }
      case 'device_ambient_light':
      case 'lumiere_ambiante': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.watchAmbientLight((lux) => logger.info('apex-tools', 'ambient', { lux }));
      }
      case 'device_proximity': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.watchProximity((p) => logger.info('apex-tools', 'proximity', { p }));
      }
      case 'device_bluetooth':
      case 'bluetooth_pair': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestBluetoothDevice(
          (params['filters'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? [{ services: ['battery_service'] }],
        );
      }
      case 'device_bluetooth_paired':
      case 'bluetooth_list': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.listPairedBluetooth();
      }
      case 'device_nfc_read':
      case 'nfc_lire': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestNFCRead((records) => {
          logger.info('apex-tools', 'nfc_records', { count: records.length });
        });
      }
      case 'device_nfc_write':
      case 'nfc_ecrire': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestNFCWrite([{
          recordType: 'text',
          data: params['text'] as string ?? '',
        }]);
      }
      case 'device_usb': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestUSBDevice((params['filters'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []);
      }
      case 'device_serial': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestSerial();
      }
      case 'device_hid': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.requestHID((params['filters'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []);
      }
      case 'device_pick_files':
      case 'choisir_fichiers': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const pickOpts: { accept?: string; multiple?: boolean } = {};
        if (typeof params['accept'] === 'string') pickOpts.accept = params['accept'];
        if (typeof params['multiple'] === 'boolean') pickOpts.multiple = params['multiple'];
        return deviceControl.pickFiles(pickOpts);
      }
      case 'device_pick_directory': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.pickDirectory();
      }
      case 'device_share_files': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.shareFiles((params['files'] as File[] | undefined) ?? []);
      }
      case 'device_open_mail':
      case 'mail': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openMail(
          params['to'] as string ?? '',
          params['subject'] as string | undefined,
          params['body'] as string | undefined,
        );
      }
      case 'device_open_facetime':
      case 'facetime': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openFaceTime(params['contact'] as string ?? '');
      }
      case 'device_open_calendar':
      case 'calendrier': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openCalendar();
      }
      case 'device_open_health':
      case 'sante': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openHealth();
      }
      case 'device_open_settings':
      case 'reglages_ios': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openSettings();
      }
      case 'device_open_shortcuts':
      case 'raccourcis': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openShortcuts(params['name'] as string ?? '');
      }
      case 'device_open_camera_app': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openCamera();
      }
      case 'device_open_music':
      case 'musique': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openMusic(params['track'] as string | undefined ?? '');
      }
      case 'device_open_podcasts':
      case 'podcasts': {
        const { deviceControl } = await import('../integrations/device-control.js');
        return deviceControl.openPodcasts();
      }
      case 'device_recent_photos':
      case 'photos_recentes': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const days = (params['days'] as number | undefined) ?? 7;
        const photoCount = (params['count'] as number | undefined) ?? 20;
        return deviceControl.getRecentPhotos(days, photoCount);
      }
      case 'device_tri_photos_date':
      case 'tri_photos': {
        const { deviceControl } = await import('../integrations/device-control.js');
        const files = (params['files'] as File[] | undefined) ?? [];
        const metadatas = await Promise.all(files.map(async (f) => {
          const r = await deviceControl.analyzePhoto(f);
          return r.data;
        }));
        const valid = metadatas.filter((m): m is NonNullable<typeof m> => m !== undefined);
        return deviceControl.triPhotosByDate(valid);
      }
      case 'read_file':
        return readFile(params['path'] as string, params['branch'] as string | undefined);
      case 'web_fetch':
        return webFetch(params['url'] as string);
      case 'web_search':
        return webSearch(params['query'] as string, params['max_results'] as number | undefined);
      case 'cmc_read': {
        type CmcReadOpts = Parameters<typeof orchestrator.cmcRead>[0];
        const cmcOpts: NonNullable<CmcReadOpts> = {};
        if (typeof params['scope'] === 'string') cmcOpts.scope = params['scope'] as NonNullable<NonNullable<CmcReadOpts>['scope']>;
        if (typeof params['user_uid'] === 'string') cmcOpts.user_uid = params['user_uid'];
        if (typeof params['year'] === 'number') cmcOpts.year = params['year'];
        if (typeof params['month'] === 'number') cmcOpts.month = params['month'];
        if (typeof params['day'] === 'number') cmcOpts.day = params['day'];
        return orchestrator.cmcRead(cmcOpts);
      }
      case 'kdmc_stats':
        return orchestrator.kdmcStats();
      case 'github_clean_notifications': {
        const { apexGithubNotifications } = await import('../integrations/apex-github-notifications.js');
        return apexGithubNotifications.cleanActionsNotifications();
      }
      case 'view_audit_log': {
        /* v13.4.215 — Navigation vers vue admin via router (déjà registrée v211) */
        try {
          const { router } = await import('../../core/router.js');
          router.navigate('audit-log-viewer');
          return { ok: true, action: 'navigated_to_audit_log_viewer', route: 'audit-log-viewer' };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
      case 'llm_council': {
        /* v13.4.364 (Kevin « Utilise toutes les ia dispo. Orchestre d'ia ») :
         * tool déclaré depuis longtemps mais JAMAIS dispatché (mort, erreur #28).
         * Câblé sur le crew RÉEL : brainstorm parallèle (chaque expert appelle SON
         * provider via streamSingle) + synthèse juge par Anthropic (conductor). */
        const { crewExperts } = await import('../ai/crew-experts.js');
        const task = String(params['task'] ?? '');
        if (!task) return { ok: false, error: 'task requis' };
        const maxRounds = Number(params['max_rounds'] ?? 3);
        const mode = maxRounds >= 2 ? 'debate' : 'consensus';
        const result = await crewExperts.run({
          task,
          systemPrompt: 'Tu es un expert du conseil multi-IA d\'APEX. Réponds précis, en français.',
          members: crewExperts.defaultMembers('specialized'),
          mode,
        });
        const synthesis = maxRounds >= 3
          ? await crewExperts.conductorSynthesis(result, task)
          : result.synthesis;
        return {
          synthesis,
          experts: result.responses.map((r) => ({
            ia: crewExperts.providerName(r.provider),
            expertise: r.expertise,
            ok: r.ok,
            extrait: r.text.slice(0, 300),
          })),
          conflicts: result.conflicts,
          consensus: result.consensus,
          latency_ms: result.totalLatencyMs,
          rounds_executed: maxRounds >= 3 ? ['brainstorm', 'debate', 'synthese_juge'] : maxRounds >= 2 ? ['brainstorm', 'debate'] : ['brainstorm'],
        };
      }
      case 'multi_branch_status': {
        const { apexMultiBranchCoordinator } = await import('../admin/apex-multi-branch-coordinator.js');
        const refresh = params['refresh'] === true;
        if (refresh) return apexMultiBranchCoordinator.runCoordinationCycle();
        return apexMultiBranchCoordinator.getLastReport() ?? apexMultiBranchCoordinator.runCoordinationCycle();
      }
      case 'github_mute_repo': {
        const { apexGithubNotifications } = await import('../integrations/apex-github-notifications.js');
        return apexGithubNotifications.muteRepo();
      }
      case 'open_tool':
        return orchestrator.openTool(params['tool_id'] as string);
      case 'read_logs':
        return readLogs(params['scope'] as string | undefined, params['limit'] as number | undefined);
      case 'vault_action':
        return vaultAction(params['action'] as string, params['key'] as string | undefined);
      case 'finance_calculate':
        return financeCalculate(params['type'] as string, params['params'] as Record<string, unknown>);
      case 'qr_generate':
        return qrGenerate(params['data'] as string, params['format'] as string | undefined);
      case 'translate':
        return translate(params['text'] as string, params['target_lang'] as string);
      case 'escalate_human':
        return escalateHuman(
          params['action'] as string,
          params['urgency'] as string,
          params['context'] as string | undefined,
        );
      case 'audit_self':
        return auditSelf(params['scope'] as string | undefined);
      case 'backup_trigger':
        return backupTrigger();
      case 'project_status':
        return projectStatus(params['project_id'] as string);
      case 'project_continue':
        return projectContinue(params['project_id'] as string);
      case 'search_latest_tools':
        return searchLatestTools(params['domain'] as string);
      case 'self_improve':
        return selfImprove(params['target'] as string | undefined);
      case 'knowledge_update':
        return knowledgeUpdate(params['provider'] as string);
      case 'memory_recall':
        return memoryRecall(params['keyword'] as string, params['scope'] as string | undefined);
      case 'memory_add':
        return memoryAdd(params['category'] as string, params['fact'] as string);
      case 'lesson_record':
        return lessonRecord(
          params['title'] as string,
          params['text'] as string,
          params['severity'] as string,
          params['category'] as string | undefined,
        );
      /* === v13.0.1 +10 tools === */
      case 'weather':
        return weather(params['location'] as string, params['days'] as number | undefined);
      case 'news_headlines':
        return newsHeadlines(
          params['category'] as string | undefined,
          params['country'] as string | undefined,
        );
      case 'market_data':
        return marketData(params['type'] as string, params['symbol'] as string);
      case 'scrape_url':
        return scrapeUrl(params['url'] as string);
      case 'clone_site':
        return cloneSite(params['url'] as string, params['mode'] as string | undefined);
      case 'osint_tools':
        return osintTools(params['category'] as string | undefined);
      case 'detect_intent':
        return detectIntent(params['text'] as string);
      case 'sentinels_status':
        return sentinelsStatus();
      case 'perf_metrics':
        return perfMetricsSnapshot();
      case 'voice_command':
      case 'screen_share':
      case 'multi_llm_consensus':
        /* Browser API only / orchestrator complexe — placeholder safe */
        return { placeholder: true, message: `Tool ${toolName} disponible côté UI (browser API).` };
      case 'execute_task': {
        /* Apex IA → Claude Code Action GitHub (autonomie totale) */
        const { apexExecute } = await import('../admin/apex-execute.js');
        const task = String(params['task'] ?? '');
        const taskParams = (params['params'] as Record<string, unknown>) ?? {};
        return apexExecute.requestExecution(task, taskParams as Record<string, unknown>, {
          src: 'apex',
          initiated_by: 'apex_ia',
        });
      }
      case 'list_executions': {
        const { apexExecute } = await import('../admin/apex-execute.js');
        const filterOpts: { status?: 'pending'; task?: 'modify_file'; limit?: number } = {};
        if (params['status']) filterOpts.status = params['status'] as 'pending';
        if (params['task']) filterOpts.task = params['task'] as 'modify_file';
        if (typeof params['limit'] === 'number') filterOpts.limit = params['limit'];
        return apexExecute.listPendingExecutions(filterOpts);
      }
      case 'poll_execution': {
        const { apexExecute } = await import('../admin/apex-execute.js');
        const id = String(params['task_id'] ?? '');
        if (!id) throw new Error('task_id requis');
        return apexExecute.pollResult(id);
      }
      case 'cancel_execution': {
        const { apexExecute } = await import('../admin/apex-execute.js');
        const id = String(params['task_id'] ?? '');
        if (!id) throw new Error('task_id requis');
        return { ok: apexExecute.cancelExecution(id) };
      }
      case 'execute_stats': {
        const { apexExecute } = await import('../admin/apex-execute.js');
        return apexExecute.getStats();
      }
      case 'edit_file':
      case 'commit_push':
      case 'run_test':
      case 'run_lint':
      case 'run_typecheck':
      case 'create_calendar_event':
      case 'send_email':
      case 'send_telegram':
      case 'ocr_scan':
      case 'image_analyze':
      case 'project_finish':
        /* Tools nécessitant Cloudflare Worker bridge ou capacités browser
         * → return placeholder (à wirer Jet 9 quand backend prêt) */
        return { placeholder: true, message: `Tool ${toolName} nécessite worker bridge (Jet 9)` };
      /* ========== APEX KNOWLEDGE BASE (RAG GitHub API) ========== */
      case 'search_repo_code': {
        const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
        const query = typeof params['query'] === 'string' ? params['query'] : '';
        const repo = typeof params['repo'] === 'string' && params['repo'] ? params['repo'] : undefined;
        if (!query) throw new Error('query required');
        const results = repo
          ? await apexKnowledgeBase.searchCode(query, repo)
          : await apexKnowledgeBase.searchCode(query);
        return { query, repo: repo ?? '9r4rxssx64-creator/CMCteams', total: results.length, results };
      }
      case 'read_repo_file': {
        const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
        const path = typeof params['path'] === 'string' ? params['path'] : '';
        const repo = typeof params['repo'] === 'string' && params['repo'] ? params['repo'] : undefined;
        if (!path) throw new Error('path required');
        const file = repo
          ? await apexKnowledgeBase.getFile(path, repo)
          : await apexKnowledgeBase.getFile(path);
        if (!file) return { found: false, path, repo: repo ?? '9r4rxssx64-creator/CMCteams' };
        return { found: true, ...file };
      }
      case 'list_repo_files': {
        const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
        const directory = typeof params['directory'] === 'string' ? params['directory'] : '';
        const repo = typeof params['repo'] === 'string' && params['repo'] ? params['repo'] : undefined;
        const list = repo
          ? await apexKnowledgeBase.listFiles(directory, repo)
          : await apexKnowledgeBase.listFiles(directory);
        return { directory, repo: repo ?? '9r4rxssx64-creator/CMCteams', total: list.length, files: list };
      }
      case 'get_recent_commits': {
        const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
        const limit = typeof params['limit'] === 'number' ? params['limit'] : 10;
        const repo = typeof params['repo'] === 'string' && params['repo'] ? params['repo'] : undefined;
        const commits = repo
          ? await apexKnowledgeBase.getRecentCommits(limit, repo)
          : await apexKnowledgeBase.getRecentCommits(limit);
        return { repo: repo ?? '9r4rxssx64-creator/CMCteams', total: commits.length, commits };
      }
      case 'get_repo_readme': {
        const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
        const repo = typeof params['repo'] === 'string' && params['repo'] ? params['repo'] : undefined;
        const readme = repo
          ? await apexKnowledgeBase.getReadme(repo)
          : await apexKnowledgeBase.getReadme();
        return { repo: repo ?? '9r4rxssx64-creator/CMCteams', found: !!readme, content: readme ?? '' };
      }
      /* ========== PUSH MAX v13.0.20 — implémentations 25 nouveaux tools ========== */
      /* Web extras */
      case 'wikipedia_lookup':
        return wikipediaLookup(
          params['query'] as string,
          (params['lang'] as string | undefined) ?? 'fr',
        );
      case 'youtube_search':
        return youtubeSearch(params['query'] as string);
      case 'github_search':
        return githubSearch(
          params['query'] as string,
          (params['type'] as string | undefined) ?? 'repositories',
        );
      case 'stackoverflow_search':
        return stackoverflowSearch(
          params['query'] as string,
          params['tag'] as string | undefined,
        );
      case 'unshorten_url':
        return unshortenUrl(params['url'] as string);
      /* Files & Documents */
      case 'json_validate':
        return jsonValidate(params['json'] as string);
      case 'csv_parse':
        return csvParse(
          params['csv'] as string,
          params['delimiter'] as string | undefined,
        );
      case 'text_diff':
        return textDiff(params['before'] as string, params['after'] as string);
      case 'hash_text':
        return hashText(
          params['text'] as string,
          (params['algo'] as string | undefined) ?? 'SHA-256',
        );
      case 'base64_encode_decode':
        return base64EncodeDecode(
          params['mode'] as string,
          params['text'] as string,
        );
      /* Code utils */
      case 'regex_test':
        return regexTest(
          params['pattern'] as string,
          params['text'] as string,
          params['flags'] as string | undefined,
        );
      case 'jwt_decode':
        return jwtDecode(params['token'] as string);
      case 'uuid_generate':
        return uuidGenerate((params['count'] as number | undefined) ?? 1);
      /* Productivity */
      case 'summarize_text':
        return summarizeText(
          params['text'] as string,
          (params['sentences'] as number | undefined) ?? 3,
        );
      case 'word_count':
        return wordCount(params['text'] as string);
      case 'detect_language':
        return detectLanguage(params['text'] as string);
      case 'mind_map_generate':
        return mindMapGenerate(
          params['topic'] as string,
          (params['branches'] as string[] | undefined) ?? [],
        );
      case 'create_task':
        return createTask(
          params['title'] as string,
          params['description'] as string | undefined,
          params['due'] as string | undefined,
          (params['priority'] as 'low' | 'normal' | 'high' | 'critical' | undefined) ?? 'normal',
        );
      /* Communications validators */
      case 'email_validate':
        return emailValidate(params['email'] as string);
      case 'phone_validate':
        return phoneValidate(
          params['phone'] as string,
          (params['country'] as string | undefined) ?? 'FR',
        );
      case 'whatsapp_link':
        return whatsappLink(
          params['phone'] as string,
          params['text'] as string | undefined,
        );
      /* Finance extras */
      case 'vat_validate_eu':
        return vatValidateEu(params['vat'] as string);
      case 'compound_interest':
        return compoundInterest(
          params['principal'] as number,
          params['rate'] as number,
          params['years'] as number,
          (params['frequency'] as number | undefined) ?? 12,
        );
      case 'currency_convert':
        return currencyConvert(
          params['amount'] as number,
          params['from'] as string,
          params['to'] as string,
        );
      /* Image utils */
      case 'image_compress':
        return imageCompress(
          params['image_base64'] as string,
          (params['quality'] as number | undefined) ?? 0.8,
          (params['max_width'] as number | undefined) ?? 1920,
        );
      /* === Autonomie totale Kevin 2026-05-04 ===
         Apex IA exécute tâches sur services externes (envoie email, crée issue,
         transfer paiement, post message) via clés API Kevin déjà configurées. */
      case 'execute_task_on_service':
      case 'execute_task_service':
      case 'autonomie_execute_service':
        return this.executeTaskOnService(
          params['service'] as string,
          params['task'] as string,
          (params['params'] as Record<string, unknown> | undefined) ?? {},
        );
      /* P0 PARITÉ CLAUDE CODE (Kevin screenshots 2026-05-07) :
       * Tools dédiés write fichier — short-circuits vers handleGithubTask. */
      case 'create_or_update_file':
      case 'create_file':
      case 'write_file': {
        return this.executeTaskOnService('github', 'create_or_update_file', params);
      }
      case 'delete_repo_file': {
        return this.executeTaskOnService('github', 'delete_file', params);
      }
      case 'list_task_on_service_handlers':
        return { handlers: this.listExecuteTaskHandlers() };
      /* === Personal Assistant (Kevin 2026-05-07) === */
      case 'whatsapp_send_message': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const phone = await resolvePhone(
          params['phone'] as string | undefined,
          params['contact_name'] as string | undefined,
        );
        if (!phone) return { ok: false, reason: 'Numéro ou contact_name requis (carnet vide ?)' };
        return personalAssistant.whatsappSendMessage({
          phone,
          message: (params['message'] as string) ?? '',
        });
      }
      case 'whatsapp_call': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const phone = await resolvePhone(
          params['phone'] as string | undefined,
          params['contact_name'] as string | undefined,
        );
        if (!phone) return { ok: false, reason: 'Numéro ou contact_name requis' };
        return personalAssistant.whatsappCall({ phone });
      }
      case 'whatsapp_video_call': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const phone = await resolvePhone(
          params['phone'] as string | undefined,
          params['contact_name'] as string | undefined,
        );
        if (!phone) return { ok: false, reason: 'Numéro ou contact_name requis' };
        return personalAssistant.whatsappCall({ phone, video: true });
      }
      case 'gmail_compose': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.gmailCompose({
          to: (params['to'] as string) ?? '',
          subject: (params['subject'] as string) ?? '',
          body: (params['body'] as string) ?? '',
        });
      }
      case 'gmail_list_unread': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.gmailListUnread((params['max'] as number | undefined) ?? 20);
      }
      case 'gmail_archive': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.gmailMoveLabel(
          (params['email_id'] as string) ?? '',
          (params['label'] as string) ?? 'archive',
          'INBOX',
        );
      }
      case 'outlook_compose': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.outlookCompose({
          to: (params['to'] as string) ?? '',
          subject: (params['subject'] as string) ?? '',
          body: (params['body'] as string) ?? '',
        });
      }
      case 'outlook_list_unread': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.outlookListUnread((params['max'] as number | undefined) ?? 20);
      }
      case 'facebook_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const fbOpts: { message?: string; mediaUrl?: string; pageId?: string } = {};
        if (typeof params['message'] === 'string') fbOpts.message = params['message'];
        if (typeof params['media_url'] === 'string') fbOpts.mediaUrl = params['media_url'];
        if (typeof params['page_id'] === 'string') fbOpts.pageId = params['page_id'];
        return personalAssistant.facebookPost(fbOpts);
      }
      case 'instagram_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const igType = (params['type'] as string) ?? 'image';
        const igOpts: { mediaUrl: string; caption?: string; type: 'image' | 'video' | 'reel' } = {
          mediaUrl: (params['media_url'] as string) ?? '',
          type: igType === 'video' ? 'video' : igType === 'reel' ? 'reel' : 'image',
        };
        if (typeof params['caption'] === 'string') igOpts.caption = params['caption'];
        return personalAssistant.instagramPost(igOpts);
      }
      case 'tiktok_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.tiktokPost({
          videoUrl: (params['video_url'] as string) ?? '',
          caption: (params['caption'] as string) ?? '',
        });
      }
      case 'youtube_upload': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const ytOpts: {
          videoBlob?: Blob;
          title: string;
          description: string;
          tags?: string[];
          privacy?: 'public' | 'unlisted' | 'private';
        } = {
          title: (params['title'] as string) ?? '',
          description: (params['description'] as string) ?? '',
        };
        if (Array.isArray(params['tags'])) ytOpts.tags = params['tags'] as string[];
        const priv = params['privacy'] as string | undefined;
        if (priv === 'public' || priv === 'unlisted' || priv === 'private') ytOpts.privacy = priv;
        if (params['video_blob'] instanceof Blob) ytOpts.videoBlob = params['video_blob'];
        return personalAssistant.youtubeUpload(ytOpts);
      }
      case 'linkedin_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const liOpts: { text: string; mediaUrl?: string } = {
          text: (params['text'] as string) ?? '',
        };
        if (typeof params['media_url'] === 'string') liOpts.mediaUrl = params['media_url'];
        return personalAssistant.linkedinPost(liOpts);
      }
      case 'twitter_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.twitterPost({ text: (params['text'] as string) ?? '' });
      }
      case 'telegram_send': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.telegramSendMessage({
          chatId: (params['chat_id'] as string) ?? '',
          text: (params['text'] as string) ?? '',
        });
      }
      case 'discord_webhook': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.discordWebhook({
          url: (params['url'] as string) ?? '',
          content: (params['content'] as string) ?? '',
        });
      }
      case 'slack_post': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const slackOpts: { channel: string; text: string; webhookUrl?: string } = {
          channel: (params['channel'] as string) ?? '',
          text: (params['text'] as string) ?? '',
        };
        if (typeof params['webhook_url'] === 'string') slackOpts.webhookUrl = params['webhook_url'];
        return personalAssistant.slackPost(slackOpts);
      }
      case 'notion_create_page': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.notionCreatePage({
          databaseId: (params['database_id'] as string) ?? '',
          title: (params['title'] as string) ?? '',
          content: (params['content'] as string) ?? '',
        });
      }
      case 'google_photos_list': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const albumId = params['album_id'] as string | undefined;
        const max = (params['max'] as number | undefined) ?? 50;
        return albumId
          ? personalAssistant.googlePhotosList(albumId, max)
          : personalAssistant.googlePhotosList(undefined, max);
      }
      case 'google_photos_organize': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const orgOpts: { albumName: string; photoIds?: string[] } = {
          albumName: (params['album_name'] as string) ?? '',
        };
        if (Array.isArray(params['photo_ids'])) orgOpts.photoIds = params['photo_ids'] as string[];
        return personalAssistant.googlePhotosOrganize(orgOpts);
      }
      case 'spotify_play': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const spOpts: { trackId?: string; contextUri?: string; deviceId?: string } = {};
        if (typeof params['track_id'] === 'string') spOpts.trackId = params['track_id'];
        if (typeof params['context_uri'] === 'string') spOpts.contextUri = params['context_uri'];
        if (typeof params['device_id'] === 'string') spOpts.deviceId = params['device_id'];
        return personalAssistant.spotifyPlay(spOpts);
      }
      case 'spotify_create_playlist': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const spOpts: { name: string; trackIds?: string[]; isPublic?: boolean } = {
          name: (params['name'] as string) ?? '',
        };
        if (Array.isArray(params['track_ids'])) spOpts.trackIds = params['track_ids'] as string[];
        if (params['is_public'] !== undefined) {
          spOpts.isPublic = params['is_public'] === true || params['is_public'] === 'true';
        }
        return personalAssistant.spotifyCreatePlaylist(spOpts);
      }
      case 'icloud_photos_list': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return personalAssistant.icloudPhotosList();
      }
      case 'integrations_capabilities': {
        const { personalAssistant } = await import('./personal-assistant.js');
        const filterService = params['service'] as string | undefined;
        return filterService
          ? { capabilities: personalAssistant.getCapabilitiesForService(filterService) }
          : { capabilities: personalAssistant.getCapabilities() };
      }
      case 'integrations_oauth_health': {
        const { personalAssistant } = await import('./personal-assistant.js');
        return { services: await personalAssistant.checkAllOAuth() };
      }
      /* === Contacts === */
      case 'contact_add': {
        const { contacts } = await import('../integrations/contacts.js');
        const cInput: {
          name: string;
          phone?: string;
          email?: string;
          whatsapp?: string;
          aliases?: string[];
          notes?: string;
        } = { name: (params['name'] as string) ?? '' };
        if (typeof params['phone'] === 'string') cInput.phone = params['phone'];
        if (typeof params['email'] === 'string') cInput.email = params['email'];
        if (typeof params['whatsapp'] === 'string') cInput.whatsapp = params['whatsapp'];
        if (Array.isArray(params['aliases'])) cInput.aliases = params['aliases'] as string[];
        if (typeof params['notes'] === 'string') cInput.notes = params['notes'];
        return { ok: true, contact: contacts.add(cInput) };
      }
      case 'contact_search': {
        const { contacts } = await import('../integrations/contacts.js');
        const opts: { maxResults?: number } = {};
        if (typeof params['max'] === 'number') opts.maxResults = params['max'];
        return {
          ok: true,
          results: contacts.search((params['query'] as string) ?? '', opts),
        };
      }
      case 'contact_list': {
        const { contacts } = await import('../integrations/contacts.js');
        return { ok: true, contacts: contacts.list() };
      }
      case 'contact_remove': {
        const { contacts } = await import('../integrations/contacts.js');
        return { ok: contacts.remove((params['id'] as string) ?? '') };
      }
      /* === Image Generate — v13.4.350 (audit amélioration Top #3 : le case manquait,
       * l'outil était routé mais « génère une image » ne faisait rien) === */
      case 'image_generate':
      case 'generate_image': {
        const { imageTransform } = await import('./image-transform.js');
        const prompt = String(params['prompt'] ?? params['text'] ?? params['description'] ?? '').trim();
        if (!prompt) throw new Error('prompt requis — décris l\'image à générer');
        return await imageTransform.generateImage(prompt);
      }
      /* === Image Transform — Kevin "polyvalent créatif" 2026-05-07 === */
      case 'transform_image':
      case 'cartoonify':
      case 'animate_image':
      case 'image_to_video':
      case 'remove_background':
      case 'stylize_image': {
        const { imageTransform } = await import('./image-transform.js');
        const url = (params['url'] as string) ?? '';
        if (!url || !imageTransform.isValidImageUrl(url)) {
          throw new Error('url invalide (https/data:/blob: requis)');
        }
        /* Aliases shorthand → type */
        let type = (params['type'] as string) ?? '';
        if (toolName === 'cartoonify') type = 'cartoon';
        else if (toolName === 'animate_image' || toolName === 'image_to_video') type = 'video';
        else if (toolName === 'remove_background') type = 'remove-bg';
        else if (toolName === 'stylize_image') type = 'stylize';
        if (!imageTransform.isValidTransformType(type)) {
          throw new Error(`type invalide (cartoon | anime | video | remove-bg | stylize). Reçu: ${type}`);
        }
        const prompt = params['prompt'] as string | undefined;
        let result;
        if (type === 'cartoon') result = await imageTransform.cartoonify(url);
        else if (type === 'anime') result = await imageTransform.animeStyle(url);
        else if (type === 'video') result = await imageTransform.animateToVideo(url);
        else if (type === 'remove-bg') result = await imageTransform.removeBg(url);
        else result = await imageTransform.stylize(url, prompt ?? '');
        return result;
      }
      /* === Marketplace Plugins (Kevin 2026-05-04 — Apex peut s'auto-étendre) === */
      case 'marketplace_list_installed': {
        const { apexPluginsMarketplace } = await import('./apex-plugins-marketplace.js');
        const installed = apexPluginsMarketplace.list({ status: 'installed' });
        return {
          count: installed.length,
          plugins: installed.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            tools: p.apex_tools ?? [],
          })),
          stats: apexPluginsMarketplace.getStats(),
        };
      }
      case 'marketplace_search': {
        const { apexPluginsMarketplace } = await import('./apex-plugins-marketplace.js');
        const query = String(params['query'] ?? '');
        const max = typeof params['max'] === 'number' ? (params['max'] as number) : 30;
        const results = apexPluginsMarketplace.search(query, max);
        return {
          query,
          count: results.length,
          plugins: results.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            category: p.category,
            source: p.source,
            status: apexPluginsMarketplace.getStatusOf(p.id),
            pwa_compatible: p.pwa_compatible,
            value: p.estimated_value,
            url: p.url,
          })),
        };
      }
      case 'marketplace_install': {
        const { apexPluginsMarketplace } = await import('./apex-plugins-marketplace.js');
        const pluginId = String(params['plugin_id'] ?? '');
        if (!pluginId) throw new Error('plugin_id requis');
        const result = await apexPluginsMarketplace.install(pluginId);
        return result;
      }
      case 'marketplace_recommend': {
        const { apexPluginsMarketplace } = await import('./apex-plugins-marketplace.js');
        const category = params['category'] as string | undefined;
        const max = typeof params['max'] === 'number' ? (params['max'] as number) : 20;
        const minValue = (params['min_value'] as 'critical' | 'high' | 'medium' | 'low' | undefined) ?? 'medium';
        const recos = apexPluginsMarketplace.recommendForUser({
          ...(category && { category: category as never }),
          max,
          minValue,
        });
        return {
          count: recos.length,
          recommendations: recos.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            category: p.category,
            value: p.estimated_value,
            requires_api_key: p.api_key_service ?? null,
          })),
        };
      }
      /* === Méta-Marketplace (Kevin 2026-05-07 — hub 30+ marketplaces) === */
      case 'meta_search': {
        const { apexMetaMarketplace } = await import('./apex-meta-marketplace.js');
        const query = String(params['query'] ?? '');
        const limit = typeof params['limit'] === 'number' ? (params['limit'] as number) : 50;
        const includeNonPwa = params['include_non_pwa'] === true;
        const categoriesRaw = params['categories'];
        const opts: {
          categories?: import('./apex-meta-marketplace.js').MarketplaceCategory[];
          limit?: number;
          include_non_pwa?: boolean;
        } = { limit };
        if (includeNonPwa) opts.include_non_pwa = true;
        if (typeof categoriesRaw === 'string' && categoriesRaw.trim()) {
          opts.categories = categoriesRaw
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean) as import('./apex-meta-marketplace.js').MarketplaceCategory[];
        }
        const items = await apexMetaMarketplace.searchAll(query, opts);
        return {
          query,
          count: items.length,
          items: items.map((it) => ({
            id: it.id,
            marketplace: it.marketplace,
            name: it.name,
            description: it.description,
            url: it.url,
            ...(it.category && { category: it.category }),
            ...(typeof it.stars === 'number' && { stars: it.stars }),
            ...(typeof it.downloads === 'number' && { downloads: it.downloads }),
            ...(it.install_method && { install_method: it.install_method }),
          })),
        };
      }
      case 'meta_install': {
        const { apexMetaMarketplace } = await import('./apex-meta-marketplace.js');
        const providerId = String(params['providerId'] ?? '');
        const itemId = String(params['itemId'] ?? '');
        if (!providerId || !itemId) throw new Error('providerId et itemId requis');
        const result = await apexMetaMarketplace.install(providerId, itemId);
        return result;
      }
      case 'meta_trending': {
        const { apexMetaMarketplace } = await import('./apex-meta-marketplace.js');
        const providerId = String(params['providerId'] ?? '');
        if (!providerId) throw new Error('providerId requis');
        const limit = typeof params['limit'] === 'number' ? (params['limit'] as number) : 10;
        const items = await apexMetaMarketplace.getTrending(providerId, limit);
        return { providerId, count: items.length, items };
      }
      case 'meta_recommend': {
        const { apexMetaMarketplace } = await import('./apex-meta-marketplace.js');
        const recos = await apexMetaMarketplace.recommendForApex();
        return {
          count: recos.length,
          recommendations: recos,
        };
      }
      case 'meta_list_providers': {
        const { apexMetaMarketplace } = await import('./apex-meta-marketplace.js');
        const filter: {
          category?: import('./apex-meta-marketplace.js').MarketplaceCategory;
          pwa_compatible?: boolean;
          api_key_required?: boolean;
        } = {};
        if (typeof params['category'] === 'string') {
          filter.category = params['category'] as import('./apex-meta-marketplace.js').MarketplaceCategory;
        }
        if (typeof params['pwa_compatible'] === 'boolean') filter.pwa_compatible = params['pwa_compatible'];
        if (typeof params['api_key_required'] === 'boolean') filter.api_key_required = params['api_key_required'];
        const providers = apexMetaMarketplace.listProviders(filter);
        return {
          count: providers.length,
          providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            url: p.url,
            pwa_compatible: p.pwa_compatible,
            api_key_required: p.api_key_required,
            api_key_service: p.api_key_service ?? null,
            free_tier_available: p.free_tier_available,
            description: p.description,
          })),
          stats: apexMetaMarketplace.getStats(),
        };
      }
      /* v13.3.51 — Vision device + Broadlink (Kevin 2026-05-07 "rien fait avec mes photos") */
      case 'analyze_device_image': {
        const { visionDeviceAnalyze } = await import('../ai/vision-device-analyze.js');
        const dataUrl = typeof params['image_data_url'] === 'string' ? params['image_data_url'] : undefined;
        const b64 = typeof params['image_base64'] === 'string' ? params['image_base64'] : undefined;
        if (!dataUrl && !b64) throw new Error('image_data_url ou image_base64 requis');
        const forceType = typeof params['force_type'] === 'string' ? params['force_type'] : 'auto';
        const input = dataUrl ? { imageDataUrl: dataUrl } : { imageBase64: b64! };
        if (forceType === 'broadlink_account') {
          const r = await visionDeviceAnalyze.analyzeBroadlinkAccount(input);
          return { ok: true, type: 'broadlink_account', ...r };
        }
        if (forceType === 'smart_tv') {
          const r = await visionDeviceAnalyze.analyzeSmartTV(input);
          return { ok: true, type: 'smart_tv', ...r };
        }
        const r = await visionDeviceAnalyze.autoDetectAndAnalyze(input);
        return { ok: true, ...r };
      }
      case 'setup_broadlink_from_image': {
        const { visionDeviceAnalyze } = await import('../ai/vision-device-analyze.js');
        const { broadlinkBridge } = await import('../integrations/broadlink-bridge.js');
        const dataUrl = typeof params['image_data_url'] === 'string' ? params['image_data_url'] : undefined;
        const b64 = typeof params['image_base64'] === 'string' ? params['image_base64'] : undefined;
        if (!dataUrl && !b64) throw new Error('image_data_url ou image_base64 requis');
        const input = dataUrl ? { imageDataUrl: dataUrl } : { imageBase64: b64! };
        const analysis = await visionDeviceAnalyze.analyzeBroadlinkAccount(input);
        if (!analysis.token) {
          return {
            ok: false,
            reason: 'no_token_visible',
            message: 'Aucun token visible dans l\'image. Connecte-toi via la vue ?view=broadlink-setup avec email + password.',
            analysis,
          };
        }
        const setupResult = await broadlinkBridge.setToken(analysis.token, analysis.email);
        return {
          ok: setupResult.ok,
          token_stored: setupResult.ok,
          email: analysis.email,
          devices_detected: analysis.devices?.length ?? 0,
          devices: analysis.devices,
        };
      }
      case 'broadlink_list_devices': {
        const { broadlinkBridge } = await import('../integrations/broadlink-bridge.js');
        const force = params['force_refresh'] === true;
        const devices = await broadlinkBridge.listDevices(force);
        return { ok: true, count: devices.length, devices };
      }
      case 'broadlink_send_ir': {
        const { broadlinkBridge } = await import('../integrations/broadlink-bridge.js');
        const deviceId = typeof params['device_id'] === 'string' ? params['device_id'] : '';
        let irHex = typeof params['ir_hex'] === 'string' ? params['ir_hex'] : '';
        const learnedName = typeof params['learned_name'] === 'string' ? params['learned_name'] : '';
        if (!irHex && learnedName && deviceId) {
          const codes = await broadlinkBridge.getLearnedCodes(deviceId);
          const found = codes.find((c) => c.name === learnedName);
          if (found) irHex = found.ir_hex;
        }
        if (!deviceId || !irHex) {
          return { ok: false, error: 'device_id + (ir_hex ou learned_name avec code appris) requis' };
        }
        const r = await broadlinkBridge.sendIR(deviceId, irHex);
        return r;
      }
      /* v13.3.52 — IoT multi-providers framework (Kevin 2026-05-07) */
      case 'install_iot_provider': {
        const { iotRegistry } = await import('../integrations/iot-providers-registry.js');
        const providerId = typeof params['provider_id'] === 'string' ? params['provider_id'] : '';
        const credsRaw = params['credentials'];
        const credentials =
          credsRaw && typeof credsRaw === 'object' && !Array.isArray(credsRaw)
            ? (credsRaw as Record<string, string>)
            : {};
        const region = typeof params['region'] === 'string' ? params['region'] : undefined;
        if (!providerId || Object.keys(credentials).length === 0) {
          return { ok: false, error: 'provider_id + credentials requis' };
        }
        const installInput = region
          ? { provider_id: providerId, credentials, region }
          : { provider_id: providerId, credentials };
        const r = await iotRegistry.configureProvider(installInput);
        return r;
      }
      case 'iot_list_devices': {
        const { iotRegistry } = await import('../integrations/iot-providers-registry.js');
        const providerId = typeof params['provider_id'] === 'string' ? params['provider_id'] : '';
        const devices = providerId
          ? await iotRegistry.listDevicesFor(providerId)
          : await iotRegistry.listAllDevices();
        return { ok: true, count: devices.length, devices };
      }
      case 'iot_send_command': {
        const { iotRegistry } = await import('../integrations/iot-providers-registry.js');
        const providerId = typeof params['provider_id'] === 'string' ? params['provider_id'] : '';
        const deviceId = typeof params['device_id'] === 'string' ? params['device_id'] : '';
        const cmdRaw = params['command'];
        const command =
          cmdRaw && typeof cmdRaw === 'object' && !Array.isArray(cmdRaw)
            ? (cmdRaw as Record<string, unknown>)
            : {};
        if (!providerId || !deviceId) return { ok: false, error: 'provider_id + device_id requis' };
        const r = await iotRegistry.sendCommand(providerId, deviceId, command);
        return r;
      }
      case 'iot_test_provider': {
        const { iotRegistry } = await import('../integrations/iot-providers-registry.js');
        const providerId = typeof params['provider_id'] === 'string' ? params['provider_id'] : '';
        if (!providerId) return { ok: false, error: 'provider_id requis' };
        const r = await iotRegistry.testConnection(providerId);
        return r;
      }
      /* v13.3.64 — Admin reset PIN cross-device (Kevin 2026-05-08).
         Push command Firebase ; iPhone target SSE listener (admin-commands-listener.ts)
         applique reset local + toast + reload. */
      case 'reset_user_pin': {
        const targetUid = typeof params['target_uid'] === 'string' ? params['target_uid'] : '';
        const reason = typeof params['reason'] === 'string' ? params['reason'] : '';
        const { adminCommands } = await import('../admin/admin-commands.js');
        return adminCommands.resetUserPin(targetUid, reason);
      }
      /* === v13 — Browser controller (anti-blocage X-Frame-Options) === */
      case 'unblock_url': {
        const { axTryUnblockUrl } = await import('../integrations/browser-controller.js');
        const url = String(params['url'] ?? '');
        if (!url) return { ok: false, error: 'url required' };
        return await axTryUnblockUrl(url);
      }
      case 'navigate_to': {
        const { axNavigateTo } = await import('../integrations/browser-controller.js');
        const target = String(params['target'] ?? '');
        const field = typeof params['field'] === 'string' ? params['field'] : undefined;
        if (!target) return { ok: false, error: 'target required' };
        return await axNavigateTo(target, field);
      }
      case 'autofill_field': {
        const { axAutofillField } = await import('./form-auto-fill.js');
        const key = String(params['key'] ?? '');
        const value = String(params['value'] ?? '');
        if (!key || !value) return { ok: false, error: 'key and value required' };
        const opts: { confirm?: boolean; reason?: string } = {};
        if (typeof params['confirm'] === 'boolean') opts.confirm = params['confirm'];
        if (typeof params['reason'] === 'string') opts.reason = params['reason'];
        return await axAutofillField(key, value, opts);
      }
      /* v13.3.69 — Setup compte user complet (PIN + activation) en autonomie totale */
      case 'setup_user_account': {
        const targetUid = typeof params['target_uid'] === 'string' ? params['target_uid'] : '';
        const pinClear = typeof params['pin_clear'] === 'string' ? params['pin_clear'] : '';
        const displayName = typeof params['display_name'] === 'string' ? params['display_name'] : undefined;
        const reason = typeof params['reason'] === 'string' ? params['reason'] : '';
        if (!targetUid || !pinClear) return { ok: false, error: 'target_uid et pin_clear requis' };
        if (!/^\d{4,12}$/.test(pinClear)) return { ok: false, error: 'PIN doit être 4-12 chiffres' };
        const { auth } = await import('../auth/auth.js');
        const { adminCommands } = await import('../admin/admin-commands.js');
        const pinHash = await auth.hashPin(pinClear, targetUid);
        const setupOpts: { targetUid: string; pinHash: string; displayName?: string; reason?: string } = { targetUid, pinHash };
        if (displayName) setupOpts.displayName = displayName;
        if (reason) setupOpts.reason = reason;
        return adminCommands.setupAccount(setupOpts);
      }
      /* === v13 — MCP Memory Server (knowledge graph local — issue #240 innovation gratuite) === */
      case 'memory_add_entity': {
        const { mcpMemoryServer } = await import('../ai/mcp-memory-server.js');
        const name = String(params['name'] ?? '');
        const type = String(params['type'] ?? '');
        if (!name || !type) throw new Error('name and type required');
        const obs = Array.isArray(params['observations'])
          ? (params['observations'] as unknown[]).filter((o): o is string => typeof o === 'string')
          : [];
        return await mcpMemoryServer.addEntity(name, type, obs);
      }
      case 'memory_add_relation': {
        const { mcpMemoryServer } = await import('../ai/mcp-memory-server.js');
        const fromId = String(params['from_id'] ?? '');
        const toId = String(params['to_id'] ?? '');
        const type = String(params['type'] ?? '');
        if (!fromId || !toId || !type) throw new Error('from_id, to_id and type required');
        return await mcpMemoryServer.addRelation(fromId, toId, type);
      }
      case 'memory_search': {
        const { mcpMemoryServer } = await import('../ai/mcp-memory-server.js');
        const query = String(params['query'] ?? '');
        if (!query) throw new Error('query required');
        const opts: { limit?: number; type?: string } = {};
        if (typeof params['limit'] === 'number') opts.limit = params['limit'];
        if (typeof params['type'] === 'string' && params['type']) opts.type = params['type'];
        const hits = await mcpMemoryServer.search(query, opts);
        return { hits, count: hits.length };
      }
      case 'memory_get_related': {
        const { mcpMemoryServer } = await import('../ai/mcp-memory-server.js');
        const entityId = String(params['entity_id'] ?? '');
        if (!entityId) throw new Error('entity_id required');
        const depth = typeof params['depth'] === 'number' ? params['depth'] : 1;
        const related = await mcpMemoryServer.getRelated(entityId, depth);
        return { related, count: related.length };
      }
      /* === v13 — Sequential Thinking MCP (raisonnement multi-étapes — issue #240) === */
      case 'thinking_start': {
        const { sequentialThinking } = await import('../ai/sequential-thinking.js');
        const problem = String(params['problem'] ?? '');
        if (!problem) throw new Error('problem required');
        const estimated = typeof params['estimated_steps'] === 'number' ? params['estimated_steps'] : undefined;
        return await sequentialThinking.startThought(problem, estimated);
      }
      case 'thinking_add_step': {
        const { sequentialThinking } = await import('../ai/sequential-thinking.js');
        const thoughtId = String(params['thought_id'] ?? '');
        const content = String(params['content'] ?? '');
        if (!thoughtId || !content) throw new Error('thought_id and content required');
        const opts: { reflections?: string; can_revise?: boolean } = {};
        if (typeof params['reflections'] === 'string' && params['reflections']) {
          opts.reflections = params['reflections'];
        }
        if (typeof params['can_revise'] === 'boolean') opts.can_revise = params['can_revise'];
        return await sequentialThinking.addStep(thoughtId, content, opts);
      }
      case 'thinking_revise': {
        const { sequentialThinking } = await import('../ai/sequential-thinking.js');
        const thoughtId = String(params['thought_id'] ?? '');
        const stepIndex = typeof params['step_index'] === 'number' ? params['step_index'] : -1;
        const newContent = String(params['new_content'] ?? '');
        if (!thoughtId || stepIndex < 0 || !newContent) {
          throw new Error('thought_id, step_index, and new_content required');
        }
        return await sequentialThinking.revise(thoughtId, stepIndex, newContent);
      }
      case 'thinking_branch': {
        const { sequentialThinking } = await import('../ai/sequential-thinking.js');
        const thoughtId = String(params['thought_id'] ?? '');
        const fromStep = typeof params['from_step'] === 'number' ? params['from_step'] : -1;
        const alternative = String(params['alternative'] ?? '');
        if (!thoughtId || fromStep < 0 || !alternative) {
          throw new Error('thought_id, from_step, and alternative required');
        }
        return await sequentialThinking.branch(thoughtId, fromStep, alternative);
      }
      case 'thinking_complete': {
        const { sequentialThinking } = await import('../ai/sequential-thinking.js');
        const thoughtId = String(params['thought_id'] ?? '');
        const conclusion = String(params['conclusion'] ?? '');
        if (!thoughtId || !conclusion) throw new Error('thought_id and conclusion required');
        return await sequentialThinking.complete(thoughtId, conclusion);
      }

      /* ─────────── Skills 2026 (Docx/Pptx/Xlsx/Pdf/Video/Design/MCP) ─────────── */
      case 'generate_docx':
        return await dispatchGenerateDocx(params);
      case 'generate_pptx':
        return await dispatchGeneratePptx(params);
      case 'generate_xlsx':
        return await dispatchGenerateXlsx(params);
      case 'generate_pdf':
        return await dispatchGeneratePdf(params);
      case 'video_edit':
        return await dispatchVideoEdit(params);
      case 'video_compose_hyperframes':
        return await dispatchVideoComposeHyperframes(params);
      case 'skill_factory_create':
        return await dispatchSkillFactoryCreate(params);
      case 'security_review':
        return await dispatchSecurityReview(params);
      case 'code_review':
        return await dispatchCodeReview(params);
      case 'seo_audit':
        return await dispatchSeoAudit(params);
      case 'seo_ai_visibility':
        return await dispatchSeoAiVisibility(params);
      case 'generate_design_system':
        return await dispatchGenerateDesignSystem(params);
      case 'generate_marketing_copy':
        return await dispatchGenerateMarketingCopy(params);
      case 'mcp_bofip_search':
        return await dispatchMcpBofipSearch(params);
      case 'mcp_almanac_research':
        return await dispatchMcpAlmanacResearch(params);
      case 'mcp_legal_search':
        return await dispatchMcpLegalSearch(params);
      case 'futuristic_module_invoke':
        return await dispatchFuturisticModuleInvoke(params);

      default:
        throw new Error(`Tool inconnu: ${toolName}`);
    }
  }

  /* === Implémentations tools === */


  /**
   * Kevin règle "1 CLIC + FENÊTRE + BOUTON DIRECT" :
   * Ouvre modal pop-up avec lien direct cliquable (pas window.open auto).
   * IA appelle ce tool quand user dit "ouvre Google", "va sur tel site", etc.
   */
  private async openUrlModal(url: string, label?: string, description?: string): Promise<{ ok: boolean; url: string; opened: boolean }> {
    const cleanUrl = url.trim();
    if (!cleanUrl) return { ok: false, url: '', opened: false };
    /* Préfixe https:// si manquant */
    const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    /* Domain pour label par défaut */
    let domain = fullUrl;
    try {
      domain = new URL(fullUrl).hostname.replace(/^www\./, '');
    } catch { /* skip */ }
    const labelText = label ?? domain;
    const descText = description ?? `Ouvre ${domain} dans un nouvel onglet`;
    /* Ouvre modal-sheet UI (Kevin règle 1-clic) */
    try {
      const { modalSheet } = await import('../../ui/modal-sheet.js');
      const sheet = modalSheet.open({
        title: `🌐 ${labelText}`,
        content: `
          <div style="padding:8px 0">
            <p style="margin:0 0 16px;color:var(--ax-text-dim)">${descText}</p>
            <div style="background:rgba(201,162,39,0.08);border:1px solid rgba(201,162,39,0.3);border-radius:8px;padding:12px;font-family:monospace;font-size:13px;word-break:break-all;color:#c9a227">
              ${fullUrl.replace(/[<>"']/g, '')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
              <button class="ax-btn ax-btn-secondary" data-tool-action="openurl-internal">📱 Ouvrir dans Apex</button>
              <button class="ax-btn ax-btn-primary" data-tool-action="openurl-external">🌐 Ouvrir Safari</button>
            </div>
          </div>
        `,
        actions: [
          {
            label: 'Annuler',
            variant: 'ghost',
            onClick: () => { sheet.close(); },
          },
        ],
      });
      /* P0 fix audit Cure53/NCC : event delegation au lieu d'addEventListener par bouton.
         1 listener global sur document.body via installDelegation() — pas de leak par modal. */
      const unregInternal = this.registerToolAction('openurl-internal', () => {
        sheet.close();
        try {
          localStorage.setItem('apex_v13_browser_last_url', fullUrl);
        } catch { /* skip */ }
        if (typeof location !== 'undefined') location.hash = '#browser';
        unregInternal();
        unregExternal();
      });
      const unregExternal = this.registerToolAction('openurl-external', () => {
        sheet.close();
        if (typeof window !== 'undefined') window.open(fullUrl, '_blank', 'noopener,noreferrer');
        unregInternal();
        unregExternal();
      });
      return { ok: true, url: fullUrl, opened: true };
    } catch (err: unknown) {
      logger.warn('apex-tools', 'openUrlModal failed', { err });
      return { ok: false, url: fullUrl, opened: false };
    }
  }


  /* === Tools meta-projets Kevin === */


  /* === Implémentations v13.0.1 (+10 tools) === */


  /* ========== PUSH MAX v13.0.20 — Implémentations 25 nouveaux tools ==========
     Tous offline-first ou fetch lazy avec timeout + fallback gracieux.
     Aucune dépendance paid, aucune clé requise par défaut. */

  /* === Web extras === */


  /* === Files & Documents === */


  /* === Code utils === */


  /* === Productivity === */


  /* === Communications validators === */


  /* === Finance extras === */


  /* === Image utils === */


  /* ============================================================================
   * EXECUTE TASK ON SERVICE — Autonomie totale Kevin 2026-05-04
   *
   * Apex IA exécute des tâches concrètes sur services Kevin (clé API configurée).
   * Ex : send_email Resend, create_issue GitHub, transfer Stripe, post Telegram.
   *
   * Sécurité :
   * - Whitelist stricte de services + actions
   * - Toute action audit-loggée
   * - Pas d'exécution si clé non configurée (vault.readKey vide)
   * - Pas de delete/destruction sans confirmation explicite (params.confirm=true)
   * ============================================================================ */

  /**
   * Liste des handlers disponibles (pour list_task_on_service_handlers tool).
   */
  listExecuteTaskHandlers(): string[] {
    return [
      'github', 'stripe', 'resend', 'telegram', 'brevo',
      'openai', 'anthropic', 'vercel', 'cloudflare', 'paypal',
      'discord', 'slack', 'notion', 'airtable', 'shopify',
    ];
  }

  /**
   * Dispatcher service → handler. Retourne {ok, result?, error?}.
   */
  async executeTaskOnService(
    service: string,
    task: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; service: string; task: string; result?: unknown; error?: string; duration_ms?: number }> {
    const start = Date.now();
    if (!service) return { ok: false, service: '', task, error: 'service required' };
    if (!task) return { ok: false, service, task: '', error: 'task required' };
    const normSvc = service.toLowerCase().trim();
    const normTask = task.toLowerCase().trim();

    /* Audit log avant exécution */
    void auditLog.record('execute_task_on_service.start', {
      details: { service: normSvc, task: normTask, params: sanitizeForAudit(params) },
    });

    try {
      let result: unknown;
      /* v13.3.62 code-split : handlers lazy-loaded depuis apex-tools-handlers/.
         Bénéfice : -25KB raw du chunk principal apex-tools-dispatch. */
      switch (normSvc) {
        case 'github': {
          const m = await import('../apex-tools-handlers/github.js');
          result = await m.handleGithubTask(normTask, params);
          break;
        }
        case 'stripe': {
          const m = await import('../apex-tools-handlers/payments.js');
          result = await m.handleStripeTask(normTask, params);
          break;
        }
        case 'paypal': {
          const m = await import('../apex-tools-handlers/payments.js');
          result = await m.handlePaypalTask(normTask, params);
          break;
        }
        case 'resend': {
          const m = await import('../apex-tools-handlers/comm.js');
          result = await m.handleResendTask(normTask, params);
          break;
        }
        case 'telegram': {
          const m = await import('../apex-tools-handlers/comm.js');
          result = await m.handleTelegramTask(normTask, params);
          break;
        }
        case 'brevo':
        case 'sendinblue': {
          const m = await import('../apex-tools-handlers/comm.js');
          result = await m.handleBrevoTask(normTask, params);
          break;
        }
        case 'discord': {
          const m = await import('../apex-tools-handlers/comm.js');
          result = await m.handleDiscordTask(normTask, params);
          break;
        }
        case 'slack': {
          const m = await import('../apex-tools-handlers/comm.js');
          result = await m.handleSlackTask(normTask, params);
          break;
        }
        case 'openai': {
          const m = await import('../apex-tools-handlers/ai.js');
          result = await m.handleOpenaiTask(normTask, params);
          break;
        }
        case 'anthropic': {
          const m = await import('../apex-tools-handlers/ai.js');
          result = await m.handleAnthropicTask(normTask, params);
          break;
        }
        case 'vercel': {
          const m = await import('../apex-tools-handlers/cloud.js');
          result = await m.handleVercelTask(normTask, params);
          break;
        }
        case 'cloudflare': {
          const m = await import('../apex-tools-handlers/cloud.js');
          result = await m.handleCloudflareTask(normTask, params);
          break;
        }
        case 'notion': {
          const m = await import('../apex-tools-handlers/data.js');
          result = await m.handleNotionTask(normTask, params);
          break;
        }
        case 'airtable': {
          const m = await import('../apex-tools-handlers/data.js');
          result = await m.handleAirtableTask(normTask, params);
          break;
        }
        case 'shopify': {
          const m = await import('../apex-tools-handlers/data.js');
          result = await m.handleShopifyTask(normTask, params);
          break;
        }
        default:
          throw new Error(`Service non supporté : ${normSvc}. Services dispo : ${this.listExecuteTaskHandlers().join(', ')}`);
      }
      const duration = Date.now() - start;
      void auditLog.record('execute_task_on_service.success', {
        details: { service: normSvc, task: normTask, duration_ms: duration },
      });
      return { ok: true, service: normSvc, task: normTask, result, duration_ms: duration };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void auditLog.record('execute_task_on_service.failed', {
        details: { service: normSvc, task: normTask, error: msg },
      });
      return { ok: false, service: normSvc, task: normTask, error: msg, duration_ms: Date.now() - start };
    }
  }


}

export const apexToolsDispatch = new ApexToolsDispatcher();
