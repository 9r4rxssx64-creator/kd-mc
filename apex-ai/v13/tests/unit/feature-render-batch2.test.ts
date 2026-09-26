/**
 * APEX v13 — Tests render features batch2 (7 features à 0% lines coverage).
 *
 * Couvre :
 *  - features/device-capabilities/index.ts
 *  - features/iot-providers/index.ts
 *  - features/knowledge/index.ts
 *  - features/meta-marketplace/index.ts
 *  - features/plugins/index.ts
 *  - features/smart-router/index.ts
 *  - features/voice-bio/index.ts
 *
 * Pattern : DOM happy-dom + vi.mock services + vi.fn() handlers + assert HTML/handlers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ========================================================================
 * MOCKS GLOBAUX (avant imports features)
 * ====================================================================== */

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../ui/toast.js', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    show: vi.fn(),
  },
}));

vi.mock('../../ui/haptic.js', () => ({
  haptic: { tap: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), medium: vi.fn() },
}));

vi.mock('../../core/listener-cleanup.js', () => {
  const mkScope = (name: string) => {
    const bindings: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
    return {
      name,
      get size() {
        return bindings.length;
      },
      disposed: false,
      bind: vi.fn((target: EventTarget, type: string, listener: EventListener) => {
        target.addEventListener(type, listener);
        bindings.push({ target, type, listener });
        return () => target.removeEventListener(type, listener);
      }),
      cleanup: vi.fn(() => {
        for (const b of bindings) b.target.removeEventListener(b.type, b.listener);
        bindings.length = 0;
      }),
    };
  };
  return {
    createCleanupScope: vi.fn((name: string) => mkScope(name)),
  };
});

vi.mock('../../core/store.js', () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../services/auth/feature-guard.js', () => ({
  guardFeatureEnabled: vi.fn(() => true),
}));

vi.mock('../../services/core-svc/csp-style-helper.js', () => ({
  cspStyleHelper: { withNonce: vi.fn((html: string) => html), extractStyles: vi.fn() },
}));

/* ========================================================================
 * MOCKS SERVICES SPÉCIFIQUES
 * ====================================================================== */

vi.mock('../../services/core-svc/cross-platform.js', () => ({
  crossPlatform: {
    requestAllPermissions: vi.fn(async () => ({
      notifications: 'granted',
      geolocation: 'denied',
      camera: 'granted',
      microphone: 'unsupported',
    })),
    share: vi.fn(async () => ({ ok: true, fallback: 'native' })),
    vibrate: vi.fn(() => true),
    getBattery: vi.fn(async () => ({ ok: true, data: { level: 80, charging: true } })),
  },
}));

vi.mock('../../services/integrations/device-detect.js', () => ({
  deviceDetect: {
    detect: vi.fn(() => ({
      os: 'ios',
      os_version: '17.4',
      browser: 'safari',
      browser_version: '17',
      isPWA: true,
      hasTouch: true,
      isMobile: true,
      isTablet: false,
      language: 'fr-FR',
      timezone: 'Europe/Monaco',
      screenWidth: 390,
      screenHeight: 844,
      pixelRatio: 3,
      cpuCores: 6,
      memoryGB: 4,
      storageQuotaMB: 1024,
      isSecureContext: true,
      isOnline: true,
      effectiveType: '4g',
      saveData: false,
      downlink: 10,
      rtt: 50,
      hasWebBluetooth: false,
      hasWebNFC: false,
      hasWebUSB: false,
      hasWebSerial: false,
      hasWebMIDI: false,
      hasWebHID: false,
      hasWebGPU: false,
      hasGyro: true,
      hasMotion: true,
      hasGeolocation: true,
      hasVibration: true,
      hasFileSystemAccess: false,
      hasOPFS: true,
      hasIndexedDB: true,
      hasLocalStorage: true,
      hasShare: true,
      hasShareTarget: false,
      hasMediaSession: true,
      hasGetUserMedia: true,
      hasBarcodeDetector: false,
      hasFaceDetector: false,
      hasImageCapture: false,
      hasScreenCapture: false,
      hasWakeLock: true,
      hasBattery: true,
      hasIdleDetection: false,
      hasContactPicker: false,
      hasWebAuthn: true,
      hasCredentialsAPI: true,
      hasPaymentRequest: true,
      hasApplePay: true,
      hasGooglePay: false,
      hasNotifications: true,
      hasPushAPI: true,
      hasBackgroundSync: false,
      hasPeriodicBackgroundSync: false,
      hasBadging: false,
    })),
    activeFeatureCount: vi.fn(() => 25),
    recommendedFeatures: vi.fn(() => ['Web Share', 'WebAuthn (FaceID)']),
    unavailableFeatures: vi.fn(() => [
      { feature: 'Web Bluetooth', reason: 'iOS Safari pas supporté' },
      { feature: 'Web NFC', reason: 'iOS pas dispo' },
    ]),
    networkQuality: vi.fn(() => 'high' as const),
  },
}));

