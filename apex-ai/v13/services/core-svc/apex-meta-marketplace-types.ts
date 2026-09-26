/**
 * APEX v13 — Meta marketplace public types (no runtime, breaks circular deps).
 *
 * Both `apex-meta-marketplace.ts` and `apex-meta-marketplace/*.ts` import
 * this file for shared type interfaces. By isolating the types here,
 * neither side has a runtime dependency on the other → no circular cycle.
 */

export type MarketplaceCategory =
  | 'ai-ml'
  | 'code-packages'
  | 'github'
  | 'extensions'
  | 'automation'
  | 'saas'
  | 'cloud'
  | 'apis'
  | 'datasets'
  | 'anthropic';

export type SearchMethod =
  | 'public-api' /* fetch direct, gratuit, pas d'auth */
  | 'oauth-api' /* requiert OAuth flow + token refresh */
  | 'api-key' /* requiert clé API stockée vault */
  | 'web-scrape' /* scrape HTML (fragile, à éviter si possible) */
  | 'static-list'; /* liste hardcodée (fallback) */

export interface MarketplaceProvider {
  /** Identifiant unique (kebab-case) */
  id: string;
  /** Nom officiel affiché */
  name: string;
  /** Catégorie principale */
  category: MarketplaceCategory;
  /** URL du site marketplace (browser direct) */
  url: string;
  /** Endpoint API si publique */
  api_endpoint?: string;
  /** Exige une clé API stockée vault */
  api_key_required: boolean;
  /** Nom de la clé dans le vault (ex: "ax_github_token") */
  api_key_service?: string;
  /** Méthode de search */
  search_method: SearchMethod;
  /** Tier gratuit disponible (sans payer) */
  free_tier_available: boolean;
  /** Limite de requêtes (ex: "60/h", "1000/jour") */
  rate_limit?: string;
  /** Apex peut search direct depuis le browser (CORS OK) */
  pwa_compatible: boolean;
  /** Le serveur autorise CORS depuis app web (Access-Control-Allow-Origin) */
  cors_friendly: boolean;
  /** Apex doit passer par un Cloudflare Worker proxy si pwa_compatible=false */
  search_proxy_required?: boolean;
  /** Description courte de ce qu'on trouve dedans */
  description: string;
}

export interface MarketplaceItem {
  /** Id natif marketplace (npm package name, hf model id, etc.) */
  id: string;
  /** Provider qui a renvoyé cet item */
  marketplace: string;
  /** Nom affichable */
  name: string;
  /** Description courte */
  description: string;
  /** URL canonique de l'item */
  url: string;
  /** Icône / logo (URL absolue) */
  icon_url?: string;
  /** Sous-catégorie / tag */
  category?: string;
  /** Étoiles GitHub / likes / upvotes */
  stars?: number;
  /** Téléchargements (par semaine ou total selon source) */
  downloads?: number;
  /** Prix si payant */
  price?: { amount: number; currency: string; period?: 'one-time' | 'monthly' | 'yearly' };
  /** Comment Apex peut utiliser/installer */
  install_method?: 'url' | 'cli' | 'oauth' | 'api-key' | 'manual' | 'fetch-mcp';
  /** Métadonnées brutes spécifiques au provider (transparence pour debug) */
  metadata?: Record<string, unknown>;
}

export interface SearchAllOptions {
  /** Filtre catégories de marketplaces (sinon tous PWA-compatible) */
  categories?: MarketplaceCategory[];
  /** Limite globale de résultats agrégés */
  limit?: number;
  /** Inclure marketplaces non-PWA (nécessite proxy / oauth — peut throw) */
  include_non_pwa?: boolean;
}

export interface InstallResult {
  ok: boolean;
  providerId: string;
  itemId: string;
  /** Méthode utilisée (url ouverte, cli copié, oauth flow lancé, etc.) */
  method?: string;
  /** Donnée renvoyée par l'install (URL ouverte, snippet copié, etc.) */
  result?: unknown;
  /** Instructions pour Kevin si action manuelle requise */
  instructions?: string;
  error?: string;
  /** Si requires api key → indique laquelle manque */
  requires_api_key?: string;
}

export interface MetaMarketplaceStats {
  /** Nombre total de marketplaces enregistrés */
  providers: number;
  /** Combien sont PWA-compatible (search direct OK) */
  pwa_compatible: number;
  /** Combien nécessitent une clé API */
  require_api_key: number;
  /** Combien ont une clé configurée dans le vault */
  api_keys_configured: number;
  /** Compteur installs depuis le boot */
  installs_total: number;
  /** Dernier install timestamp */
  last_install_ts: number;
  /** Répartition par catégorie */
  by_category: Record<MarketplaceCategory, number>;
}
