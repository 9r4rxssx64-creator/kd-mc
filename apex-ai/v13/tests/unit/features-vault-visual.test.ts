/**
 * Tests features/vault — refonte visuelle premium (Kevin 2026-05-07).
 *
 * Couvre :
 *  - CATEGORIES (9 catégories + "other")
 *  - classifyService (mappage service → catégorie)
 *  - buildCredentialDisplays (multi-key vault → cards)
 *  - computeStats (header agrégats)
 *  - renderCredentialCard (HTML escape + boutons + status)
 *  - getCredentialsForCategory (filter + search)
 *  - formatRelativeTime (i18n FR)
 *  - render (UI complète + accessibility)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { multiKeyVault } from '../../services/vault/multi-key-vault.js';
import { vault } from '../../services/vault/vault.js';

import {
  buildCredentialDisplays,
  CATEGORIES,
  classifyService,
  computeStats,
  formatRelativeTime,
  getCredentialsForCategory,
  render,
  renderCredentialCard,
  type CredentialDisplay,
} from '../../features/vault/index.js';

import { store } from '../../core/store.js';

function makeDisplay(overrides: Partial<CredentialDisplay> = {}): CredentialDisplay {
  return {
    id: 'k_' + Math.random().toString(36).slice(2, 8),
    service: 'anthropic',
    serviceName: 'Anthropic Claude',
    category: 'ai',
    status: 'active',
    source: 'multi-key',
    ...overrides,
  };
}

describe('features/vault visual — CATEGORIES', () => {
  it('expose 11 catégories incluant "other" (v13.4.284 : +identity +addresses)', () => {
    expect(CATEGORIES.length).toBe(11);
    expect(CATEGORIES.find((c) => c.id === 'other')).toBeDefined();
  });

  it('expose les catégories clés demandées par Kevin', () => {
    const ids = CATEGORIES.map((c) => c.id);
    for (const id of ['ai', 'finance', 'devops', 'comms', 'social', 'storage', 'ecommerce', 'crypto', 'identity', 'addresses']) {
      expect(ids).toContain(id);
    }
  });

  it('chaque catégorie a un label avec emoji et un id snake_case-friendly', () => {
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.id).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('features/vault visual — classifyService', () => {
  it('range anthropic dans ai', () => {
    expect(classifyService('anthropic')).toBe('ai');
  });
  it('range stripe dans finance', () => {
    expect(classifyService('stripe')).toBe('finance');
  });
  it('range github dans devops', () => {
    expect(classifyService('github')).toBe('devops');
  });
  it('range telegram dans comms', () => {
    expect(classifyService('telegram')).toBe('comms');
  });
  it('range firebase dans storage', () => {
    expect(classifyService('firebase')).toBe('storage');
  });
  it('range coinbase dans crypto', () => {
    expect(classifyService('coinbase')).toBe('crypto');
  });
  it('range identifiant Kevin dans identity', () => {
    expect(classifyService('kevin_email')).toBe('identity');
  });
  it('utilise pattern.category pour les inconnus quand fourni', () => {
    expect(classifyService('mystery_service', 'identity')).toBe('identity');
  });
  it('fallback "other" quand aucun match', () => {
    expect(classifyService('zzzunknown_xyz_blue')).toBe('other');
  });
});

describe('features/vault visual — formatRelativeTime', () => {
  it('< 1 min → "à l\'instant"', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toMatch(/instant/);
  });
  it('60 min → "il y a Xh"', () => {
    expect(formatRelativeTime(Date.now() - 60 * 60 * 1000)).toBe('il y a 1h');
  });
  it('2 jours → "il y a 2j"', () => {
    expect(formatRelativeTime(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe('il y a 2j');
  });
});

describe('features/vault visual — renderCredentialCard', () => {
  it('escape HTML dans serviceName et alias (XSS-safe)', () => {
    const html = renderCredentialCard(
      makeDisplay({ serviceName: '<script>alert(1)</script>', alias: '"><img/>' }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
  });

  it('inclut le bouton Test', () => {
    const html = renderCredentialCard(makeDisplay());
    expect(html).toContain('data-action="test"');
    expect(html).toContain('🔄 Test');
  });

  it('inclut le bouton Recharger avec data-recharge-url', () => {
    const html = renderCredentialCard(makeDisplay({ rechargeUrl: 'https://example.com/billing' }));
    expect(html).toContain('data-action="recharge"');
    expect(html).toContain('https://example.com/billing');
    expect(html).not.toContain('disabled');
  });

  it('disable le bouton Recharger sans URL', () => {
    const html = renderCredentialCard(makeDisplay());
    expect(html).toMatch(/data-action="recharge"[^>]*disabled/);
  });

  it('inclut les boutons edit et delete', () => {
    const html = renderCredentialCard(makeDisplay());
    expect(html).toContain('data-action="edit"');
    expect(html).toContain('data-action="delete"');
  });

  it('affiche un masque ••••• (jamais la valeur réelle)', () => {
    const html = renderCredentialCard(makeDisplay({ preview: 'sk-ant-api03-LONGSECRET' }));
    expect(html).toContain('••••••');
    expect(html).not.toContain('sk-ant-api03-LONGSECRET');
  });

  it('affiche les couleurs de status spécifiques', () => {
    /* v13.4.232 (étape 3 design system) : migration hex → CSS vars
     * #22cc77 → var(--ax-green), #ffaa00 → var(--ax-warning), #ff5b5b → var(--ax-error) */
    const active = renderCredentialCard(makeDisplay({ status: 'active' }));
    const failing = renderCredentialCard(makeDisplay({ status: 'failing' }));
    const invalid = renderCredentialCard(makeDisplay({ status: 'invalid' }));
    expect(active).toContain('var(--ax-green)');
    expect(failing).toContain('var(--ax-warning)');
    expect(invalid).toContain('var(--ax-error)');
  });
});

