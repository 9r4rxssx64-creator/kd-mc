/**
 * Tests features/dashboard (port v12 vDashboard).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  computeKpis,
  escapeHtml,
  loadAlerts,
  loadRechargeLinks,
  loadTodos,
  renderServiceHealthCard,
  type ServiceHealthLight,
} from '../../features/dashboard/index.js';

describe('features/dashboard — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("L'apostrophe")).toBe('L&#39;apostrophe');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('idempotent sur texte clean', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

describe('features/dashboard — computeKpis', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('retourne 5 KPIs (messages, tokens, projects, sentinels, todos)', async () => {
    const kpis = await computeKpis();
    expect(kpis).toHaveLength(5);
    const ids = kpis.map((k) => k.id);
    expect(ids).toContain('messages');
    expect(ids).toContain('tokens');
    expect(ids).toContain('projects');
    expect(ids).toContain('sentinels');
    expect(ids).toContain('todos');
  });

  it('chaque KPI a route + couleur + label', async () => {
    const kpis = await computeKpis();
    for (const k of kpis) {
      expect(k.route).toBeTruthy();
      /* v13.4.232 (étape 3 design system) : couleurs migrées hex → CSS vars.
       * Accepte hex OU var(--ax-*) — les KPI utilisent désormais les tokens. */
      expect(k.color).toMatch(/^(#[0-9a-f]{6}|var\(--ax-[\w-]+\))$/i);
      expect(k.label.length).toBeGreaterThan(0);
    }
  });

  it('messages KPI lit ax_messages_24h depuis localStorage', async () => {
    localStorage.setItem('apex_v13_messages_24h', '42');
    const kpis = await computeKpis();
    const msg = kpis.find((k) => k.id === 'messages');
    expect(msg?.value).toBe(42);
  });

  it('tokens KPI gère valeur invalide gracefully', async () => {
    localStorage.setItem('apex_v13_tokens_24h', 'not-a-number');
    const kpis = await computeKpis();
    const tok = kpis.find((k) => k.id === 'tokens');
    expect(tok?.value).toBe('0');
  });

  it('todos KPI compte les pending dans ax_claude_todo', async () => {
    localStorage.setItem('ax_claude_todo', JSON.stringify([
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'pending' },
      { id: 'c', status: 'resolved' },
    ]));
    const kpis = await computeKpis();
    const t = kpis.find((k) => k.id === 'todos');
    expect(t?.value).toBe(2);
  });

  it('todos KPI gère JSON corrompu', async () => {
    localStorage.setItem('ax_claude_todo', '{not_valid_json');
    const kpis = await computeKpis();
    const t = kpis.find((k) => k.id === 'todos');
    expect(t?.value).toBe(0);
  });

  it('todos KPI gère array null gracefully', async () => {
    localStorage.setItem('ax_claude_todo', 'null');
    const kpis = await computeKpis();
    const t = kpis.find((k) => k.id === 'todos');
    expect(t?.value).toBe(0);
  });
});

