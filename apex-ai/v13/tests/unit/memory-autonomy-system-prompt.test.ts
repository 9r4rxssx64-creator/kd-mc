/**
 * Tests memory.ts buildSystemPromptContext — Autonomie totale Kevin 2026-05-04.
 *
 * Vérifie que le system prompt injecte bien les capacités exécution autonomie totale
 * pour qu'Apex IA sache exécuter tasks via execute_task_on_service.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { memory } from '../../core/memory.js';

describe('memory — system prompt autonomie totale (Kevin 2026-05-04)', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  it('section "Capacités exécution autonomie totale" présente', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin DESARZENS' });
    expect(ctx).toContain('Capacités exécution autonomie totale');
  });

  it('inclut citation Kevin 2026-05-04 sur autonomie', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Lorsqu\'il voit un nouveau réseau ou banque ou site');
  });

  it('mentionne execute_task_on_service tool', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('execute_task_on_service');
  });

  it('mentionne 5 catégories de capabilities', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Communication / Notification');
    expect(ctx).toContain('Code / Repo');
    expect(ctx).toContain('Paiement / Finance');
    expect(ctx).toContain('Productivité');
    expect(ctx).toContain('Cloud / Hosting');
  });

  it('liste les 15 services minimum', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    const services = ['github', 'stripe', 'resend', 'telegram', 'brevo',
      'openai', 'anthropic', 'vercel', 'cloudflare', 'paypal',
      'discord', 'slack', 'notion', 'airtable', 'shopify'];
    for (const svc of services) {
      expect(ctx.toLowerCase()).toContain(svc);
    }
  });

  it('mentionne unknownCredentialResolver découverte autonome', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('unknownCredentialResolver');
    expect(ctx).toContain('Brave/Tavily/DuckDuckGo');
  });

  it('mentionne banking patterns 130+ services', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Société Générale');
    expect(ctx).toContain('BNP');
    expect(ctx).toContain('Revolut');
  });

  it('mentionne crypto exchanges supportés', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Coinbase');
    expect(ctx).toContain('Binance');
    expect(ctx).toContain('Kraken');
  });

  it('mentionne forbidden patterns explicitement', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Forbidden');
    expect(ctx).toContain('seed phrases');
    expect(ctx).toContain('cartes bancaires complètes');
  });

  it('mentionne audit log obligatoire', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Audit log obligatoire');
    expect(ctx).toContain('PII redacted');
  });

  it('mentionne actions destructrices avec confirm:true', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('confirm: true');
  });

  it('contexte non-vide même sans user', () => {
    const ctx = memory.buildSystemPromptContext(null);
    expect(ctx.length).toBeGreaterThan(500);
    expect(ctx).toContain('Capacités exécution autonomie totale');
  });
});

describe('memory — injection journal permanent (Kevin 2026-06-02 "branche le journal dans Apex")', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  it('injecte les dépôts du journal permanent dans le system prompt', () => {
    localStorage.setItem('apex_v13_chat_journal', JSON.stringify([
      { id: 'j1', ts: Date.now(), source: 'note', text: 'Adresse appartement Nice 12 rue X' },
    ]));
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).toContain('Journal permanent');
    expect(ctx).toContain('appartement Nice');
  });

  it('pas de section journal si vide', () => {
    const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
    expect(ctx).not.toContain('Journal permanent — ce que Kevin');
  });
});
