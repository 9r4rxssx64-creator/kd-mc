/**
 * APEX v13 — Méta-marketplace search handlers (per-provider).
 * Auto-split from services/apex-meta-marketplace.ts (refactor 2026-05-08).
 *
 * Chaque handler implémente le search d'un provider donné.
 * Les helpers (fetchJson, stripHtml, getApiKey) sont injectés via le 1er argument
 * pour éviter la dépendance directe à `this` du service.
 */

import { logger } from '../../core/logger.js';
import type { MarketplaceItem, MarketplaceProvider } from '../core-svc/apex-meta-marketplace-types.js';

export interface SearchHelpers {
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T | null>;
  stripHtml: (s: string) => string;
  getApiKey: (keyName: string | undefined) => string | null;
}

export async function searchHuggingFace(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${limit}&full=false`;
  const data = await h.fetchJson<Array<{ id: string; downloads?: number; likes?: number; pipeline_tag?: string }>>(url);
  return (data ?? []).map((m) => ({
    id: m.id,
    marketplace: 'huggingface',
    name: m.id,
    description: m.pipeline_tag ? `Task: ${m.pipeline_tag}` : 'Modèle HuggingFace',
    url: `https://huggingface.co/${m.id}`,
    ...(typeof m.likes === 'number' && { stars: m.likes }),
    ...(typeof m.downloads === 'number' && { downloads: m.downloads }),
    ...(m.pipeline_tag && { category: m.pipeline_tag }),
    install_method: 'url',
    metadata: m as unknown as Record<string, unknown>,
  }));
}

export async function searchHuggingFaceDatasets(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(query)}&limit=${limit}&full=false`;
  const data = await h.fetchJson<Array<{ id: string; downloads?: number; likes?: number }>>(url);
  return (data ?? []).map((d) => ({
    id: d.id,
    marketplace: 'huggingface-datasets',
    name: d.id,
    description: 'Dataset HuggingFace',
    url: `https://huggingface.co/datasets/${d.id}`,
    ...(typeof d.likes === 'number' && { stars: d.likes }),
    ...(typeof d.downloads === 'number' && { downloads: d.downloads }),
    install_method: 'url',
  }));
}

export async function searchReplicate(h: SearchHelpers, query: string, limit: number, provider: MarketplaceProvider): Promise<MarketplaceItem[]> {
  const token = h.getApiKey(provider.api_key_service);
  if (!token) return [];
  /* Replicate /v1/models : pas de search natif, on filtre côté client */
  const data = await h.fetchJson<{ results?: Array<{ owner: string; name: string; description?: string; visibility?: string }> }>(
    'https://api.replicate.com/v1/models',
    { headers: { Authorization: `Token ${token}` } },
  );
  const results = data?.results ?? [];
  const filtered = results
    .filter((m) => !query || `${m.owner}/${m.name} ${m.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);
  return filtered.map((m) => ({
    id: `${m.owner}/${m.name}`,
    marketplace: 'replicate',
    name: `${m.owner}/${m.name}`,
    description: m.description ?? 'Modèle Replicate',
    url: `https://replicate.com/${m.owner}/${m.name}`,
    install_method: 'api-key',
  }));
}

export async function searchOpenRouter(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const data = await h.fetchJson<{ data?: Array<{ id: string; name?: string; description?: string; pricing?: { prompt?: string } }> }>(
    'https://openrouter.ai/api/v1/models',
  );
  const results = data?.data ?? [];
  const filtered = results
    .filter((m) => !query || `${m.id} ${m.name ?? ''} ${m.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);
  return filtered.map((m) => ({
    id: m.id,
    marketplace: 'openrouter',
    name: m.name ?? m.id,
    description: m.description ?? 'LLM via OpenRouter',
    url: `https://openrouter.ai/models/${m.id}`,
    install_method: 'api-key',
    metadata: m as unknown as Record<string, unknown>,
  }));
}

export async function searchCivitai(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://civitai.com/api/v1/models?query=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await h.fetchJson<{ items?: Array<{ id: number; name: string; description?: string; type?: string; stats?: { downloadCount?: number; thumbsUpCount?: number } }> }>(url);
  return (data?.items ?? []).map((m) => ({
    id: String(m.id),
    marketplace: 'civitai',
    name: m.name,
    description: h.stripHtml(m.description ?? '') || `Modèle ${m.type ?? 'Civitai'}`,
    url: `https://civitai.com/models/${m.id}`,
    ...(m.type && { category: m.type }),
    ...(typeof m.stats?.thumbsUpCount === 'number' && { stars: m.stats.thumbsUpCount }),
    ...(typeof m.stats?.downloadCount === 'number' && { downloads: m.stats.downloadCount }),
    install_method: 'url',
  }));
}

