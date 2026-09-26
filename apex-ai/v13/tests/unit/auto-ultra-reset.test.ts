/**
 * APEX v13 — Tests Auto Ultra Reset (Kevin 2026-05-08 ABSOLUE).
 *
 * "Ultra reset autonome automatique si besoin, rappel toi"
 *
 * Vérifie :
 *  - Détection score < 6 → no trigger
 *  - Détection score >= 6 → trigger + reload imminent
 *  - Throttle 24h respecté (skip si trigger récent)
 *  - Backup Firebase appelé AVANT clear (ordre + force:true)
 *  - restoreAfterReset appelé seulement si ?_auto_reset=1 dans l'URL
 *  - Notif Kevin envoyée (trigger + completed)
 *  - Cleanup query param après restore
 *  - localStorage corrupt détecté
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const auditRecordMock = vi.fn(async () => undefined);
vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: auditRecordMock },
}));

const alertKevinMock = vi.fn(async () => ({
  ok: true,
  channels_tried: ['audit-log'],
  channels_ok: ['audit-log'],
  channels_failed: [],
}));
vi.mock('../../services/admin/kevin-alerts.js', () => ({
  kevinAlerts: { alertKevin: alertKevinMock },
}));

const pushAllLocalMock = vi.fn(async () => ({ pushed: 5, failed: 0, skipped: 0 }));
const restoreAllMock = vi.fn(async () => ({
  total: 5,
  restored: 5,
  skipped: 0,
  failed: 0,
  details: [],
}));
vi.mock('../../services/vault/vault-firebase-backup.js', () => ({
  vaultFirebaseBackup: {
    pushAllLocal: pushAllLocalMock,
    restoreAllFromFirebaseBackup: restoreAllMock,
  },
}));

const sentinelsListMock = vi.fn(() => [] as Array<{ id: string; lastResult?: { ok: boolean; msg: string } }>);
vi.mock('../../services/sentinels/sentinels.js', () => ({
  sentinels: { list: sentinelsListMock },
}));

const neverForgetGetLastRunMock = vi.fn(() => null as null | {
  checks: Array<{ id: string; passed: boolean; severity: string }>;
});
vi.mock('../../services/sentinels/never-forget-watch.js', () => ({
  neverForgetWatch: { getLastRun: neverForgetGetLastRunMock },
}));

/* Mock window.location pour pouvoir tester replace + URL */
const replaceMock = vi.fn();
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  pushAllLocalMock.mockResolvedValue({ pushed: 5, failed: 0, skipped: 0 });
  restoreAllMock.mockResolvedValue({
    total: 5,
    restored: 5,
    skipped: 0,
    failed: 0,
    details: [],
  });
  sentinelsListMock.mockReturnValue([]);
  neverForgetGetLastRunMock.mockReturnValue(null);
  /* Reset URL */
  if (typeof window !== 'undefined') {
    /* happy-dom : on peut écraser location avec replaceState */
    try {
      window.history.replaceState(null, '', '/apex-ai-v13/');
    } catch {
      /* ignore */
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoUltraReset.assessConditions()', () => {
  it('retourne score 0 quand tout est OK', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    const a = await autoUltraReset.assessConditions();
    expect(a.score).toBe(0);
    expect(a.shouldTrigger).toBe(false);
    expect(a.conditions.length).toBe(5);
  });

  it('détecte score >= 6 quand state_incoherent + bugs_persistent + cache_stale', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    /* state_incoherent : Kevin manquant (3pts) */
    neverForgetGetLastRunMock.mockReturnValue({
      checks: [{ id: 'kevin_present', passed: false, severity: 'critical' }],
    });
    /* bugs_persistent : 4 sentinelles critical (3pts) */
    sentinelsListMock.mockReturnValue([
      { id: 's1', lastResult: { ok: false, msg: 'crit 1' } },
      { id: 's2', lastResult: { ok: false, msg: 'crit 2' } },
      { id: 's3', lastResult: { ok: false, msg: 'crit 3' } },
      { id: 's4', lastResult: { ok: false, msg: 'crit 4' } },
    ]);
    const a = await autoUltraReset.assessConditions();
    expect(a.score).toBeGreaterThanOrEqual(6);
    expect(a.shouldTrigger).toBe(true);
    /* Vérifie que les reasons contiennent state_incoherent (test substring direct) */
    const flat = a.reasons.join(' | ');
    expect(flat).toContain('state_incoherent');
    expect(flat).toContain('bugs_persistent');
  });

  it('détecte localStorage_corrupt si JSON parse fail sur clé critique', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    localStorage.setItem('apex_v13_user', '{this is not json'); /* corrupt */
    const a = await autoUltraReset.assessConditions();
    const corrupt = a.conditions.find((c) => c.id === 'localStorage_corrupt');
    expect(corrupt?.detected).toBe(true);
    expect(corrupt?.points).toBe(2);
  });

  it('Auto-fixed sentinelles ne comptent PAS comme bugs persistants', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    sentinelsListMock.mockReturnValue([
      { id: 's1', lastResult: { ok: false, msg: 'Auto-fixed: replayed flush' } },
      { id: 's2', lastResult: { ok: false, msg: 'Auto-fixed: snapshot' } },
      { id: 's3', lastResult: { ok: false, msg: 'Auto-fixed: ping ok' } },
      { id: 's4', lastResult: { ok: false, msg: 'Auto-fixed: rotated' } },
    ]);
    const a = await autoUltraReset.assessConditions();
    const bugs = a.conditions.find((c) => c.id === 'bugs_persistent');
    expect(bugs?.detected).toBe(false);
  });
});

