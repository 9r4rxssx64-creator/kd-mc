/**
 * Tests self-healing.ts (Kevin "auto-géré, auto-corrige, pas problème mémoire").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { selfHealing } from '../../services/sentinels/self-healing.js';

describe('Self-Healing (auto-gestion mémoire + corrections)', () => {
  beforeEach(() => {
    localStorage.clear();
    selfHealing.reset();
  });

  describe('runHealCycle', () => {
    it('trim ax_audit_log au-delà cap 200', async () => {
      const big = Array.from({ length: 300 }, (_, i) => ({ ts: Date.now(), msg: `e${i}` }));
      localStorage.setItem('apex_v13_audit_log', JSON.stringify(big));
      const result = await selfHealing.runHealCycle();
      expect(result.trims).toBeGreaterThanOrEqual(1);
      const after = JSON.parse(localStorage.getItem('apex_v13_audit_log')!) as unknown[];
      expect(after.length).toBeLessThanOrEqual(200);
    });

    it('trim ax_telemetry_in cap 100', async () => {
      const big = Array.from({ length: 150 }, (_, i) => ({ ts: Date.now(), msg: `t${i}` }));
      localStorage.setItem('ax_telemetry_in', JSON.stringify(big));
      await selfHealing.runHealCycle();
      const after = JSON.parse(localStorage.getItem('ax_telemetry_in')!) as unknown[];
      expect(after.length).toBeLessThanOrEqual(100);
    });

    it('trim apex_v13_lessons cap 500', async () => {
      const big = Array.from({ length: 700 }, (_, i) => ({ ts: Date.now(), title: `L${i}` }));
      localStorage.setItem('apex_v13_lessons', JSON.stringify(big));
      await selfHealing.runHealCycle();
      const after = JSON.parse(localStorage.getItem('apex_v13_lessons')!) as unknown[];
      expect(after.length).toBeLessThanOrEqual(500);
    });

    it('skip key inexistante (gracefull)', async () => {
      let threw = false;
      try {
        await selfHealing.runHealCycle();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('skip si JSON invalide (gracefull)', async () => {
      localStorage.setItem('apex_v13_audit_log', 'INVALID_JSON');
      let threw = false;
      try {
        await selfHealing.runHealCycle();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('GC stale data', () => {
    it('garbage collect pending_messages > 24h', async () => {
      const old = Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`,
        text: `old`,
        ts: Date.now() - 25 * 60 * 60 * 1000, /* 25h ago */
        status: 'done',
      }));
      const fresh = [
        { id: 'fresh', text: 'recent', ts: Date.now(), status: 'pending' },
      ];
      localStorage.setItem('apex_v13_pending_messages_kevin', JSON.stringify([...old, ...fresh]));
      const result = await selfHealing.runHealCycle();
      expect(result.stale_removed).toBeGreaterThanOrEqual(5);
      const after = JSON.parse(localStorage.getItem('apex_v13_pending_messages_kevin')!) as unknown[];
      expect(after.length).toBe(1); /* seulement fresh */
    });
  });

  describe('emergencyTrim (QuotaExceeded)', () => {
    it('emergencyTrim libère bytes via cap réduite', () => {
      const big = Array.from({ length: 200 }, (_, i) => ({ ts: Date.now(), msg: `audit_${i}_blabla` }));
      localStorage.setItem('apex_v13_audit_log', JSON.stringify(big));
      const before = localStorage.getItem('apex_v13_audit_log')!.length;
      const freed = selfHealing.emergencyTrim();
      const after = localStorage.getItem('apex_v13_audit_log')!.length;
      expect(freed).toBeGreaterThan(0);
      expect(after).toBeLessThan(before);
      /* cap réduite 200 → 100 */
      const arr = JSON.parse(localStorage.getItem('apex_v13_audit_log')!) as unknown[];
      expect(arr.length).toBeLessThanOrEqual(100);
    });

    it('emergencyTrim ne crash pas même si keys vides', () => {
      let threw = false;
      try {
        const freed = selfHealing.emergencyTrim();
        expect(freed).toBeGreaterThanOrEqual(0);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('install + quota guard', () => {
    it('install idempotent', () => {
      let threw = false;
      try {
        selfHealing.install();
        selfHealing.install();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('getStats + getHistory', () => {
    it('stats vide retourne defaults sains', () => {
      const stats = selfHealing.getStats();
      expect(stats.total_actions).toBe(0);
      expect(stats.success_rate).toBe(100);
      expect(stats.bytes_freed_total).toBe(0);
    });

    it('stats avec heal cycles → reflète actions', async () => {
      const big = Array.from({ length: 300 }, (_, i) => ({ ts: Date.now(), msg: `e${i}` }));
      localStorage.setItem('apex_v13_audit_log', JSON.stringify(big));
      await selfHealing.runHealCycle();
      const stats = selfHealing.getStats();
      expect(stats.total_actions).toBeGreaterThanOrEqual(1);
      expect(stats.bytes_freed_total).toBeGreaterThan(0);
    });

    it('getHistory retourne réf au history', async () => {
      const big = Array.from({ length: 300 }, (_, i) => ({ ts: Date.now(), msg: `e${i}` }));
      localStorage.setItem('apex_v13_audit_log', JSON.stringify(big));
      await selfHealing.runHealCycle();
      const hist = selfHealing.getHistory();
      expect(hist.length).toBeGreaterThanOrEqual(1);
      expect(hist[0]?.id).toMatch(/^heal_/);
    });
  });
});
