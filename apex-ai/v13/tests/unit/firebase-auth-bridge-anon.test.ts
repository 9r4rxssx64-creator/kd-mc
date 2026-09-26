/**
 * Repli anonyme du pont Firebase (durcissement /apex + /coffre_vault auth != null,
 * Kevin 2026-07-04 « Durci »). Invariants :
 *  - getToken() reste PUR/sync (aucun fetch déclenché — lesson #89 anti fuite post-teardown)
 *  - ensureAnonToken() : signUp Identity Toolkit → token anonyme exposé par getToken()
 *  - le token Phase 5 (PIN) reste PRIORITAIRE sur l'anonyme
 *  - échec signUp → '' + throttle (fail-open, jamais de throw)
 *  - authQS() construit ?auth= / &auth= pour les fetch RTDB directs (rgpd, memory-bridge)
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { firebaseAuthBridge } from '@services/auth/firebase-auth-bridge.js';

type AnonState = { anonToken: string; anonExp: number; anonNextTs: number; idToken: string; exp: number };
const st = firebaseAuthBridge as unknown as AnonState;

function resetAnon(): void {
  st.anonToken = '';
  st.anonExp = 0;
  st.anonNextTs = 0;
}

function jsonResp(body: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as unknown as Response);
}

describe('firebaseAuthBridge — repli anonyme (auth != null)', () => {
  beforeEach(() => {
    localStorage.clear();
    firebaseAuthBridge.clear();
    resetAnon();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getToken() est PUR : sans token il ne déclenche AUCUN fetch (lesson #89)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(firebaseAuthBridge.getToken()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ensureAnonToken : signUp anonyme → token exposé par getToken() + authQS()', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      expect(String(input)).toContain('identitytoolkit.googleapis.com/v1/accounts:signUp');
      return jsonResp({ idToken: 'ANON_TOK', expiresIn: '3600' });
    });
    const tok = await firebaseAuthBridge.ensureAnonToken();
    expect(tok).toBe('ANON_TOK');
    expect(firebaseAuthBridge.getToken()).toBe('ANON_TOK');
    expect(firebaseAuthBridge.authQS(false)).toBe('?auth=ANON_TOK');
    expect(firebaseAuthBridge.authQS(true)).toBe('&auth=ANON_TOK');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    /* Re-appel avec token valide → pas de nouveau fetch (cache) */
    await firebaseAuthBridge.ensureAnonToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('le token Phase 5 (PIN) reste prioritaire sur le token anonyme', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/login')) return jsonResp({ ok: true, id_token: 'ID_TOK', expires_in: 3600 });
      return jsonResp({ idToken: 'ANON_TOK', expiresIn: '3600' });
    });
    await firebaseAuthBridge.ensureAnonToken();
    expect(firebaseAuthBridge.getToken()).toBe('ANON_TOK');
    localStorage.setItem('apex_v13_pin', 'HASH_ADMIN');
    await firebaseAuthBridge.activate('kdmc_admin', true);
    expect(firebaseAuthBridge.getToken()).toBe('ID_TOK'); /* Phase 5 gagne */
  });

  it('échec signUp → "" + throttle 60s (fail-open, pas de spam)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResp({ error: { message: 'OPERATION_NOT_ALLOWED' } }, false, 400),
    );
    const tok = await firebaseAuthBridge.ensureAnonToken();
    expect(tok).toBe('');
    expect(firebaseAuthBridge.getToken()).toBe('');
    expect(firebaseAuthBridge.authQS(false)).toBe('');
    /* Throttle actif → pas de re-fetch immédiat */
    await firebaseAuthBridge.ensureAnonToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('exception réseau → "" sans throw (fail-open absolu)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(firebaseAuthBridge.ensureAnonToken()).resolves.toBe('');
    expect(firebaseAuthBridge.getToken()).toBe('');
  });

  it('ensureFreshToken sans uid/PIN → repli anonyme (le boot RTDB part authentifié)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      expect(String(input)).toContain('accounts:signUp');
      return jsonResp({ idToken: 'ANON_BOOT', expiresIn: '3600' });
    });
    const tok = await firebaseAuthBridge.ensureFreshToken();
    expect(tok).toBe('ANON_BOOT');
  });
});
