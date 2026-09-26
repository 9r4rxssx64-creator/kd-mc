/**
 * errors — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : triggerRescue (seuil maxErrors), toUserMessage isAdmin (id kdmc_admin, catch).
 * Reset errorCount du singleton en afterEach (anti-fuite #84).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { errors } from '../../core/errors.js';

const e = errors as unknown as { errorCount: number };

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => {
  vi.restoreAllMocks();
  e.errorCount = 0; // restaure le compteur du singleton
  document.getElementById('apex-rescue-btn')?.remove();
});

describe('errors — capture & triggerRescue', () => {
  it('capture < seuil → pas de rescue', () => {
    e.errorCount = 0;
    errors.capture(new Error('x'));
    expect(e.errorCount).toBe(1);
  });

  it('capture atteint le seuil (10) → triggerRescue affiche le bouton SOS', () => {
    const sos = document.createElement('div');
    sos.id = 'apex-rescue-btn';
    sos.style.display = 'none';
    document.body.appendChild(sos);
    e.errorCount = 9;
    errors.capture('boom-string'); // 10e → triggerRescue
    expect(sos.style.display).toBe('flex');
  });

  it('triggerRescue sans bouton SOS présent → pas de crash (branche if(sos) false)', () => {
    document.getElementById('apex-rescue-btn')?.remove();
    e.errorCount = 9;
    expect(() => errors.capture(new Error('y'))).not.toThrow();
  });
});

describe('errors — installGlobalHandlers', () => {
  it('window error event sans .error → capture(new Error(message)) (branche `|| new Error`)', () => {
    (errors as unknown as { installed: boolean }).installed = false;
    errors.installGlobalHandlers();
    const spy = vi.spyOn(errors, 'capture').mockImplementation(() => {});
    window.dispatchEvent(new ErrorEvent('error', { message: 'no-error-obj', error: null }));
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Error);
    expect((arg as Error).message).toBe('no-error-obj');
  });
});

describe('errors — toUserMessage isAdmin', () => {
  it('user id kdmc_admin (sans role) → admin debug (branche || user?.id)', () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin' }));
    const msg = errors.toUserMessage(new Error('weird internal failure xyz'));
    expect(msg).toContain('admin debug');
  });

  it('user role admin → admin debug (branche role)', () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ role: 'admin' }));
    const msg = errors.toUserMessage(new Error('autre souci technique'));
    expect(msg).toContain('admin debug');
  });

  it('localStorage user JSON corrompu → catch → isAdmin false → message générique', () => {
    localStorage.setItem('apex_v13_user', '{bad json');
    const msg = errors.toUserMessage(new Error('souci'));
    expect(msg).not.toContain('admin debug');
    expect(msg).toContain('Souci technique');
  });

  it('non-admin → message générique', () => {
    localStorage.clear();
    const msg = errors.toUserMessage(new Error('souci'));
    expect(msg).toContain('Souci technique');
  });
});