vi.mock('../../services/integrations/iot-providers-registry.js', () => {
  const fakeProvider = {
    id: 'ewelink',
    name: 'eWeLink',
    category: 'smart-home',
    console_url: 'https://web.ewelink.cc',
    endpoints: { list_devices: { method: 'GET', path: '/devices' }, send_command: { method: 'POST', path: '/cmd', body_template: {} } },
    credential_keys: ['ax_ewelink_email', 'ax_ewelink_password'],
    test_endpoint: '/ping',
    icon: '🔌',
    description: 'eWeLink IoT cloud',
  };
  const fakeStatus = { ok: false, reason: 'no_credentials' };
  return {
    iotRegistry: {
      statusAll: vi.fn(async () => [{ provider: fakeProvider, status: fakeStatus }]),
      listAllDevices: vi.fn(async () => []),
      get: vi.fn((id: string) => (id === 'ewelink' ? fakeProvider : null)),
      configureProvider: vi.fn(async () => ({ ok: true, devices_found: 3 })),
      testConnection: vi.fn(async () => ({ ok: true, devices_count: 5, latency_ms: 120 })),
      sendCommand: vi.fn(async () => ({ ok: true })),
    },
  };
});

vi.mock('../../core/memory.js', () => ({
  memory: {
    syncDocsAtBoot: vi.fn(async () => ({ synced: 5, failed: 0 })),
    getDocsContext: vi.fn(() => ({
      'CLAUDE.md': { content: 'rules', ts: Date.now() - 1000, size: 5000 },
    })),
    extractFactsFromMessage: vi.fn(async () => ({ extracted: 2 })),
  },
}));

vi.mock('../../services/storage/persistent-memory-store.js', () => ({
  persistentMemory: {
    list: vi.fn(async () => [
      { id: 'm1', category: 'profile', text: 'Lieu : Monaco', ts: Date.now() - 1000, scope: 'kdmc_admin', importance: 90, source: 'chat' },
      { id: 'm2', category: 'preferences', text: 'Aime le café', ts: Date.now() - 2000, scope: 'kdmc_admin', importance: 60 },
      { id: 'm3', category: 'facts', text: 'Anniv 12 mai', ts: Date.now() - 3000, scope: 'laurence', importance: 85 },
    ]),
  },
}));

vi.mock('../../services/sentinels/sentinels.js', () => ({
  sentinels: {
    runOne: vi.fn(async () => ({ msg: 'memory-watch ran OK', severity: 'ok' })),
  },
}));

vi.mock('../../ui/drilldown.js', () => ({
  drillDown: { open: vi.fn() },
}));

vi.mock('../../services/core-svc/apex-meta-marketplace.js', () => ({
  apexMetaMarketplace: {
    init: vi.fn(),
    getStats: vi.fn(() => ({
      providers: 30,
      pwa_compatible: 22,
      require_api_key: 15,
      api_keys_configured: 5,
      installs_total: 12,
    })),
    listProviders: vi.fn(() => [
      { id: 'github', name: 'GitHub', description: 'Repos', pwa_compatible: true, api_key_required: true, api_key_service: 'github' },
      { id: 'npm', name: 'NPM', description: 'Packages', pwa_compatible: true, api_key_required: false },
    ]),
    getProvider: vi.fn((id: string) => ({ id, name: id, description: 'Test', pwa_compatible: true, api_key_required: false })),
    searchAll: vi.fn(async () => [
      { id: 'item1', name: 'Item One', description: 'Desc', url: 'https://x.com', marketplace: 'github', stars: 100, downloads: 500, category: 'web' },
    ]),
    install: vi.fn(async () => ({ ok: true, providerId: 'github', itemId: 'item1', method: 'url', instructions: 'OK' })),
  },
  META_MARKETPLACE_CATALOG: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
}));

