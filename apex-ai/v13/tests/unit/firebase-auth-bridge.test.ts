/**
 * Pont Phase 5 Firebase Auth — contrat FAIL-OPEN + chemins succès/bootstrap.
 * L'invariant critique : sans worker / sans token → getToken() === '' (0 régression).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { firebaseAuthBridge } from '@services/auth/firebase-auth-bridge.js';

function jsonResp(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
}

describe('firebaseAuthBridge (Phase 5, fail-open)', () => {
  beforeEach(() => {
    localStorage.clear();
    firebaseAuthBridge.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getToken() vide par défaut (aucune régression possible)", () => {
    expect(firebaseAuthBridge.getToken()).toBe('');
  });

  it('activate sans PIN local → false, pas de token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ok = await firebaseAuthBridge.activate('kdmc_admin', true);
    expect(ok).toBe(false);
    expect(firebaseAuthBridge.getToken()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled(); // pas d'appel worker si pas de hash
  });

  it('succès : id_token stocké et exposé', async () => {
    localStorage.setItem('apex_v13_pin', 'HASH_ADMIN');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResp({ ok: true, id_token: 'ID_TOK', refresh_token: 'RT', expires_in: 3600 }) as unknown as Promise<Response>,
    );
    const ok = await firebaseAuthBridge.activate('kdmc_admin', true);
    expect(ok).toBe(true);
    expect(firebaseAuthBridge.getToken()).toBe('ID_TOK');
  });

  it('user_not_found → bootstrap PUT → retry ok', async () => {
    localStorage.setItem('apex_v13_pin_emp1', 'HASH_EMP');
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/login')) {
        // 1er /login → user_not_found ; 2e /login → ok
        const loginCalls = calls.filter((c) => c.includes('/login')).length;
        if (loginCalls === 1) return jsonResp({ ok: false, error: 'user_not_found' }, false, 404) as unknown as Promise<Response>;
        return jsonResp({ ok: true, id_token: 'ID2', expires_in: 3600 }) as unknown as Promise<Response>;
      }
      // bootstrap PUT
      return jsonResp({}, true, 200) as unknown as Promise<Response>;
    });
    const ok = await firebaseAuthBridge.activate('emp1', false);
    expect(ok).toBe(true);
    expect(firebaseAuthBridge.getToken()).toBe('ID2');
    expect(calls.some((c) => c.includes('/apex/ax_pin_emp1.json'))).toBe(true); // bootstrap a bien eu lieu
  });

  it('erreur worker → fail-open (false, pas de token)', async () => {
    localStorage.setItem('apex_v13_pin', 'HASH_ADMIN');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const ok = await firebaseAuthBridge.activate('kdmc_admin', true);
    expect(ok).toBe(false);
    expect(firebaseAuthBridge.getToken()).toBe('');
  });

  it('custom_token seul (pas de Web API key worker) → ok mais getToken vide (fail-open)', async () => {
    localStorage.setItem('apex_v13_pin', 'HASH_ADMIN');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResp({ ok: true, custom_token: 'CT', expires_in: 3600 }) as unknown as Promise<Response>,
    );
    const ok = await firebaseAuthBridge.activate('kdmc_admin', true);
    expect(ok).toBe(true); // login réussi
    expect(firebaseAuthBridge.getToken()).toBe(''); // pas d'id_token → rien attaché → comportement actuel
  });
});