export async function searchNpm(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query || 'a')}&size=${limit}`;
  const data = await h.fetchJson<{ objects?: Array<{ package: { name: string; description?: string; links?: { npm?: string }; version?: string } }> }>(url);
  return (data?.objects ?? []).map((o) => ({
    id: o.package.name,
    marketplace: 'npm',
    name: o.package.name,
    description: o.package.description ?? 'Package NPM',
    url: o.package.links?.npm ?? `https://www.npmjs.com/package/${o.package.name}`,
    install_method: 'cli',
    metadata: { version: o.package.version },
  }));
}

export async function searchCratesIo(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${limit}`;
  const data = await h.fetchJson<{ crates?: Array<{ id: string; name: string; description?: string; downloads?: number }> }>(url);
  return (data?.crates ?? []).map((c) => ({
    id: c.id,
    marketplace: 'crates-io',
    name: c.name,
    description: c.description ?? 'Crate Rust',
    url: `https://crates.io/crates/${c.name}`,
    ...(typeof c.downloads === 'number' && { downloads: c.downloads }),
    install_method: 'cli',
  }));
}

export async function searchMavenCentral(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&rows=${limit}&wt=json`;
  const data = await h.fetchJson<{ response?: { docs?: Array<{ id: string; g: string; a: string; latestVersion?: string }> } }>(url);
  return (data?.response?.docs ?? []).map((d) => ({
    id: d.id,
    marketplace: 'maven-central',
    name: `${d.g}:${d.a}`,
    description: `Maven artifact (latest: ${d.latestVersion ?? 'unknown'})`,
    url: `https://central.sonatype.com/artifact/${d.g}/${d.a}`,
    install_method: 'manual',
  }));
}

export async function searchPackagist(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://packagist.org/search.json?q=${encodeURIComponent(query)}&per_page=${limit}`;
  const data = await h.fetchJson<{ results?: Array<{ name: string; description?: string; url?: string; downloads?: number; favers?: number }> }>(url);
  return (data?.results ?? []).map((r) => ({
    id: r.name,
    marketplace: 'packagist',
    name: r.name,
    description: r.description ?? 'Package Composer',
    url: r.url ?? `https://packagist.org/packages/${r.name}`,
    ...(typeof r.favers === 'number' && { stars: r.favers }),
    ...(typeof r.downloads === 'number' && { downloads: r.downloads }),
    install_method: 'cli',
  }));
}

export async function searchRubyGems(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`;
  const data = await h.fetchJson<Array<{ name: string; info?: string; downloads?: number; project_uri?: string }>>(url);
  return (data ?? []).slice(0, limit).map((g) => ({
    id: g.name,
    marketplace: 'rubygems',
    name: g.name,
    description: g.info ?? 'Ruby gem',
    url: g.project_uri ?? `https://rubygems.org/gems/${g.name}`,
    ...(typeof g.downloads === 'number' && { downloads: g.downloads }),
    install_method: 'cli',
  }));
}

export async function searchHexPm(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://hex.pm/api/packages?search=${encodeURIComponent(query)}&sort=downloads`;
  const data = await h.fetchJson<Array<{ name: string; meta?: { description?: string }; downloads?: { all?: number }; html_url?: string }>>(url);
  return (data ?? []).slice(0, limit).map((p) => ({
    id: p.name,
    marketplace: 'hex-pm',
    name: p.name,
    description: p.meta?.description ?? 'Hex package',
    url: p.html_url ?? `https://hex.pm/packages/${p.name}`,
    ...(typeof p.downloads?.all === 'number' && { downloads: p.downloads.all }),
    install_method: 'cli',
  }));
}

