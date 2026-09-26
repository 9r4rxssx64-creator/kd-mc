/**
 * permissions — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Couvre getTier (no user / admin / laurence / tier localStorage / catch / défaut),
 * check (action connue/inconnue), isAllowed, setTier.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { permissions } from '../../services/auth/permissions.js';
import { store } from '../../core/store.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('permissions — getTier', () => {
  it('pas de user → client_free', () => {
    vi.spyOn(store, 'get').mockReturnValue(undefined);
    expect(permissions.getTier()).toBe('client_free');
  });

  it('kdmc_admin → admin', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'kdmc_admin' });
    expect(permissions.getTier()).toBe('admin');
  });

  it('laurence_sp → laurence', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'laurence_sp' });
    expect(permissions.getTier()).toBe('laurence');
  });

  it('tier stocké en localStorage → ce tier', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'cli_42' });
    localStorage.setItem('apex_v13_tier_cli_42', 'client_pro');
    expect(permissions.getTier()).toBe('client_pro');
  });

  it('user sans tier stocké → client_free (défaut)', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'cli_99' });
    expect(permissions.getTier()).toBe('client_free');
  });

  it('localStorage.getItem throw → catch → client_free', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'cli_x' });
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('ls'); });
    expect(permissions.getTier()).toBe('client_free');
    spy.mockRestore();
  });
});

describe('permissions — check / isAllowed / setTier', () => {
  it('action connue → niveau selon tier (admin auto)', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'kdmc_admin' });
    expect(permissions.check('toggle_commerce')).toBe('auto');
  });

  it('action connue → denied pour client_free (use_studios)', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'cli_free' });
    expect(permissions.check('use_studios')).toBe('denied');
    expect(permissions.isAllowed('use_studios')).toBe(false);
  });

  it('action inconnue → auto par défaut', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'kdmc_admin' });
    expect(permissions.check('action_inexistante')).toBe('auto');
    expect(permissions.isAllowed('action_inexistante')).toBe(true);
  });

  it('setTier persiste le tier (relu par getTier)', () => {
    vi.spyOn(store, 'get').mockReturnValue({ id: 'cli_set' });
    permissions.setTier('cli_set', 'family');
    expect(permissions.getTier()).toBe('family');
  });

  it('setTier : localStorage.setItem throw → catch (pas de crash)', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => permissions.setTier('x', 'family')).not.toThrow();
    spy.mockRestore();
  });
});
