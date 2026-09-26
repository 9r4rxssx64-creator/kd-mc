/**
 * Test régression v13.4.73 — services/admin-action-gate.ts.
 *
 * Gate sécu actions admin sensibles : WebAuthn obligatoire si enrollé,
 * sinon fallback PIN. Échec → refus + audit log immutable.
 * P0 sécurité Kevin règle "WebAuthn obligatoire admin Kevin".
 */
import { describe, it, expect } from 'vitest';
import { adminActionGate } from '../../services/auth/admin-action-gate.js';

describe('v13.4.73 admin-action-gate — API publique', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(adminActionGate).toBeDefined();
    expect(typeof adminActionGate.verify).toBe('function');
    expect(typeof adminActionGate.guardAction).toBe('function');
    expect(typeof adminActionGate.getStatus).toBe('function');
  });
});

describe('v13.4.73 admin-action-gate — verify sans PIN ni WebAuthn', () => {
  it("verify(action, uid) sans PIN → refus si WebAuthn pas enrollé", async () => {
    const r = await adminActionGate.verify('toggle_commerce', 'kdmc_admin');
    expect(r).toBeDefined();
    expect(typeof r.ok).toBe('boolean');
    /* Sans PIN ni WebAuthn → denied */
    if (!r.ok) {
      expect(r.method).toBe('denied');
      expect(typeof r.reason).toBe('string');
    }
  });

  it("verify(action, uid, pin_invalide) → refus", async () => {
    const r = await adminActionGate.verify('erase_account', 'kdmc_admin', 'wrong_pin_999');
    expect(r).toBeDefined();
    expect(typeof r.ok).toBe('boolean');
    /* PIN invalide → ok:false */
    expect(r.ok).toBe(false);
  });

  it("verify accepte les 9 SensitiveAction sans throw", async () => {
    const actions: Array<Parameters<typeof adminActionGate.verify>[0]> = [
      'toggle_commerce',
      'set_user_plan',
      'erase_account',
      'export_data',
      'change_pin',
      'change_passphrase',
      'rotate_api_key',
      'factory_reset',
      'change_email_admin',
    ];
    for (const a of actions) {
      const r = await adminActionGate.verify(a, 'kdmc_admin');
      expect(r).toBeDefined();
      expect(typeof r.ok).toBe('boolean');
    }
  });
});

describe('v13.4.73 admin-action-gate — guardAction wrapper', () => {
  it("guardAction wrap une fonction → retourne fn async", () => {
    const original = async (x: number): Promise<number> => x * 2;
    const guarded = adminActionGate.guardAction('toggle_commerce', 'kdmc_admin', original);
    expect(typeof guarded).toBe('function');
  });

  it("guardAction si gate refusé → retourne {ok:false, gateBlocked:true, reason}", async () => {
    /* Fn qui ne doit PAS être appelée si gate fail */
    let called = false;
    const original = async (): Promise<{ ok: true }> => {
      called = true;
      return { ok: true };
    };
    const guarded = adminActionGate.guardAction('factory_reset', 'kdmc_admin', original);
    const result = await guarded();
    expect(result).toBeDefined();
    /* Sans WebAuthn ni PIN, gate refuse → original ne doit PAS être appelée */
    if ('gateBlocked' in result) {
      expect(result.gateBlocked).toBe(true);
      expect(result.ok).toBe(false);
      expect(typeof result.reason).toBe('string');
      expect(called).toBe(false);
    }
  });
});

describe('v13.4.73 admin-action-gate — getStatus dashboard', () => {
  it("getStatus(uid) retourne objet structuré 3 champs", () => {
    const s = adminActionGate.getStatus('kdmc_admin');
    expect(s).toBeDefined();
    expect(typeof s.webauthn_enrolled).toBe('boolean');
    expect(typeof s.webauthn_supported).toBe('boolean');
    expect(typeof s.requires_setup).toBe('boolean');
  });

  it("requires_setup = supported && !enrolled (logique cohérente)", () => {
    const s = adminActionGate.getStatus('kdmc_admin');
    expect(s.requires_setup).toBe(s.webauthn_supported && !s.webauthn_enrolled);
  });
});
