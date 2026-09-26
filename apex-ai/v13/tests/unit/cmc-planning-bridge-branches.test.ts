/**
 * cmc-planning-bridge — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : guard admin (non-admin refusé), catch firebase.write (Error vs non-Error).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { pushPlanningToCmc } from '../../services/integrations/cmc-planning-bridge.js';
import { auth } from '../../services/auth/auth.js';
import { firebase } from '../../services/storage/firebase.js';

const SBM_TEXT = 'MAI 2026 BJ Éq.1 PIT BOSS '.repeat(20);

afterEach(() => { vi.restoreAllMocks(); });

describe('cmc-planning-bridge — pushPlanningToCmc', () => {
  it('rawText vide → empty raw_text', async () => {
    const r = await pushPlanningToCmc('');
    expect(r).toEqual({ ok: false, error: 'empty raw_text' });
  });

  it('non-admin → refusé admin_only_cmc_push', async () => {
    vi.spyOn(auth, 'isAdminSync').mockReturnValue(false);
    const r = await pushPlanningToCmc(SBM_TEXT, 'chat');
    expect(r).toEqual({ ok: false, error: 'admin_only_cmc_push' });
  });

  it('admin + write OK → ok:true + id', async () => {
    vi.spyOn(auth, 'isAdminSync').mockReturnValue(true);
    vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
    const r = await pushPlanningToCmc(SBM_TEXT, 'paste');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toMatch(/^pln_/);
  });

  it('admin + write throw Error → catch errMsg = message', async () => {
    vi.spyOn(auth, 'isAdminSync').mockReturnValue(true);
    vi.spyOn(firebase, 'write').mockRejectedValue(new Error('fb down'));
    const r = await pushPlanningToCmc(SBM_TEXT);
    expect(r).toEqual({ ok: false, error: 'fb down' });
  });

  it('admin + write throw non-Error (string) → catch String(err)', async () => {
    vi.spyOn(auth, 'isAdminSync').mockReturnValue(true);
    vi.spyOn(firebase, 'write').mockRejectedValue('boom-str');
    const r = await pushPlanningToCmc(SBM_TEXT);
    expect(r).toEqual({ ok: false, error: 'boom-str' });
  });
});