export async function searchGitHub(h: SearchHelpers, query: string, limit: number, provider: MarketplaceProvider): Promise<MarketplaceItem[]> {
  const token = provider.api_key_required ? h.getApiKey(provider.api_key_service) : null;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const q = query || 'stars:>1000';
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${limit}&sort=stars`;
  const data = await h.fetchJson<{ items?: Array<{ full_name: string; description?: string; html_url: string; stargazers_count?: number; topics?: string[] }> }>(url, {
    headers,
  });
  return (data?.items ?? []).map((r) => ({
    id: r.full_name,
    marketplace: provider.id,
    name: r.full_name,
    description: r.description ?? 'GitHub repository',
    url: r.html_url,
    ...(typeof r.stargazers_count === 'number' && { stars: r.stargazers_count }),
    ...(r.topics && r.topics[0] && { category: r.topics[0] }),
    install_method: 'url',
  }));
}

export async function searchClaudePlugins(_h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  void _h; /* Param signature uniformisée avec autres handlers, pas utilisé ici */
  /* Délégation au catalogue interne 196 plugins (apex-plugins-marketplace.ts) */
  try {
    const mod = await import('../core-svc/apex-plugins-marketplace.js');
    const results = mod.apexPluginsMarketplace.search(query || '', limit);
    return results.map((p) => ({
      id: p.id,
      marketplace: 'claude-plugins',
      name: p.name,
      description: p.description,
      url: p.url ?? `https://claude.com/plugins/${p.id}`,
      category: p.category,
      install_method: 'manual',
      metadata: { source: p.source, value: p.estimated_value },
    }));
  } catch (e) {
    logger.warn('apex-meta-marketplace', 'searchClaudePlugins failed', e);
    return [];
  }
}

export async function searchJetBrains(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://plugins.jetbrains.com/api/searchPlugins?search=${encodeURIComponent(query)}&max=${limit}`;
  const data = await h.fetchJson<{ plugins?: Array<{ id: number; name: string; preview?: string; xmlId?: string; downloads?: number; rating?: number }> }>(url);
  return (data?.plugins ?? []).map((p) => ({
    id: p.xmlId ?? String(p.id),
    marketplace: 'jetbrains-marketplace',
    name: p.name,
    description: p.preview ?? 'JetBrains plugin',
    url: `https://plugins.jetbrains.com/plugin/${p.id}`,
    ...(typeof p.rating === 'number' && { stars: Math.round(p.rating * 100) }),
    ...(typeof p.downloads === 'number' && { downloads: p.downloads }),
    install_method: 'manual',
  }));
}

export async function searchFirefoxAddons(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://addons.mozilla.org/api/v5/addons/search/?q=${encodeURIComponent(query)}&page_size=${limit}`;
  const data = await h.fetchJson<{ results?: Array<{ slug: string; name: { 'en-US'?: string; fr?: string } | string; summary?: { 'en-US'?: string } | string; url: string; average_daily_users?: number; ratings?: { average?: number } }> }>(url);
  return (data?.results ?? []).map((a) => {
    const name = typeof a.name === 'string' ? a.name : (a.name?.fr ?? a.name?.['en-US'] ?? a.slug);
    const summary = typeof a.summary === 'string' ? a.summary : (a.summary?.['en-US'] ?? '');
    return {
      id: a.slug,
      marketplace: 'firefox-addons',
      name,
      description: summary || 'Firefox add-on',
      url: a.url,
      ...(typeof a.average_daily_users === 'number' && { downloads: a.average_daily_users }),
      ...(typeof a.ratings?.average === 'number' && { stars: Math.round(a.ratings.average * 100) }),
      install_method: 'url',
    };
  });
}

export async function searchAppleAppStore(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=software&limit=${limit}`;
  const data = await h.fetchJson<{ results?: Array<{ trackId: number; trackName: string; description?: string; trackViewUrl: string; price?: number; currency?: string; averageUserRating?: number; primaryGenreName?: string }> }>(url);
  return (data?.results ?? []).map((a) => ({
    id: String(a.trackId),
    marketplace: 'apple-app-store',
    name: a.trackName,
    description: (a.description ?? '').slice(0, 200),
    url: a.trackViewUrl,
    ...(a.primaryGenreName && { category: a.primaryGenreName }),
    ...(typeof a.averageUserRating === 'number' && { stars: Math.round(a.averageUserRating * 100) }),
    ...(typeof a.price === 'number' &&
      a.price > 0 &&
      a.currency && {
        price: { amount: a.price, currency: a.currency, period: 'one-time' as const },
      }),
    install_method: 'url',
  }));
}

export async function searchWordPressPlugins(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(query)}&request[per_page]=${limit}`;
  const data = await h.fetchJson<{ plugins?: Array<{ slug: string; name: string; short_description?: string; homepage?: string; active_installs?: number; rating?: number }> }>(url);
  return (data?.plugins ?? []).map((p) => ({
    id: p.slug,
    marketplace: 'wordpress-plugins',
    name: p.name,
    description: h.stripHtml(p.short_description ?? '') || 'Plugin WordPress',
    url: p.homepage ?? `https://wordpress.org/plugins/${p.slug}`,
    ...(typeof p.rating === 'number' && { stars: p.rating }),
    ...(typeof p.active_installs === 'number' && { downloads: p.active_installs }),
    install_method: 'manual',
  }));
}

