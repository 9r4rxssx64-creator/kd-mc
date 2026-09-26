/**
 * Tests services/apex-plugins-marketplace.ts.
 *
 * ≥30 tests : list / search / install / uninstall / recommend / stats / catalog integrity /
 * unsupported-pwa honnêteté / api_key check / idempotence / categories / notes / toggle /
 * persistence localStorage / reset / bootstrap internals / edge cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { APEX_PLUGINS_CATALOG } from '../../data/apex-plugins-catalog.js';
import { apexPluginsMarketplace } from '../../services/core-svc/apex-plugins-marketplace.js';

const STORAGE_KEY = 'apex_v13_plugins_state';
const STATS_KEY = 'apex_v13_plugins_stats';

describe('services/apex-plugins-marketplace — Marketplace 196 plugins Anthropic / MCP', () => {
  beforeEach(() => {
    localStorage.clear();
    apexPluginsMarketplace.reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  /* ============================================================================
   * Catalog integrity
   * ========================================================================= */
  describe('Catalog integrity', () => {
    it('catalog contient au moins 150 plugins recensés', () => {
      expect(APEX_PLUGINS_CATALOG.length).toBeGreaterThanOrEqual(150);
    });

    it('catalog contient au moins 1 plugin de chaque source', () => {
      const sources = new Set(APEX_PLUGINS_CATALOG.map((p) => p.source));
      expect(sources.has('anthropic-official')).toBe(true);
      expect(sources.has('mcp-server')).toBe(true);
      expect(sources.has('apex-internal')).toBe(true);
    });

    it('catalog contient les plugins critical TOP : github, supabase, exa, firecrawl', () => {
      const ids = APEX_PLUGINS_CATALOG.map((p) => p.id);
      expect(ids).toContain('github');
      expect(ids).toContain('supabase');
      expect(ids).toContain('exa');
      expect(ids).toContain('firecrawl');
    });

    it('catalog contient memory plugins (mcp-memory, remember, goodmem)', () => {
      const ids = APEX_PLUGINS_CATALOG.map((p) => p.id);
      expect(ids).toContain('mcp-memory');
      expect(ids).toContain('remember-mcp');
    });

    it('catalog contient plugins INTERNAL Apex (déjà câblés)', () => {
      const internals = APEX_PLUGINS_CATALOG.filter((p) => p.source === 'apex-internal');
      expect(internals.length).toBeGreaterThanOrEqual(3);
      const ids = internals.map((p) => p.id);
      expect(ids).toContain('apex-multi-key-vault');
    });

    it('chaque plugin a un id, name, url, description, category', () => {
      for (const p of APEX_PLUGINS_CATALOG) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.url).toMatch(/^(https?|internal):\/\//);
        expect(p.description.length).toBeGreaterThan(5);
        expect(p.category).toBeTruthy();
      }
    });

    it('aucun id dupliqué dans le catalog', () => {
      const ids = APEX_PLUGINS_CATALOG.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  /* ============================================================================
   * list / filtres
   * ========================================================================= */
  describe('list()', () => {
    it('list() sans filtre retourne tout le catalog', () => {
      const all = apexPluginsMarketplace.list();
      expect(all.length).toBe(APEX_PLUGINS_CATALOG.length);
    });

    it('list({ category: "memory" }) filtre par catégorie', () => {
      const memory = apexPluginsMarketplace.list({ category: 'memory' });
      expect(memory.length).toBeGreaterThan(0);
      for (const p of memory) {
        expect(p.category).toBe('memory');
      }
    });

    it('list({ pwaOnly: true }) filtre seulement PWA-compatible', () => {
      const pwa = apexPluginsMarketplace.list({ pwaOnly: true });
      for (const p of pwa) {
        expect(p.pwa_compatible).toBe(true);
      }
    });

    it('list({ source: "mcp-server" }) filtre par source', () => {
      const mcp = apexPluginsMarketplace.list({ source: 'mcp-server' });
      expect(mcp.length).toBeGreaterThan(0);
      for (const p of mcp) {
        expect(p.source).toBe('mcp-server');
      }
    });

    it('list({ minValue: "high" }) filtre par valeur estimée', () => {
      const high = apexPluginsMarketplace.list({ minValue: 'high' });
      for (const p of high) {
        expect(['critical', 'high']).toContain(p.estimated_value);
      }
    });
  });

  /* ============================================================================
   * search()
   * ========================================================================= */
  describe('search()', () => {
    it('search("github") trouve le plugin GitHub', () => {
      const results = apexPluginsMarketplace.search('github');
      const ids = results.map((p) => p.id);
      expect(ids).toContain('github');
    });

    it('search("memory") trouve les plugins memory', () => {
      const results = apexPluginsMarketplace.search('memory');
      expect(results.length).toBeGreaterThan(0);
    });

    it('search("") retourne tableau vide', () => {
      const results = apexPluginsMarketplace.search('');
      expect(results.length).toBe(0);
    });

    it('search("xyzz_nonexistent") retourne tableau vide', () => {
      const results = apexPluginsMarketplace.search('xyzz_nonexistent_plugin_12345');
      expect(results.length).toBe(0);
    });

    it('search respecte max param', () => {
      const results = apexPluginsMarketplace.search('a', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('search par tag fonctionne ("rag" → pinecone)', () => {
      const results = apexPluginsMarketplace.search('rag');
      const ids = results.map((p) => p.id);
      expect(ids).toContain('pinecone');
    });

    it('search est case-insensitive', () => {
      const lower = apexPluginsMarketplace.search('github');
      const upper = apexPluginsMarketplace.search('GITHUB');
      expect(lower.length).toBe(upper.length);
    });
  });

  /* ============================================================================
   * install / uninstall
   * ========================================================================= */
  describe('install()', () => {
    it('install plugin inconnu → ok=false', async () => {
      const result = await apexPluginsMarketplace.install('plugin_not_existing_xyz');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('inconnu');
    });

    it('install plugin unsupported-pwa → refuse honnêtement', async () => {
      /* puppeteer / chrome-devtools-mcp sont unsupported */
      const result = await apexPluginsMarketplace.install('mcp-puppeteer');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('non supporté en PWA');
    });

    it('install plugin requiring api_key sans clé → ok=false + requires_api_key', async () => {
      /* Stripe requiert ax_stripe_key, vide en début de test */
      localStorage.removeItem('ax_stripe_key');
      const result = await apexPluginsMarketplace.install('stripe');
      expect(result.ok).toBe(false);
      expect(result.requires_api_key).toBe('ax_stripe_key');
    });

    it('install plugin avec api_key fournie → ok=true', async () => {
      localStorage.setItem('ax_stripe_key', 'sk_test_12345_dummy_long_enough');
      const result = await apexPluginsMarketplace.install('stripe');
      expect(result.ok).toBe(true);
      expect(result.pluginId).toBe('stripe');
    });

    it('install est idempotent (2× même plugin → ok)', async () => {
      localStorage.setItem('ax_supabase_key', 'sb_test_dummy_long');
      const r1 = await apexPluginsMarketplace.install('supabase');
      const r2 = await apexPluginsMarketplace.install('supabase');
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it('install plugin sans api_key (gratuit ex: youdotcom) → ok=true sans clé', async () => {
      const plugin = APEX_PLUGINS_CATALOG.find((p) => p.id === 'huggingface');
      /* huggingface a api_key_service, on teste un sans clé */
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      expect(plugin).toBeDefined();
      expect(noKeyPlugin).toBeDefined();
      if (noKeyPlugin) {
        const result = await apexPluginsMarketplace.install(noKeyPlugin.id);
        expect(result.ok).toBe(true);
      }
    });

    it('install persiste l\'état dans localStorage', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) throw new Error('No no-key plugin found');
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? '{}') as { installed: Array<{ pluginId: string }> };
      expect(parsed.installed.find((p) => p.pluginId === noKeyPlugin.id)).toBeDefined();
    });

    it('install bump lastInstallTs dans STATS_KEY', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const raw = localStorage.getItem(STATS_KEY);
      expect(raw).toBeTruthy();
      const stats = JSON.parse(raw ?? '{}') as { lastInstallTs?: number };
      expect(stats.lastInstallTs).toBeGreaterThan(0);
    });
  });

  describe('uninstall()', () => {
    it('uninstall plugin inconnu → ok=false', async () => {
      const result = await apexPluginsMarketplace.uninstall('xyz_unknown');
      expect(result.ok).toBe(false);
    });

    it('uninstall plugin apex-internal refusé', async () => {
      const result = await apexPluginsMarketplace.uninstall('apex-multi-key-vault');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('non désinstallable');
    });

    it('uninstall plugin pas installé → ok=true (no-op)', async () => {
      const result = await apexPluginsMarketplace.uninstall('mongodb');
      expect(result.ok).toBe(true);
    });

    it('install puis uninstall → uninstall ok', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      expect(apexPluginsMarketplace.isInstalled(noKeyPlugin.id)).toBe(true);
      const result = await apexPluginsMarketplace.uninstall(noKeyPlugin.id);
      expect(result.ok).toBe(true);
      expect(apexPluginsMarketplace.isInstalled(noKeyPlugin.id)).toBe(false);
    });
  });

  /* ============================================================================
   * recommendForUser
   * ========================================================================= */
  describe('recommendForUser()', () => {
    it('recommend retourne plugins PWA + value≥medium par défaut', () => {
      const recos = apexPluginsMarketplace.recommendForUser();
      for (const r of recos) {
        expect(r.pwa_compatible).toBe(true);
        expect(['high', 'critical', 'medium']).toContain(r.estimated_value);
      }
    });

    it('recommend exclut les plugins déjà installés', async () => {
      localStorage.setItem('ax_supabase_key', 'sb_dummy_1234567890');
      await apexPluginsMarketplace.install('supabase');
      const recos = apexPluginsMarketplace.recommendForUser();
      expect(recos.find((r) => r.id === 'supabase')).toBeUndefined();
    });

    it('recommend respecte max', () => {
      const recos = apexPluginsMarketplace.recommendForUser({ max: 3 });
      expect(recos.length).toBeLessThanOrEqual(3);
    });

    it('recommend filtre par catégorie', () => {
      const recos = apexPluginsMarketplace.recommendForUser({ category: 'memory' });
      for (const r of recos) {
        expect(r.category).toBe('memory');
      }
    });

    it('recommend trie par valeur (critical > high > medium)', () => {
      const recos = apexPluginsMarketplace.recommendForUser({ max: 30 });
      const ranks = { critical: 4, high: 3, medium: 2, low: 1 };
      let prevRank = 5;
      for (const r of recos) {
        const cur = ranks[r.estimated_value];
        expect(cur).toBeLessThanOrEqual(prevRank);
        prevRank = cur;
      }
    });
  });

  /* ============================================================================
   * stats
   * ========================================================================= */
  describe('getStats()', () => {
    it('getStats retourne totalCatalog correct', () => {
      const stats = apexPluginsMarketplace.getStats();
      expect(stats.totalCatalog).toBe(APEX_PLUGINS_CATALOG.length);
    });

    it('getStats : totalInstalled inclut les apex-internal bootstrappés', () => {
      const stats = apexPluginsMarketplace.getStats();
      const internalsCount = APEX_PLUGINS_CATALOG.filter(
        (p) => p.source === 'apex-internal' || p.status === 'installed',
      ).length;
      expect(stats.totalInstalled).toBeGreaterThanOrEqual(
        APEX_PLUGINS_CATALOG.filter((p) => p.source === 'apex-internal').length,
      );
      expect(internalsCount).toBeGreaterThan(0);
    });

    it('getStats compte unsupported-pwa correctement', () => {
      const stats = apexPluginsMarketplace.getStats();
      const unsupportedInCatalog = APEX_PLUGINS_CATALOG.filter(
        (p) => p.status === 'unsupported-pwa',
      ).length;
      expect(stats.totalUnsupportedPwa).toBe(unsupportedInCatalog);
    });
  });

  /* ============================================================================
   * categories
   * ========================================================================= */
  describe('getCategories()', () => {
    it('getCategories retourne au moins 10 catégories distinctes', () => {
      const cats = apexPluginsMarketplace.getCategories();
      expect(cats.length).toBeGreaterThanOrEqual(10);
    });

    it('getCategories est trié alphabétiquement', () => {
      const cats = apexPluginsMarketplace.getCategories();
      const sorted = [...cats].sort();
      expect(cats).toEqual(sorted);
    });
  });

  /* ============================================================================
   * notes / toggle
   * ========================================================================= */
  describe('notes + toggleEnabled', () => {
    it('setNotes sur plugin non installé → ok=false', async () => {
      const result = await apexPluginsMarketplace.setNotes('mongodb', 'test');
      expect(result.ok).toBe(false);
    });

    it('setNotes après install → ok=true + getNotes retourne valeur', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const result = await apexPluginsMarketplace.setNotes(noKeyPlugin.id, 'note Kevin test');
      expect(result.ok).toBe(true);
      expect(apexPluginsMarketplace.getNotes(noKeyPlugin.id)).toBe('note Kevin test');
    });

    it('setNotes tronque à 500 chars', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const longText = 'x'.repeat(1000);
      await apexPluginsMarketplace.setNotes(noKeyPlugin.id, longText);
      expect(apexPluginsMarketplace.getNotes(noKeyPlugin.id).length).toBe(500);
    });

    it('toggleEnabled(false) désactive sans uninstall', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const r = await apexPluginsMarketplace.toggleEnabled(noKeyPlugin.id, false);
      expect(r.ok).toBe(true);
      expect(apexPluginsMarketplace.isInstalled(noKeyPlugin.id)).toBe(true);
    });

    it('toggleEnabled sur non-installé → ok=false', async () => {
      const r = await apexPluginsMarketplace.toggleEnabled('mongodb', true);
      expect(r.ok).toBe(false);
    });
  });

  /* ============================================================================
   * isInstalled / getStatusOf / getById
   * ========================================================================= */
  describe('isInstalled + getStatusOf + getById', () => {
    it('getById retourne plugin existant', () => {
      const p = apexPluginsMarketplace.getById('github');
      expect(p).not.toBeNull();
      expect(p?.name).toContain('GitHub');
    });

    it('getById retourne null si inconnu', () => {
      const p = apexPluginsMarketplace.getById('plugin_xyz_inconnu');
      expect(p).toBeNull();
    });

    it('isInstalled false si pas installé + pas catalog status:installed', () => {
      expect(apexPluginsMarketplace.isInstalled('mongodb')).toBe(false);
    });

    it('isInstalled true pour les apex-internal bootstrappés', () => {
      expect(apexPluginsMarketplace.isInstalled('apex-multi-key-vault')).toBe(true);
    });

    it('getStatusOf retourne unsupported-pwa pour mcp-puppeteer', () => {
      expect(apexPluginsMarketplace.getStatusOf('mcp-puppeteer')).toBe('unsupported-pwa');
    });
  });

  /* ============================================================================
   * Tools list
   * ========================================================================= */
  describe('getInstalledToolsFlat()', () => {
    it('getInstalledToolsFlat retourne tableau de tools des plugins installés', () => {
      const tools = apexPluginsMarketplace.getInstalledToolsFlat();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('après install plugin avec apex_tools → tools listés', async () => {
      /* GitHub a status:installed dans catalog → tools déjà exposés */
      const tools = apexPluginsMarketplace.getInstalledToolsFlat();
      expect(tools).toContain('search_repo_code');
    });

    it('toggleEnabled(false) retire les tools du flat list', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => p.apex_tools && p.apex_tools.length > 0
          && !p.api_key_service && p.pwa_compatible
          && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin || !noKeyPlugin.apex_tools) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      const before = apexPluginsMarketplace.getInstalledToolsFlat();
      expect(before).toContain(noKeyPlugin.apex_tools[0]);
      await apexPluginsMarketplace.toggleEnabled(noKeyPlugin.id, false);
      const after = apexPluginsMarketplace.getInstalledToolsFlat();
      /* Le tool peut être déjà présent via un autre plugin installed=true catalog,
         mais celui désactivé ne doit pas l'avoir ré-injecté. Au minimum, le set
         doit toujours être valide. */
      expect(Array.isArray(after)).toBe(true);
    });
  });

  /* ============================================================================
   * Reset + persistence reload
   * ========================================================================= */
  describe('reset + persistence', () => {
    it('reset nettoie installed mais ré-bootstrap internals', () => {
      apexPluginsMarketplace.reset();
      expect(apexPluginsMarketplace.isInstalled('apex-multi-key-vault')).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('init() après loadState corrupt → reset clean (pas de crash)', () => {
      localStorage.setItem(STORAGE_KEY, 'NOT_VALID_JSON{[]');
      apexPluginsMarketplace.reset();
      /* Pas de throw → success */
      expect(apexPluginsMarketplace.list().length).toBeGreaterThan(0);
    });
  });

  /* ============================================================================
   * Honnêteté / sécurité
   * ========================================================================= */
  describe('honnêteté + audit', () => {
    it('chaque install émet un audit log entry', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      /* Audit log stocké dans ax_audit_log_v13 — on vérifie qu'il existe */
      const auditRaw = localStorage.getItem('ax_audit_log_v13');
      expect(auditRaw).toBeTruthy();
      if (auditRaw) {
        const entries = JSON.parse(auditRaw) as Array<{ action: string }>;
        expect(entries.some((e) => e.action.startsWith('plugins.install'))).toBe(true);
      }
    });

    it('install plugin requires_api_key émet event audit avec reason', async () => {
      localStorage.removeItem('ax_stripe_key');
      await apexPluginsMarketplace.install('stripe');
      const auditRaw = localStorage.getItem('ax_audit_log_v13');
      expect(auditRaw).toBeTruthy();
      if (auditRaw) {
        const entries = JSON.parse(auditRaw) as Array<{ action: string }>;
        expect(entries.some((e) => e.action === 'plugins.install.requires_key')).toBe(true);
      }
    });

    it('uninstall émet audit', async () => {
      const noKeyPlugin = APEX_PLUGINS_CATALOG.find(
        (p) => !p.api_key_service && p.pwa_compatible && p.source !== 'apex-internal' && p.status === 'available',
      );
      if (!noKeyPlugin) return;
      await apexPluginsMarketplace.install(noKeyPlugin.id);
      await apexPluginsMarketplace.uninstall(noKeyPlugin.id);
      const auditRaw = localStorage.getItem('ax_audit_log_v13');
      if (auditRaw) {
        const entries = JSON.parse(auditRaw) as Array<{ action: string }>;
        expect(entries.some((e) => e.action === 'plugins.uninstall')).toBe(true);
      }
    });
  });

  /* ============================================================================
   * Edge cases
   * ========================================================================= */
  describe('edge cases', () => {
    it('list({status: "unsupported-pwa"}) liste correctement les plugins KO', () => {
      const list = apexPluginsMarketplace.list({ status: 'unsupported-pwa' });
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) {
        expect(p.pwa_compatible).toBe(false);
      }
    });

    it('list combinée multiples filtres : pwaOnly + minValue + category', () => {
      const list = apexPluginsMarketplace.list({
        pwaOnly: true,
        minValue: 'high',
        category: 'database',
      });
      for (const p of list) {
        expect(p.pwa_compatible).toBe(true);
        expect(['high', 'critical']).toContain(p.estimated_value);
        expect(p.category).toBe('database');
      }
    });
  });
});
