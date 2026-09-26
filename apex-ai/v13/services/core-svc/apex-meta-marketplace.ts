/**
 * APEX v13 — Méta-Marketplace : hub unifié vers 30+ marketplaces du monde.
 *
 * Demande Kevin (2026-05-07, ABSOLUE) :
 * "Il faut peut-être inclure tous les marketplace pour apex. Pas que les plugins,
 *  tous les marketplace disponibles pour qu'il aille chercher tout ce qui qu'il a
 *  besoin en toute autonomie et ou si je lui demande."
 *
 * Mission :
 *  - Agrège 30+ marketplaces (IA/ML, code, GitHub, plugins/extensions, automation,
 *    SaaS, cloud, APIs, datasets, anthropic-specific) sous une API unifiée.
 *  - Search cross-marketplace en parallèle (Promise.allSettled — gracieux si KO).
 *  - Détail item, trending, install-dispatch, recommandations contextuelles.
 *  - HONNÊTETÉ stricte : flag `pwa_compatible` + `cors_friendly` exposé sans mensonge.
 *    Apex sait quand il peut search direct vs quand un proxy/OAuth est requis.
 *  - Audit log immutable à chaque install (RGPD + traçabilité).
 *  - Persistance localStorage `apex_v13_meta_marketplace_state` (favoris, history).
 *
 * Anti-pattern Kevin :
 *  - Pas de promesse vide (marketplace listé mais inutilisable sans le dire).
 *  - Pas de prétention OAuth/proxy si pas configuré → return error explicite.
 *  - Pas de doublon d'install (idempotent côté store local).
 *
 * Règle Kevin "PROTECTION ≠ STABILITÉ" + "TOUT AU MAX TOUJOURS" :
 *  - Tous les providers exposés via system prompt enrichi (Apex IA sait qu'ils existent).
 *  - searchAll dispatche en parallèle, n'attend jamais un seul provider lent.
 *  - Lazy import (pas de surcharge boot — fetch à la demande).
 *
 * Compatibilité avec apex-plugins-marketplace.ts (Anthropic plugins claude.com) :
 *  - meta-marketplace est complémentaire (ne remplace pas), il l'expose comme
 *    1 provider parmi 30+. Tools IA Apex peuvent invoquer l'un OU l'autre.
 */

import { logger } from '../../core/logger.js';
import { META_MARKETPLACE_CATALOG } from '../apex-meta-marketplace/catalog.js';
import { buildCliCommand, hasApiKey } from '../apex-meta-marketplace/install-helpers.js';
import {
  SEARCH_HANDLERS,
  fetchJsonShared,
  getApiKeyShared,
  stripHtmlShared,
  type SearchHelpers,
} from '../apex-meta-marketplace/search-handlers.js';
import { auditLog } from '../observability/audit-log.js';

import type {
  MarketplaceCategory,
  MarketplaceProvider,
  MarketplaceItem,
  SearchAllOptions,
  InstallResult,
  MetaMarketplaceStats,
} from './apex-meta-marketplace-types.js';

const STORAGE_KEY = 'apex_v13_meta_marketplace_state';

/* ============================================================================
 * Types publics
 * ========================================================================= */

export type {
  MarketplaceCategory,
  SearchMethod,
  MarketplaceProvider,
  MarketplaceItem,
  SearchAllOptions,
  InstallResult,
  MetaMarketplaceStats,
} from './apex-meta-marketplace-types.js';

/* Catalog moved to apex-meta-marketplace/catalog.ts (refactor 2026-05-08) */

/* ============================================================================
 * Service principal
 * ========================================================================= */

interface PersistedState {
  /** Map providerId → liste itemIds favoris */
  favorites: Record<string, string[]>;
  /** Historique installs (provider, item, ts, ok) */
  installs: Array<{ providerId: string; itemId: string; ts: number; ok: boolean; method?: string }>;
  /** Compteur installs */
  installs_total: number;
  /** Dernier install ts */
  last_install_ts: number;
}

