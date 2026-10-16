/**
 * v13.4.379 — plus de bulle « Proxy Cloudflare activé » à l'écran (Kevin 13.10 : « pas d'infos inutiles, nulle part »).
 * Vue par le robot « Apex comme Kevin » (run 38975685928) : sur un appareil neuf, la bulle recouvrait la première ligne
 * de la réponse d'Apex. L'activation du proxy reste dans le journal ; AUCUNE bulle ne part.
 * Sabotage : remettre `toast.info(...)` dans autoEnableIfReady → ce test rougit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bulles: string[] = [];
vi.mock('../../ui/toast.js', () => ({
  toast: {
    show: (m: string) => { bulles.push(m); return 'id'; },
    info: (m: string) => { bulles.push(m); return 'id'; },
    success: (m: string) => { bulles.push(m); return 'id'; },
    warning: (m: string) => { bulles.push(m); return 'id'; },
  },
}));
vi.mock('../../core/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
const { mockStore, mockProxy } = vi.hoisted(() => ({ mockStore: { get: vi.fn() }, mockProxy: { checkHealth: vi.fn() } }));
vi.mock('../../core/store.js', () => ({ store: mockStore }));
vi.mock('../../services/integrations/apex-secrets-proxy-client.js', () => ({ apexSecretsProxy: mockProxy }));

import { proxyAutoEnable } from '../../services/integrations/proxy-auto-enable.js';

describe('v13.4.379 — activation du proxy sans bulle', () => {
  beforeEach(() => {
    bulles.length = 0; localStorage.clear();
    mockStore.get.mockReturnValue({ id: 'kdmc_admin' });
    mockProxy.checkHealth.mockResolvedValue({ ok: true, data: { available_providers: ['groq', 'anthropic'] } });
  });
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it('première activation (appareil neuf) : le drapeau se pose, aucune bulle ne part', async () => {
    const r = await proxyAutoEnable.autoEnableIfReady();
    expect(r).toEqual({ enabled: true, reason: 'auto_enabled' });
    expect(localStorage.getItem('apex_v13_use_secrets_proxy')).toBe('true');
    await new Promise((res) => setTimeout(res, 30));
    expect(bulles).toEqual([]);
  });
});
