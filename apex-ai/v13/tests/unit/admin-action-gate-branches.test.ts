/**
 * admin-action-gate — couverture branches complète (dette audit #1 → 100% réel).
 * Mocks WebAuthn / auth / feature-toggles pour exercer chaque chemin :
 * WebAuthn ok / refusé / sans reason / throw · PIN ok / faux / throw · toggles · guardAction passant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/auth/webauthn.js', () => ({
  webauthn: {
    hasEnrollment: vi.fn(),
    verify: vi.fn(),
    isSupported: vi.fn(() => true),
  },
}));
vi.mock('../../services/auth/auth.js', () => ({
  auth: { login: vi.fn() },
}));
vi.mock('../../services/auth/feature-toggles.js', () => ({
  isFeatureEnabled: vi.fn(() => true),
}));

import { adminActionGate } from '../../services/auth/admin-action-gate.js';
import { webauthn } from '../../services/auth/webauthn.js';
import { auth } from '../../services/auth/auth.js';
import { isFeatureEnabled } from '../../services/auth/feature-toggles.js';

const wa = webauthn as unknown as {
  hasEnrollment: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  isSupported: ReturnType<typeof vi.fn>;
};
const al = auth as unknown as { login: ReturnType<typeof vi.fn> };
const fe = isFeatureEnabled as unknown as ReturnType<typeof vi.fn>;

/* CRITIQUE : un test spy sur le SINGLETON partagé `adminActionGate.verify`.
   Sans restore, le spy fuit vers les autres fichiers du même fork (clearAllMocks
   global n'efface que les appels, pas l'implémentation spiée). Lesson #83. */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin-action-gate — branches WebAuthn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fe.mockReturnValue(true);
    wa.isSupported.mockReturnValue(true);
  });

  it('biometric ON + enrollé + verify ok → passed webauthn', async () => {
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockResolvedValue({ ok: true });
    const r = await adminActionGate.verify('erase_account', 'kdmc_admin');
    expect(r).toEqual({ ok: true, method: 'webauthn' });
  });

  it('verify refusé avec reason → denied + reason propagée', async () => {
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockResolvedValue({ ok: false, reason: 'cancelled' });
    const r = await adminActionGate.verify('factory_reset', 'kdmc_admin');
    expect(r.ok).toBe(false);
    expect(r.method).toBe('denied');
    expect(r.reason).toBe('cancelled');
  });

  it('verify refusé sans reason → message fallback WebAuthn', async () => {
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockResolvedValue({ ok: false });
    const r = await adminActionGate.verify('export_data', 'kdmc_admin');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('WebAuthn');
  });

  it('verify throw → catch → denied avec message erreur', async () => {
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockRejectedValue(new Error('hw fail'));
    const r = await adminActionGate.verify('rotate_api_key', 'kdmc_admin');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('hw fail');
  });

  it('verify throw non-Error (string) → String(err)', async () => {
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockRejectedValue('boom-str');
    const r = await adminActionGate.verify('rotate_api_key', 'kdmc_admin');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('boom-str');
  });
});

describe('admin-action-gate — branches PIN fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wa.isSupported.mockReturnValue(true);
  });

  it('biometric OFF (toggle 1 false) → PIN ok → passed pin', async () => {
    fe.mockReturnValue(false); // court-circuite le && dès le 1er toggle
    al.login.mockResolvedValue({ ok: true });
    const r = await adminActionGate.verify('change_pin', 'kdmc_admin', 'goodpin');
    expect(r).toEqual({ ok: true, method: 'pin' });
  });

  it('toggle biometric true mais webauthn false (2e opérande) → PIN', async () => {
    fe.mockReturnValueOnce(true).mockReturnValueOnce(false);
    al.login.mockResolvedValue({ ok: true });
    const r = await adminActionGate.verify('set_user_plan', 'kdmc_admin', 'p');
    expect(r.method).toBe('pin');
  });

  it('biometric ON mais PAS enrollé → fallback PIN ok', async () => {
    fe.mockReturnValue(true);
    wa.hasEnrollment.mockReturnValue(false);
    al.login.mockResolvedValue({ ok: true });
    const r = await adminActionGate.verify('change_passphrase', 'kdmc_admin', 'pin');
    expect(r.method).toBe('pin');
  });

  it('PIN incorrect (login ok=false) → denied PIN incorrect', async () => {
    fe.mockReturnValue(false);
    al.login.mockResolvedValue({ ok: false });
    const r = await adminActionGate.verify('toggle_commerce', 'kdmc_admin', 'bad');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('PIN incorrect');
  });

  it('login throw → catch → denied avec message', async () => {
    fe.mockReturnValue(false);
    al.login.mockRejectedValue(new Error('login boom'));
    const r = await adminActionGate.verify('change_email_admin', 'kdmc_admin', 'x');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('login boom');
  });

  it('login throw non-Error (string) → reason = String(err)', async () => {
    fe.mockReturnValue(false);
    al.login.mockRejectedValue('pin-boom-str');
    const r = await adminActionGate.verify('change_pin', 'kdmc_admin', 'x');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('pin-boom-str');
  });
});

describe('admin-action-gate — guardAction passant + getStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wa.isSupported.mockReturnValue(true);
  });

  it('guardAction : gate passe (webauthn) → fn exécutée + résultat renvoyé', async () => {
    fe.mockReturnValue(true);
    wa.hasEnrollment.mockReturnValue(true);
    wa.verify.mockResolvedValue({ ok: true });
    let called = false;
    const fn = adminActionGate.guardAction('toggle_commerce', 'kdmc_admin', async (x: string) => {
      called = true;
      return { done: x };
    });
    const res = await fn('go');
    expect(called).toBe(true);
    expect(res).toEqual({ done: 'go' });
  });

  it('guardAction : gate refuse → gateBlocked sans appeler fn', async () => {
    fe.mockReturnValue(false); // pas de PIN → denied
    let called = false;
    const fn = adminActionGate.guardAction('erase_account', 'kdmc_admin', async () => {
      called = true;
      return { ok: true };
    });
    const res = (await fn()) as { ok: false; gateBlocked: true; reason: string };
    expect(called).toBe(false);
    expect(res.gateBlocked).toBe(true);
  });

  it('getStatus : supporté + enrollé → requires_setup false', () => {
    wa.isSupported.mockReturnValue(true);
    wa.hasEnrollment.mockReturnValue(true);
    expect(adminActionGate.getStatus('kdmc_admin')).toEqual({
      webauthn_enrolled: true,
      webauthn_supported: true,
      requires_setup: false,
    });
  });

  it('getStatus : supporté + pas enrollé → requires_setup true', () => {
    wa.isSupported.mockReturnValue(true);
    wa.hasEnrollment.mockReturnValue(false);
    expect(adminActionGate.getStatus('kdmc_admin').requires_setup).toBe(true);
  });

  it('getStatus : non supporté → requires_setup false', () => {
    wa.isSupported.mockReturnValue(false);
    wa.hasEnrollment.mockReturnValue(false);
    expect(adminActionGate.getStatus('kdmc_admin').requires_setup).toBe(false);
  });

  it('guardAction : gate refuse SANS reason → fallback "denied"', async () => {
    vi.spyOn(adminActionGate, 'verify').mockResolvedValue({ ok: false });
    const fn = adminActionGate.guardAction('factory_reset', 'kdmc_admin', async () => ({ ok: true }));
    const res = (await fn()) as { ok: false; gateBlocked: true; reason: string };
    expect(res.gateBlocked).toBe(true);
    expect(res.reason).toBe('denied');
  });
});
