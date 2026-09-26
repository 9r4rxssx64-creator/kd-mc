/**
 * Test fonctionnel RÉEL — firebase.ts attache le token d'auth Phase 5 (RTDB `?auth=`).
 * Sécu P1 ultra-review v13.4.291 : prérequis au durcissement des règles RTDB.
 * Vérifie le contrat RÉTRO-COMPATIBLE : token présent → `auth=` dans l'URL ;
 * token absent → aucun param (comportement identique à avant, zéro régression).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firebase } from '../../services/storage/firebase.js';
import { firebaseAuthBridge } from '../../services/auth/firebase-auth-bridge.js';

function mockFetchOk(): ReturnType<typeof vi.fn> {
  const f = vi.fn(async () =>
    new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined); /* évite SSE réel en happy-dom */
  /* Neutralise le restore vault de fond (fire-and-forget dans init) pour éviter
     toute fuite de fetch async post-teardown (leçon #89 CLAUDE.md). */
  vi.spyOn(
    firebase as unknown as { restoreVaultAllLayers: () => Promise<void> },
    'restoreVaultAllLayers',
  ).mockResolvedValue(undefined);
});

afterEach(() => {
  firebase.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('firebase — attache token RTDB ?auth= (sécu Phase 5)', () => {
  it('token présent → URL ping contient auth=<token>', async () => {
    vi.spyOn(firebaseAuthBridge, 'getToken').mockReturnValue('TESTTOKEN123');
    const f = mockFetchOk();
    await firebase.init();
    const urls = f.mock.calls.map((c) => String(c[0]));
    const pinged = urls.find((u) => u.includes('shallow=true'));
    expect(pinged).toBeDefined();
    expect(pinged).toContain('auth=TESTTOKEN123');
  });

  it('token absent → URL ping SANS param auth (rétro-compatible)', async () => {
    vi.spyOn(firebaseAuthBridge, 'getToken').mockReturnValue('');
    const f = mockFetchOk();
    await firebase.init();
    const urls = f.mock.calls.map((c) => String(c[0]));
    const pinged = urls.find((u) => u.includes('shallow=true'));
    expect(pinged).toBeDefined();
    expect(pinged).not.toContain('auth=');
  });

  it('token avec caractères spéciaux → encodé dans l\'URL', async () => {
    vi.spyOn(firebaseAuthBridge, 'getToken').mockReturnValue('a/b+c=d');
    const f = mockFetchOk();
    await firebase.init();
    const urls = f.mock.calls.map((c) => String(c[0]));
    const pinged = urls.find((u) => u.includes('shallow=true'));
    expect(pinged).toContain('auth=a%2Fb%2Bc%3Dd');
  });
});