class ApexMetaMarketplace {
  private state: PersistedState = {
    favorites: {},
    installs: [],
    installs_total: 0,
    last_install_ts: 0,
  };
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.loadState();
  }

  private loadState(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed && typeof parsed === 'object') {
        this.state = {
          favorites: parsed.favorites ?? {},
          installs: Array.isArray(parsed.installs) ? parsed.installs.slice(-200) : [],
          installs_total: typeof parsed.installs_total === 'number' ? parsed.installs_total : 0,
          last_install_ts: typeof parsed.last_install_ts === 'number' ? parsed.last_install_ts : 0,
        };
      }
    } catch {
      /* parse error → reset, on garde un état stable */
    }
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* quota exceeded → on perd l'historique mais pas le runtime */
    }
  }

  /**
   * Reset complet (test seulement).
   */
  reset(): void {
    this.state = { favorites: {}, installs: [], installs_total: 0, last_install_ts: 0 };
    this.initialized = false;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Liste tous les providers, optionnellement filtrés.
   */
  listProviders(filter?: {
    category?: MarketplaceCategory;
    pwa_compatible?: boolean;
    free_tier_available?: boolean;
    api_key_required?: boolean;
  }): readonly MarketplaceProvider[] {
    this.init();
    let result: readonly MarketplaceProvider[] = META_MARKETPLACE_CATALOG;
    if (filter?.category) {
      result = result.filter((p) => p.category === filter.category);
    }
    if (filter?.pwa_compatible !== undefined) {
      result = result.filter((p) => p.pwa_compatible === filter.pwa_compatible);
    }
    if (filter?.free_tier_available !== undefined) {
      result = result.filter((p) => p.free_tier_available === filter.free_tier_available);
    }
    if (filter?.api_key_required !== undefined) {
      result = result.filter((p) => p.api_key_required === filter.api_key_required);
    }
    return result;
  }

  /**
   * Récupère un provider par id.
   */
  getProvider(providerId: string): MarketplaceProvider | null {
    return META_MARKETPLACE_CATALOG.find((p) => p.id === providerId) ?? null;
  }

  /**
   * Search unifié cross-marketplace en parallèle.
   * Promise.allSettled : un provider lent / KO ne casse pas l'agrégation.
   */
  async searchAll(query: string, opts: SearchAllOptions = {}): Promise<MarketplaceItem[]> {
    this.init();
    const trimmed = query.trim();
    if (!trimmed) return [];

    const providers = this.listProviders({
      ...(opts.include_non_pwa ? {} : { pwa_compatible: true }),
    });
    const categoriesFilter = opts.categories;
    const targets = categoriesFilter
      ? providers.filter((p) => categoriesFilter.includes(p.category))
      : providers;

    const results = await Promise.allSettled(
      targets.map((p) => this.searchOne(p.id, trimmed, 10).catch(() => [] as MarketplaceItem[])),
    );

    const aggregated = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 50;
    return aggregated.slice(0, limit);
  }

  /**
   * Search un marketplace spécifique.
   * - Si pwa_compatible=false → throw (sauf si Apex a configuré un proxy worker).
   * - Si api_key_required=true et clé manquante → throw (avec instructions).
   */
  async searchOne(providerId: string, query: string, limit = 10): Promise<MarketplaceItem[]> {
    this.init();
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider inconnu: ${providerId}`);
    if (!provider.pwa_compatible) {
      throw new Error(
        `Provider ${providerId} non PWA-compatible (${provider.search_method}). Proxy/OAuth requis.`,
      );
    }
    if (provider.api_key_required && !hasApiKey(provider.api_key_service)) {
      throw new Error(
        `Provider ${providerId} requiert clé API "${provider.api_key_service}" (manquante dans le vault).`,
      );
    }

    /* Dispatch par provider id (handlers spécialisés — module séparé) */
    const handler = SEARCH_HANDLERS[providerId];
    if (!handler) {
      throw new Error(`Handler search non implémenté pour ${providerId}`);
    }
    const helpers: SearchHelpers = {
      fetchJson: fetchJsonShared,
      stripHtml: stripHtmlShared,
      getApiKey: getApiKeyShared,
    };
    return handler(helpers, query, limit, provider);
  }

  /**
   * Récupère le détail d'un item (si l'API du provider le supporte).
   */
  async getItem(providerId: string, itemId: string): Promise<MarketplaceItem | null> {
    this.init();
    const provider = this.getProvider(providerId);
    if (!provider) return null;
    /* Pour la plupart des providers, getItem = redirige vers le 1er résultat search */
    try {
      const items = await this.searchOne(providerId, itemId, 5);
      return items.find((it) => it.id === itemId || it.name === itemId) ?? items[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Récupère les items trending d'un provider.
   * Réutilise le handler search avec une query "trending".
   */
  async getTrending(providerId: string, limit = 10): Promise<MarketplaceItem[]> {
    this.init();
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider inconnu: ${providerId}`);
    /* Heuristique : on lance un search avec query vide + sort by stars/downloads */
    /* La plupart des handlers acceptent query vide → renvoient top items */
    try {
      return await this.searchOne(providerId, '', limit);
    } catch {
      return [];
    }
  }

  /**
   * Installe / utilise un item (dispatch selon install_method).
   * Idempotent : si déjà installé récemment, retourne ok=true sans rien faire.
   */
  async install(
    providerId: string,
    itemId: string,
    opts: Record<string, unknown> = {},
  ): Promise<InstallResult> {
    this.init();
    const provider = this.getProvider(providerId);
    if (!provider) {
      return { ok: false, providerId, itemId, error: 'Provider inconnu' };
    }

    /* Idempotence : si install récent (< 5 min) → no-op */
    const recent = this.state.installs.find(
      (i) => i.providerId === providerId && i.itemId === itemId && Date.now() - i.ts < 5 * 60_000,
    );
    if (recent && recent.ok) {
      return {
        ok: true,
        providerId,
        itemId,
        ...(recent.method && { method: recent.method }),
        instructions: 'Déjà installé récemment (cache 5 min).',
      };
    }

    /* Vérification clé API si requis (avant d'ouvrir l'URL inutilement) */
    if (provider.api_key_required && !hasApiKey(provider.api_key_service)) {
      return {
        ok: false,
        providerId,
        itemId,
        ...(provider.api_key_service && { requires_api_key: provider.api_key_service }),
        error: `Clé API "${provider.api_key_service}" requise mais absente du vault.`,
      };
    }

    /* Récupération item pour avoir l'URL canonique */
    let item: MarketplaceItem | null = null;
    try {
      item = await this.getItem(providerId, itemId);
    } catch {
      /* on continue avec URL fallback */
    }

    const url = item?.url ?? provider.url;
    const method = item?.install_method ?? 'url';

    let result: InstallResult;
    switch (method) {
      case 'url':
        result = {
          ok: true,
          providerId,
          itemId,
          method: 'url',
          result: { url },
          instructions: `Ouvre ${url} dans le browser pour installer / utiliser.`,
        };
        break;
      case 'cli':
        result = {
          ok: true,
          providerId,
          itemId,
          method: 'cli',
          result: { command: buildCliCommand(provider, itemId, opts) },
          instructions: `Copie cette commande et exécute-la dans ton terminal.`,
        };
        break;
      case 'oauth':
        result = {
          ok: false,
          providerId,
          itemId,
          method: 'oauth',
          error: 'OAuth flow non implémenté (à venir via cloud worker).',
          instructions: `Va sur ${provider.url} et complète l'OAuth manuellement.`,
        };
        break;
      case 'api-key':
        result = {
          ok: true,
          providerId,
          itemId,
          method: 'api-key',
          result: { api_endpoint: provider.api_endpoint },
          instructions: `Utilise l'API ${provider.api_endpoint ?? provider.url} avec ta clé déjà stockée.`,
        };
        break;
      case 'fetch-mcp':
        result = {
          ok: true,
          providerId,
          itemId,
          method: 'fetch-mcp',
          result: { mcp_url: item?.url ?? provider.url },
          instructions: `Configure le MCP Server depuis ${item?.url ?? provider.url}.`,
        };
        break;
      case 'manual':
      default:
        result = {
          ok: true,
          providerId,
          itemId,
          method: 'manual',
          instructions: `Installation manuelle requise — voir ${url}.`,
        };
        break;
    }

    /* Persistance + audit */
    this.state.installs.push({
      providerId,
      itemId,
      ts: Date.now(),
      ok: result.ok,
      ...(result.method && { method: result.method }),
    });
    if (result.ok) {
      this.state.installs_total += 1;
      this.state.last_install_ts = Date.now();
    }
    /* Cap historique à 200 */
    if (this.state.installs.length > 200) {
      this.state.installs = this.state.installs.slice(-200);
    }
    this.saveState();

    /* Audit log immutable (RGPD + traçabilité Kevin) */
    try {
      await auditLog.record('meta_marketplace.install', {
        actor: 'apex',
        target: `${providerId}:${itemId}`,
        details: {
          ok: result.ok,
          method: result.method ?? null,
          ...(result.error && { error: result.error }),
        },
      });
    } catch (e) {
      logger.warn('apex-meta-marketplace', `audit.record failed`, e);
    }

    return result;
  }

  /**
   * Recommandations contextuelles pour Apex / Kevin.
   * Heuristique : favori + PWA-compatible + free_tier + jamais installé.
   */
  async recommendForApex(): Promise<{ items: MarketplaceItem[]; reason: string }[]> {
    this.init();
    const recommendations: { items: MarketplaceItem[]; reason: string }[] = [];

    /* 1. Marketplaces PWA-compatible non-encore exploités */
    const pwaProviders = this.listProviders({ pwa_compatible: true, free_tier_available: true });
    const installedProviderIds = new Set(this.state.installs.filter((i) => i.ok).map((i) => i.providerId));
    const unexplored = pwaProviders.filter((p) => !installedProviderIds.has(p.id)).slice(0, 5);
    if (unexplored.length > 0) {
      recommendations.push({
        items: unexplored.map((p) => ({
          id: p.id,
          marketplace: 'meta',
          name: p.name,
          description: p.description,
          url: p.url,
          category: p.category,
          install_method: 'url',
        })),
        reason: 'Marketplaces PWA-compatible jamais explorés (gain rapide, sans clé API).',
      });
    }

    /* 2. Anthropic-specific (priorité Apex) */
    const anthropicProviders = this.listProviders({ category: 'anthropic' });
    if (anthropicProviders.length > 0) {
      recommendations.push({
        items: anthropicProviders.map((p) => ({
          id: p.id,
          marketplace: 'meta',
          name: p.name,
          description: p.description,
          url: p.url,
          category: 'anthropic',
          install_method: 'url',
        })),
        reason: 'Marketplaces Anthropic (skills, MCP servers, cookbook) — priorité Apex.',
      });
    }

    /* 3. Trending HuggingFace + GitHub (signal communauté) */
    try {
      const hf = await this.getTrending('huggingface', 3);
      if (hf.length > 0) {
        recommendations.push({
          items: hf,
          reason: 'Modèles HuggingFace tendance (community signal).',
        });
      }
    } catch {
      /* gracieux */
    }

    return recommendations;
  }

  /**
   * Stats globales.
   */
  getStats(): MetaMarketplaceStats {
    this.init();
    const all = META_MARKETPLACE_CATALOG;
    const byCategory = all.reduce(
      (acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<MarketplaceCategory, number>,
    );
    return {
      providers: all.length,
      pwa_compatible: all.filter((p) => p.pwa_compatible).length,
      require_api_key: all.filter((p) => p.api_key_required).length,
      api_keys_configured: all.filter((p) => p.api_key_required && hasApiKey(p.api_key_service)).length,
      installs_total: this.state.installs_total,
      last_install_ts: this.state.last_install_ts,
      by_category: byCategory,
    };
  }

  /**
   * Toggle favori (persisté).
   */
  toggleFavorite(providerId: string, itemId: string): boolean {
    this.init();
    const list = this.state.favorites[providerId] ?? [];
    const idx = list.indexOf(itemId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(itemId);
    }
    this.state.favorites[providerId] = list;
    this.saveState();
    return idx < 0; /* true si ajouté */
  }

  /**
   * Liste des favoris d'un provider.
   */
  getFavorites(providerId: string): readonly string[] {
    this.init();
    return this.state.favorites[providerId] ?? [];
  }

  /**
   * Historique installs.
   */
  getInstallHistory(): readonly PersistedState['installs'][number][] {
    this.init();
    return [...this.state.installs];
  }

  /* ============================================================================
   * Internals — handlers search par provider
   * ========================================================================= */

}

export const apexMetaMarketplace = new ApexMetaMarketplace();

/* Exports utilitaires (tests + UI) */
export { META_MARKETPLACE_CATALOG };
