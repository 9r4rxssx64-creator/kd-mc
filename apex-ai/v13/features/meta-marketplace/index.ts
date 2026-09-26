/**
 * APEX v13 — Feature Méta-Marketplace (vue admin / chat-tool).
 *
 * UI hub vers tous les marketplaces du monde — search unifié, filtres catégories,
 * stats globales, cards résultats, install-dispatch.
 *
 * Demande Kevin (2026-05-07) :
 * "Tous les marketplace disponibles pour qu'il aille chercher tout ce qui qu'il
 *  a besoin en toute autonomie et ou si je lui demande."
 *
 * UX :
 *  - Stats en tête (nb providers, PWA-compat, clés configurées).
 *  - Search bar live (Apex appelle searchAll en parallèle 30+ marketplaces).
 *  - Filtres catégorie cliquables (chips).
 *  - Cards résultats unifiées (icon, nom, description, stars, downloads, install btn).
 *  - Section "Recommandé pour Apex" en tête (recommendForApex).
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import {
  apexMetaMarketplace,
  type MarketplaceCategory,
  type MarketplaceItem,
  type MarketplaceProvider,
  META_MARKETPLACE_CATALOG,
} from '../../services/core-svc/apex-meta-marketplace.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeMetaScope: CleanupScope | null = null;

export function dispose(): void {
  activeMetaScope?.cleanup();
  activeMetaScope = null;
}

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  'ai-ml': '🤖 IA / ML',
  'code-packages': '📦 Code / Packages',
  github: '🐙 GitHub',
  extensions: '🔌 Extensions',
  automation: '⚙ Automation',
  saas: '💼 SaaS',
  cloud: '☁ Cloud',
  apis: '🌐 APIs',
  datasets: '📊 Datasets',
  anthropic: '✨ Anthropic',
};

function renderStatsHeader(): string {
  const stats = apexMetaMarketplace.getStats();
  return `
    <div class="meta-mkt-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;padding:12px;background:rgba(255,255,255,.04);border-radius:10px;">
      <div><div class="ax-gs-32">Marketplaces</div><div class="ax-gs-66">${stats.providers}</div></div>
      <div><div class="ax-gs-32">PWA-compatible</div><div style="font-size:1.5em;font-weight:600;color:#22cc77">${stats.pwa_compatible}</div></div>
      <div><div class="ax-gs-32">Clés API requises</div><div class="ax-gs-66">${stats.require_api_key}</div></div>
      <div><div class="ax-gs-32">Clés configurées</div><div style="font-size:1.5em;font-weight:600;color:#f0c020">${stats.api_keys_configured}/${stats.require_api_key}</div></div>
      <div><div class="ax-gs-32">Installs total</div><div class="ax-gs-66">${stats.installs_total}</div></div>
    </div>
  `;
}

function renderCategoryChips(active: MarketplaceCategory | null): string {
  const cats: MarketplaceCategory[] = [
    'ai-ml',
    'code-packages',
    'github',
    'extensions',
    'automation',
    'saas',
    'cloud',
    'apis',
    'datasets',
    'anthropic',
  ];
  return `
    <div class="meta-mkt-cats" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <button data-meta-mkt-cat="" style="padding:6px 12px;border-radius:16px;border:1px solid #444;background:${active === null ? '#2a2a4a' : 'transparent'};color:#fff;cursor:pointer;font-size:.9em;">Tous</button>
      ${cats
        .map(
          (c) => `
        <button data-meta-mkt-cat="${c}" style="padding:6px 12px;border-radius:16px;border:1px solid #444;background:${active === c ? '#2a2a4a' : 'transparent'};color:#fff;cursor:pointer;font-size:.9em;">${CATEGORY_LABELS[c]}</button>
      `,
        )
        .join('')}
    </div>
  `;
}

function renderProviderBadge(provider: MarketplaceProvider): string {
  const pwaIcon = provider.pwa_compatible ? '🟢' : '🔴';
  const keyIcon = provider.api_key_required ? '🔑' : '';
  return `<span style="opacity:.7;font-size:.8em" title="${provider.pwa_compatible ? 'PWA-compatible (search direct)' : 'Proxy/OAuth requis'}">${pwaIcon} ${provider.name} ${keyIcon}</span>`;
}

function renderItemCard(item: MarketplaceItem): string {
  const provider = apexMetaMarketplace.getProvider(item.marketplace);
  const stars = typeof item.stars === 'number' ? `⭐ ${item.stars.toLocaleString('fr')}` : '';
  const downloads = typeof item.downloads === 'number' ? `⬇ ${item.downloads.toLocaleString('fr')}` : '';
  const price = item.price ? `💰 ${item.price.amount} ${item.price.currency}` : '';
  return `
    <div class="meta-mkt-card" style="padding:12px;border:1px solid #333;border-radius:8px;background:rgba(255,255,255,.03);">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
        <div class="ax-gs-6">
          <div style="font-weight:600;font-size:1em;word-break:break-word">${escapeHtml(item.name)}</div>
          ${provider ? `<div style="margin-top:2px">${renderProviderBadge(provider)}</div>` : ''}
        </div>
        <button data-meta-mkt-install="${escapeHtml(item.marketplace)}|${escapeHtml(item.id)}" style="padding:6px 10px;border-radius:6px;border:1px solid #22cc77;background:rgba(34,204,119,.1);color:#22cc77;cursor:pointer;font-size:.85em;flex-shrink:0">Installer</button>
      </div>
      <div style="margin-top:6px;opacity:.85;font-size:.85em;line-height:1.4">${escapeHtml(item.description.slice(0, 200))}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;font-size:.8em;opacity:.75">
        ${stars} ${downloads} ${price}
        ${item.category ? `<span class="ax-gs-139">#${escapeHtml(item.category)}</span>` : ''}
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" style="color:#6cf">Ouvrir →</a>
      </div>
    </div>
  `;
}

function renderProvidersList(category: MarketplaceCategory | null): string {
  const filter: { category?: MarketplaceCategory } = {};
  if (category) filter.category = category;
  const providers = apexMetaMarketplace.listProviders(filter);
  return `
    <div class="meta-mkt-providers" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:16px;">
      ${providers
        .map(
          (p) => `
        <div style="padding:8px 10px;background:rgba(255,255,255,.03);border-radius:6px;border:1px solid #2a2a2a">
          <div style="font-weight:600;font-size:.9em">${p.pwa_compatible ? '🟢' : '🔴'} ${escapeHtml(p.name)}</div>
          <div style="opacity:.7;font-size:.75em;margin-top:2px">${escapeHtml(p.description.slice(0, 80))}</div>
          ${p.api_key_required ? `<div style="font-size:.7em;color:#f0c020;margin-top:2px">🔑 ${escapeHtml(p.api_key_service ?? 'clé requise')}</div>` : ''}
        </div>
      `,
        )
        .join('')}
    </div>
  `;
}

function renderResults(items: MarketplaceItem[]): string {
  if (items.length === 0) {
    return '<div class="ax-gs-140">Aucun résultat. Essaie une autre query ou catégorie.</div>';
  }
  return `
    <div class="meta-mkt-results" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
      ${items.map(renderItemCard).join('')}
    </div>
  `;
}

interface RenderState {
  category: MarketplaceCategory | null;
  query: string;
  loading: boolean;
  results: MarketplaceItem[];
}

const state: RenderState = {
  category: null,
  query: '',
  loading: false,
  results: [],
};

function renderShell(): string {
  return `
    <div class="meta-mkt-feature" style="padding:16px;color:#fff;font-family:system-ui,-apple-system,sans-serif">
      <h2 style="margin:0 0 8px 0">🌐 Méta-Marketplace Apex</h2>
      <div style="opacity:.7;margin-bottom:12px;font-size:.9em">
        Search unifié dans <strong>${META_MARKETPLACE_CATALOG.length}+ marketplaces</strong> du monde — IA, code, GitHub, plugins, automation, SaaS, cloud, APIs, datasets, anthropic.
      </div>
      ${renderStatsHeader()}
      <div class="ax-gs-67">
        <input id="meta-mkt-search" type="search" aria-label="Recherche dans les marketplaces" placeholder="Cherche dans 30+ marketplaces (ex: stable diffusion, react, postgres)..." value="${escapeHtml(state.query)}" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid #444;background:#1a1a2a;color:#fff;font-size:1em">
        <button id="meta-mkt-search-btn" style="padding:10px 16px;border-radius:8px;border:1px solid #6cf;background:rgba(102,204,255,.1);color:#6cf;cursor:pointer">Search</button>
      </div>
      ${renderCategoryChips(state.category)}
      <div id="meta-mkt-content">
        ${state.loading ? '<div class="ax-gs-140">⏳ Recherche en parallèle...</div>' : state.results.length > 0 ? renderResults(state.results) : renderProvidersList(state.category)}
      </div>
    </div>
  `;
}

async function performSearch(query: string, category: MarketplaceCategory | null): Promise<void> {
  state.loading = true;
  state.query = query;
  state.category = category;
  state.results = [];
  rerender();
  try {
    const opts: { categories?: MarketplaceCategory[]; limit?: number } = { limit: 50 };
    if (category) opts.categories = [category];
    const items = await apexMetaMarketplace.searchAll(query, opts);
    state.results = items;
  } catch (e) {
    logger.warn('meta-marketplace-feature', 'searchAll failed', e);
  } finally {
    state.loading = false;
    rerender();
  }
}

let mountEl: HTMLElement | null = null;

function rerender(): void {
  if (!mountEl) return;
  mountEl.innerHTML = renderShell();
  attachHandlers();
}

function attachHandlers(): void {
  if (!mountEl) return;
  /* P1-6 : scope listeners pour anti-leak SPA navigation */
  activeMetaScope?.cleanup();
  activeMetaScope = createCleanupScope('meta-marketplace');

  const searchInput = mountEl.querySelector<HTMLInputElement>('#meta-mkt-search');
  const searchBtn = mountEl.querySelector<HTMLButtonElement>('#meta-mkt-search-btn');
  if (searchInput) {
    activeMetaScope!.bind(searchInput, 'keydown', (ev) => {
      if (ev.key === 'Enter') {
        void performSearch(searchInput.value, state.category);
      }
    });
  }
  if (searchBtn) {
    activeMetaScope!.bind(searchBtn, 'click', () => {
      const q = searchInput?.value ?? '';
      void performSearch(q, state.category);
    });
  }

  /* Catégories chips */
  mountEl.querySelectorAll<HTMLButtonElement>('[data-meta-mkt-cat]').forEach((btn) => {
    activeMetaScope!.bind(btn, 'click', () => {
      const cat = btn.dataset['metaMktCat'] ?? '';
      const newCat = cat ? (cat as MarketplaceCategory) : null;
      if (state.query) {
        void performSearch(state.query, newCat);
      } else {
        state.category = newCat;
        rerender();
      }
    });
  });

  /* Install buttons */
  mountEl.querySelectorAll<HTMLButtonElement>('[data-meta-mkt-install]').forEach((btn) => {
    activeMetaScope!.bind(btn, 'click', async () => {
      const raw = btn.dataset['metaMktInstall'] ?? '';
      const [providerId, ...rest] = raw.split('|');
      const itemId = rest.join('|');
      if (!providerId || !itemId) return;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const result = await apexMetaMarketplace.install(providerId, itemId);
        if (result.ok) {
          btn.textContent = '✅ Installé';
          btn.style.background = 'rgba(34,204,119,.25)';
          if (result.instructions) {
            logger.info('meta-marketplace-feature', `Install ${providerId}/${itemId}: ${result.instructions}`);
          }
        } else {
          btn.textContent = '❌ Échec';
          btn.style.background = 'rgba(255,91,91,.25)';
          if (result.requires_api_key) {
            logger.warn('meta-marketplace-feature', `Clé API manquante: ${result.requires_api_key}`);
          }
        }
      } catch (e) {
        btn.textContent = '❌ Erreur';
        logger.warn('meta-marketplace-feature', 'install failed', e);
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Installer';
          btn.style.background = 'rgba(34,204,119,.1)';
        }, 3000);
      }
    });
  });
}

/**
 * Monte la feature Méta-Marketplace dans un élément cible (admin tab, modal, etc.).
 */
export function mountMetaMarketplace(target: HTMLElement): { unmount: () => void } {
  mountEl = target;
  apexMetaMarketplace.init();
  rerender();
  return {
    unmount: (): void => {
      mountEl = null;
      target.innerHTML = '';
    },
  };
}

/**
 * v13.4.239 — Export `render` standard pour compat router (RouteLoader attend
 * `render`). Wrappe mountMetaMarketplace. Câblage route `marketplace`.
 */
export function render(root: HTMLElement): void {
  mountMetaMarketplace(root);
}

/**
 * Réinitialise l'état (utile pour tests).
 */
export function resetMetaMarketplaceFeature(): void {
  state.category = null;
  state.query = '';
  state.loading = false;
  state.results = [];
  mountEl = null;
}
