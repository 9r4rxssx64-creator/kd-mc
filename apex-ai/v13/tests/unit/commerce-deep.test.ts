import { describe, it, expect, beforeEach } from 'vitest';
import { commerce } from '../../services/integrations/commerce.js';
import { store } from '../../core/store.js';

describe('commerce deep tests', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
    store.set('isAdmin', false);
  });

  it('setEnabled persiste dans store', () => {
    commerce.setEnabled(true);
    expect(commerce.isEnabled()).toBe(true);
    commerce.setEnabled(false);
    expect(commerce.isEnabled()).toBe(false);
  });

  it('setUserPlan persiste dans localStorage', () => {
    commerce.setUserPlan('u1', 'pro');
    expect(localStorage.getItem('apex_v13_plan_u1')).toBe('pro');
  });

  it('canAccess admin tier = true partout', () => {
    store.set('isAdmin', true);
    expect(commerce.canAccess('kdmc_admin', 'voicePremium')).toBe(true);
    expect(commerce.canAccess('kdmc_admin', 'marketplaceAccess')).toBe(true);
    expect(commerce.canAccess('kdmc_admin', 'whiteLabel')).toBe(true);
  });

  it('canAccess free user voice = false', () => {
    commerce.setEnabled(true);
    expect(commerce.canAccess('client_xyz', 'voicePremium')).toBe(false);
  });

  it('getLimits free vs pro vs admin', () => {
    commerce.setEnabled(true);
    expect(commerce.getLimits('client_free').msgPerDay).toBe(50);
    commerce.setUserPlan('u_pro', 'pro');
    expect(commerce.getLimits('u_pro').msgPerDay).toBe(-1);
    store.set('isAdmin', true);
    expect(commerce.getLimits('kdmc_admin').msgPerDay).toBe(-1);
  });

  it('consumeMessage incrémente compteur quotidien', () => {
    commerce.setEnabled(true);
    commerce.setUserPlan('u_count', 'free');
    const r1 = commerce.consumeMessage('u_count');
    const r2 = commerce.consumeMessage('u_count');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBeLessThan(r1.remaining);
  });

  it('consumeMessage refuse après quota dépassé', () => {
    commerce.setEnabled(true);
    commerce.setUserPlan('u_quota', 'free');
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`apex_v13_msgcount_u_quota_${today}`, '50'); /* limit free */
    const r = commerce.consumeMessage('u_quota');
    expect(r.allowed).toBe(false);
  });

  it('consumeMessage clamp integer overflow', () => {
    commerce.setEnabled(true);
    commerce.setUserPlan('u_overflow', 'free');
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`apex_v13_msgcount_u_overflow_${today}`, String(Number.MAX_SAFE_INTEGER));
    const r = commerce.consumeMessage('u_overflow');
    expect(r.allowed).toBe(false);
  });
});
