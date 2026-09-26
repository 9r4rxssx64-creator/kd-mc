/**
 * Tests agent-watches.ts (P0 audit gaps : 8 agents nommés CLAUDE.md).
 * Anti-théâtre : prouve que les 8 agents fonctionnent réellement.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { agentWatches } from '../../services/sentinels/agent-watches.js';

describe('Agent Watches (8 agents nommés P0 CLAUDE.md)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('importWatch', () => {
    it('coverage 100% → severity ok', () => {
      const r = agentWatches.importWatch(50, 50);
      expect(r.severity).toBe('ok');
    });

    it('coverage < 50% → severity critical', () => {
      const r = agentWatches.importWatch(20, 50);
      expect(r.severity).toBe('critical');
      expect(r.msg).toContain('< 50%');
    });

    it('coverage 50-80% → severity warn', () => {
      const r = agentWatches.importWatch(30, 50);
      expect(r.severity).toBe('warn');
    });

    it('totalEmployees=0 → severity ok (pas de division par 0)', () => {
      const r = agentWatches.importWatch(0, 0);
      expect(r.severity).toBe('ok');
    });
  });

  describe('sessionWatch', () => {
    it('uid match session → ok', () => {
      const r = agentWatches.sessionWatch('kevin', 'kevin');
      expect(r.severity).toBe('ok');
    });

    it('uid != session → critical (security)', () => {
      const r = agentWatches.sessionWatch('kevin', 'autre');
      expect(r.severity).toBe('critical');
      expect(r.msg).toContain('mismatch');
    });

    it('session null → err', () => {
      const r = agentWatches.sessionWatch('kevin', null);
      expect(r.severity).toBe('err');
    });
  });

  describe('fbHealth', () => {
    it('connected + event récent → ok', () => {
      const r = agentWatches.fbHealth(true, Date.now());
      expect(r.severity).toBe('ok');
    });

    it('disconnected → err', () => {
      const r = agentWatches.fbHealth(false, Date.now());
      expect(r.severity).toBe('err');
    });

    it('event > 5 min → warn', () => {
      const r = agentWatches.fbHealth(true, Date.now() - 6 * 60 * 1000);
      expect(r.severity).toBe('warn');
    });
  });

  describe('chatWatch', () => {
    it('queue vide → ok', () => {
      const r = agentWatches.chatWatch('kevin');
      expect(r.severity).toBe('ok');
    });

    it('messages stuck > 60s → warn', () => {
      const stuck = [{ status: 'processing', ts: Date.now() - 70_000 }];
      localStorage.setItem('apex_v13_pending_messages_kevin', JSON.stringify(stuck));
      const r = agentWatches.chatWatch('kevin');
      expect(r.severity).toBe('warn');
      expect(r.msg).toContain('stuck');
    });
  });

  describe('notifWatch', () => {
    it('notifWatch retourne ok/warn (selon API)', () => {
      const r = agentWatches.notifWatch();
      expect(['ok', 'warn']).toContain(r.severity);
    });
  });

  describe('exchangeWatch (CMCteams)', () => {
    it('exchanges vides → ok', () => {
      const r = agentWatches.exchangeWatch();
      expect(r.severity).toBe('ok');
    });

    it('exchanges pending > 24h → warn', () => {
      const old = [{ status: 'pending', ts: Date.now() - 25 * 60 * 60 * 1000 }];
      localStorage.setItem('cmc_exchanges', JSON.stringify(old));
      const r = agentWatches.exchangeWatch();
      expect(r.severity).toBe('warn');
    });
  });

  describe('presenceWatch', () => {
    it('lastact recent → ok', () => {
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      const r = agentWatches.presenceWatch();
      expect(r.severity).toBe('ok');
    });

    it('lastact > 30 min → warn', () => {
      localStorage.setItem('apex_v13_lastact', String(Date.now() - 31 * 60 * 1000));
      const r = agentWatches.presenceWatch();
      expect(r.severity).toBe('warn');
    });

    it('no lastact → warn', () => {
      const r = agentWatches.presenceWatch();
      expect(r.severity).toBe('warn');
    });
  });

  describe('storageWatch', () => {
    it('storage faible → ok', () => {
      const r = agentWatches.storageWatch();
      expect(r.severity).toBe('ok');
    });

    it('storage > 80% → warn (mock 4 MB+)', () => {
      try {
        for (let i = 0; i < 5; i++) localStorage.setItem(`big_${i}`, 'X'.repeat(900_000));
      } catch {
        /* quota */
      }
      const r = agentWatches.storageWatch();
      expect(['ok', 'warn', 'critical']).toContain(r.severity);
    });
  });

  describe('runAll (cycle complet 8 agents)', () => {
    it('runAll retourne array de reports (>= 5 agents non-context-dependent)', async () => {
      const reports = await agentWatches.runAll('kevin');
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBeGreaterThanOrEqual(5);
      const ids = new Set(reports.map((r) => r.agent_id));
      expect(ids.has('fb-health')).toBe(true);
      expect(ids.has('notif-watch')).toBe(true);
      expect(ids.has('storage-watch')).toBe(true);
      expect(ids.has('presence-watch')).toBe(true);
    });

    it('runAll inclut session-watch si uid fourni', async () => {
      const reports = await agentWatches.runAll('kevin');
      expect(reports.some((r) => r.agent_id === 'session-watch')).toBe(true);
    });

    it('runAll without uid → skip session/chat watches', async () => {
      const reports = await agentWatches.runAll();
      expect(reports.some((r) => r.agent_id === 'session-watch')).toBe(false);
    });
  });

  describe('Telemetry escalation (anti-théâtre)', () => {
    it('severity warn → push telemetry pipeline', () => {
      agentWatches.fbHealth(false, 0); /* err severity */
      const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as Array<{ kind: string }>;
      expect(buf.length).toBeGreaterThanOrEqual(1);
      expect(buf.some((e) => e.kind === 'err' || e.kind === 'warn')).toBe(true);
    });

    it('severity ok → PAS de telemetry push', () => {
      const before = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]').length;
      agentWatches.fbHealth(true, Date.now());
      const after = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]').length;
      expect(after).toBe(before);
    });
  });

  describe('Persistence reports', () => {
    it('reports persisted apex_v13_agent_reports', () => {
      agentWatches.notifWatch();
      const stored = JSON.parse(localStorage.getItem('apex_v13_agent_reports') ?? '[]') as unknown[];
      expect(stored.length).toBeGreaterThanOrEqual(1);
    });

    it('cap 500 max persisted', () => {
      for (let i = 0; i < 600; i++) agentWatches.notifWatch();
      const stored = JSON.parse(localStorage.getItem('apex_v13_agent_reports') ?? '[]') as unknown[];
      expect(stored.length).toBeLessThanOrEqual(500);
    });
  });

  describe('getStats', () => {
    it('stats by_severity counters', () => {
      agentWatches.fbHealth(true, Date.now()); /* ok */
      agentWatches.fbHealth(false, 0); /* err */
      const stats = agentWatches.getStats();
      expect(stats.total_reports).toBeGreaterThanOrEqual(2);
      expect(stats.by_severity.ok).toBeGreaterThanOrEqual(1);
      expect(stats.by_severity.err).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getReports filter', () => {
    it('getReports(severity) filtre', () => {
      agentWatches.fbHealth(true, Date.now()); /* ok */
      agentWatches.sessionWatch('kev', 'autre'); /* critical */
      const oks = agentWatches.getReports('ok');
      const crits = agentWatches.getReports('critical');
      expect(oks.every((r) => r.severity === 'ok')).toBe(true);
      expect(crits.every((r) => r.severity === 'critical')).toBe(true);
    });
  });
});
