/**
 * v13.4.380 — cloneSite envoie le laissez-passer du domaine au worker kdmc-clone.
 * Le worker va exiger `Authorization: Bearer <jeton>` (l'en-tête Origin seule se falsifie : proxy ouvert).
 * Sabotage : retirer l'en-tête `headers` dans cloneSite → le test « jeton présent » rougit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/core-svc/orchestrator.js', () => ({ orchestrator: {} }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: { log: vi.fn() } }));
vi.mock('../../services/storage/firebase.js', () => ({ firebase: {} }));
vi.mock('../../services/integrations/depot-github.js', () => ({ lireFichier: vi.fn(), lireFichierDetaille: vi.fn() }));

import { cloneSite } from '../../services/apex-tools-dispatch/utils-misc.js';

function reponseJson(): Response {
  return new Response(JSON.stringify({ title: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('v13.4.380 — cloneSite envoie le laissez-passer', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => reponseJson());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('jeton en localStorage : fetch reçoit Authorization: Bearer <jeton>', async () => {
    localStorage.setItem('kdmc_sso_token', 'jeton-de-test-123');
    await cloneSite('https://example.com', 'read');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://kdmc-clone.9r4rxssx64.workers.dev/read?url=');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jeton-de-test-123');
  });

  it('pas de jeton : aucun en-tête Authorization (le worker répondra son message)', async () => {
    await cloneSite('https://example.com');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeUndefined();
  });

  it('localStorage qui lève : pas de plantage, pas d\'en-tête', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    try {
      await cloneSite('https://example.com', 'meta');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.headers).toBeUndefined();
    } finally { spy.mockRestore(); }
  });
});