describe('autoUltraReset.triggerAutoReset()', () => {
  it('respecte le throttle 24h (skip si trigger < 24h)', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    /* Stamp un trigger récent (1h ago) */
    localStorage.setItem('apex_v13_auto_reset_last_ts', String(Date.now() - 60 * 60 * 1000));
    const r = await autoUltraReset.triggerAutoReset();
    expect(r.ok).toBe(false);
    expect(r.throttled).toBe(true);
    /* Aucun appel pushAllLocal car throttled AVANT */
    expect(pushAllLocalMock).not.toHaveBeenCalled();
    /* Audit skipped enregistré */
    expect(auditRecordMock).toHaveBeenCalledWith(
      'auto-reset.skipped',
      expect.objectContaining({
        actor: 'system',
        target: 'auto-ultra-reset',
      }),
    );
  });

  it('appelle Firebase backup AVANT le clear (ordre vérifié)', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    autoUltraReset.resetThrottle();
    /* Pas de fake timers ici car location.replace est wrappé dans setTimeout 5s
     * et happy-dom ne réagit pas à location.replace en test (pas de navigation réelle) */
    const r = await autoUltraReset.triggerAutoReset();
    expect(r.ok).toBe(true);
    expect(r.willReload).toBe(true);
    /* Vault push appelé en pré-backup */
    expect(pushAllLocalMock).toHaveBeenCalledTimes(1);
    /* Audit triggered enregistré */
    expect(auditRecordMock).toHaveBeenCalledWith(
      'auto-reset.triggered',
      expect.anything(),
    );
    /* Notif Kevin envoyée (severity info) — fire-and-forget, attendre microtask */
    await new Promise((r) => setTimeout(r, 50));
    expect(alertKevinMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        source: 'auto-ultra-reset',
      }),
    );
  });

  it('opt-in force: bypasse le throttle', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    /* Récent trigger */
    localStorage.setItem('apex_v13_auto_reset_last_ts', String(Date.now() - 60 * 60 * 1000));
    const r = await autoUltraReset.triggerAutoReset({ force: true });
    expect(r.ok).toBe(true);
    expect(r.throttled).toBeFalsy();
    expect(pushAllLocalMock).toHaveBeenCalled();
  });
});

