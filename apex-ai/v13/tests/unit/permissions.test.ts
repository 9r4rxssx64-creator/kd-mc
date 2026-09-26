import { describe, it, expect, beforeEach } from 'vitest';
import { permissions } from '../../services/auth/permissions.js';
import { store } from '../../core/store.js';

describe('permissions', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
  });
  it('admin Kevin bypass tout', () => {
    store.set('user', { id: 'kdmc_admin', name: 'Kevin (DK)' });
    expect(permissions.getTier()).toBe('admin');
    expect(permissions.check('toggle_commerce')).toBe('auto');
    expect(permissions.check('admin_view')).toBe('auto');
    expect(permissions.check('erase_account')).toBe('auto');
  });
  it('Laurence isolée admin views denied', () => {
    store.set('user', { id: 'laurence_sp', name: 'Laurence' });
    expect(permissions.getTier()).toBe('laurence');
    expect(permissions.check('admin_view')).toBe('denied');
    expect(permissions.check('toggle_commerce')).toBe('denied');
    expect(permissions.check('chat')).toBe('auto');
  });
  it('Laurence erase_account = validate Kevin', () => {
    store.set('user', { id: 'laurence_sp', name: 'Laurence' });
    expect(permissions.check('erase_account')).toBe('validate');
  });
  it('client_free pas de studios ni voice', () => {
    store.set('user', { id: 'client_xyz', name: 'Client' });
    expect(permissions.check('use_studios')).toBe('denied');
    expect(permissions.check('voice')).toBe('denied');
    expect(permissions.check('chat')).toBe('auto');
  });
  it('isAllowed retourne true sauf denied', () => {
    store.set('user', { id: 'client_xyz', name: 'X' });
    expect(permissions.isAllowed('chat')).toBe(true);
    expect(permissions.isAllowed('admin_view')).toBe(false);
  });
});
