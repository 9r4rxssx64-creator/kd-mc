/**
 * Tests features/billing (port v12 vAccountsBilling).
 */
import { describe, expect, it } from 'vitest';

import { BILLING_SERVICES, billingHub, escapeHtml } from '../../features/billing/index.js';

describe('features/billing — registry', () => {
  it('liste 12+ services', () => {
    expect(BILLING_SERVICES.length).toBeGreaterThanOrEqual(12);
  });

  it('chaque service a id, name, emoji, urls', () => {
    for (const s of BILLING_SERVICES) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.dashboard_url).toMatch(/^https:\/\//);
      expect(s.billing_url).toMatch(/^https:\/\//);
    }
  });

  it('tous les ids sont uniques', () => {
    const ids = BILLING_SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('catégories valides (ai/saas/comms/infra/finance/other)', () => {
    const valid = new Set(['ai', 'saas', 'comms', 'infra', 'finance', 'other']);
    for (const s of BILLING_SERVICES) {
      expect(valid.has(s.category)).toBe(true);
    }
  });

  it('contient anthropic, openai, stripe, github (must-have Kevin)', () => {
    const ids = BILLING_SERVICES.map((s) => s.id);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
    expect(ids).toContain('stripe');
    expect(ids).toContain('github');
  });
});

describe('features/billing — billingHub', () => {
  it('list retourne tous services', () => {
    expect(billingHub.list().length).toBe(BILLING_SERVICES.length);
  });

  it('byId retourne service ou undefined', () => {
    expect(billingHub.byId('anthropic')?.name).toBe('Anthropic');
    expect(billingHub.byId('inexistant')).toBeUndefined();
  });

  it('byCategory filtre correctement', () => {
    const ai = billingHub.byCategory('ai');
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.every((s) => s.category === 'ai')).toBe(true);
  });

  it('groupByCategory retourne tous groupes', () => {
    const groups = billingHub.groupByCategory();
    expect(groups.ai.length).toBeGreaterThan(0);
    expect(groups.infra.length).toBeGreaterThan(0);
    expect(groups.finance.length).toBeGreaterThan(0);
  });

  it('getStats retourne total, with_credit_api, categories', () => {
    const stats = billingHub.getStats();
    expect(stats.total).toBe(BILLING_SERVICES.length);
    expect(stats.with_credit_api).toBeGreaterThanOrEqual(2); /* anthropic + openai */
    expect(stats.categories).toBeGreaterThanOrEqual(4);
  });

  it('isValidUrl accepte HTTPS de domaine trusted', () => {
    expect(billingHub.isValidUrl('https://console.anthropic.com')).toBe(true);
    expect(billingHub.isValidUrl('https://dashboard.stripe.com/billing')).toBe(true);
  });

  it('isValidUrl refuse HTTP', () => {
    expect(billingHub.isValidUrl('http://anthropic.com')).toBe(false);
  });

  it('isValidUrl refuse domaine non-trusted', () => {
    expect(billingHub.isValidUrl('https://evil.com')).toBe(false);
  });

  it('isValidUrl refuse URL invalide', () => {
    expect(billingHub.isValidUrl('not_a_url')).toBe(false);
  });
});

describe('features/billing — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml("L'auth")).toBe('L&#39;auth');
  });
});
