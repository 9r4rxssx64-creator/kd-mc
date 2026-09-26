/**
 * APEX v13 — Marketplace Plugins (Anthropic + MCP + community + apex-internal).
 *
 * Demande Kevin (2026-05-04, ABSOLUE) :
 * "https://claude.com/plugins — Va chercher installe tout ce que apex a besoin
 *  sur cette page et dans les autres pages, récupère tous les outils. Tous les plug,
 *  tout ce qui est intéressant et susceptibles d'améliorer les performances d'apex.
 *  Ne te contente pas de un ou deux va plus loin. Prends tout même pour l'avenir,
 *  vois plus loin toujours au maximum pour apex."
 *
 * Mission :
 *  - Recense 196 plugins (cf. data/apex-plugins-catalog.ts)
 *  - Permet : list / search / install / uninstall / recommend
 *  - HONNÊTETÉ stricte : pwa_compatible filtré + status `unsupported-pwa` exposé
 *  - Audit log immutable à chaque install (RGPD + traçabilité)
 *  - Persistance localStorage `apex_v13_plugins_state`
 *
 * Anti-pattern Kevin :
 *  - Pas de promesse vide (un plugin "installé" qui ne marche pas)
 *  - Pas d'install sans clé API si requise → return error explicite
 *  - Pas de doublon (install idempotent)
 *
 * Règle Kevin "PROTECTION ≠ STABILITÉ" + "Apex doit savoir ses pleines capacités" :
 *  - Tous les plugins exposés via system prompt enrichi (Apex IA sait qu'ils existent)
 *  - Tools registry étendu après install (apex-tools.ts vérifie `marketplace.isInstalled`)
 */

import { logger } from '../../core/logger.js';
import {
  APEX_PLUGINS_CATALOG,
  type ApexPluginManifest,
  type PluginCategory,
  type PluginStatus,
  type PluginSource,
} from '../../data/apex-plugins-catalog.js';
import { auditLog } from '../observability/audit-log.js';

const STORAGE_KEY = 'apex_v13_plugins_state';
const STATS_KEY = 'apex_v13_plugins_stats';

/**
 * État persisté d'un plugin côté utilisateur (par-instance Apex Kevin).
 */
export interface ApexPluginInstalled {
  pluginId: string;
  installedAt: number;
  /** Tools effectivement enregistrés (peut différer du catalog si install partielle) */
  toolsAdded: string[];
  /** Notes utilisateur (Kevin peut tagger en favori, ajouter rappel...) */
  notes?: string;
  /** Désactivé temporairement (toggle ON/OFF Kevin règle 2026-05-04) */
  disabled?: boolean;
}

export interface MarketplaceStats {
  totalCatalog: number;
  totalInstalled: number;
  totalAvailable: number;
  totalUnsupportedPwa: number;
  totalPlanned: number;
  installsByCategory: Record<string, number>;
  lastInstallTs: number;
  lastUninstallTs: number;
}

export interface InstallResult {
  ok: boolean;
  pluginId: string;
  toolsAdded?: string[];
  error?: string;
  /** Si requires_api_key → vault key manquant côté user */
  requires_api_key?: string;
}

export interface RecommendOptions {
  /** Filtre min value (default 'medium') */
  minValue?: 'critical' | 'high' | 'medium' | 'low';
  /** Filtre catégorie ciblée */
  category?: PluginCategory;
  /** Max résultats */
  max?: number;
}

