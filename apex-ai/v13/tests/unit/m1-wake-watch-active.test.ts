/**
 * APEX v13.3.74 — Tests M1 (audit Apex v13.3.73 issue #240).
 *
 * "Réactiver wake word 'Dis Apex' (wake-watch désactivée)"
 * Vérifie : wake-watch peut être activée + autoFix no-op si user pas opt-in.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('M1 — wake-watch sentinelle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('wake-watch est registered (présente dans la liste)', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    const ww = list.find((s) => s.id === 'wake-watch');
    expect(ww).toBeDefined();
    expect(ww?.id).toBe('wake-watch');
    expect(ww?.name).toContain('Wake');
  });

  it('wake-watch peut être activée via sentinels.enable() (M1 fix services-bootstrap)', () => {
    registerCoreSentinels();
    /* Default OFF (back-compat) */
    let ww = sentinels.list().find((s) => s.id === 'wake-watch');
    expect(ww?.enabled).toBe(false);

    /* Re-active programmatiquement (services-bootstrap fait pareil) */
    sentinels.enable('wake-watch', true);
    ww = sentinels.list().find((s) => s.id === 'wake-watch');
    expect(ww?.enabled).toBe(true);
  });

  it('wake-watch autoFix no-op si user pas opt-in (ax_wake_word_active != "1")', async () => {
    registerCoreSentinels();
    /* Pas de toggle ax_wake_word_active → autoFix doit rendre OK no-op */
    const ww = sentinels.list().find((s) => s.id === 'wake-watch');
    expect(ww?.autoFix).toBeDefined();
    if (ww?.autoFix) {
      const result = await ww.autoFix();
      expect(result.ok).toBe(true);
      expect(result.msg.toLowerCase()).toContain('désactivé');
    }
  });
});
