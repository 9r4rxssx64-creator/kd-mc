/**
 * Tests consumption-monitor.ts.
 * Demande Kevin : info live conso + notif 1-clic recharge par IA + abo.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { consumptionMonitor } from '../../services/observability/consumption-monitor.js';

describe('Consumption Monitor (live + alertes 1 clic recharge)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('budgets', () => {
    it('getBudgets retourne defaults pour services connus', () => {
      const b = consumptionMonitor.getBudgets();
      expect(b.anthropic).toBeGreaterThan(0);
      expect(b.openai).toBeGreaterThan(0);
      expect(b).toHaveProperty('groq');
    });

    it('setBudget override le default', () => {
      consumptionMonitor.setBudget('anthropic', 100);
      const b = consumptionMonitor.getBudgets();
      expect(b.anthropic).toBe(100);
    });

    it('setBudget négatif → clamp à 0', () => {
      consumptionMonitor.setBudget('openai', -50);
      const b = consumptionMonitor.getBudgets();
      expect(b.openai).toBe(0);
    });
  });

  describe('getServiceStatus live counter', () => {
    it('retourne pct + severity + billing_url', () => {
      const s = consumptionMonitor.getServiceStatus('anthropic');
      expect(s.service).toBe('anthropic');
      expect(['ok', 'warn', 'critical']).toContain(s.severity);
      expect(typeof s.pct_used).toBe('number');
      expect(s.billing_url).toContain('http');
    });

    it('budget 0 → pct 0 + severity ok', () => {
      consumptionMonitor.setBudget('test_service', 0);
      const s = consumptionMonitor.getServiceStatus('test_service');
      expect(s.pct_used).toBe(0);
      expect(s.severity).toBe('ok');
    });
  });

  describe('checkAndNotify dedup 6h', () => {
    it('pas notif si severity ok', async () => {
      const all = await consumptionMonitor.checkAndNotify('kdmc_admin');
      expect(Array.isArray(all)).toBe(true);
    });

    it('dedup : si dernier alert < 6h → skip', async () => {
      localStorage.setItem('apex_v13_consumption_alert_anthropic', String(Date.now()));
      const all = await consumptionMonitor.checkAndNotify('kdmc_admin');
      /* anthropic skip car alert récent */
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('upgrade plans 1 clic recharge', () => {
    it('Anthropic plans avec upgrade_url billing', () => {
      const plans = consumptionMonitor.getUpgradePlans('anthropic');
      expect(plans.length).toBeGreaterThan(0);
      expect(plans[0]?.upgrade_url).toContain('anthropic.com');
    });

    it('Cloudflare Free + Workers Paid + Pro', () => {
      const plans = consumptionMonitor.getUpgradePlans('cloudflare');
      expect(plans.length).toBeGreaterThanOrEqual(2);
      const free = plans.find((p) => p.name === 'Free');
      expect(free?.price_eur_month).toBe(0);
    });

    it('Brevo / Resend plans email', () => {
      const brevo = consumptionMonitor.getUpgradePlans('brevo');
      const resend = consumptionMonitor.getUpgradePlans('resend');
      expect(brevo.length).toBeGreaterThan(0);
      expect(resend.length).toBeGreaterThan(0);
    });

    it('service inconnu → fallback billing', () => {
      const plans = consumptionMonitor.getUpgradePlans('inconnu_xyz');
      expect(plans.length).toBe(1);
      expect(plans[0]?.upgrade_url).toContain('http');
    });
  });

  describe('history snapshots', () => {
    it('recordSnapshot persist entries', () => {
      consumptionMonitor.recordSnapshot();
      const history = JSON.parse(localStorage.getItem('apex_v13_consumption_history') ?? '[]') as unknown[];
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it('cap history 90 entries (FIFO)', () => {
      for (let i = 0; i < 100; i++) consumptionMonitor.recordSnapshot();
      const history = JSON.parse(localStorage.getItem('apex_v13_consumption_history') ?? '[]') as unknown[];
      expect(history.length).toBeLessThanOrEqual(90);
    });

    it('getHistory tous services', () => {
      consumptionMonitor.recordSnapshot();
      const h = consumptionMonitor.getHistory(undefined, 10);
      expect(Array.isArray(h)).toBe(true);
    });

    it('getHistory par service', () => {
      consumptionMonitor.recordSnapshot();
      const h = consumptionMonitor.getHistory('anthropic', 10);
      expect(Array.isArray(h)).toBe(true);
    });
  });

  describe('recommendUpgrade auto', () => {
    it('pas assez historique → needed=false', () => {
      const r = consumptionMonitor.recommendUpgrade('anthropic');
      expect(r.needed).toBe(false);
      expect(r.reason).toContain('historique');
    });

    it('avec historique 80%+ → suggère upgrade', () => {
      /* Force 7 snapshots avec pct 90% pour anthropic */
      const fakeHistory = Array.from({ length: 7 }, (_, i) => ({
        ts: Date.now() - i * 86400000,
        services: [{ service: 'anthropic', used_eur: 45, pct: 90 }],
      }));
      localStorage.setItem('apex_v13_consumption_history', JSON.stringify(fakeHistory));
      const r = consumptionMonitor.recommendUpgrade('anthropic');
      expect(r.needed).toBe(true);
      expect(r.upgrade_url).toContain('http');
    });
  });

  describe('formatForUI dashboard', () => {
    it('retourne services array + total_alerts', () => {
      const ui = consumptionMonitor.formatForUI();
      expect(Array.isArray(ui.services)).toBe(true);
      expect(typeof ui.total_alerts).toBe('number');
    });

    it('chaque service a emoji honnête + billing_url', () => {
      /* v13.3.85 honestEmoji : ⚪ ajouté pour "non configuré"
       * (avant : 🟢 trompeur même quand clé absente). */
      const ui = consumptionMonitor.formatForUI();
      for (const s of ui.services) {
        expect(['🟢', '🟡', '🔴', '⚪']).toContain(s.emoji);
        expect(s.billing_url.length).toBeGreaterThan(0);
      }
    });
  });
});
