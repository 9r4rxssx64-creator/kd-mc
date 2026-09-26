/**
 * worker-url-heal — couverture 100% (campagne, lesson #85).
 * healWorkerUrls() réécrit les URLs *.desarzens-kevin.workers.dev → *.9r4rxssx64.workers.dev.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { healWorkerUrls } from '../../services/integrations/worker-url-heal.js';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('worker-url-heal', () => {
  it('URL avec ancien sous-domaine → réécrite (val truthy + includes true + fixed>0)', () => {
    localStorage.setItem('ax_push_worker_url', 'https://apex-push.desarzens-kevin.workers.dev/send');
    const r = healWorkerUrls();
    expect(r.fixed).toBe(1);
    expect(r.keys).toContain('ax_push_worker_url');
    expect(localStorage.getItem('ax_push_worker_url')).toContain('.9r4rxssx64.workers.dev');
  });

  it('URL sans ancien sous-domaine → inchangée (includes false, fixed=0, pas de log)', () => {
    localStorage.setItem('ax_proxy_url', 'https://apex.9r4rxssx64.workers.dev/');
    const r = healWorkerUrls();
    expect(r.fixed).toBe(0);
  });

  it('aucune clé stockée → val null (`val &&` court-circuit), fixed=0', () => {
    const r = healWorkerUrls();
    expect(r.fixed).toBe(0);
    expect(r.keys).toEqual([]);
  });

  it('getItem throw → catch silencieux (pas de throw)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('ls'); }, setItem: () => {}, removeItem: () => {}, clear: () => {},
    });
    expect(() => healWorkerUrls()).not.toThrow();
  });
});
