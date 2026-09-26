/**
 * Tests services/auto-discover-links.ts (Kevin règle 2026-05-07 auto-discover autonome).
 *
 * Coverage : 25+ tests sur les 8 méthodes publiques + edges cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { autoDiscoverLinks } from '../../services/integrations/auto-discover-links.js';

describe('AutoDiscoverLinks (autonome 100%)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('discover() — pre_configured', () => {
    it('service connu (anthropic) → source pre_configured + confidence 1.0', async () => {
      const r = await autoDiscoverLinks.discover('anthropic');
      expect(r.service).toBe('anthropic');
      expect(r.source).toBe('pre_configured');
      expect(r.confidence).toBe(1.0);
      expect(r.dashboard).toContain('console.anthropic.com');
      expect(r.billing).toContain('billing');
      expect(r.api_keys).toContain('keys');
      expect(r.docs).toContain('docs.anthropic');
      expect(r.alive).toBe(true);
    });

    it('service connu (openai) → tous les liens essentiels présents', async () => {
      const r = await autoDiscoverLinks.discover('openai');
      expect(r.dashboard).toContain('platform.openai.com');
      expect(r.api_keys).toBeDefined();
      expect(r.usage).toBeDefined();
    });

    it('service connu (github) → pre_configured avec api_keys=tokens', async () => {
      const r = await autoDiscoverLinks.discover('github');
      expect(r.source).toBe('pre_configured');
      expect(r.api_keys).toContain('tokens');
    });

    it('normalize : "ANTHROPIC " (uppercase + espace) → "anthropic"', async () => {
      const r = await autoDiscoverLinks.discover('  ANTHROPIC ');
      expect(r.service).toBe('anthropic');
      expect(r.source).toBe('pre_configured');
    });
  });

  describe('discover() — pattern_discovery', () => {
    it('service inconnu avec HEAD ok → pattern_discovery + alive', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      const r = await autoDiscoverLinks.discover('mysvc_unknown');
      expect(r.service).toBe('mysvc_unknown');
      expect(['pattern_discovery', 'web_search']).toContain(r.source);
      expect(r.alive).toBe(true);
    });

    it('service inconnu avec HEAD fail → pattern_discovery + alive=false', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not reachable'));
      const r = await autoDiscoverLinks.discover('totally_dead_service');
      expect(r.service).toBe('totally_dead_service');
      expect(r.alive).toBe(false);
      expect(r.confidence).toBeLessThan(0.5);
    });

    it('service inconnu valide → confidence dépend du nombre de liens trouvés', async () => {
      let count = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        count++;
        /* Tous les premiers candidats répondent → confidence haute */
        if (count <= 5) return new Response(null, { status: 200 });
        return new Response(null, { status: 404 });
      });
      const r = await autoDiscoverLinks.discover('half_alive_svc');
      expect(r.confidence).toBeGreaterThan(0);
    });
  });

  describe('discover() — cache', () => {
    it('cache hit → pas re-fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      const r1 = await autoDiscoverLinks.discover('cached_svc');
      const fetchCallsAfter1 = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      const r2 = await autoDiscoverLinks.discover('cached_svc');
      const fetchCallsAfter2 = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(r2.service).toBe(r1.service);
      /* 2eme appel doit utiliser cache → 0 fetch supplémentaire */
      expect(fetchCallsAfter2).toBe(fetchCallsAfter1);
    });

    it('cache force → re-fetch même si récent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('force_svc');
      const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      await autoDiscoverLinks.discover('force_svc', { force: true });
      const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(after).toBeGreaterThan(before);
    });

    it('cache stocke dans localStorage apex_v13_discovered_links', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('cache_svc');
      const raw = localStorage.getItem('apex_v13_discovered_links');
      expect(raw).toBeTruthy();
      const cache = JSON.parse(raw!) as Array<{ service: string }>;
      expect(cache.find((c) => c.service === 'cache_svc')).toBeDefined();
    });
  });

  describe('discoverAllStored() — batch', () => {
    it('batch tous services → retourne stats {total, new, verified}', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      const r = await autoDiscoverLinks.discoverAllStored();
      expect(r.total).toBeGreaterThan(0);
      expect(typeof r.new).toBe('number');
      expect(typeof r.verified).toBe('number');
    }, 30000);

    it('batch avec localStorage vide → utilise catalogue links-registry', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      const r = await autoDiscoverLinks.discoverAllStored();
      /* catalogue links-registry contient ~40+ services connus */
      expect(r.total).toBeGreaterThanOrEqual(20);
    }, 30000);
  });

  describe('findServiceFromIdentifier() — emails', () => {
    it('email gmail → google + accounts.google.com', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin.desarzens@gmail.com');
      expect(r.service).toBe('google');
      expect(r.loginUrl).toContain('accounts.google.com');
      expect(r.confidence).toBeGreaterThan(0.9);
    });

    it('email outlook → microsoft + login.live.com', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@outlook.com');
      expect(r.service).toBe('microsoft');
      expect(r.loginUrl).toContain('live.com');
    });

    it('email hotmail.fr → microsoft', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@hotmail.fr');
      expect(r.service).toBe('microsoft');
    });

    it('email icloud → apple', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@icloud.com');
      expect(r.service).toBe('apple');
      expect(r.loginUrl).toContain('icloud.com');
    });

    it('email proton.me → protonmail', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@proton.me');
      expect(r.service).toBe('protonmail');
    });

    it('email orange.fr → orange', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@orange.fr');
      expect(r.service).toBe('orange');
    });

    it('email custom domain → fallback URL générique', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('kevin@example-saas.io');
      expect(r.confidence).toBeLessThan(1);
      expect(r.loginUrl).toBeDefined();
    });
  });

  describe('findServiceFromIdentifier() — IBAN', () => {
    it('IBAN FR76 30003... → société générale', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('FR7630003012345678901234567');
      expect(r.service).toBe('societe_generale');
      expect(r.loginUrl).toContain('societegenerale');
    });

    it('IBAN FR76 30004... → BNP Paribas', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('FR7630004012345678901234567');
      expect(r.service).toBe('bnp_paribas');
    });

    it('IBAN FR76 avec espaces → trim et match', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('FR76 3000 3012 3456 7890 1234 567');
      expect(r.service).toBe('societe_generale');
    });

    it('IBAN MC (Monaco) → banque_monaco', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('MC5811222000010203040506K01');
      expect(r.service).toBe('banque_monaco');
    });

    it('IBAN FR avec code banque inconnu → unknown_bank_fr', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('FR7699999012345678901234567');
      expect(r.service).toBe('unknown_bank_fr');
    });
  });

  describe('findServiceFromIdentifier() — divers', () => {
    it('phone +377 → monaco_telecom', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('+33712345678'); /* français → pas reconnu */
      expect(r.confidence).toBe(0);
      const r2 = await autoDiscoverLinks.findServiceFromIdentifier('+37712345678');
      expect(r2.service).toBe('monaco_telecom');
    });

    it('URL → extrait domaine + lookup links-registry', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('https://console.anthropic.com/settings');
      expect(r.service).toBeDefined();
      expect(r.loginUrl).toBeDefined();
    });

    it('hint utilisateur prioritaire', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('whatever', 'github');
      expect(r.service).toBe('github');
      expect(r.confidence).toBe(0.9);
    });

    it('valeur vide → confidence 0', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('');
      expect(r.confidence).toBe(0);
    });

    it('lookup direct dans registry par nom service', async () => {
      const r = await autoDiscoverLinks.findServiceFromIdentifier('stripe');
      expect(r.service).toBe('stripe');
      expect(r.loginUrl).toContain('stripe');
    });
  });

  describe('generateLoginUrl()', () => {
    it('service connu → URL', () => {
      const url = autoDiscoverLinks.generateLoginUrl('github');
      expect(url).toBeTruthy();
      expect(url).toMatch(/^https?:\/\//);
    });

    it('service avec redirectTo → URL avec return_to encodé', () => {
      const url = autoDiscoverLinks.generateLoginUrl('github', { redirectTo: 'https://example.com/' });
      expect(url).toContain('return_to=');
      expect(url).toContain(encodeURIComponent('https://example.com/'));
    });

    it('service vide → null', () => {
      const url = autoDiscoverLinks.generateLoginUrl('');
      expect(url).toBeNull();
    });

    it('cached service utilise URL cached', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('cached_login');
      const url = autoDiscoverLinks.generateLoginUrl('cached_login');
      expect(url).toBeTruthy();
    });
  });

  describe('getCached()', () => {
    it('rien en cache → null', () => {
      expect(autoDiscoverLinks.getCached('non_existent')).toBeNull();
    });

    it('après discover → getCached retourne lien', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('cached_get');
      const cached = autoDiscoverLinks.getCached('cached_get');
      expect(cached).not.toBeNull();
      expect(cached?.service).toBe('cached_get');
    });

    it('normalize service name lookup', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('normalized');
      const cached = autoDiscoverLinks.getCached('  NORMALIZED  ');
      expect(cached?.service).toBe('normalized');
    });
  });

  describe('reVerifyAll()', () => {
    it('cache vide → tested=0', async () => {
      const r = await autoDiscoverLinks.reVerifyAll();
      expect(r.tested).toBe(0);
      expect(r.alive).toBe(0);
      expect(r.broken).toBe(0);
    });

    it('avec liens cached alive → re-test ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('reverify_ok');
      const r = await autoDiscoverLinks.reVerifyAll();
      expect(r.tested).toBeGreaterThan(0);
      expect(r.alive).toBeGreaterThan(0);
    });

    it('avec liens cached qui meurent → broken counter incrémente', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await autoDiscoverLinks.discover('reverify_die');
      /* Maintenant fetch fail */
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('dead'));
      const r = await autoDiscoverLinks.reVerifyAll();
      expect(r.broken).toBeGreaterThan(0);
    });
  });

  describe('Cache FIFO 200', () => {
    it('cap à 200 entrées (FIFO)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      /* Force overflow : 205 services */
      for (let i = 0; i < 205; i++) {
        await autoDiscoverLinks.discover(`bulk_svc_${i}`);
      }
      const raw = localStorage.getItem('apex_v13_discovered_links');
      expect(raw).toBeTruthy();
      const cache = JSON.parse(raw!) as unknown[];
      expect(cache.length).toBeLessThanOrEqual(200);
    }, 60000);
  });
});
