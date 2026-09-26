/**
 * Tests services/autonomous-watch + sentinel-auto-repair (Kevin v13.4.208).
 *
 * Couvre 2 services courts non-testés :
 * - autonomousWatch : start/stop/forceTick/getStats lifecycle
 * - sentinelAutoRepair : securityRebuildChain + conflictMergeResolve
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Mock apex-autonomous-mode pour ne pas déclencher de réelles actions IA */
vi.mock('../../services/admin/apex-autonomous-mode.js', () => ({
  apexAutonomousMode: { tick: vi.fn().mockResolvedValue(undefined) },
}));

/* Mock audit-log pour sentinelAutoRepair */
const { mockAuditLog, mockFirebase } = vi.hoisted(() => ({
  mockAuditLog: {
    reload: vi.fn(),
    autoRepair: vi.fn(),
  },
  mockFirebase: { init: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));
vi.mock('../../services/storage/firebase.js', () => ({ firebase: mockFirebase }));

import { autonomousWatch } from '../../services/sentinels/autonomous-watch.js';
import { sentinelAutoRepair } from '../../services/sentinels/sentinel-auto-repair.js';
import { apexAutonomousMode } from '../../services/admin/apex-autonomous-mode.js';

describe('services/autonomous-watch', () => {
  beforeEach(() => {
    autonomousWatch.stop(); /* reset state */
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    autonomousWatch.stop();
    vi.useRealTimers();
  });

  it('start() lance setInterval + idempotent (2 starts = 1 timer)', () => {
    autonomousWatch.start();
    const s1 = autonomousWatch.getStats();
    expect(s1.active).toBe(true);
    expect(s1.startedAt).toBeGreaterThan(0);
    /* Second start no-op */
    autonomousWatch.start();
    const s2 = autonomousWatch.getStats();
    expect(s2.active).toBe(true);
  });

  it('stop() arrête le timer + active=false', () => {
    autonomousWatch.start();
    expect(autonomousWatch.getStats().active).toBe(true);
    autonomousWatch.stop();
    expect(autonomousWatch.getStats().active).toBe(false);
  });

  it('stop() avant start no-op (pas de crash)', () => {
    expect(() => autonomousWatch.stop()).not.toThrow();
    expect(autonomousWatch.getStats().active).toBe(false);
  });

  it('tick auto après 30s → tickCount++ + lastTickAt mis à jour', async () => {
    autonomousWatch.start();
    expect(autonomousWatch.getStats().tickCount).toBe(0);
    /* Avance 30s + flush microtask */
    await vi.advanceTimersByTimeAsync(30_000);
    expect(autonomousWatch.getStats().tickCount).toBeGreaterThanOrEqual(1);
    expect(autonomousWatch.getStats().lastTickAt).toBeGreaterThan(0);
    expect(vi.mocked(apexAutonomousMode.tick)).toHaveBeenCalled();
  });

  it('forceTick() incrémente tickCount sans attendre 30s', async () => {
    const before = autonomousWatch.getStats().tickCount;
    await autonomousWatch.forceTick();
    expect(autonomousWatch.getStats().tickCount).toBe(before + 1);
  });

  it('tick swallow exception silencieusement (logger.warn)', async () => {
    vi.mocked(apexAutonomousMode.tick).mockRejectedValueOnce(new Error('boom'));
    await expect(autonomousWatch.forceTick()).resolves.toBeUndefined();
    /* tickCount toujours incrémenté malgré l'erreur */
    expect(autonomousWatch.getStats().tickCount).toBeGreaterThan(0);
  });

  it('getStats retourne shape complet', () => {
    const s = autonomousWatch.getStats();
    expect(s).toHaveProperty('startedAt');
    expect(s).toHaveProperty('tickCount');
    expect(s).toHaveProperty('lastTickAt');
    expect(s).toHaveProperty('active');
  });

  describe('trackLifecycle (campagne 100%)', () => {
    type Priv = { trackLifecycle(): Promise<void>; timer: ReturnType<typeof setInterval> | null };
    it('timer null → early return (branche !this.timer)', async () => {
      autonomousWatch.stop();
      await (autonomousWatch as unknown as Priv).trackLifecycle();
      expect(autonomousWatch.getStats().active).toBe(false);
    });

    it('import service-lifecycle throw → catch silencieux (branche 75)', async () => {
      vi.doMock('../../services/core-svc/service-lifecycle.js', () => { throw new Error('lifecycle boom'); });
      const priv = autonomousWatch as unknown as Priv;
      priv.timer = setInterval(() => {}, 1_000_000);
      await expect(priv.trackLifecycle()).resolves.toBeUndefined();
      autonomousWatch.stop();
      vi.doUnmock('../../services/core-svc/service-lifecycle.js');
    });
  });
});

describe('services/sentinel-auto-repair', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('securityRebuildChain', () => {
    it('chain déjà valide (rebuilt=0) → ok=true + msg "no-op"', async () => {
      mockAuditLog.autoRepair.mockResolvedValue({ ok: true, rebuilt: 0 });
      const r = await sentinelAutoRepair.securityRebuildChain();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('no-op');
    });

    it('chain rebuilt N entries → ok=true + msg avec brokenAt', async () => {
      mockAuditLog.autoRepair.mockResolvedValue({ ok: true, rebuilt: 5, brokenAt: 42 });
      const r = await sentinelAutoRepair.securityRebuildChain();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('5 entries');
      expect(r.msg).toContain('42');
      expect(r.details?.rebuilt).toBe(5);
      expect(r.details?.brokenAt).toBe(42);
    });

    it('autoRepair ok=false → result.ok=false avec details', async () => {
      mockAuditLog.autoRepair.mockResolvedValue({ ok: false, rebuilt: 3 });
      const r = await sentinelAutoRepair.securityRebuildChain();
      expect(r.ok).toBe(false);
      expect(r.msg).toContain('3 entries');
    });

    it('autoRepair throw → ok=false + msg "rebuildChainHash fail"', async () => {
      mockAuditLog.autoRepair.mockRejectedValue(new Error('audit log corrupt'));
      const r = await sentinelAutoRepair.securityRebuildChain();
      expect(r.ok).toBe(false);
      expect(r.msg).toContain('rebuildChainHash fail');
      expect(r.msg).toContain('audit log corrupt');
    });
  });

  describe('conflictMergeResolve', () => {
    it('pas de queue → ok=true "No queue to resolve"', async () => {
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(true);
      expect(r.msg).toBe('No queue to resolve');
    });

    it('queue sans entries stale → ok=true "No stale writes"', async () => {
      const fresh = [
        { status: 'flushing', ts: Date.now() - 1000, key: 'k1' }, /* recent, pas stale */
        { status: 'pending', key: 'k2' },
      ];
      localStorage.setItem('apex_v13_fb_queue', JSON.stringify(fresh));
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('No stale writes');
    });

    it('queue avec entries stale (>5min flushing) → reset → pending + fb pull', async () => {
      const stale = [
        { status: 'flushing', ts: Date.now() - 10 * 60 * 1000, key: 'old' },
        { status: 'flushing', /* pas de ts */ key: 'no_ts' }, /* aussi stale */
        { status: 'pending', key: 'fresh' },
      ];
      localStorage.setItem('apex_v13_fb_queue', JSON.stringify(stale));
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('Reset 2 stale writes');
      expect(r.details?.reset).toBe(2);
      expect(r.details?.total).toBe(3);
      /* Verify localStorage updated */
      const updated = JSON.parse(localStorage.getItem('apex_v13_fb_queue')!) as Array<{ status: string }>;
      expect(updated.filter((e) => e.status === 'flushing').length).toBe(0);
      /* Verify firebase.init() appelé */
      expect(mockFirebase.init).toHaveBeenCalled();
    });

    it('JSON.parse fail → ok=false + msg "merge fail"', async () => {
      localStorage.setItem('apex_v13_fb_queue', '{invalid json');
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(false);
      expect(r.msg).toContain('merge fail');
    });

    it('firebase.init throw → silent (return ok=true quand même)', async () => {
      mockFirebase.init.mockRejectedValueOnce(new Error('network'));
      const stale = [{ status: 'flushing', ts: 0, key: 'x' }];
      localStorage.setItem('apex_v13_fb_queue', JSON.stringify(stale));
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('Reset 1 stale writes');
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('securityRebuildChain : autoRepair throw non-Error (string) → String(err) (52)', async () => {
      mockAuditLog.autoRepair.mockRejectedValue('str-corrupt');
      const r = await sentinelAutoRepair.securityRebuildChain();
      expect(r.ok).toBe(false);
      expect(r.msg).toContain('str-corrupt');
    });

    it('conflictMergeResolve : setItem throw → catch quota silencieux (78)', async () => {
      const stale = JSON.stringify([{ status: 'flushing', ts: 0, key: 'x' }]);
      vi.stubGlobal('localStorage', {
        getItem: () => stale,
        setItem: () => { throw new Error('quota'); },
        removeItem: () => {}, clear: () => {},
      });
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(true); // setItem échoue mais reset comptabilisé → ok
      expect(r.msg).toContain('Reset 1 stale writes');
    });

    it('conflictMergeResolve : getItem throw non-Error (string) → outer catch String(err) (96)', async () => {
      vi.stubGlobal('localStorage', {
        // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
        getItem: () => { throw 'str-ls'; },
        setItem: () => {}, removeItem: () => {}, clear: () => {},
      });
      const r = await sentinelAutoRepair.conflictMergeResolve();
      expect(r.ok).toBe(false);
      expect(r.msg).toContain('merge fail');
      expect(r.msg).toContain('str-ls');
    });
  });
});
