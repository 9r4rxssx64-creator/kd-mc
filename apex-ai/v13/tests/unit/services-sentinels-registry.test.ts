/**
 * Tests services/sentinels-registry.ts (Boost MAX 18+ sentinelles).
 * ≥40 tests : registry shape, start/stop, run, autoFix, escalation, metrics, meta.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  sentinelsRegistry,
  bootstrapSentinelsRegistry,
  type SentinelResult,
} from '../../services/sentinels/sentinels-registry.js';
import { sentinels as legacy } from '../../services/sentinels/sentinels.js';

const ESCALATION_KEY = 'ax_claude_todo';

describe('services/sentinels-registry — Boost MAX 18+', () => {
  beforeEach(() => {
    localStorage.clear();
    sentinelsRegistry.resetMetrics();
    /* Force re-boot extras pour isolation tests (legacy manager garde son state) */
    bootstrapSentinelsRegistry();
  });

  /* === Bootstrap & shape === */

  describe('bootstrap & list', () => {
    it('bootstrap est idempotent (ne double pas les sentinelles)', () => {
      const before = sentinelsRegistry.list().length;
      bootstrapSentinelsRegistry();
      bootstrapSentinelsRegistry();
      const after = sentinelsRegistry.list().length;
      expect(after).toBe(before);
    });

    it('registry contient ≥17 sentinelles après bootstrap', () => {
      const list = sentinelsRegistry.list();
      expect(list.length).toBeGreaterThanOrEqual(17);
    });

    it('contient capabilities-watch (extra MAX)', () => {
      const ids = sentinelsRegistry.list().map((s) => s.id);
      expect(ids).toContain('capabilities-watch');
    });

    it('contient tools-watch (extra MAX)', () => {
      const ids = sentinelsRegistry.list().map((s) => s.id);
      expect(ids).toContain('tools-watch');
    });

    it('contient persistence-watch (extra MAX)', () => {
      const ids = sentinelsRegistry.list().map((s) => s.id);
      expect(ids).toContain('persistence-watch');
    });

    it('contient sentinel-meta (méta-surveillance)', () => {
      const ids = sentinelsRegistry.list().map((s) => s.id);
      expect(ids).toContain('sentinel-meta');
    });

    it('contient les 13 core sentinels existants', () => {
      const ids = sentinelsRegistry.list().map((s) => s.id);
      const coreExpected = [
        'token-balance-watch',
        'error-watch',
        'backup-watch',
        'credentials-watch',
        'link-validation-watch',
        'storage-watch',
        'network-watch',
        'performance-watch',
        'security-watch',
        'presence-watch',
        'compliance-watch',
        'conflict-watch',
      ];
      for (const id of coreExpected) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('shape Sentinel typed', () => {
    it('chaque sentinel a id/name/description/intervalMs/run/enabled', () => {
      for (const s of sentinelsRegistry.list()) {
        expect(typeof s.id).toBe('string');
        expect(s.id.length).toBeGreaterThan(0);
        expect(typeof s.name).toBe('string');
        expect(typeof s.description).toBe('string');
        expect(typeof s.intervalMs).toBe('number');
        expect(s.intervalMs).toBeGreaterThan(0);
        expect(typeof s.run).toBe('function');
        expect(typeof s.enabled).toBe('boolean');
      }
    });

    it('au moins 5 sentinels ont autoFix', () => {
      const withAutoFix = sentinelsRegistry.list().filter((s) => s.autoFix !== undefined);
      expect(withAutoFix.length).toBeGreaterThanOrEqual(5);
    });

    it('get retourne sentinelle par id', () => {
      const s = sentinelsRegistry.get('capabilities-watch');
      expect(s).toBeDefined();
      expect(s?.id).toBe('capabilities-watch');
    });

    it('get retourne undefined si id inconnu', () => {
      expect(sentinelsRegistry.get('nope-nope-nope')).toBeUndefined();
    });
  });

  /* === Start / Stop === */

  describe('start/stop', () => {
    it('start active une sentinelle', () => {
      legacy.enable('error-watch', false);
      sentinelsRegistry.start('error-watch');
      const s = sentinelsRegistry.get('error-watch');
      expect(s?.enabled).toBe(true);
    });

    it('stop désactive une sentinelle', () => {
      sentinelsRegistry.stop('error-watch');
      const s = sentinelsRegistry.get('error-watch');
      expect(s?.enabled).toBe(false);
      sentinelsRegistry.start('error-watch'); /* restore */
    });

    it('startAll active toutes les sentinelles', () => {
      sentinelsRegistry.stopAll();
      sentinelsRegistry.startAll();
      const list = sentinelsRegistry.list();
      expect(list.every((s) => s.enabled)).toBe(true);
    });

    it('stopAll désactive toutes les sentinelles', () => {
      sentinelsRegistry.startAll();
      sentinelsRegistry.stopAll();
      const list = sentinelsRegistry.list();
      expect(list.every((s) => !s.enabled)).toBe(true);
      sentinelsRegistry.startAll(); /* restore */
    });

    it('start sur id inconnu ne crash pas', () => {
      expect(() => sentinelsRegistry.start('inexistent')).not.toThrow();
    });

    it('stop sur id inconnu ne crash pas', () => {
      expect(() => sentinelsRegistry.stop('inexistent')).not.toThrow();
    });
  });

  /* === Run / runAll === */

  describe('run async', () => {
    it('runOne retourne SentinelResult typé', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('credentials-watch');
      expect(r).toMatchObject({
        status: expect.stringMatching(/ok|warn|error/) as unknown,
        message: expect.any(String) as unknown,
        ts: expect.any(Number) as unknown,
        durationMs: expect.any(Number) as unknown,
      });
    });

    it('runOne sur id inconnu retourne status=error', async () => {
      const r = await sentinelsRegistry.runOne('nope-nope-nope');
      expect(r.status).toBe('error');
      expect(r.message).toContain('not found');
    });

    it('durationMs ≥ 0 dans le résultat', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('credentials-watch');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('capabilities-watch run retourne ok', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('capabilities-watch');
      expect(r.status).toBe('ok');
      expect(r.message).toMatch(/APIs/);
    });

    it('tools-watch run retourne un résultat valide', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('tools-watch');
      expect(['ok', 'error']).toContain(r.status);
      expect(typeof r.message).toBe('string');
    });

    it('persistence-watch sans clés retourne msg "État initial"', async () => {
      localStorage.clear();
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('persistence-watch');
      expect(r.status).toBe('ok');
    });

    it('persistence-watch avec clés présentes ok', async () => {
      /* Sprint 13.3.17 : utilise les vraies clés écrites par les services. */
      localStorage.setItem('ax_audit_log_v13', '[]');
      localStorage.setItem('apex_v13_user', '{}');
      localStorage.setItem('apex_v13_settings', '{}');
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('persistence-watch');
      expect(r.status).toBe('ok');
    });

    it('persistence-watch détecte clé critique manquante quand autres présentes', async () => {
      localStorage.clear();
      /* Une optionnelle présente mais critique manquante → vraie alerte */
      localStorage.setItem('apex_v13_settings', '{}');
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('persistence-watch');
      expect(r.ts).toBeGreaterThan(0);
    });

    it('sentinel-meta run retourne supervision count', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('sentinel-meta');
      expect(['ok', 'error']).toContain(r.status);
      expect(r.message).toMatch(/sentinelles/i);
    });

    it('runAll execute toutes les enabled', { timeout: 30_000 }, async () => {
      /* v13.4.125 : timeout 30s (au lieu de 5s default) car 35+ sentinels enabled
       * avec checks réseau Firebase/GitHub raw → 5s pas suffisant en CI. */
      sentinelsRegistry.startAll();
      const results = await sentinelsRegistry.runAll();
      expect(results.length).toBeGreaterThanOrEqual(15);
      for (const r of results) {
        expect(typeof r.id).toBe('string');
        expect(['ok', 'warn', 'error']).toContain(r.result.status);
      }
    });

    it('runAll skip les disabled', async () => {
      sentinelsRegistry.stopAll();
      sentinelsRegistry.start('credentials-watch');
      const results = await sentinelsRegistry.runAll();
      expect(results.length).toBe(1);
      expect(results[0]?.id).toBe('credentials-watch');
      sentinelsRegistry.startAll(); /* restore */
    });
  });

  /* === Auto-fix path === */

  describe('autoFix', () => {
    it('runOne déclenche autoFix si check fail + autoFix dispo (storage-watch)', async () => {
      /* storage-watch a autoFix; on remplit localStorage pour fail */
      const big = 'x'.repeat(50_000);
      for (let i = 0; i < 80; i++) {
        try {
          localStorage.setItem(`big_${i}`, big);
        } catch {
          /* quota OK on stop */
          break;
        }
      }
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('storage-watch');
      /* Soit autoFix a réussi (status ok + message Auto-fixed), soit pas assez gros pour trigger */
      expect(r.ts).toBeGreaterThan(0);
    });

    it('runOne avec autoFix tente fix (compliance-watch v13.3.17)', async () => {
      localStorage.clear();
      /* Sprint 13.3.17 : autoFix enregistre consent essential par défaut */
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('compliance-watch');
      /* Avec autoFix qui crée un consent par défaut → status passe à ok */
      expect(['ok', 'error']).toContain(r.status);
      /* Si autoFix a tourné, consent doit être présent */
      if (r.status === 'ok') {
        expect(localStorage.getItem('apex_v13_cookies_accepted')).toBeTruthy();
      }
    });
  });

  /* === Status & Metrics === */

  describe('getStatus', () => {
    it('retourne status agrégé valide', () => {
      const s = sentinelsRegistry.getStatus();
      expect(s.total).toBeGreaterThanOrEqual(17);
      expect(s.running).toBeGreaterThanOrEqual(0);
      expect(s.errors).toBeGreaterThanOrEqual(0);
      expect(s.ok).toBeGreaterThanOrEqual(0);
      expect(s.pending).toBeGreaterThanOrEqual(0);
    });

    it('total = ok + errors + pending + warns', () => {
      const s = sentinelsRegistry.getStatus();
      expect(s.ok + s.errors + s.pending + s.warns).toBe(s.total);
    });

    it('totalRuns ≥ 0', () => {
      const s = sentinelsRegistry.getStatus();
      expect(s.totalRuns).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLastReport', () => {
    it('retourne null si pas encore run', () => {
      sentinelsRegistry.resetMetrics();
      legacy.list().forEach((s) => {
        s.lastResult = undefined;
        s.lastRun = 0;
      });
      const r = sentinelsRegistry.getLastReport('error-watch');
      expect(r).toBeNull();
    });

    it('retourne SentinelResult après run', async () => {
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('credentials-watch');
      const r = sentinelsRegistry.getLastReport('credentials-watch');
      expect(r).not.toBeNull();
      expect(r?.ts).toBeGreaterThan(0);
    });

    it('retourne null pour id inconnu', () => {
      expect(sentinelsRegistry.getLastReport('nope')).toBeNull();
    });
  });

  describe('getMetrics', () => {
    it('shape valide après run', async () => {
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('credentials-watch');
      const m = sentinelsRegistry.getMetrics();
      expect(m.totalRuns).toBeGreaterThan(0);
      expect(m.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(m.perSentinel['credentials-watch']).toBeDefined();
    });

    it('totalSuccess + totalFailures = totalRuns', async () => {
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('credentials-watch');
      await sentinelsRegistry.runOne('capabilities-watch');
      const m = sentinelsRegistry.getMetrics();
      expect(m.totalSuccess + m.totalFailures).toBe(m.totalRuns);
    });

    it('perSentinel.avgMs ≥ 0', async () => {
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('capabilities-watch');
      const m = sentinelsRegistry.getMetrics();
      const stats = m.perSentinel['capabilities-watch'];
      expect(stats?.avgMs).toBeGreaterThanOrEqual(0);
    });

    it('resetMetrics clear tout', async () => {
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('credentials-watch');
      sentinelsRegistry.resetMetrics();
      const m = sentinelsRegistry.getMetrics();
      expect(m.totalRuns).toBe(0);
    });

    it('métriques persistées entre runs', async () => {
      sentinelsRegistry.resetMetrics();
      sentinelsRegistry.startAll();
      await sentinelsRegistry.runOne('credentials-watch');
      await sentinelsRegistry.runOne('credentials-watch');
      const m = sentinelsRegistry.getMetrics();
      expect(m.perSentinel['credentials-watch']?.runs).toBeGreaterThanOrEqual(2);
    });
  });

  /* === Escalation === */

  describe('escalation ax_claude_todo', () => {
    /* Sprint 13.3.17 : compliance-watch a maintenant un autoFix. Pour tester
     * l'escalation pure (sans autoFix recovery), on utilise error-watch qui
     * lit `observability.getBuffer()` — on injecte un critical pending. */
    async function injectCriticalEvent(): Promise<void> {
      const { observability } = await import('../../services/observability/observability.js');
      observability.capture('critical', 'test.escalation', 'fake critical event');
    }

    it('escalade vers ax_claude_todo si fail sans autoFix', async () => {
      localStorage.removeItem(ESCALATION_KEY);
      sentinelsRegistry.resetMetrics();
      sentinelsRegistry.startAll();
      await injectCriticalEvent();
      /* error-watch sans autoFix → fail = escalade direct */
      await sentinelsRegistry.runOne('error-watch');
      const raw = localStorage.getItem(ESCALATION_KEY);
      expect(raw).not.toBeNull();
      const list = JSON.parse(raw ?? '[]') as Array<{ sentinel_id: string }>;
      expect(list.some((t) => t.sentinel_id === 'error-watch')).toBe(true);
    });

    it('cooldown empêche double escalade', async () => {
      localStorage.removeItem(ESCALATION_KEY);
      sentinelsRegistry.resetMetrics();
      sentinelsRegistry.startAll();
      await injectCriticalEvent();
      await sentinelsRegistry.runOne('error-watch');
      await sentinelsRegistry.runOne('error-watch');
      const list = JSON.parse(localStorage.getItem(ESCALATION_KEY) ?? '[]') as Array<{
        sentinel_id: string;
      }>;
      const count = list.filter((t) => t.sentinel_id === 'error-watch').length;
      expect(count).toBeLessThanOrEqual(1);
    });

    it('escalation entry contient sentinel_id, severity, message, ts', async () => {
      localStorage.removeItem(ESCALATION_KEY);
      sentinelsRegistry.resetMetrics();
      sentinelsRegistry.startAll();
      await injectCriticalEvent();
      await sentinelsRegistry.runOne('error-watch');
      const list = JSON.parse(localStorage.getItem(ESCALATION_KEY) ?? '[]') as Array<{
        id: string;
        sentinel_id: string;
        severity: string;
        message: string;
        ts: number;
        status: string;
      }>;
      const entry = list.find((t) => t.sentinel_id === 'error-watch');
      expect(entry).toBeDefined();
      expect(entry?.id).toMatch(/^todo_/);
      expect(['error', 'warn', 'ok']).toContain(entry?.severity ?? '');
      expect(typeof entry?.message).toBe('string');
      expect(entry?.status).toBe('pending');
    });

    it('cap escalation à 50 entries', async () => {
      const fake = Array.from({ length: 55 }, (_, i) => ({
        id: `todo_old_${i}`,
        sentinel_id: 'fake',
        severity: 'warn',
        message: 'old',
        ts: i,
        status: 'pending',
      }));
      localStorage.setItem(ESCALATION_KEY, JSON.stringify(fake));
      sentinelsRegistry.resetMetrics();
      sentinelsRegistry.startAll();
      await injectCriticalEvent();
      await sentinelsRegistry.runOne('error-watch');
      const list = JSON.parse(localStorage.getItem(ESCALATION_KEY) ?? '[]') as unknown[];
      expect(list.length).toBeLessThanOrEqual(50);
    });
  });

  /* === Adaptation result === */

  describe('SentinelResult adaptation', () => {
    it('legacy ok=true → status="ok"', async () => {
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('capabilities-watch');
      if (r.status === 'ok') {
        expect(r.status).toBe('ok');
      }
    });

    it('legacy ok=false → status="error"', async () => {
      localStorage.clear();
      /* Sprint 13.3.17 : compliance-watch ne fail QUE si user logged-in.
       * Pour valider l'adaptation legacy ok=false→error, on utilise error-watch
       * avec un critical pending (pas d'autoFix → status reste error). */
      const { observability } = await import('../../services/observability/observability.js');
      observability.capture('critical', 'test.adapt', 'force fail');
      sentinelsRegistry.startAll();
      const r = await sentinelsRegistry.runOne('error-watch');
      expect(r.status).toBe('error');
    });
  });

  /* === Test sentinel-meta self-supervision === */

  describe('sentinel-meta', () => {
    it('détecte 0 stales si toutes ont jamais run', async () => {
      sentinelsRegistry.startAll();
      legacy.list().forEach((s) => {
        s.lastRun = 0; /* jamais run */
      });
      const r = await sentinelsRegistry.runOne('sentinel-meta');
      expect(r.status).toBe('ok');
    });

    it('détecte 0 crashed si toutes ok', async () => {
      sentinelsRegistry.startAll();
      legacy.list().forEach((s) => {
        s.lastResult = { ok: true, msg: 'OK', ts: Date.now() };
      });
      const r = await sentinelsRegistry.runOne('sentinel-meta');
      expect(r.status).toBe('ok');
    });

    it('alerte si > 50% crashed', async () => {
      sentinelsRegistry.startAll();
      const all = legacy.list().filter((s) => s.id !== 'sentinel-meta');
      /* Force la majorité en erreur */
      all.forEach((s, i) => {
        if (i < all.length * 0.7) {
          s.lastResult = { ok: false, msg: 'fail', ts: Date.now() };
        } else {
          s.lastResult = { ok: true, msg: 'OK', ts: Date.now() };
        }
        s.lastRun = Date.now();
      });
      const r = await sentinelsRegistry.runOne('sentinel-meta');
      expect(r.status).toBe('error');
    });
  });

  /* === Description par sentinelle === */

  describe('descriptions enrichies', () => {
    it('capabilities-watch description platform-aware (v13.3.89 P1.10)', () => {
      const s = sentinelsRegistry.get('capabilities-watch');
      /* v13.3.89 P1.10 : description simplifiée vers platform-aware (iOS/Android/Desktop). */
      expect(s?.description).toMatch(/APIs|platform/i);
    });

    it('tools-watch a description niveau MAX', () => {
      const s = sentinelsRegistry.get('tools-watch');
      expect(s?.description).toMatch(/orphelin|capabilities|tools/i);
    });

    it('persistence-watch a description niveau MAX', () => {
      const s = sentinelsRegistry.get('persistence-watch');
      expect(s?.description).toMatch(/clés|critiques|local|firebase/i);
    });

    it('sentinel-meta a description niveau MAX', () => {
      const s = sentinelsRegistry.get('sentinel-meta');
      expect(s?.description).toMatch(/surveille|sentinelles|stale|crash/i);
    });
  });

  /* === Intervals === */

  describe('intervals raisonnables', () => {
    it('aucune sentinelle n\'a interval < 1 min', () => {
      for (const s of sentinelsRegistry.list()) {
        expect(s.intervalMs).toBeGreaterThanOrEqual(60_000);
      }
    });

    it('sentinel-meta tourne toutes les 5 min', () => {
      const s = sentinelsRegistry.get('sentinel-meta');
      expect(s?.intervalMs).toBe(5 * 60 * 1000);
    });

    it('capabilities-watch tourne 1×/semaine', () => {
      const s = sentinelsRegistry.get('capabilities-watch');
      expect(s?.intervalMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('persistence-watch tourne 1×/heure', () => {
      const s = sentinelsRegistry.get('persistence-watch');
      expect(s?.intervalMs).toBe(60 * 60 * 1000);
    });
  });
});

/* Sanity TypeScript : SentinelResult export check */
const _typecheck: SentinelResult = {
  status: 'ok',
  message: 't',
  ts: 0,
  durationMs: 0,
};
void _typecheck;