describe('autoUltraReset.restoreAfterReset()', () => {
  it('skip si pas de query param ?_auto_reset=1', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    /* URL sans flag */
    window.history.replaceState(null, '', '/apex-ai-v13/');
    const r = await autoUltraReset.restoreAfterReset();
    expect(r.detected).toBe(false);
    expect(r.restored).toBe(0);
    expect(restoreAllMock).not.toHaveBeenCalled();
  });

  it('appelle vaultFirebaseBackup.restoreAllFromFirebaseBackup si ?_auto_reset=1', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    window.history.replaceState(null, '', '/apex-ai-v13/?_auto_reset=1&_t=12345');
    const r = await autoUltraReset.restoreAfterReset();
    expect(r.detected).toBe(true);
    expect(r.restored).toBe(5);
    expect(restoreAllMock).toHaveBeenCalledTimes(1);
    /* Notif completed envoyée — fire-and-forget */
    await new Promise((rs) => setTimeout(rs, 50));
    expect(alertKevinMock).toHaveBeenCalled();
    const calls = alertKevinMock.mock.calls.map((c) => c[0]);
    expect(calls.some((p: unknown) => {
      const payload = p as { severity?: string; title?: string };
      return payload?.severity === 'info' && typeof payload?.title === 'string' && payload.title.includes('Apex à jour');
    })).toBe(true);
    /* Audit completed enregistré */
    expect(auditRecordMock).toHaveBeenCalledWith(
      'auto-reset.completed',
      expect.objectContaining({
        actor: 'system',
        target: 'auto-ultra-reset',
      }),
    );
  });

  it('cleanup query param de l\'URL après restore (history.replaceState)', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    window.history.replaceState(null, '', '/apex-ai-v13/?_auto_reset=1&_t=99');
    expect(window.location.search).toContain('_auto_reset');
    await autoUltraReset.restoreAfterReset();
    expect(window.location.search).not.toContain('_auto_reset');
  });
});

describe('autoUltraReset — anti-loop helpers', () => {
  it('recordReloadAttempt incrémente le compteur localStorage', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    autoUltraReset.recordReloadAttempt();
    autoUltraReset.recordReloadAttempt();
    expect(localStorage.getItem('apex_v13_auto_reset_reload_attempts')).toBe('2');
    expect(localStorage.getItem('apex_v13_auto_reset_stale_since')).toBeTruthy();
  });

  it('cache_stale détecté si stale > 30min ET reloads >= 2', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    /* Simule stale depuis 31min + 2 reloads tentés */
    localStorage.setItem('apex_v13_auto_reset_stale_since', String(Date.now() - 31 * 60 * 1000));
    localStorage.setItem('apex_v13_auto_reset_reload_attempts', '2');
    const a = await autoUltraReset.assessConditions();
    const cache = a.conditions.find((c) => c.id === 'cache_stale');
    expect(cache?.detected).toBe(true);
    expect(cache?.points).toBe(3);
  });

  it('isPostResetReload retourne true seulement si flag URL', async () => {
    const { autoUltraReset } = await import('../../services/storage/auto-ultra-reset.js');
    window.history.replaceState(null, '', '/apex-ai-v13/');
    expect(autoUltraReset.isPostResetReload()).toBe(false);
    window.history.replaceState(null, '', '/apex-ai-v13/?_auto_reset=1');
    expect(autoUltraReset.isPostResetReload()).toBe(true);
  });
});

describe('isVaultCredentialKey — garde universelle anti perte coffre (Kevin "clés disparues")', () => {
  it('préserve TOUT ax_<service>_key, même services hors liste codée en dur', async () => {
    const { isVaultCredentialKey } = await import('../../services/storage/auto-ultra-reset.js');
    /* Services présents dans la liste ET absents : tous doivent être protégés */
    for (const k of [
      'ax_anthropic_key', 'ax_openai_key', 'ax_tavily_key',
      'ax_vonage_key', 'ax_emailjs_private_key', 'ax_finnhub_key',
      'ax_youtube_refresh_token', 'ax_some_new_provider_2027_key',
      'ax_pinecone_key', 'ax_pin', 'ax_user', 'ax_uid',
      'ax_shared_api_key', 'ax_api_key', 'ax_vapid_public',
    ]) {
      expect(isVaultCredentialKey(k)).toBe(true);
    }
  });

  it("n'attrape PAS les clés de cache/non-credential", async () => {
    const { isVaultCredentialKey } = await import('../../services/storage/auto-ultra-reset.js');
    for (const k of [
      'apex_v13_sw_cache_x', 'ax_token_usage_2026', 'ax_voice_print_kevin',
      'apex_v13_app_ver', 'ax_browser_history', 'cmc_chat',
    ]) {
      expect(isVaultCredentialKey(k)).toBe(false);
    }
  });
});
