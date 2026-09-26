/**
 * Permissions coverage boost — edge cases & branches manquantes (Sprint 9 Kevin v13.0.78+)
 *
 * Cible : permissions.ts L:87.8% F:75.0% B:80.0% → ≥95% partout
 * Branches manquantes : action inconnue, tier persisté, setTier quota, store no-user.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { permissions } from '../../services/auth/permissions.js';
import { store } from '../../core/store.js';

describe('permissions coverage boost', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
  });

  it('getTier sans user → client_free (default)', () => {
    expect(permissions.getTier()).toBe('client_free');
  });

  it('getTier user id=kdmc_admin → admin', () => {
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    expect(permissions.getTier()).toBe('admin');
  });

  it('getTier user id=laurence_sp → laurence', () => {
    store.set('user', { id: 'laurence_sp', name: 'Laurence' });
    expect(permissions.getTier()).toBe('laurence');
  });

  it('getTier user random id → client_free par défaut', () => {
    store.set('user', { id: 'random_xyz', name: 'X' });
    expect(permissions.getTier()).toBe('client_free');
  });

  it('getTier lit tier persisté localStorage si présent', () => {
    store.set('user', { id: 'random_xyz', name: 'X' });
    localStorage.setItem('apex_v13_tier_random_xyz', 'family');
    expect(permissions.getTier()).toBe('family');
  });

  it('getTier lit tier=client_pro si stocké', () => {
    store.set('user', { id: 'pro_user', name: 'Pro' });
    localStorage.setItem('apex_v13_tier_pro_user', 'client_pro');
    expect(permissions.getTier()).toBe('client_pro');
  });

  it('check action inconnue retourne auto par défaut', () => {
    store.set('user', { id: 'random', name: 'X' });
    expect(permissions.check('nonexistent_action')).toBe('auto');
  });

  it('check action vide string retourne auto', () => {
    store.set('user', { id: 'random', name: 'X' });
    expect(permissions.check('')).toBe('auto');
  });

  it('isAllowed pour action inconnue retourne true', () => {
    store.set('user', { id: 'random', name: 'X' });
    expect(permissions.isAllowed('unknown')).toBe(true);
  });

  it('setTier persiste dans localStorage', () => {
    permissions.setTier('user_x', 'family');
    expect(localStorage.getItem('apex_v13_tier_user_x')).toBe('family');
  });

  it('setTier admin tier change effectif après getTier', () => {
    store.set('user', { id: 'random', name: 'X' });
    permissions.setTier('random', 'client_pro');
    expect(permissions.getTier()).toBe('client_pro');
  });

  it('setTier QuotaExceededError silently ignoré (catch)', () => {
    /* Mock localStorage.setItem to throw */
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new Error('Quota'); };
    expect(() => permissions.setTier('uid', 'family')).not.toThrow();
    localStorage.setItem = orig;
  });

  it('getTier localStorage throw catché → fallback client_free', () => {
    store.set('user', { id: 'random_qe', name: 'X' });
    /* Mock localStorage.getItem to throw */
    const orig = localStorage.getItem.bind(localStorage);
    localStorage.getItem = () => { throw new Error('Boom'); };
    expect(permissions.getTier()).toBe('client_free');
    localStorage.getItem = orig;
  });

  it('chat action: tous tiers auto', () => {
    store.set('user', { id: 'kdmc_admin', name: 'K' });
    expect(permissions.check('chat')).toBe('auto');
    store.set('user', { id: 'laurence_sp', name: 'L' });
    expect(permissions.check('chat')).toBe('auto');
    store.set('user', { id: 'client_x', name: 'C' });
    expect(permissions.check('chat')).toBe('auto');
  });

  it('upload_large: client_free denied, autres auto', () => {
    store.set('user', { id: 'client_x', name: 'C' });
    expect(permissions.check('upload_large')).toBe('denied');
    expect(permissions.isAllowed('upload_large')).toBe(false);
  });

  it('purchase_above_50: client_free validate, client_pro auto', () => {
    store.set('user', { id: 'client_free_1', name: 'F' });
    expect(permissions.check('purchase_above_50')).toBe('validate');
    localStorage.setItem('apex_v13_tier_client_free_1', 'client_pro');
    expect(permissions.check('purchase_above_50')).toBe('auto');
  });

  it('login: admin=auto, autres=notify', () => {
    store.set('user', { id: 'kdmc_admin', name: 'K' });
    expect(permissions.check('login')).toBe('auto');
    store.set('user', { id: 'laurence_sp', name: 'L' });
    expect(permissions.check('login')).toBe('notify');
    store.set('user', { id: 'random', name: 'X' });
    expect(permissions.check('login')).toBe('notify');
  });

  it('edit_other_users: admin only', () => {
    store.set('user', { id: 'kdmc_admin', name: 'K' });
    expect(permissions.check('edit_other_users')).toBe('auto');
    store.set('user', { id: 'laurence_sp', name: 'L' });
    expect(permissions.check('edit_other_users')).toBe('denied');
    expect(permissions.isAllowed('edit_other_users')).toBe(false);
  });
});