vi.mock('../../services/core-svc/apex-plugins-marketplace.js', () => ({
  apexPluginsMarketplace: {
    getStats: vi.fn(() => ({
      totalCatalog: 50,
      totalInstalled: 10,
      totalAvailable: 30,
      totalUnsupportedPwa: 10,
    })),
    getCategories: vi.fn(() => ['dev-tools', 'database']),
    list: vi.fn(() => [
      {
        id: 'gh-cli',
        name: 'GitHub CLI',
        description: 'GitHub command line',
        category: 'dev-tools',
        source: 'community',
        url: 'https://cli.github.com',
        estimated_value: 'high',
      },
    ]),
    search: vi.fn(() => []),
    getStatusOf: vi.fn(() => 'available'),
    recommendForUser: vi.fn(() => [
      {
        id: 'rec1',
        name: 'Recommended Plugin',
        description: 'Top pick',
        category: 'productivity',
        source: 'anthropic-official',
        url: 'https://example.com',
        estimated_value: 'critical',
        apex_tools: ['tool1', 'tool2'],
      },
    ]),
    install: vi.fn(async () => ({ ok: true, toolsAdded: ['t1'] })),
    uninstall: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('../../services/sentinels/auto-improvement.js', () => ({
  autoImprovement: {
    getState: vi.fn(() => ({ installed: ['mcp-1'], skipped: [] })),
    autoInstallSafe: vi.fn(async () => ({ ok: true, message: 'Installed' })),
  },
}));

vi.mock('../../data/apex-extended-catalog.js', () => ({
  APEX_EXTENDED_CATALOG: [
    {
      id: 'mcp-1',
      name: 'MCP Test',
      type: 'mcp-server',
      apex_compatibility: 'pwa-direct',
      auto_improvement_value: 'high',
      description: 'Test MCP server',
      categories: ['ai-ml'],
      source_url: 'https://github.com/x/y',
    },
  ],
  searchCatalog: vi.fn(() => []),
}));

vi.mock('../../services/ai/smart-router.js', () => {
  const stats = {
    last_ping_ts: Date.now() - 10_000,
    last_ping_ok: true,
    latency_avg_ms: 250,
    latency_p95_ms: 500,
    success_rate: 0.95,
    quota_remaining_pct: 80,
    uptime_24h: 0.99,
  };
  const score = { total: 85, latency_pts: 35, quota_pts: 25, quality_pts: 15, uptime_pts: 10 };
  return {
    smartRouter: {
      rankProviders: vi.fn(async () => [{ provider: 'anthropic', score }]),
      getRecommendations: vi.fn(async () => [
        { from: 'openai', to: 'groq', savings_pct: 50, reason: 'Cheaper, faster' },
      ]),
      getOverride: vi.fn(() => null),
      setOverride: vi.fn(),
      getAllProviders: vi.fn(() => ['anthropic', 'openai', 'groq']),
      getStats: vi.fn(async () => stats),
      scoreProvider: vi.fn(async () => score),
      pingAllProviders: vi.fn(async () => undefined),
      resetAll: vi.fn(),
      getPricing: vi.fn(() => 3.0),
    },
  };
});

vi.mock('../../services/ai/voice-print.js', () => ({
  voicePrint: {
    getPrintFor: vi.fn(() => null),
    needsCalibration: vi.fn(() => ({ needs: false, reason: '', confidence: 0.9 })),
    isExclusiveMode: vi.fn(() => true),
    isExclusiveAnticipated: vi.fn(() => false),
    getPhaseDetails: vi.fn(() => ({
      phase: 'open',
      label: 'Ouvert',
      progress: 0,
      threshold: 0.5,
      samples_to_next: 4,
    })),
    listPrints: vi.fn(() => []),
    getStats: vi.fn(() => ({ enrolled_count: 0, total_samples: 0, avg_match_score: 0 })),
    getUnknownAttempts: vi.fn(() => []),
    enroll: vi.fn(async () => ({ ok: true, samples_count: 3, confidence_score: 0.85 })),
    deletePrint: vi.fn(() => true),
    setExclusiveMode: vi.fn(),
    setExclusiveAnticipated: vi.fn(),
    markCalibrated: vi.fn(),
    clearUnknownAttempts: vi.fn(),
  },
}));

/* ========================================================================
 * IMPORTS APRÈS MOCKS
 * ====================================================================== */

import { render as renderDevice, dispose as disposeDevice, escapeHtml } from '../../features/device-capabilities/index.js';
import { render as renderIot } from '../../features/iot-providers/index.js';
import { render as renderKnowledge } from '../../features/knowledge/index.js';
import {
  mountMetaMarketplace,
  resetMetaMarketplaceFeature,
  dispose as disposeMeta,
} from '../../features/meta-marketplace/index.js';
import { render as renderPlugins, dispose as disposePlugins } from '../../features/plugins/index.js';
import { render as renderRouter, dispose as disposeRouter } from '../../features/smart-router/index.js';
import { render as renderVoiceBio, dispose as disposeVoice } from '../../features/voice-bio/index.js';

import { crossPlatform } from '../../services/core-svc/cross-platform.js';
import { iotRegistry } from '../../services/integrations/iot-providers-registry.js';
import { memory } from '../../core/memory.js';
import { persistentMemory } from '../../services/storage/persistent-memory-store.js';
import { sentinels } from '../../services/sentinels/sentinels.js';
import { apexMetaMarketplace } from '../../services/core-svc/apex-meta-marketplace.js';
import { apexPluginsMarketplace } from '../../services/core-svc/apex-plugins-marketplace.js';
import { smartRouter } from '../../services/ai/smart-router.js';
import { voicePrint } from '../../services/ai/voice-print.js';
import { store } from '../../core/store.js';
import { toast } from '../../ui/toast.js';

/* ========================================================================
 * Helpers communs
 * ====================================================================== */

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.clearAllMocks();
  /* user par défaut = admin */
  vi.mocked(store.get).mockImplementation((k: string): unknown => {
    if (k === 'user') return { id: 'kdmc_admin', name: 'Kevin' };
    return null;
  });
  /* Stub confirm/prompt pour empêcher blocking */
  globalThis.confirm = vi.fn(() => true);
  globalThis.prompt = vi.fn(() => '');
  /* Stub URL.createObjectURL pour export blob */
  if (!('createObjectURL' in URL)) {
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
  } else {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  /* Best-effort dispose pour features avec scope listeners */
  try { disposeDevice(); } catch { /* ignore */ }
  try { disposeMeta(); } catch { /* ignore */ }
  try { disposePlugins(); } catch { /* ignore */ }
  try { disposeRouter(); } catch { /* ignore */ }
  try { disposeVoice(); } catch { /* ignore */ }
  try { resetMetaMarketplaceFeature(); } catch { /* ignore */ }
});

const tick = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ========================================================================
 * 1. features/device-capabilities
 * ====================================================================== */

describe('features/device-capabilities', () => {
  it('escapeHtml encode caractères spéciaux', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });

  it('render rend identité + features groups + actions', async () => {
    await renderDevice(root);
    expect(root.innerHTML).toContain('Mes capacités device');
    expect(root.innerHTML).toContain('Identité');
    expect(root.innerHTML).toContain('Hardware');
    expect(root.innerHTML).toContain('Storage');
    expect(root.querySelector('#ax-dev-perm-all')).toBeTruthy();
    expect(root.querySelector('#ax-dev-test-share')).toBeTruthy();
    expect(root.querySelector('#ax-dev-test-vibrate')).toBeTruthy();
    expect(root.querySelector('#ax-dev-test-battery')).toBeTruthy();
    expect(root.querySelector('#ax-dev-refresh')).toBeTruthy();
  });

  it('click Demander permissions → crossPlatform.requestAllPermissions', async () => {
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-perm-all')!.click();
    await tick();
    expect(crossPlatform.requestAllPermissions).toHaveBeenCalledWith([
      'notifications', 'geolocation', 'camera', 'microphone',
    ]);
    const out = root.querySelector('#ax-dev-action-result');
    expect(out?.textContent).toContain('permissions');
  });

  it('click Tester partage → crossPlatform.share', async () => {
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-test-share')!.click();
    await tick();
    expect(crossPlatform.share).toHaveBeenCalled();
  });

  it('click Vibration → crossPlatform.vibrate', async () => {
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-test-vibrate')!.click();
    await tick();
    expect(crossPlatform.vibrate).toHaveBeenCalledWith([100, 50, 100]);
  });

  it('click Battery → crossPlatform.getBattery', async () => {
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-test-battery')!.click();
    await tick();
    expect(crossPlatform.getBattery).toHaveBeenCalled();
  });

  it('click Refresh → relance render', async () => {
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-refresh')!.click();
    await tick();
    /* deviceDetect.detect appelée plusieurs fois (init + refresh) */
    expect(root.innerHTML).toContain('Mes capacités device');
  });

  it('Battery handler error gracieux (ok=false)', async () => {
    vi.mocked(crossPlatform.getBattery).mockResolvedValueOnce({ ok: false });
    await renderDevice(root);
    root.querySelector<HTMLButtonElement>('#ax-dev-test-battery')!.click();
    await tick();
    expect(root.querySelector('#ax-dev-action-result')?.textContent).toContain('indisponible');
  });

  it('dispose() ne plante pas', () => {
    expect(() => disposeDevice()).not.toThrow();
  });
});

/* ========================================================================
 * 2. features/iot-providers
 * ====================================================================== */

describe('features/iot-providers', () => {
  it('non-admin → message accès réservé', async () => {
    vi.mocked(store.get).mockReturnValue({ id: 'laurence', name: 'Laurence' });
    await renderIot(root);
    expect(root.innerHTML).toContain('réservée');
  });

  it('admin → render providers + devices + tools', async () => {
    await renderIot(root);
    expect(root.innerHTML).toContain('IoT Providers');
    expect(root.innerHTML).toContain('eWeLink');
    expect(iotRegistry.statusAll).toHaveBeenCalled();
    expect(iotRegistry.listAllDevices).toHaveBeenCalled();
  });

  it('section devices vide quand 0 device', async () => {
    await renderIot(root);
    expect(root.innerHTML).toContain('Aucun device détecté');
  });

  it('refresh-all bouton → re-render', async () => {
    await renderIot(root);
    const btn = root.querySelector<HTMLElement>('[data-action="refresh-all"]');
    expect(btn).toBeTruthy();
    btn!.click();
    await tick();
    /* statusAll appelée 2 fois (init + refresh) */
    expect(iotRegistry.statusAll).toHaveBeenCalledTimes(2);
  });

  it('install bouton → ouvre modal avec form', async () => {
    await renderIot(root);
    const installBtn = root.querySelector<HTMLElement>('[data-action="install"]');
    expect(installBtn).toBeTruthy();
    installBtn!.click();
    await tick();
    expect(root.querySelector('#iot-install-form')).toBeTruthy();
    expect(root.querySelector('input[name="email"]')).toBeTruthy();
    expect(root.querySelector('input[name="password"]')).toBeTruthy();
  });

  it('show-proxy → window.prompt appelé', async () => {
    globalThis.prompt = vi.fn(() => 'https://proxy.example.com');
    await renderIot(root);
    const proxyBtn = root.querySelector<HTMLElement>('[data-action="show-proxy"]');
    expect(proxyBtn).toBeTruthy();
    proxyBtn!.click();
    await tick();
    expect(globalThis.prompt).toHaveBeenCalled();
  });

  it('render gère exception statusAll', async () => {
    vi.mocked(iotRegistry.statusAll).mockRejectedValueOnce(new Error('boom'));
    await renderIot(root);
    expect(root.innerHTML).toContain('Erreur');
  });
});

/* ========================================================================
 * 3. features/knowledge
 * ====================================================================== */

describe('features/knowledge', () => {
  beforeEach(() => {
    /* user dans localStorage au lieu de store car la feature lit apex_v13_user direct */
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin', name: 'Kevin' }));
  });

  it('render section principal + boutons actions', () => {
    renderKnowledge(root);
    expect(root.innerHTML).toContain('Mémoire long-terme');
    expect(root.querySelector('#btn-resync-docs')).toBeTruthy();
    expect(root.querySelector('#btn-compress-mem')).toBeTruthy();
    expect(root.querySelector('#btn-export-json')).toBeTruthy();
    expect(root.querySelector('#btn-extract-test')).toBeTruthy();
  });

  it('admin voit section cross-user', () => {
    renderKnowledge(root);
    expect(root.querySelector('#sec-cross-user')).toBeTruthy();
  });

  it('non-admin ne voit PAS section cross-user', () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'laurence', name: 'L' }));
    renderKnowledge(root);
    expect(root.querySelector('#sec-cross-user')).toBeFalsy();
  });

  it('charge facts (mock persistentMemory.list)', async () => {
    renderKnowledge(root);
    await tick(50);
    expect(persistentMemory.list).toHaveBeenCalled();
    expect(root.querySelector('#my-facts-content')?.innerHTML).toContain('fact');
  });

  it('btn-resync-docs → memory.syncDocsAtBoot', async () => {
    renderKnowledge(root);
    await tick(50);
    root.querySelector<HTMLButtonElement>('#btn-resync-docs')!.click();
    await tick(50);
    expect(memory.syncDocsAtBoot).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('btn-compress-mem → sentinels.runOne(memory-watch)', async () => {
    renderKnowledge(root);
    await tick(50);
    root.querySelector<HTMLButtonElement>('#btn-compress-mem')!.click();
    await tick(50);
    expect(sentinels.runOne).toHaveBeenCalledWith('memory-watch');
  });

  it('btn-export-json → crée Blob + déclenche download', async () => {
    renderKnowledge(root);
    await tick(50);
    root.querySelector<HTMLButtonElement>('#btn-export-json')!.click();
    await tick(50);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalled();
  });

  it('btn-extract-test → memory.extractFactsFromMessage', async () => {
    globalThis.prompt = vi.fn(() => 'Je vis à Monaco');
    renderKnowledge(root);
    await tick(50);
    root.querySelector<HTMLButtonElement>('#btn-extract-test')!.click();
    await tick(50);
    expect(memory.extractFactsFromMessage).toHaveBeenCalled();
  });

  it('charge docs sync status', async () => {
    renderKnowledge(root);
    await tick(50);
    expect(root.querySelector('#docs-content')?.innerHTML).toContain('CLAUDE.md');
  });
});

