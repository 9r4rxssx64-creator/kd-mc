/* eslint-disable no-script-url -- tests vérifient explicitement le blocage de ce schéma */
/**
 * Tests browser-controller.ts (v13).
 *
 * Couvre :
 *  - isBlockedDomain() : URLs valides, schemes interdits, blocklist statique
 *  - buildArchiveUrl/buildReaderUrl/buildCorsProxyUrl : génération corrects
 *  - axTryUnblockUrl : cascade fallback (mock fetch HEAD)
 *  - axNavigateTo : alias connus, prefix fallback, alias inconnu, store.set
 *  - listNavigationTargets / registerNavigationTarget
 *
 * Couvre aussi form-auto-fill.ts (mêmes mission requirements) :
 *  - detectFillIntent : 4 patterns (remplis/mets/set/sauvegarde)
 *  - axAutofillField : whitelist + forbidden + confirm/non-confirm
 *  - confirmAutofill / cancelAutofill
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  axNavigateTo,
  axTryUnblockUrl,
  buildArchiveUrl,
  buildCorsProxyUrl,
  buildReaderUrl,
  isBlockedDomain,
  listNavigationTargets,
  registerNavigationTarget,
} from '../../services/integrations/browser-controller.js';
import {
  axAutofillField,
  cancelAutofill,
  confirmAutofill,
  detectFillIntent,
  isWritableKey,
  listPendingAutofills,
  listWritableKeys,
} from '../../services/core-svc/form-auto-fill.js';

describe('browser-controller — isBlockedDomain', () => {
  it('accepte une URL https valide', () => {
    const r = isBlockedDomain('https://google.com/');
    expect(r.blocked).toBe(false);
    expect(r.domain).toBe('google.com');
  });

  it('strip www.', () => {
    const r = isBlockedDomain('https://www.example.com/path');
    expect(r.blocked).toBe(false);
    expect(r.domain).toBe('example.com');
  });

  it('refuse javascript: scheme', () => {
    const r = isBlockedDomain('javascript:alert(1)');
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('scheme_forbidden');
  });

  it('refuse data: scheme', () => {
    const r = isBlockedDomain('data:text/html,<h1>xss</h1>');
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('scheme_forbidden');
  });

  it('refuse URL malformée', () => {
    const r = isBlockedDomain('not-a-url');
    expect(r.blocked).toBe(true);
    expect(r.domain).toBe(null);
  });

  it('refuse blocklist statique', () => {
    const r = isBlockedDomain('https://malware-test.example/');
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('static_blocklist');
  });
});

describe('browser-controller — builders', () => {
  it('buildArchiveUrl encode l\'URL', () => {
    const u = buildArchiveUrl('https://example.com/?q=test');
    expect(u).toContain('web.archive.org');
    expect(u).toContain('example.com');
  });

  it('buildReaderUrl utilise r.jina.ai', () => {
    const u = buildReaderUrl('https://example.com/');
    expect(u).toBe('https://r.jina.ai/https://example.com/');
  });

  it('buildCorsProxyUrl null si pas configuré', () => {
    localStorage.removeItem('ax_cors_proxy_url');
    expect(buildCorsProxyUrl('https://example.com/')).toBe(null);
  });

  it('buildCorsProxyUrl construit avec proxy configuré', () => {
    localStorage.setItem('ax_cors_proxy_url', 'https://my-proxy.workers.dev/proxy');
    const u = buildCorsProxyUrl('https://example.com/');
    expect(u).toContain('my-proxy.workers.dev');
    expect(u).toContain('url=');
    expect(decodeURIComponent(u!.split('url=')[1] ?? '')).toBe('https://example.com/');
  });
});

describe('browser-controller — axTryUnblockUrl', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.removeItem('ax_cors_proxy_url');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('retourne method=direct si HEAD probe direct passe', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;
    const r = await axTryUnblockUrl('https://example.com/');
    expect(r.ok).toBe(true);
    expect(r.method).toBe('direct');
    expect(r.attempts.length).toBeGreaterThanOrEqual(1);
  });

  it('refuse blocklist domain immédiatement', async () => {
    const r = await axTryUnblockUrl('https://malware-test.example/');
    expect(r.ok).toBe(false);
    expect(r.fallback).toBe('open_safari');
  });

  it('cascade vers archive si direct fail', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      /* 1er appel (direct) → fail, 2e (archive) → ok */
      if (calls === 1) throw new Error('network down');
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const r = await axTryUnblockUrl('https://example.com/');
    expect(r.ok).toBe(true);
    expect(r.method).toBe('archive');
    expect(r.attempts.length).toBeGreaterThanOrEqual(2);
    expect(r.attempts[0]?.ok).toBe(false);
  });

  it('fallback Safari si toutes les stratégies échouent', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('all dead'); }) as typeof fetch;
    const r = await axTryUnblockUrl('https://example.com/');
    expect(r.ok).toBe(false);
    expect(r.fallback).toBe('open_safari');
    expect(r.method).toBe('safari-fallback');
  });
});