describe('features/vault visual — buildCredentialDisplays + getCredentialsForCategory', () => {
  beforeEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });
  afterEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });

  it('retourne [] quand aucun multi-key stocké', () => {
    expect(buildCredentialDisplays()).toEqual([]);
  });

  it('retourne 1 entry après addKey', async () => {
    vault.setPassphrase('test-pass');
    await multiKeyVault.addKey('anthropic', 'sk-ant-api03-' + 'a'.repeat(40));
    const list = buildCredentialDisplays();
    expect(list.length).toBe(1);
    expect(list[0]?.service).toBe('anthropic');
    expect(list[0]?.category).toBe('ai');
  });

  it('groupe correctement par catégorie', async () => {
    vault.setPassphrase('test-pass');
    await multiKeyVault.addKey('stripe', 'sk_test_' + 'a'.repeat(30));
    await multiKeyVault.addKey('anthropic', 'sk-ant-api03-' + 'a'.repeat(40));
    const aiCat = CATEGORIES.find((c) => c.id === 'ai');
    const finCat = CATEGORIES.find((c) => c.id === 'finance');
    if (!aiCat || !finCat) throw new Error('catégories manquantes');
    expect(getCredentialsForCategory(aiCat).length).toBe(1);
    expect(getCredentialsForCategory(finCat).length).toBe(1);
  });

  it('search filter matche par nom service', async () => {
    vault.setPassphrase('test-pass');
    await multiKeyVault.addKey('anthropic', 'sk-ant-api03-' + 'a'.repeat(40));
    const aiCat = CATEGORIES.find((c) => c.id === 'ai');
    if (!aiCat) throw new Error('catégorie ai manquante');
    expect(getCredentialsForCategory(aiCat, 'anthr').length).toBe(1);
    expect(getCredentialsForCategory(aiCat, 'zzznope').length).toBe(0);
  });
});

describe('features/vault visual — computeStats', () => {
  beforeEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });
  afterEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });

  it('renvoie zéros quand aucune clé', () => {
    expect(computeStats()).toEqual({ total: 0, active: 0, failing: 0, invalid: 0 });
  });

  it('compte total + invalid après ajout puis markInvalid', async () => {
    vault.setPassphrase('test-pass');
    const k = await multiKeyVault.addKey('groq', 'gsk_' + 'a'.repeat(50));
    multiKeyVault.markInvalid(k.id, 'test');
    const stats = computeStats();
    expect(stats.total).toBe(1);
    expect(stats.invalid).toBe(1);
  });
});

describe('features/vault visual — render() UI', () => {
  beforeEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });
  afterEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });

  it('affiche un message admin-only si !isAdmin', () => {
    store.set('isAdmin', false);
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('Coffre admin');
    expect(root.innerHTML).toContain('réservée');
  });

  it('affiche header + boutons + zone search quand admin', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('🔐 Coffre Codes');
    expect(root.querySelector('#ax-vault-add-manual')).toBeTruthy();
    expect(root.querySelector('#ax-vault-test-all')).toBeTruthy();
    expect(root.querySelector('#ax-vault-search')).toBeTruthy();
  });

  it('expose les détails par catégorie (10 sections render-pending)', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    render(root);
    const container = root.querySelector('#ax-vault-categories');
    expect(container).toBeTruthy();
    /* Identity toujours visible (Kevin règle) même vide */
    expect(container?.innerHTML).toContain('🆔 Identité');
  });

  it('click "+ Ajouter" ouvre le modal', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const addBtn = root.querySelector<HTMLButtonElement>('#ax-vault-add-manual');
    expect(addBtn).toBeTruthy();
    addBtn?.click();
    const modal = root.querySelector('[role="dialog"]');
    expect(modal).toBeTruthy();
    expect(root.innerHTML).toContain('+ Ajouter une clé');
    document.body.removeChild(root);
  });

  it('click "🔄 Tester tout" appelle multiKeyVault.healthCheckAll', () => {
    store.set('isAdmin', true);
    const spy = vi.spyOn(multiKeyVault, 'healthCheckAll').mockResolvedValue({ tested: 0, recovered: 0, stillDown: 0 });
    const root = document.createElement('div');
    render(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-vault-test-all');
    btn?.click();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('contient le bloc "Auto-détection rapide" pour paste rapide', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    render(root);
    expect(root.querySelector('#ax-vault-paste')).toBeTruthy();
    expect(root.querySelector('#ax-vault-paste-btn')).toBeTruthy();
  });

  it('contient bouton export JSON', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    render(root);
    expect(root.querySelector('#ax-vault-export')).toBeTruthy();
  });

  it('emet la stats line agrégée', () => {
    store.set('isAdmin', true);
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('codes');
    expect(root.innerHTML).toContain('actifs');
    expect(root.innerHTML).toContain('dégradés');
    expect(root.innerHTML).toContain('invalides');
  });
});

describe('features/vault visual — recharge open uses linksRegistry', () => {
  beforeEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });
  afterEach(() => {
    localStorage.clear();
    multiKeyVault.resetAll();
  });

  it('après ajout anthropic, le rechargeUrl est rempli depuis linksRegistry', async () => {
    vault.setPassphrase('test-pass');
    await multiKeyVault.addKey('anthropic', 'sk-ant-api03-' + 'a'.repeat(40));
    const list = buildCredentialDisplays();
    const first = list[0];
    expect(first?.rechargeUrl).toBeTruthy();
    expect(first?.rechargeUrl).toContain('anthropic');
  });
});