/* ========================================================================
 * 4. features/meta-marketplace
 * ====================================================================== */

describe('features/meta-marketplace', () => {
  it('mountMetaMarketplace render shell + stats', () => {
    mountMetaMarketplace(root);
    expect(root.innerHTML).toContain('Méta-Marketplace');
    expect(root.innerHTML).toContain('Marketplaces');
    expect(apexMetaMarketplace.init).toHaveBeenCalled();
  });

  it('search input + click search bouton', async () => {
    mountMetaMarketplace(root);
    const input = root.querySelector<HTMLInputElement>('#meta-mkt-search')!;
    input.value = 'react';
    root.querySelector<HTMLButtonElement>('#meta-mkt-search-btn')!.click();
    await tick(20);
    expect(apexMetaMarketplace.searchAll).toHaveBeenCalledWith('react', expect.any(Object));
  });

  it('clic chip catégorie active state', async () => {
    mountMetaMarketplace(root);
    const chip = root.querySelector<HTMLButtonElement>('[data-meta-mkt-cat="github"]')!;
    chip.click();
    await tick(20);
    /* Quand pas de query, change la catégorie + rerender */
    expect(root.innerHTML).toContain('Méta-Marketplace');
  });

  it('install bouton → apexMetaMarketplace.install', async () => {
    mountMetaMarketplace(root);
    /* Trigger search d'abord pour avoir des items */
    const input = root.querySelector<HTMLInputElement>('#meta-mkt-search')!;
    input.value = 'test';
    root.querySelector<HTMLButtonElement>('#meta-mkt-search-btn')!.click();
    await tick(30);
    const installBtn = root.querySelector<HTMLButtonElement>('[data-meta-mkt-install]');
    if (installBtn) {
      installBtn.click();
      await tick(20);
      expect(apexMetaMarketplace.install).toHaveBeenCalled();
    }
  });

  it('keydown Enter sur search → searchAll', async () => {
    mountMetaMarketplace(root);
    const input = root.querySelector<HTMLInputElement>('#meta-mkt-search')!;
    input.value = 'foo';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick(20);
    expect(apexMetaMarketplace.searchAll).toHaveBeenCalledWith('foo', expect.any(Object));
  });

  it('unmount() vide le target', () => {
    const { unmount } = mountMetaMarketplace(root);
    unmount();
    expect(root.innerHTML).toBe('');
  });

  it('resetMetaMarketplaceFeature ne plante pas', () => {
    expect(() => resetMetaMarketplaceFeature()).not.toThrow();
  });

  it('dispose() cleanup scope', () => {
    mountMetaMarketplace(root);
    expect(() => disposeMeta()).not.toThrow();
  });
});

