/**
 * v13.4.342 — auto-test + auto-réparation IA au boot (Kevin « fais tout toi auto
 * avec Apex »). Apex attend le vault, ping anthropic via proxy, efface les DEAD
 * sur 200, capture l'échec exact sinon — zéro geste de Kevin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getBootHealResult, runBootHeal } from '../../services/ai/ai-boot-heal.js';
import { getLastAiFails, recordLastAiFail } from '../../services/ai/last-ai-fail.js';

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn(async (k: string) => (k === 'ax_pin' ? '200807' : null)) },
}));

describe('v13.4.342 — ai-boot-heal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('non-admin → skip propre (aucun ping, aucun coût)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await runBootHeal();
    expect(r.ok).toBe(true);
    expect(r.step).toBe('skip');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('admin + proxy OFF → skip (clé locale attendue)', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    const r = await runBootHeal();
    expect(r.step).toBe('skip');
    expect(r.detail).toContain('proxy désactivé');
  });

  it('admin + proxy ON + ping 200 → auto-réparation (DEAD + échec purgés) + résultat persisté', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    recordLastAiFail('anthropic', 'vieil échec', 401); /* pollution résiduelle */
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    const r = await runBootHeal();
    expect(r.ok).toBe(true);
    expect(r.step).toBe('ping');
    expect(getLastAiFails()['anthropic']).toBeUndefined(); /* purgé */
    expect(getBootHealResult()?.ok).toBe(true); /* persisté pour le rapport d'audit */
  });

  it('admin + proxy ON + ping 401 → échec CAPTURÉ avec status+body exacts', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid x-apex-pin"}', { status: 401 })));
    const r = await runBootHeal();
    expect(r.ok).toBe(false);
    const f = getLastAiFails()['anthropic'];
    expect(f?.status).toBe(401);
    expect(f?.msg).toContain('invalid x-apex-pin');
  });

  it('fetch qui throw (réseau) → capturé, jamais d\'exception propagée', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    const r = await runBootHeal();
    expect(r.ok).toBe(false);
    expect(getLastAiFails()['anthropic']?.msg).toContain('Failed to fetch');
  });
});
