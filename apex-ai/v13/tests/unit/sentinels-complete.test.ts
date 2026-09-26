/**
 * v13.3.70 — Tests des 8 sentinelles complétées avec auto-fix réel.
 *
 * Couvre :
 * - security-watch : check + sentinelAutoRepair.securityRebuildChain (UI button)
 * - performance-watch : check Web Vitals + autoFix (reset baseline)
 * - storage-watch : check + autoFix (aggressiveCleanup) — déjà couvert mais re-test
 * - network-watch : check ping CSP-friendly + autoFix (fbReconnect)
 * - presence-watch : heartbeat + broadcast online/offline + cleanup stale
 * - compliance-watch : RGPD + permissions revoked detect
 * - conflict-watch : detect stale + sentinelAutoRepair.conflictMergeResolve (UI button)
 * - wake-watch : permission + restart si crashed
 *
 * Note design : security-watch + conflict-watch n'ont PAS de Sentinel.autoFix
 * direct car leurs signaux (tamper / conflict) doivent rester visibles avant
 * repair manuel. Le repair est exposé via sentinelAutoRepair.* pour wire UI.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';
import { sentinelAutoRepair } from '../../services/sentinels/sentinel-auto-repair.js';
import { auditLog } from '../../services/observability/audit-log.js';

const TARGETS = [
  'security-watch',
  'performance-watch',
  'storage-watch',
  'network-watch',
  'presence-watch',
  'compliance-watch',
  'conflict-watch',
  'wake-watch',
] as const;

describe('sentinels-complete (8 sentinelles avec auto-fix réel)', () => {
  beforeEach(() => {
    localStorage.clear();
    registerCoreSentinels();
  });

  it('toutes les 8 sentinelles ciblées sont enregistrées', () => {
    const ids = sentinels.list().map((s) => s.id);
    for (const target of TARGETS) {
      expect(ids).toContain(target);
    }
  });

  it('security-watch : check ok sur audit log vide + sentinelAutoRepair idempotent', async () => {
    const r = await sentinels.runOne('security-watch');
    expect(r?.ts).toBeGreaterThan(0);
    expect(typeof r?.msg).toBe('string');
    /* securityRebuildChain idempotent : chain valide → no-op ok:true */
    const fix = await sentinelAutoRepair.securityRebuildChain();
    expect(fix.ok).toBe(true);
    expect(fix.msg).toMatch(/déjà valide|no-op|rebuild/i);
  });

  it('security-watch : sentinelAutoRepair.securityRebuildChain rebuilt si tamper', async () => {
    auditLog.init();
    await auditLog.record('test.action.1');
    await auditLog.record('test.action.2');
    /* Corrupt chain manuellement */
    const raw = localStorage.getItem('ax_audit_log_v13');
    if (raw) {
      const chain = JSON.parse(raw) as { hash: string }[];
      if (chain[1]) chain[1].hash = 'tampered';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(chain));
    }
    auditLog.reload();
    const fix = await sentinelAutoRepair.securityRebuildChain();
    expect(fix.ok).toBe(true);
    expect(fix.msg).toMatch(/rebuild/i);
  });

  it('performance-watch : seed baseline + autoFix reset si > 7j', async () => {
    /* Seed baseline ancienne (8j) → autoFix doit reset */
    const oldBaseline = {
      LCP: 2000, INP: 80, CLS: 0.05,
      ts: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem('apex_v13_perf_baseline', JSON.stringify(oldBaseline));
    const r = await sentinels.runOne('performance-watch');
    expect(r?.ts).toBeGreaterThan(0);
    const s = sentinels.list().find((x) => x.id === 'performance-watch');
    expect(s?.autoFix).toBeDefined();
    if (s?.autoFix) {
      const fix = await s.autoFix();
      expect(fix.ok).toBe(true);
      expect(fix.msg).toContain('reset');
      /* Vérifie que la baseline a bien été supprimée */
      expect(localStorage.getItem('apex_v13_perf_baseline')).toBeNull();
    }
  });

  it('storage-watch : autoFix trim arrays oversized', async () => {
    /* Seed un array oversized (300 items dans observability) */
    const big = Array.from({ length: 300 }, (_, i) => ({ id: i, msg: 'x'.repeat(100) }));
    localStorage.setItem('apex_v13_observability', JSON.stringify(big));
    const s = sentinels.list().find((x) => x.id === 'storage-watch');
    expect(s?.autoFix).toBeDefined();
    if (s?.autoFix) {
      const fix = await s.autoFix();
      /* Trim 300→100 doit libérer du KB */
      expect(typeof fix.msg).toBe('string');
      const after = JSON.parse(localStorage.getItem('apex_v13_observability') ?? '[]') as unknown[];
      expect(after.length).toBeLessThanOrEqual(100);
    }
  });

  it('network-watch : check OK puis autoFix appellable', async () => {
    const r = await sentinels.runOne('network-watch');
    expect(r?.ts).toBeGreaterThan(0);
    const s = sentinels.list().find((x) => x.id === 'network-watch');
    expect(s?.autoFix).toBeDefined();
    /* On ne run PAS le autoFix réel ici (firebase.init() écrirait au localStorage),
     * on vérifie juste que la fonction existe et est callable. */
    expect(typeof s?.autoFix).toBe('function');
  });

  it('presence-watch : update lastact + broadcast registry online', async () => {
    /* Simule user logged-in */
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin', name: 'Kevin' }));
    const r = await sentinels.runOne('presence-watch');
    expect(r?.ts).toBeGreaterThan(0);
    /* Le check broadcast doit avoir écrit dans apex_v13_presence */
    const presence = JSON.parse(localStorage.getItem('apex_v13_presence') ?? '{}') as Record<string, { online: boolean }>;
    expect(presence['kdmc_admin']?.online).toBe(true);
    /* AutoFix → refresh lastact */
    const s = sentinels.list().find((x) => x.id === 'presence-watch');
    if (s?.autoFix) {
      const fix = await s.autoFix();
      expect(fix.ok).toBe(true);
      expect(parseInt(localStorage.getItem('apex_v13_lastact') ?? '0', 10)).toBeGreaterThan(0);
    }
  });

  it('presence-watch : marque offline les users stale > 10min', async () => {
    /* Seed un user online avec ts > 10min */
    const stalePresence = {
      'old_user_1': { ts: Date.now() - 15 * 60 * 1000, online: true, uid: 'old_user_1' },
    };
    localStorage.setItem('apex_v13_presence', JSON.stringify(stalePresence));
    await sentinels.runOne('presence-watch');
    const after = JSON.parse(localStorage.getItem('apex_v13_presence') ?? '{}') as Record<string, { online: boolean }>;
    expect(after['old_user_1']?.online).toBe(false);
  });

  it('compliance-watch : detect consent absent + auto-fix le résout', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'u1' }));
    /* runOne déclenche check + autoFix automatique → résultat final ok après auto-fix */
    const r = await sentinels.runOne('compliance-watch');
    expect(r?.ts).toBeGreaterThan(0);
    /* Soit msg "Auto-fixed" (autofix a tourné), soit consent ok directement */
    expect(typeof r?.msg).toBe('string');
    /* Verify autoFix a bien seedé un consent → re-run check directement */
    const s = sentinels.list().find((x) => x.id === 'compliance-watch');
    if (s) {
      const direct = await s.check();
      expect(direct.ok).toBe(true);
    }
  });

  it('compliance-watch : autoFix seed default consent', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'u1' }));
    const s = sentinels.list().find((x) => x.id === 'compliance-watch');
    if (s?.autoFix) {
      const fix = await s.autoFix();
      expect(fix.ok).toBe(true);
      expect(localStorage.getItem('apex_v13_cookies_accepted')).not.toBeNull();
    }
  });

  it('conflict-watch : check direct détecte stale + sentinelAutoRepair reset → pending', async () => {
    /* Seed queue avec 7 entries flushing > 5min stale */
    const oldTs = Date.now() - 10 * 60 * 1000;
    const queue = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      status: 'flushing',
      ts: oldTs,
    }));
    localStorage.setItem('apex_v13_fb_queue', JSON.stringify(queue));
    /* check direct */
    const s = sentinels.list().find((x) => x.id === 'conflict-watch');
    expect(s).toBeDefined();
    if (!s) return;
    const direct = await s.check();
    expect(direct.ok).toBe(false);
    expect(direct.msg).toMatch(/stale|conflict/i);
    /* sentinelAutoRepair.conflictMergeResolve doit reset les 7 → pending */
    const fix = await sentinelAutoRepair.conflictMergeResolve();
    expect(fix.ok).toBe(true);
    expect(fix.msg).toMatch(/reset|stale/i);
    const after = JSON.parse(localStorage.getItem('apex_v13_fb_queue') ?? '[]') as Array<{ status: string }>;
    const stillFlushing = after.filter((e) => e.status === 'flushing').length;
    expect(stillFlushing).toBe(0);
  });

  it('wake-watch : autoFix no-op si désactivé', async () => {
    /* Wake word OFF par défaut → autoFix retourne ok:true sans agir */
    localStorage.removeItem('apex_v13_wake_enabled');
    const s = sentinels.list().find((x) => x.id === 'wake-watch');
    expect(s?.autoFix).toBeDefined();
    if (s?.autoFix) {
      const fix = await s.autoFix();
      expect(fix.ok).toBe(true);
      expect(fix.msg).toMatch(/désactivé|disabled|no-op/i);
    }
  });

  it('6/8 sentinelles ont autoFix Sentinel direct (security + conflict via sentinelAutoRepair)', () => {
    const list = sentinels.list();
    /* security-watch + conflict-watch n'ont PAS Sentinel.autoFix direct
     * (signaux doivent rester visibles) — mais sentinelAutoRepair les couvre */
    const SENTINEL_AUTOFIX = TARGETS.filter((t) => !['security-watch', 'conflict-watch'].includes(t));
    for (const target of SENTINEL_AUTOFIX) {
      const s = list.find((x) => x.id === target);
      expect(s, `sentinelle ${target} introuvable`).toBeDefined();
      expect(s?.autoFix, `sentinelle ${target} sans autoFix direct`).toBeDefined();
    }
    /* security + conflict : auto-repair via sentinelAutoRepair */
    expect(typeof sentinelAutoRepair.securityRebuildChain).toBe('function');
    expect(typeof sentinelAutoRepair.conflictMergeResolve).toBe('function');
  });
});