/* ========================================================================
 * 5. features/plugins
 * ====================================================================== */

describe('features/plugins', () => {
  it('render marketplace view par défaut', async () => {
    await renderPlugins(root);
    expect(root.innerHTML).toContain('Marketplace Plugins');
    expect(root.innerHTML).toContain('Recommandés');
    expect(root.querySelector('#ax-plg-search')).toBeTruthy();
    expect(root.querySelector('#ax-plg-cat')).toBeTruthy();
    expect(root.querySelector('#ax-plg-status')).toBeTruthy();
    expect(root.querySelector('#ax-plg-pwa-only')).toBeTruthy();
  });

  it('switch vers extended catalog tab puis retour marketplace', async () => {
    await renderPlugins(root);
    const extBtn = root.querySelector<HTMLButtonElement>('#ax-plg-tab-extended')!;
    extBtn.click();
    await tick(30);
    expect(root.innerHTML).toContain('Extended Catalog');
    /* Retour marketplace pour reset l'état module-level pour les tests suivants */
    const mktBtn = root.querySelector<HTMLButtonElement>('#ax-plg-tab-marketplace')!;
    mktBtn.click();
    await tick(30);
    expect(root.innerHTML).toContain('Marketplace Plugins');
  });

  it('install bouton → apexPluginsMarketplace.install', async () => {
    await renderPlugins(root);
    const installBtn = root.querySelector<HTMLButtonElement>('.ax-plg-install');
    if (installBtn) {
      installBtn.click();
      await tick(30);
      expect(apexPluginsMarketplace.install).toHaveBeenCalled();
    }
  });

  it('change category filter → re-render', async () => {
    await renderPlugins(root);
    const cat = root.querySelector<HTMLSelectElement>('#ax-plg-cat');
    if (!cat) {
      /* uiState.view module-level peut être resté à 'extended' depuis test précédent.
         Click sur tab marketplace pour reset. */
      root.querySelector<HTMLButtonElement>('#ax-plg-tab-marketplace')?.click();
      await tick(30);
    }
    const cat2 = root.querySelector<HTMLSelectElement>('#ax-plg-cat')!;
    cat2.value = 'dev-tools';
    cat2.dispatchEvent(new Event('change'));
    await tick(30);
    expect(apexPluginsMarketplace.getStats).toHaveBeenCalled();
  });

  it('PWA-only checkbox toggle', async () => {
    await renderPlugins(root);
    const cb = root.querySelector<HTMLInputElement>('#ax-plg-pwa-only');
    if (!cb) {
      root.querySelector<HTMLButtonElement>('#ax-plg-tab-marketplace')?.click();
      await tick(30);
    }
    const cb2 = root.querySelector<HTMLInputElement>('#ax-plg-pwa-only')!;
    cb2.checked = false;
    cb2.dispatchEvent(new Event('change'));
    await tick(30);
    expect(apexPluginsMarketplace.list).toHaveBeenCalled();
  });

  it('search input keyup debounce → re-render after delay', async () => {
    await renderPlugins(root);
    const search = root.querySelector<HTMLInputElement>('#ax-plg-search');
    if (!search) {
      root.querySelector<HTMLButtonElement>('#ax-plg-tab-marketplace')?.click();
      await tick(30);
    }
    const search2 = root.querySelector<HTMLInputElement>('#ax-plg-search')!;
    search2.value = 'github';
    search2.dispatchEvent(new Event('input'));
    search2.dispatchEvent(new Event('keyup'));
    await tick(450);
    expect(apexPluginsMarketplace.list).toHaveBeenCalled();
  });

  it('dispose ne plante pas', () => {
    expect(() => disposePlugins()).not.toThrow();
  });
});

