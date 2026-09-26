/**
 * Tests links-registry C2 fix — Repair JSON ax_links_registry.
 *
 * Audit Apex v13.3.73 — C2 critical : "Registry parse failed".
 *
 * Cas testés :
 * 1. valid : Array bien formé → repaired=false
 * 2. malformed : JSON invalide → reset catalogue
 * 3. missing : pas de clé → utilise catalogue (rediscovered)
 * 4. partial : entrées partielles → drop invalid, garde valid
 * 5. legacy Record format → conversion en Array
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { linksRegistry } from '../../services/integrations/links-registry.js';

describe('links-registry C2 repair() — JSON parse safety', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('valid Array → repaired=false, no rediscover', () => {
    const valid = [
      { service: 'anthropic', alive: true, last_verified: Date.now(), dashboard: 'https://x.com' },
      { service: 'openai', alive: false, last_verified: 0 },
    ];
    localStorage.setItem('ax_links_registry_v2', JSON.stringify(valid));
    const r = linksRegistry.repair();
    expect(r.repaired).toBe(false);
    expect(r.source).toBe('v2');
    expect(r.valid_count).toBe(2);
    expect(r.invalid_count).toBe(0);
    expect(r.rediscovered).toBe(false);
  });

  it('malformed JSON → auto-reset to catalogue defaults', () => {
    localStorage.setItem('ax_links_registry_v2', '{invalid::json][broken');
    localStorage.setItem('ax_links_registry', '{still:bad');
    const r = linksRegistry.repair();
    expect(r.repaired).toBe(true);
    expect(r.source).toBe('reset');
    expect(r.rediscovered).toBe(true);
    expect(r.valid_count).toBeGreaterThan(0);
    /* Catalogue should have been restored — anthropic must be present */
    const anthropic = linksRegistry.get('anthropic');
    expect(anthropic).not.toBeNull();
    expect(anthropic?.service).toBe('anthropic');
  });

  it('missing key → uses catalogue defaults (rediscover)', () => {
    /* No setup — both keys absent */
    const r = linksRegistry.repair();
    expect(r.repaired).toBe(true);
    expect(r.source).toBe('reset');
    expect(r.rediscovered).toBe(true);
    expect(r.valid_count).toBeGreaterThan(20); /* full catalogue */
  });

  it('partial valid entries → drops invalid, keeps valid', () => {
    const mixed = [
      { service: 'anthropic', alive: true, last_verified: Date.now() }, /* valid */
      { service: '', alive: true, last_verified: 0 }, /* invalid: empty service */
      { service: 'openai', alive: 'maybe', last_verified: 0 }, /* invalid: alive not bool */
      { not_service: 'fake' }, /* invalid: missing required */
      null, /* invalid: not object */
      { service: 'github', alive: false, last_verified: 1234 }, /* valid */
    ];
    localStorage.setItem('ax_links_registry_v2', JSON.stringify(mixed));
    const r = linksRegistry.repair();
    expect(r.valid_count).toBe(2);
    expect(r.invalid_count).toBe(4);
    expect(r.repaired).toBe(true);
    /* After cleanup, list() returns only valid ones */
    const list = linksRegistry.list();
    expect(list.length).toBe(2);
    expect(list.find((l) => l.service === 'anthropic')).toBeDefined();
    expect(list.find((l) => l.service === 'github')).toBeDefined();
  });

  it('legacy Record format → converts to Array safely', () => {
    /* Legacy format: object keyed by service ID */
    const recordFormat = {
      anthropic: { service: 'anthropic', alive: true, last_verified: 0 },
      openai: { service: 'openai', alive: true, last_verified: 0 },
    };
    localStorage.setItem('ax_links_registry', JSON.stringify(recordFormat));
    const r = linksRegistry.repair();
    expect(r.source).toBe('legacy');
    expect(r.valid_count).toBe(2);
  });

  it('list() defensive parse — never throws on corrupt data', () => {
    localStorage.setItem('ax_links_registry_v2', 'totally not json {{{');
    /* Should NOT throw — returns empty silently */
    expect(() => linksRegistry.list()).not.toThrow();
    const result = linksRegistry.list();
    expect(Array.isArray(result)).toBe(true);
  });
});