describe('browser-controller — axNavigateTo', () => {
  it('reconnait alias connu coffre.gemini', async () => {
    const r = await axNavigateTo('coffre.gemini');
    expect(r.ok).toBe(true);
    expect(r.view).toBe('vault');
    expect(r.field).toBe('ax_gemini_key');
  });

  it('alias case-insensitive', async () => {
    const r = await axNavigateTo('SETTINGS.THEME');
    expect(r.ok).toBe(true);
    expect(r.view).toBe('settings');
  });

  it('fallback prefix si alias précis inconnu', async () => {
    const r = await axNavigateTo('coffre.unknown_xyz');
    expect(r.ok).toBe(true);
    expect(r.view).toBe('vault');
  });

  it('échoue si alias totalement inconnu', async () => {
    const r = await axNavigateTo('totally-bogus-target-xyz');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('échoue si target vide', async () => {
    const r = await axNavigateTo('');
    expect(r.ok).toBe(false);
  });

  it('registerNavigationTarget enrichit le router', async () => {
    registerNavigationTarget('test.custom', { view: 'custom-view', field: 'foo' });
    const r = await axNavigateTo('test.custom');
    expect(r.ok).toBe(true);
    expect(r.view).toBe('custom-view');
    expect(r.field).toBe('foo');
  });

  it('listNavigationTargets retourne >= 20 entrées', () => {
    const list = listNavigationTargets();
    expect(list.length).toBeGreaterThanOrEqual(20);
    expect(list).toContain('coffre.gemini');
  });
});

describe('form-auto-fill — detectFillIntent', () => {
  it('détecte "remplis X avec Y"', () => {
    const r = detectFillIntent('remplis ax_gemini_key avec AIzaSyXXX123');
    expect(r).not.toBeNull();
    expect(r!.key).toBe('ax_gemini_key');
    expect(r!.value).toBe('AIzaSyXXX123');
    expect(r!.view).toBe('vault');
    expect(r!.confidence).toBeGreaterThan(0.7);
  });

  it('détecte "mets Y dans X"', () => {
    const r = detectFillIntent('mets sk-ant-api03-XYZ dans ax_anthropic_key');
    expect(r).not.toBeNull();
    expect(r!.key).toBe('ax_anthropic_key');
    expect(r!.value).toBe('sk-ant-api03-XYZ');
  });

  it('détecte "set X to Y"', () => {
    const r = detectFillIntent('set ax_paypal_me to @kevin.desarzens');
    expect(r).not.toBeNull();
    expect(r!.key).toBe('ax_paypal_me');
    expect(r!.value).toBe('@kevin.desarzens');
    expect(r!.view).toBe('settings');
  });

  it('retourne null si pas de match', () => {
    expect(detectFillIntent('bonjour comment ça va')).toBeNull();
    expect(detectFillIntent('')).toBeNull();
  });

  it('view=unknown si clé pas dans whitelist', () => {
    const r = detectFillIntent('remplis foo_bar_random avec hello');
    expect(r).not.toBeNull();
    expect(r!.view).toBe('unknown');
  });
});

describe('form-auto-fill — axAutofillField', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('refuse clé vide', async () => {
    const r = await axAutofillField('', 'value', { tier: 'admin', confirm: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('key_empty');
  });

  it('refuse valeur vide', async () => {
    const r = await axAutofillField('ax_gemini_key', '', { tier: 'admin', confirm: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('value_empty');
  });

  it('refuse clé hors whitelist', async () => {
    const r = await axAutofillField('foo_random', 'val', { tier: 'admin', confirm: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('key_not_in_whitelist');
  });

  it('refuse forbidden pattern (CB complète)', async () => {
    const r = await axAutofillField('ax_paypal_me', '4111111111111111', { tier: 'admin', confirm: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('CB');
  });

  it('admin avec confirm=false écrit dans settings (localStorage) directement', async () => {
    const r = await axAutofillField('ax_paypal_me', '@kevin', { tier: 'admin', confirm: false });
    expect(r.ok).toBe(true);
    expect(r.written).toBe(true);
    expect(r.view).toBe('settings');
    expect(localStorage.getItem('ax_paypal_me')).toBe('@kevin');
  });

  it('non-admin → awaiting_confirmation', async () => {
    const r = await axAutofillField('ax_paypal_me', '@laurence', { tier: 'laurence' });
    expect(r.awaiting_confirmation).toBe(true);
    expect(r.confirmation_token).toBeDefined();
    expect(r.written).toBe(false);
  });

  it('confirmAutofill exécute après token valide', async () => {
    const pending = await axAutofillField('ax_paypal_me', '@user', { tier: 'laurence' });
    expect(pending.confirmation_token).toBeDefined();
    const final = await confirmAutofill(pending.confirmation_token!);
    expect(final.ok).toBe(true);
    expect(final.written).toBe(true);
    expect(localStorage.getItem('ax_paypal_me')).toBe('@user');
  });

  it('cancelAutofill retire pending sans écrire', async () => {
    const pending = await axAutofillField('ax_paypal_me', '@cancel', { tier: 'laurence' });
    const c = await cancelAutofill(pending.confirmation_token!);
    expect(c.ok).toBe(true);
    /* Pas écrit */
    expect(localStorage.getItem('ax_paypal_me')).toBe(null);
    /* Token invalide après cancel */
    const retry = await confirmAutofill(pending.confirmation_token!);
    expect(retry.ok).toBe(false);
  });
});

describe('form-auto-fill — utilitaires', () => {
  it('isWritableKey reconnaît clés whitelist', () => {
    expect(isWritableKey('ax_gemini_key')).toBe(true);
    expect(isWritableKey('ax_paypal_me')).toBe(true);
    expect(isWritableKey('profile.email')).toBe(true);
    expect(isWritableKey('foo_random')).toBe(false);
  });

  it('listWritableKeys >= 30 entries (vault+settings+profile)', () => {
    const list = listWritableKeys();
    expect(list.length).toBeGreaterThanOrEqual(30);
    expect(list.some((e) => e.view === 'vault')).toBe(true);
    expect(list.some((e) => e.view === 'settings')).toBe(true);
    expect(list.some((e) => e.view === 'profile')).toBe(true);
  });

  it('listPendingAutofills retourne tableau', async () => {
    /* Crée 1 pending */
    await axAutofillField('ax_paypal_me', '@pending-test', { tier: 'laurence' });
    const list = listPendingAutofills();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    /* Ne fuit pas la valeur */
    const first = list[0] as Record<string, unknown>;
    expect(first['value']).toBeUndefined();
    expect(first['key']).toBe('ax_paypal_me');
  });
});
