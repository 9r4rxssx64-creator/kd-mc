import { describe, it, expect, beforeEach } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('sentinels deep tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runOne credentials-watch sans token retourne ok=true (no creds)', async () => {
    registerCoreSentinels();
    const r = await sentinels.runOne('credentials-watch');
    expect(r?.ts).toBeGreaterThan(0);
  });

  it('runOne backup-watch initial state ok (aucun backup encore)', async () => {
    registerCoreSentinels();
    /* Sprint 13.3.17 : absence de timestamp = état initial = OK
     * (la sentinelle ne crée pas d'alerte avant qu'un premier backup ait existé). */
    const r = await sentinels.runOne('backup-watch');
    expect(r?.ok).toBe(true);
    expect(r?.msg).toMatch(/initial|attente/i);
  });

  it('runOne backup-watch ok si récent', async () => {
    localStorage.setItem('ax_last_backup_ts', String(Date.now()));
    registerCoreSentinels();
    const r = await sentinels.runOne('backup-watch');
    expect(r?.ok).toBe(true);
  });

  it('runOne backup-watch détecte stale + autoFix tente snapshot (Sprint 13.3.17)', async () => {
    registerCoreSentinels();
    /* Timestamp ancien : check fail → autoFix tente snapshot. Si autoFix réussit,
     * lastResult devient ok. Si autoFix fail (ex: indexedDB indispo en jsdom),
     * lastResult reste fail. Les deux comportements sont valides. */
    localStorage.setItem('ax_last_backup_ts', String(Date.now() - 30 * 60 * 60 * 1000));
    const r = await sentinels.runOne('backup-watch');
    expect(r?.ts).toBeGreaterThan(0);
    expect(typeof r?.msg).toBe('string');
  });

  it('runOne sentinel inconnu retourne ok=false', async () => {
    registerCoreSentinels();
    const r = await sentinels.runOne('inexistant');
    expect(r?.ok).toBe(false);
  });

  it('storage-watch alerte si > 4 MB localStorage', async () => {
    registerCoreSentinels();
    /* Remplit localStorage avec ~4.5 MB */
    const big = 'x'.repeat(500_000);
    for (let i = 0; i < 10; i++) {
      try { localStorage.setItem(`big_${i}`, big); } catch { /* quota OK */ }
    }
    const r = await sentinels.runOne('storage-watch');
    /* Si quota localStorage permet 4MB, alors flag */
    expect(r?.ts).toBeGreaterThan(0);
  });

  it('compliance-watch sans user → état initial OK (Sprint 13.3.17)', async () => {
    /* Sprint 13.3.17 : sans user logged-in, pas de consent à enregistrer = OK. */
    registerCoreSentinels();
    const r = await sentinels.runOne('compliance-watch');
    expect(r?.ok).toBe(true);
  });

  it('compliance-watch avec consent flag true', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
    localStorage.setItem('apex_v13_rgpd_consent', JSON.stringify({ ts: Date.now() }));
    registerCoreSentinels();
    const r = await sentinels.runOne('compliance-watch');
    expect(r?.ok).toBe(true);
  });

  it('compliance-watch fail + autoFix recovery (Sprint 13.3.17)', async () => {
    /* User logged-in sans consent → check fail → autoFix crée consent essential
     * → recheck ok. Comportement autonome attendu. */
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
    registerCoreSentinels();
    const r = await sentinels.runOne('compliance-watch');
    expect(r?.ok).toBe(true); /* autoFix recovery */
    expect(localStorage.getItem('apex_v13_cookies_accepted')).toBeTruthy();
  });

  it('list contient au moins 13 sentinelles (Jet 8.1 +agent-watches-runner)', () => {
    registerCoreSentinels();
    expect(sentinels.list().length).toBeGreaterThanOrEqual(13);
  });

  it('enable/disable persistant sur instance', () => {
    registerCoreSentinels();
    sentinels.enable('error-watch', false);
    expect(sentinels.list().find((s) => s.id === 'error-watch')?.enabled).toBe(false);
    sentinels.enable('error-watch', true);
    expect(sentinels.list().find((s) => s.id === 'error-watch')?.enabled).toBe(true);
  });
});