export async function searchDockerHub(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=${limit}`;
  const data = await h.fetchJson<{ results?: Array<{ repo_name: string; short_description?: string; star_count?: number; pull_count?: number }> }>(url);
  return (data?.results ?? []).map((r) => ({
    id: r.repo_name,
    marketplace: 'docker-hub',
    name: r.repo_name,
    description: r.short_description ?? 'Docker image',
    url: `https://hub.docker.com/r/${r.repo_name}`,
    ...(typeof r.star_count === 'number' && { stars: r.star_count }),
    ...(typeof r.pull_count === 'number' && { downloads: r.pull_count }),
    install_method: 'cli',
  }));
}

export async function searchApisGuru(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const data = await h.fetchJson<Record<string, { versions?: Record<string, { info?: { title?: string; description?: string; 'x-providerName'?: string }; swaggerYamlUrl?: string }> }>>(
    'https://api.apis.guru/v2/list.json',
  );
  if (!data) return [];
  const items: MarketplaceItem[] = [];
  for (const [providerName, providerData] of Object.entries(data)) {
    const versions = providerData.versions ?? {};
    const firstVersionKey = Object.keys(versions)[0];
    if (!firstVersionKey) continue;
    const v = versions[firstVersionKey];
    if (!v) continue;
    const info = v.info ?? {};
    const title = info.title ?? providerName;
    const desc = info.description ?? '';
    if (
      !query ||
      title.toLowerCase().includes(query.toLowerCase()) ||
      desc.toLowerCase().includes(query.toLowerCase())
    ) {
      items.push({
        id: providerName,
        marketplace: 'apis-guru',
        name: title,
        description: desc.slice(0, 200) || `API ${providerName}`,
        url: v.swaggerYamlUrl ?? `https://apis.guru/browse-apis/`,
        install_method: 'manual',
      });
    }
    if (items.length >= limit) break;
  }
  return items;
}

export async function searchPublicApis(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = query ? `https://api.publicapis.org/entries?title=${encodeURIComponent(query)}` : 'https://api.publicapis.org/entries';
  const data = await h.fetchJson<{ entries?: Array<{ API: string; Description: string; Link: string; Category: string; Auth?: string; HTTPS?: boolean }> }>(url);
  return (data?.entries ?? []).slice(0, limit).map((e) => ({
    id: e.API,
    marketplace: 'public-apis',
    name: e.API,
    description: e.Description,
    url: e.Link,
    category: e.Category,
    install_method: 'manual',
    metadata: { auth: e.Auth, https: e.HTTPS },
  }));
}

export async function searchDataGouvFr(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(query)}&page_size=${limit}`;
  const data = await h.fetchJson<{ data?: Array<{ id: string; title: string; description?: string; page?: string; metrics?: { views?: number } }> }>(url);
  return (data?.data ?? []).map((d) => ({
    id: d.id,
    marketplace: 'data-gouv-fr',
    name: d.title,
    description: h.stripHtml(d.description ?? '').slice(0, 200) || 'Dataset open France',
    url: d.page ?? `https://www.data.gouv.fr/fr/datasets/${d.id}/`,
    ...(typeof d.metrics?.views === 'number' && { downloads: d.metrics.views }),
    install_method: 'url',
  }));
}

export async function searchDataEuropaEu(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  const url = `https://data.europa.eu/api/hub/search/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await h.fetchJson<{ result?: { results?: Array<{ id: string; title?: { en?: string } | string; description?: { en?: string } | string }> } }>(url);
  return (data?.result?.results ?? []).map((d) => {
    const title = typeof d.title === 'string' ? d.title : (d.title?.en ?? d.id);
    const desc = typeof d.description === 'string' ? d.description : (d.description?.en ?? '');
    return {
      id: d.id,
      marketplace: 'data-europa-eu',
      name: title,
      description: h.stripHtml(desc).slice(0, 200) || 'Dataset open EU',
      url: `https://data.europa.eu/data/datasets/${d.id}`,
      install_method: 'url',
    };
  });
}