class ApexPluginsMarketplace {
  /* État runtime — synced avec localStorage */
  private installed = new Map<string, ApexPluginInstalled>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.loadState();
  }

  /**
   * Charge état depuis localStorage. Fail-safe : si parse error → reset.
   */
  private loadState(): void {
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) {
        this.bootstrapInternalsAsInstalled();
        return;
      }
      const parsed = JSON.parse(raw) as { installed: ApexPluginInstalled[] };
      this.installed.clear();
      for (const item of parsed.installed) {
        this.installed.set(item.pluginId, item);
      }
      this.bootstrapInternalsAsInstalled();
    } catch (err: unknown) {
      logger.warn('apex-plugins-marketplace', `loadState parse failed: ${err instanceof Error ? err.message : String(err)}`);
      this.installed.clear();
      this.bootstrapInternalsAsInstalled();
    }
  }

  /**
   * Force tous les plugins source `apex-internal` (status = 'installed' dans catalog) à être considérés installés.
   * Idempotent : ne ré-install pas si déjà présent.
   */
  private bootstrapInternalsAsInstalled(): void {
    const internals = APEX_PLUGINS_CATALOG.filter(
      (p) => p.source === 'apex-internal' && p.status === 'installed',
    );
    for (const p of internals) {
      if (!this.installed.has(p.id)) {
        this.installed.set(p.id, {
          pluginId: p.id,
          installedAt: Date.now(),
          toolsAdded: p.apex_tools ?? [],
        });
      }
    }
    /* Catalogue déclare également GitHub / Cloudflare / Firebase / Fetch comme "installed" :
       ce sont des plugins déjà câblés natifs Apex (auth tokens vault). On ne rajoute pas en
       runtime localStorage — on les expose tels quels via getStatusOf(). */
  }

  /**
   * Persiste état dans localStorage.
   * Fail silently si quota dépassé (Apex CleanUp tournera ensuite).
   */
  private saveState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = { installed: Array.from(this.installed.values()) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota — ignore (axAggressiveCleanup gère) */
    }
  }

  /* === Lecture publique === */

  /**
   * Liste tous les plugins du catalog (filtre optionnel par catégorie / status / source).
   */
  list(filter?: {
    category?: PluginCategory;
    status?: PluginStatus;
    source?: PluginSource;
    pwaOnly?: boolean;
    minValue?: ApexPluginManifest['estimated_value'];
  }): ApexPluginManifest[] {
    if (!this.initialized) this.init();
    const VALUE_RANK: Record<ApexPluginManifest['estimated_value'], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    const minRank = filter?.minValue ? VALUE_RANK[filter.minValue] : 0;
    return APEX_PLUGINS_CATALOG.filter((p) => {
      if (filter?.category && p.category !== filter.category) return false;
      if (filter?.status && this.getStatusOf(p.id) !== filter.status) return false;
      if (filter?.source && p.source !== filter.source) return false;
      if (filter?.pwaOnly && !p.pwa_compatible) return false;
      if (minRank > 0 && VALUE_RANK[p.estimated_value] < minRank) return false;
      return true;
    });
  }

  /**
   * Trouve un plugin par ID.
   */
  getById(id: string): ApexPluginManifest | null {
    if (!this.initialized) this.init();
    return APEX_PLUGINS_CATALOG.find((p) => p.id === id) ?? null;
  }

  /**
   * Statut courant du plugin :
   *  - "installed" : présent dans `installed` map OU déclaré status:'installed' catalog
   *  - "available" : pwa_compatible + statut catalog 'available'
   *  - "unsupported-pwa" : status catalog
   *  - "planned" : status catalog
   */
  getStatusOf(pluginId: string): PluginStatus {
    if (!this.initialized) this.init();
    const plugin = this.getById(pluginId);
    if (!plugin) return 'available';
    if (this.installed.has(pluginId)) return 'installed';
    return plugin.status;
  }

  /**
   * Vérifie si un plugin est installé.
   */
  isInstalled(pluginId: string): boolean {
    if (!this.initialized) this.init();
    if (this.installed.has(pluginId)) return true;
    /* Catalog peut le marker installed (ex: github, cloudflare, firebase câblés natifs) */
    const plugin = this.getById(pluginId);
    return plugin?.status === 'installed';
  }

  /**
   * Recherche fuzzy par nom/description/tags.
   * Score :
   *  - exact match name : 100
   *  - prefix match name : 50
   *  - substring name : 30
   *  - substring description : 15
   *  - tag match : 20
   *  - category match : 10
   */
  search(query: string, max = 30): ApexPluginManifest[] {
    if (!this.initialized) this.init();
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    type Scored = { plugin: ApexPluginManifest; score: number };
    const scored: Scored[] = [];
    for (const p of APEX_PLUGINS_CATALOG) {
      let score = 0;
      const name = p.name.toLowerCase();
      const id = p.id.toLowerCase();
      const desc = p.description.toLowerCase();
      const cat = p.category.toLowerCase();

      if (name === q || id === q) score += 100;
      else if (name.startsWith(q) || id.startsWith(q)) score += 50;
      else if (name.includes(q) || id.includes(q)) score += 30;
      if (desc.includes(q)) score += 15;
      for (const tag of p.tags ?? []) {
        if (tag.toLowerCase().includes(q)) score += 20;
      }
      if (cat.includes(q)) score += 10;
      if (score > 0) scored.push({ plugin: p, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map((s) => s.plugin);
  }

  /**
   * Recommandations selon profil Kevin (admin, productivité élevée, PWA-first).
   * Logic v1 :
   *  - Filtre pwa_compatible (Apex est browser-first)
   *  - Estimated_value ≥ minValue (default 'medium')
   *  - Pas déjà installé
   *  - Tri par valeur estimée (critical → high → medium)
   */
  recommendForUser(options: RecommendOptions = {}): ApexPluginManifest[] {
    if (!this.initialized) this.init();
    const minValue = options.minValue ?? 'medium';
    const max = options.max ?? 20;
    const VALUE_RANK: Record<ApexPluginManifest['estimated_value'], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    const minRank = VALUE_RANK[minValue];
    const candidates = APEX_PLUGINS_CATALOG.filter((p) => {
      if (!p.pwa_compatible) return false;
      if (VALUE_RANK[p.estimated_value] < minRank) return false;
      if (this.isInstalled(p.id)) return false;
      if (options.category && p.category !== options.category) return false;
      return true;
    });
    candidates.sort((a, b) => VALUE_RANK[b.estimated_value] - VALUE_RANK[a.estimated_value]);
    return candidates.slice(0, max);
  }

  /**
   * Statistiques globales marketplace.
   */
  getStats(): MarketplaceStats {
    if (!this.initialized) this.init();
    const totalCatalog = APEX_PLUGINS_CATALOG.length;
    let totalInstalled = 0;
    let totalAvailable = 0;
    let totalUnsupportedPwa = 0;
    let totalPlanned = 0;
    const installsByCategory: Record<string, number> = {};
    for (const p of APEX_PLUGINS_CATALOG) {
      const status = this.getStatusOf(p.id);
      if (status === 'installed') {
        totalInstalled += 1;
        installsByCategory[p.category] = (installsByCategory[p.category] ?? 0) + 1;
      } else if (status === 'available') {
        totalAvailable += 1;
      } else if (status === 'unsupported-pwa') {
        totalUnsupportedPwa += 1;
      } else if (status === 'planned') {
        totalPlanned += 1;
      }
    }
    /* Lecture stats persistées (lastInstallTs / lastUninstallTs) */
    let lastInstallTs = 0;
    let lastUninstallTs = 0;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STATS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { lastInstallTs?: number; lastUninstallTs?: number };
          lastInstallTs = parsed.lastInstallTs ?? 0;
          lastUninstallTs = parsed.lastUninstallTs ?? 0;
        }
      } catch {
        /* ignore */
      }
    }
    return {
      totalCatalog,
      totalInstalled,
      totalAvailable,
      totalUnsupportedPwa,
      totalPlanned,
      installsByCategory,
      lastInstallTs,
      lastUninstallTs,
    };
  }

  private bumpStat(field: 'lastInstallTs' | 'lastUninstallTs'): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const stats: { lastInstallTs?: number; lastUninstallTs?: number } = raw
        ? (JSON.parse(raw) as { lastInstallTs?: number; lastUninstallTs?: number })
        : {};
      stats[field] = Date.now();
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      /* ignore */
    }
  }

  /* === Mutations install/uninstall === */

  /**
   * Installe un plugin. Vérifie pré-conditions :
   *  - Plugin existe dans catalog
   *  - Si pwa_compatible=false → return ok:false avec error explicite
   *  - Si requires api_key et clé absente → return error requires_api_key
   *  - Idempotent : si déjà installé → ok:true sans-op
   *
   * Audit log obligatoire (Kevin règle traçabilité immutable).
   */
  async install(pluginId: string): Promise<InstallResult> {
    if (!this.initialized) this.init();
    const plugin = this.getById(pluginId);
    if (!plugin) {
      await auditLog.record('plugins.install.failed', {
        details: { pluginId, reason: 'not-found' },
      });
      return { ok: false, pluginId, error: 'Plugin inconnu dans le catalogue' };
    }

    /* Idempotence */
    if (this.isInstalled(pluginId)) {
      logger.info('apex-plugins-marketplace', `Plugin déjà installé: ${pluginId}`);
      return { ok: true, pluginId, toolsAdded: plugin.apex_tools ?? [] };
    }

    /* Honnêteté PWA — on REFUSE d'installer les unsupported-pwa */
    if (plugin.status === 'unsupported-pwa' || !plugin.pwa_compatible) {
      await auditLog.record('plugins.install.failed', {
        details: { pluginId, reason: 'unsupported-pwa' },
      });
      return {
        ok: false,
        pluginId,
        error: `Plugin "${plugin.name}" non supporté en PWA browser. Nécessite app native ou Cloudflare Worker.`,
      };
    }

    /* Vérification clé API si requise */
    if (plugin.api_key_service) {
      const hasKey = this.checkVaultHasKey(plugin.api_key_service);
      if (!hasKey) {
        await auditLog.record('plugins.install.requires_key', {
          details: { pluginId, requires: plugin.api_key_service },
        });
        return {
          ok: false,
          pluginId,
          error: `Clé API requise dans le Coffre : ${plugin.api_key_service}`,
          requires_api_key: plugin.api_key_service,
        };
      }
    }

    /* Install effectif (registre runtime + persist) */
    const entry: ApexPluginInstalled = {
      pluginId,
      installedAt: Date.now(),
      toolsAdded: plugin.apex_tools ?? [],
    };
    this.installed.set(pluginId, entry);
    this.saveState();
    this.bumpStat('lastInstallTs');

    await auditLog.record('plugins.install.success', {
      details: {
        pluginId,
        name: plugin.name,
        category: plugin.category,
        tools: entry.toolsAdded,
      },
    });
    logger.info('apex-plugins-marketplace', `Installed plugin: ${pluginId} (${plugin.name})`);
    return { ok: true, pluginId, toolsAdded: entry.toolsAdded };
  }

  /**
   * Désinstalle un plugin (sauf source 'apex-internal' qui ne peut pas être désinstallé).
   */
  async uninstall(pluginId: string): Promise<InstallResult> {
    if (!this.initialized) this.init();
    const plugin = this.getById(pluginId);
    if (!plugin) return { ok: false, pluginId, error: 'Plugin inconnu' };
    if (plugin.source === 'apex-internal') {
      return { ok: false, pluginId, error: 'Plugin interne non désinstallable' };
    }
    if (!this.installed.has(pluginId)) {
      return { ok: true, pluginId };
    }
    this.installed.delete(pluginId);
    this.saveState();
    this.bumpStat('lastUninstallTs');
    await auditLog.record('plugins.uninstall', {
      details: { pluginId, name: plugin.name },
    });
    logger.info('apex-plugins-marketplace', `Uninstalled plugin: ${pluginId}`);
    return { ok: true, pluginId };
  }

  /**
   * Active / désactive un plugin sans le désinstaller (toggle ON/OFF Kevin règle 2026-05-04).
   */
  async toggleEnabled(pluginId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    if (!this.initialized) this.init();
    const entry = this.installed.get(pluginId);
    if (!entry) return { ok: false, error: 'Plugin non installé' };
    entry.disabled = !enabled;
    this.installed.set(pluginId, entry);
    this.saveState();
    await auditLog.record('plugins.toggle', {
      details: { pluginId, enabled },
    });
    return { ok: true };
  }

  /**
   * Vérifie si une clé API existe dans le multi-key vault.
   * Implémentation safe : pas d'import circulaire, juste check localStorage.
   * (Le vrai vault MultiKeyVault stocke chiffré avec préfixe `ax_` dans localStorage.)
   */
  private checkVaultHasKey(keyName: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const v = localStorage.getItem(keyName);
      return Boolean(v && v.length > 5);
    } catch {
      return false;
    }
  }

  /**
   * Reset complet (dev / tests uniquement). Vide installed + stats.
   */
  reset(): void {
    this.installed.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STATS_KEY);
      } catch {
        /* ignore */
      }
    }
    this.bootstrapInternalsAsInstalled();
  }

  /**
   * Liste les notes utilisateur pour un plugin installé.
   */
  getNotes(pluginId: string): string {
    if (!this.initialized) this.init();
    return this.installed.get(pluginId)?.notes ?? '';
  }

  /**
   * Met à jour les notes d'un plugin installé.
   */
  async setNotes(pluginId: string, notes: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.initialized) this.init();
    const entry = this.installed.get(pluginId);
    if (!entry) return { ok: false, error: 'Plugin non installé' };
    entry.notes = notes.slice(0, 500);
    this.installed.set(pluginId, entry);
    this.saveState();
    return { ok: true };
  }

  /**
   * Liste catégories distinctes (utile pour UI filter).
   */
  getCategories(): PluginCategory[] {
    const set = new Set<PluginCategory>();
    for (const p of APEX_PLUGINS_CATALOG) set.add(p.category);
    return Array.from(set).sort();
  }

  /**
   * Format Anthropic-tools : pour chaque plugin installé qui expose des `apex_tools`,
   * retourne la liste des tools IDs effectivement disponibles dans le system prompt.
   * Utilisé par apex-tools.ts pour étendre dynamiquement le registry.
   */
  getInstalledToolsFlat(): string[] {
    if (!this.initialized) this.init();
    const out = new Set<string>();
    for (const entry of this.installed.values()) {
      if (entry.disabled) continue;
      for (const tool of entry.toolsAdded) out.add(tool);
    }
    /* Aussi les status:'installed' catalog (github/cloudflare/firebase) */
    for (const p of APEX_PLUGINS_CATALOG) {
      if (p.status === 'installed' && p.apex_tools) {
        for (const tool of p.apex_tools) out.add(tool);
      }
    }
    return Array.from(out).sort();
  }
}

export const apexPluginsMarketplace = new ApexPluginsMarketplace();