describe('features/dashboard — loadAlerts', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('retourne array vide si aucun problème', async () => {
    const alerts = await loadAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('détecte credentials expirés depuis localStorage', async () => {
    localStorage.setItem('apex_v13_credentials_expiring', JSON.stringify([
      { service: 'Anthropic', days_left: 5 },
      { service: 'Stripe', days_left: 14 },
      { service: 'OpenAI', days_left: 90 }, /* trop loin */
    ]));
    const alerts = await loadAlerts();
    const credAlerts = alerts.filter((a) => a.id.startsWith('cred_'));
    expect(credAlerts.length).toBeGreaterThanOrEqual(2);
    expect(credAlerts[0]?.level).toBe('error'); /* 5 jours = error */
  });

  it('gère localStorage corrompu', async () => {
    localStorage.setItem('apex_v13_credentials_expiring', 'invalid json');
    const alerts = await loadAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

describe('features/dashboard — loadTodos', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('retourne [] si pas de todos', () => {
    expect(loadTodos()).toEqual([]);
  });

  it('charge les todos pending depuis ax_claude_todo', () => {
    localStorage.setItem('ax_claude_todo', JSON.stringify([
      { id: 't1', reason: 'Fix bug X', severity: 'high', ts: 123, status: 'pending' },
      { id: 't2', reason: 'Resolved', severity: 'low', ts: 456, status: 'resolved' },
    ]));
    const todos = loadTodos();
    expect(todos).toHaveLength(1);
    expect(todos[0]?.id).toBe('t1');
    expect(todos[0]?.title).toBe('Fix bug X');
    expect(todos[0]?.severity).toBe('high');
  });

  it('limite à 5 todos max', () => {
    const list = [];
    for (let i = 0; i < 10; i++) {
      list.push({ id: `t${i}`, reason: `T${i}`, status: 'pending' });
    }
    localStorage.setItem('ax_claude_todo', JSON.stringify(list));
    const todos = loadTodos();
    expect(todos.length).toBeLessThanOrEqual(5);
  });

  it('gère JSON malformé', () => {
    localStorage.setItem('ax_claude_todo', '{broken');
    expect(loadTodos()).toEqual([]);
  });

  it('utilise defaults si champs manquants', () => {
    localStorage.setItem('ax_claude_todo', JSON.stringify([
      { status: 'pending' }, /* no id, no reason, no severity */
    ]));
    const todos = loadTodos();
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe('Todo sans description');
    expect(todos[0]?.severity).toBe('medium');
  });
});

describe('features/dashboard — loadRechargeLinks (Kevin v13.0.20+)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retourne {} si aucun service', async () => {
    expect(await loadRechargeLinks([])).toEqual({});
  });

  it('charge les URLs recharge directes pour anthropic + openai', async () => {
    const links = await loadRechargeLinks(['anthropic', 'openai']);
    expect(links['anthropic']?.recharge).toContain('credit-purchases');
    expect(links['openai']?.recharge).toContain('billing');
    expect(links['anthropic']?.usage).toContain('usage');
  });

  it('retourne null pour service inconnu', async () => {
    const links = await loadRechargeLinks(['xx_unknown_service_zzz']);
    expect(links['xx_unknown_service_zzz']?.recharge).toBeNull();
    expect(links['xx_unknown_service_zzz']?.usage).toBeNull();
  });
});

describe('features/dashboard — renderServiceHealthCard (Kevin lumière)', () => {
  it('rend message vide si aucun service', () => {
    const html = renderServiceHealthCard([]);
    expect(html).toContain('Aucune clé API');
  });

  it('rend bouton recharge si yellow/red avec URL connue', () => {
    const items: ServiceHealthLight[] = [
      {
        service: 'anthropic',
        light: 'yellow',
        totalKeys: 1,
        activeKeys: 1,
        failingKeys: 1,
        invalidKeys: 0,
        lastSuccess: 0,
      },
    ];
    const links = {
      anthropic: {
        recharge: 'https://console.anthropic.com/settings/billing/credit-purchases',
        usage: 'https://console.anthropic.com/settings/usage',
        apiKeys: 'https://console.anthropic.com/settings/keys',
      },
    };
    const html = renderServiceHealthCard(items, links);
    expect(html).toContain('💳 Recharge');
    expect(html).toContain('credit-purchases');
    /* v13.4.233 (étape 3 design) : Usage renommé "Rotate" dans composant partagé */
    expect(html).toContain('🔄 Rotate');
  });

  it('rend lumière verte sans bouton recharge insistant si green', () => {
    const items: ServiceHealthLight[] = [
      {
        service: 'openai',
        light: 'green',
        totalKeys: 1,
        activeKeys: 1,
        failingKeys: 0,
        invalidKeys: 0,
        lastSuccess: Date.now(),
      },
    ];
    const links = {
      openai: {
        recharge: 'https://platform.openai.com/account/billing/overview',
        usage: 'https://platform.openai.com/usage',
        apiKeys: 'https://platform.openai.com/api-keys',
      },
    };
    const html = renderServiceHealthCard(items, links);
    /* Bouton recharge n'apparaît PAS si green (Kevin règle : recharge visible quand action requise) */
    expect(html).not.toContain('💳 Recharge');
    /* v13.4.233 (étape 3 design) : Usage renommé "Rotate" dans renderRechargeAction (parité settings) */
    expect(html).toContain('🔄 Rotate');
  });

  it('échappe HTML dans service name', () => {
    const items: ServiceHealthLight[] = [
      {
        service: '<script>alert(1)</script>',
        light: 'red',
        totalKeys: 0,
        activeKeys: 0,
        failingKeys: 0,
        invalidKeys: 0,
        lastSuccess: 0,
      },
    ];
    const html = renderServiceHealthCard(items, {});
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
