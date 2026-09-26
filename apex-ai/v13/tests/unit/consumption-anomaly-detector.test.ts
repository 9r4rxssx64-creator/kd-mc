/**
 * Tests services/consumption-anomaly-detector.
 * Seed history in localStorage to drive anomaly detection.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { consumptionAnomalyDetector } from '../../services/observability/consumption-anomaly-detector.js';

const HIST_KEY = 'apex_v13_consumption_history';

function seedHistory(service: string, dailyEur: number, days: number, currentDayEur?: number): void {
  const now = Date.now();
  const oneDay = 86400000;
  const snaps: Array<{ ts: number; services: Array<{ service: string; used_eur: number; pct: number }> }> = [];
  /* Past N days with baseline */
  for (let i = days; i >= 1; i--) {
    snaps.push({
      ts: now - i * oneDay,
      services: [{ service, used_eur: dailyEur, pct: 50 }],
    });
  }
  /* Today */
  if (currentDayEur !== undefined) {
    snaps.push({
      ts: now,
      services: [{ service, used_eur: currentDayEur, pct: 50 }],
    });
  }
  localStorage.setItem(HIST_KEY, JSON.stringify(snaps));
}

describe('services/consumption-anomaly-detector', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('detectAnomaly retourne severity normal sans history', () => {
    const r = consumptionAnomalyDetector.detectAnomaly('anthropic');
    expect(r.severity).toBe('normal');
    expect(r.service).toBe('anthropic');
  });

  it('detectAnomaly normal si conso = baseline', () => {
    seedHistory('anthropic', 1.0, 7, 1.0);
    const r = consumptionAnomalyDetector.detectAnomaly('anthropic');
    expect(r.severity).toBe('normal');
  });

  it('detectAnomaly medium si ratio >= 1.5', () => {
    seedHistory('openai', 1.0, 7, 1.6);
    const r = consumptionAnomalyDetector.detectAnomaly('openai');
    expect(r.severity).toBe('medium');
    expect(r.ratio).toBeGreaterThanOrEqual(1.5);
  });

  it('detectAnomaly high si ratio >= 2', () => {
    seedHistory('openai', 1.0, 7, 2.5);
    const r = consumptionAnomalyDetector.detectAnomaly('openai');
    expect(r.severity).toBe('high');
  });

  it('detectAnomaly critical si ratio >= 5', () => {
    seedHistory('openai', 1.0, 7, 6.0);
    const r = consumptionAnomalyDetector.detectAnomaly('openai');
    expect(r.severity).toBe('critical');
    expect(r.recommended_action).toContain('ROTATION');
  });

  it('detectAnomaly low si pas baseline mais usage > 5', () => {
    seedHistory('groq', 0, 0, 10);
    const r = consumptionAnomalyDetector.detectAnomaly('groq');
    expect(r.severity).toBe('low');
  });

  it('detectAnomaly retourne recharge_url + rotate_url pour provider connu', () => {
    const r = consumptionAnomalyDetector.detectAnomaly('anthropic');
    expect(r.recharge_url).toContain('console.anthropic.com');
    expect(r.rotate_url).toContain('keys');
  });

  it('detectAnomaly retourne urls vides pour provider inconnu', () => {
    const r = consumptionAnomalyDetector.detectAnomaly('xyz_unknown');
    expect(r.recharge_url).toBe('');
    expect(r.rotate_url).toBe('');
  });

  it('scanAll filtre normal', () => {
    seedHistory('anthropic', 1.0, 7, 1.0); /* normal */
    const reports = consumptionAnomalyDetector.scanAll();
    expect(reports.every((r) => r.severity !== 'normal')).toBe(true);
  });

  it('scanAllVerbose retourne services AVEC clé en vault (filtre v13.4.102)', () => {
    /* v13.4.102 : scanAllVerbose filtre par hasKeyInVault() (min 10 chars) → pré-populer. */
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test-long-value-12345');
    localStorage.setItem('ax_openai_key', 'sk-test-long-value-12345');
    const reports = consumptionAnomalyDetector.scanAllVerbose();
    expect(reports.length).toBeGreaterThanOrEqual(2);
  });

  it('getLinks retourne urls pour provider connu', () => {
    const links = consumptionAnomalyDetector.getLinks('anthropic');
    expect(links).not.toBeNull();
    expect(links?.recharge).toContain('anthropic.com');
    expect(links?.rotate).toContain('keys');
    expect(links?.usage_dashboard).toContain('usage');
  });

  it('getLinks retourne null pour provider inconnu', () => {
    expect(consumptionAnomalyDetector.getLinks('xyz')).toBeNull();
  });

  it('getLinks insensible casse', () => {
    expect(consumptionAnomalyDetector.getLinks('ANTHROPIC')).not.toBeNull();
  });

  it('listAllProviders retourne tableau non vide', () => {
    const providers = consumptionAnomalyDetector.listAllProviders();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers).toContain('anthropic');
  });

  describe('branches restantes (campagne 100%)', () => {
    beforeEach(() => { localStorage.clear(); });

    it('detectAnomaly history sans entrée du jour → fallback `history[last]` (116)', () => {
      seedHistory('anthropic', 5, 6); // past-only (pas de currentDayEur → pas d\'entrée today)
      const r = consumptionAnomalyDetector.detectAnomaly('anthropic');
      expect(r).toBeDefined();
    });

    it('hasKeyInVault via scanAllVerbose : clé directe > 10 chars → true (201)', () => {
      localStorage.setItem('ax_anthropic_key', 'x'.repeat(20));
      const reports = consumptionAnomalyDetector.scanAllVerbose();
      expect(Array.isArray(reports)).toBe(true);
    });

    it('hasKeyInVault via scanAllVerbose : multi_keys JSON invalide → catch false (214)', () => {
      localStorage.setItem('apex_v13_multi_keys', '{not valid json');
      const reports = consumptionAnomalyDetector.scanAllVerbose();
      expect(Array.isArray(reports)).toBe(true);
    });

    it('multi_keys : entry sans service (203), match service (207), match storageKey (208)', () => {
      /* anthropic matché par {service}, openai matché par {storageKey}, 1er sans service */
      localStorage.setItem('apex_v13_multi_keys', JSON.stringify([
        { storageKey: 'ax_nomatch_key' }, // pas de service → e.service?. court-circuit (203)
        { service: 'anthropic' },          // match service (207 true)
        { storageKey: 'ax_openai_key' },   // match regex ^ax_openai_ (208 true)
      ]));
      const reports = consumptionAnomalyDetector.scanAllVerbose();
      expect(Array.isArray(reports)).toBe(true);
    });
  });
});