export async function searchAnthropicCookbook(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  return searchGitHubContents(h, 'anthropics', 'anthropic-cookbook', query, limit, 'anthropic-cookbook');
}

export async function searchClaudeCodeSkills(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  return searchGitHubContents(h, 'anthropics', 'claude-code', query, limit, 'claude-code-skills');
}

export async function searchMcpServers(h: SearchHelpers, query: string, limit: number): Promise<MarketplaceItem[]> {
  return searchGitHubContents(h, 'modelcontextprotocol', 'servers', query, limit, 'mcp-servers');
}

/**
 * Helper : list GitHub repo contents (folders/files) avec filtre query.
 */
async function searchGitHubContents(h: SearchHelpers, 
  owner: string,
  repo: string,
  query: string,
  limit: number,
  marketplaceId: string,
): Promise<MarketplaceItem[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const data = await h.fetchJson<Array<{ name: string; path: string; type: string; html_url?: string }>>(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!data) return [];
  const filtered = data
    .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);
  return filtered.map((c) => ({
    id: c.path,
    marketplace: marketplaceId,
    name: c.name,
    description: `${c.type} dans ${owner}/${repo}`,
    url: c.html_url ?? `https://github.com/${owner}/${repo}/tree/main/${c.path}`,
    install_method: c.type === 'dir' ? 'fetch-mcp' : 'url',
  }));
}

/**
 * Wrapper fetch JSON avec timeout 8s + gestion CORS gracieuse.
 */
export async function fetchJsonShared<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      logger.debug('apex-meta-marketplace', `fetch ${url} → HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    logger.debug('apex-meta-marketplace', `fetch ${url} failed`, e);
    return null;
  }
}

/**
 * Strip HTML tags basiques (descriptions WordPress / Civitai).
 */
export function stripHtmlShared(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}


export function getApiKeyShared(keyName: string | undefined): string | null {
  if (!keyName) return null;
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(keyName);
  } catch {
    return null;
  }
}

/* ============================================================================
 * Map providerId → handler.
 * ============================================================================ */

export type SearchHandler = (
  h: SearchHelpers,
  query: string,
  limit: number,
  provider: MarketplaceProvider,
) => Promise<MarketplaceItem[]>;

export const SEARCH_HANDLERS: Record<string, SearchHandler> = {
  huggingface: (h, q, l) => searchHuggingFace(h, q, l),
  'huggingface-datasets': (h, q, l) => searchHuggingFaceDatasets(h, q, l),
  replicate: (h, q, l, p) => searchReplicate(h, q, l, p),
  openrouter: (h, q, l) => searchOpenRouter(h, q, l),
  civitai: (h, q, l) => searchCivitai(h, q, l),
  npm: (h, q, l) => searchNpm(h, q, l),
  'crates-io': (h, q, l) => searchCratesIo(h, q, l),
  'maven-central': (h, q, l) => searchMavenCentral(h, q, l),
  packagist: (h, q, l) => searchPackagist(h, q, l),
  rubygems: (h, q, l) => searchRubyGems(h, q, l),
  'hex-pm': (h, q, l) => searchHexPm(h, q, l),
  'github-marketplace': (h, q, l, p) => searchGitHub(h, q, l, p),
  'github-topics': (h, q, l, p) => searchGitHub(h, q, l, p),
  'claude-plugins': (h, q, l) => searchClaudePlugins(h, q, l),
  'jetbrains-marketplace': (h, q, l) => searchJetBrains(h, q, l),
  'firefox-addons': (h, q, l) => searchFirefoxAddons(h, q, l),
  'apple-app-store': (h, q, l) => searchAppleAppStore(h, q, l),
  'wordpress-plugins': (h, q, l) => searchWordPressPlugins(h, q, l),
  'docker-hub': (h, q, l) => searchDockerHub(h, q, l),
  'apis-guru': (h, q, l) => searchApisGuru(h, q, l),
  'public-apis': (h, q, l) => searchPublicApis(h, q, l),
  'data-gouv-fr': (h, q, l) => searchDataGouvFr(h, q, l),
  'data-europa-eu': (h, q, l) => searchDataEuropaEu(h, q, l),
  'anthropic-cookbook': (h, q, l) => searchAnthropicCookbook(h, q, l),
  'claude-code-skills': (h, q, l) => searchClaudeCodeSkills(h, q, l),
  'mcp-servers': (h, q, l) => searchMcpServers(h, q, l),
};
