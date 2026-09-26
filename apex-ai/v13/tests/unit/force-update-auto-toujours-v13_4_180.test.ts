/**
 * APEX v13.4.180 — Tests régression "Maj auto forcé toujours" (Kevin 2026-05-16).
 *
 * Vérifie que checkAndMaybeShow déclenche forceUpdate AUTO :
 *  - SANS attendre que page soit idle 30s
 *  - SANS attendre visibilitystate=hidden
 *  - SEULEMENT bloqué par : stream IA actif OU user en train de taper
 *  - Throttle 30s anti-loop reste actif
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/bootstrap.js', () => ({
  APP_VER: 'v13.4.100',
  ADMIN_ID: 'kdmc_admin',
}));

vi.mock('../../ui/toast.js', () => ({
  toast: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../services/storage/auto-backup.js', () => ({
  autoBackup: {
    snapshot: vi.fn().mockResolvedValue({ id: 'snap_1', size_bytes: 100 }),
  },
}));

import { forceUpdateBanner } from '../../services/core-svc/force-update-banner.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  forceUpdateBanner.uninstall();
  document.body.innerHTML = '';
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  forceUpdateBanner.uninstall();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  /* Cleanup window flags */
  delete (window as unknown as { __apexActiveStream?: boolean }).__apexActiveStream;
});

describe('v13.4.180 — Auto-MAJ toujours forcée', () => {
  it('user actif (pas idle), pas de stream, pas de typing → AUTO-MAJ déclenchée', async () => {
    /* Mock une session "active" : lastInteraction récente */
    localStorage.setItem('apex_v13_last_interaction', String(Date.now()));
    /* Mock fetch retournant version distante différente */
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    /* Mock forceUpdate pour ne pas faire le vrai reload */
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    /* Trigger via private checkAndMaybeShow */
    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    expect(fuSpy).toHaveBeenCalledTimes(1);
    /* lastAuto persisté */
    expect(localStorage.getItem('apex_v13_auto_maj_last')).not.toBeNull();
  });

  it('stream IA actif → banner affiché (pas auto)', async () => {
    (window as unknown as { __apexActiveStream?: boolean }).__apexActiveStream = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    expect(fuSpy).not.toHaveBeenCalled();
    /* Banner doit s'afficher */
    expect(document.getElementById('apex-force-update-banner')).not.toBeNull();
  });

  it('user en train de taper (input focus) → banner affiché', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    expect(fuSpy).not.toHaveBeenCalled();
    expect(document.getElementById('apex-force-update-banner')).not.toBeNull();
  });

  it('throttle 30s : 2e check rapide → pas re-trigger', async () => {
    localStorage.setItem('apex_v13_auto_maj_last', String(Date.now()));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    /* Throttle non OK → banner OU rien */
    expect(fuSpy).not.toHaveBeenCalled();
  });

  it('throttle expiré (>30s) → re-trigger auto', async () => {
    localStorage.setItem('apex_v13_auto_maj_last', String(Date.now() - 60_000));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    expect(fuSpy).toHaveBeenCalledTimes(1);
  });

  it('pas de version stale → pas de trigger', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.100"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    expect(fuSpy).not.toHaveBeenCalled();
  });

  it('document.visibilityState=visible + user actif récent → AUTO-MAJ quand même', async () => {
    /* Pas d'idle, pas de hidden, mais safe → MAJ doit s'enclencher */
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    localStorage.setItem('apex_v13_last_interaction', String(Date.now())); /* tout récent */
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html data-app-ver="v13.4.999"></html>', { status: 200 }),
    );
    const fuSpy = vi.spyOn(forceUpdateBanner, 'forceUpdate').mockResolvedValue(undefined);

    await (forceUpdateBanner as unknown as { checkAndMaybeShow: () => Promise<void> }).
      checkAndMaybeShow();

    /* C'est le cas qui change : avant v13.4.180, ça ne déclenchait PAS auto.
     * Maintenant ça doit déclencher. */
    expect(fuSpy).toHaveBeenCalledTimes(1);
  });
});