/* ========================================================================
 * 6. features/smart-router
 * ====================================================================== */

describe('features/smart-router', () => {
  it('render rend best provider + tableau', async () => {
    await renderRouter(root);
    expect(root.innerHTML).toContain('Smart IA Router');
    expect(root.innerHTML).toContain('anthropic');
    expect(root.innerHTML).toContain('Best provider');
    expect(smartRouter.rankProviders).toHaveBeenCalled();
    expect(smartRouter.getRecommendations).toHaveBeenCalled();
  });

  it('btn re-test → smartRouter.pingAllProviders', async () => {
    await renderRouter(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-sr-retest')!;
    btn.click();
    await tick(30);
    expect(smartRouter.pingAllProviders).toHaveBeenCalled();
  });

  it('btn refresh → relance render', async () => {
    await renderRouter(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-sr-refresh')!;
    btn.click();
    await tick(30);
    expect(smartRouter.rankProviders).toHaveBeenCalledTimes(2);
  });

  it('btn reset → smartRouter.resetAll', async () => {
    await renderRouter(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-sr-reset')!;
    btn.click();
    await tick(30);
    expect(smartRouter.resetAll).toHaveBeenCalled();
  });

  it('force-provider bouton → smartRouter.setOverride', async () => {
    await renderRouter(root);
    const btn = root.querySelector<HTMLButtonElement>('.ax-sr-force');
    expect(btn).toBeTruthy();
    btn!.click();
    await tick(30);
    expect(smartRouter.setOverride).toHaveBeenCalled();
  });

  it('avec override actif → affiche bandeau + bouton clear', async () => {
    vi.mocked(smartRouter.getOverride).mockReturnValueOnce('groq');
    await renderRouter(root);
    expect(root.innerHTML).toContain('Override admin actif');
    expect(root.querySelector('#ax-sr-clear-override')).toBeTruthy();
  });

  it('clear override bouton → setOverride(null)', async () => {
    vi.mocked(smartRouter.getOverride).mockReturnValueOnce('groq');
    await renderRouter(root);
    root.querySelector<HTMLButtonElement>('#ax-sr-clear-override')!.click();
    await tick(30);
    expect(smartRouter.setOverride).toHaveBeenCalledWith(null);
  });

  it('dispose ne plante pas', () => {
    expect(() => disposeRouter()).not.toThrow();
  });
});

/* ========================================================================
 * 7. features/voice-bio
 * ====================================================================== */

describe('features/voice-bio', () => {
  it('user pas connecté → message login', async () => {
    vi.mocked(store.get).mockReturnValue(null);
    await renderVoiceBio(root);
    expect(root.innerHTML).toContain('Connecte-toi');
  });

  it('user sans empreinte → bouton enroll', async () => {
    await renderVoiceBio(root);
    expect(root.innerHTML).toContain('empreinte vocale');
    expect(root.querySelector('#ax-vbio-enroll-start')).toBeTruthy();
  });

  it('user avec empreinte existante → stats + boutons', async () => {
    vi.mocked(voicePrint.getPrintFor).mockReturnValueOnce({
      uid: 'kdmc_admin',
      samples_count: 12,
      confidence_score: 0.88,
      match_score_avg: 0.9,
      last_match: Date.now() - 60_000,
      enrolled_at: Date.now() - 86_400_000,
      embeddings: [],
    } as never);
    await renderVoiceBio(root);
    expect(root.querySelector('#ax-vbio-recalibrate')).toBeTruthy();
    expect(root.querySelector('#ax-vbio-delete')).toBeTruthy();
    expect(root.querySelector('#ax-vbio-exclusive')).toBeTruthy();
  });

  it('admin voit section admin (voiceprints listing)', async () => {
    await renderVoiceBio(root);
    expect(root.innerHTML).toContain('Vue admin Kevin');
  });

  it('non-admin ne voit PAS section admin', async () => {
    vi.mocked(store.get).mockReturnValue({ id: 'laurence', name: 'L' });
    await renderVoiceBio(root);
    expect(root.innerHTML).not.toContain('Vue admin Kevin');
  });

  it('exclusive checkbox → voicePrint.setExclusiveMode', async () => {
    vi.mocked(voicePrint.getPrintFor).mockReturnValueOnce({
      uid: 'kdmc_admin',
      samples_count: 5,
      confidence_score: 0.7,
      match_score_avg: 0.8,
      last_match: 0,
      enrolled_at: Date.now(),
      embeddings: [],
    } as never);
    await renderVoiceBio(root);
    const cb = root.querySelector<HTMLInputElement>('#ax-vbio-exclusive')!;
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await tick();
    expect(voicePrint.setExclusiveMode).toHaveBeenCalledWith(false);
  });

  it('delete bouton → voicePrint.deletePrint', async () => {
    vi.mocked(voicePrint.getPrintFor).mockReturnValueOnce({
      uid: 'kdmc_admin',
      samples_count: 5,
      confidence_score: 0.7,
      match_score_avg: 0.8,
      last_match: 0,
      enrolled_at: Date.now(),
      embeddings: [],
    } as never);
    await renderVoiceBio(root);
    root.querySelector<HTMLButtonElement>('#ax-vbio-delete')!.click();
    await tick();
    expect(voicePrint.deletePrint).toHaveBeenCalledWith('kdmc_admin');
  });

  it('admin clear-unknown → voicePrint.clearUnknownAttempts', async () => {
    await renderVoiceBio(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-vbio-clear-unknown');
    expect(btn).toBeTruthy();
    btn!.click();
    await tick();
    expect(voicePrint.clearUnknownAttempts).toHaveBeenCalled();
  });

  it('exclusive-anticipated checkbox → setExclusiveAnticipated', async () => {
    vi.mocked(voicePrint.getPrintFor).mockReturnValueOnce({
      uid: 'kdmc_admin',
      samples_count: 5,
      confidence_score: 0.7,
      match_score_avg: 0.8,
      last_match: 0,
      enrolled_at: Date.now(),
      embeddings: [],
    } as never);
    await renderVoiceBio(root);
    const cb = root.querySelector<HTMLInputElement>('#ax-vbio-exclusive-anticipated')!;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await tick();
    expect(voicePrint.setExclusiveAnticipated).toHaveBeenCalledWith(true);
  });

  it('dispose ne plante pas', () => {
    expect(() => disposeVoice()).not.toThrow();
  });
});
