/**
 * APEX v13 — Feature Browser premium (multi-tab, bookmarks, history, AI search)
 *
 * Refonte complète Kevin v13.0.20 (2026-05-04) — niveau Arc Browser / Brave.
 *
 * Capabilities :
 *  A) UI moderne : top bar URL + nav buttons / tabs bar / sidebar / bottom toolbar
 *  B) Multi-tab system avec restore localStorage + FIFO 20 tabs max
 *  C) Bookmarks (star toggle, search, tags, favicon)
 *  D) History (max 500 entries, full-text search, clear 1-clic)
 *  E) Anti-CORS / X-Frame-Options bypass (cache web archive → reader.jina.ai → google cache → safari)
 *  F) AI search bar : "?question..." → call apex IA
 *  G) Reader mode via reader.jina.ai
 *  H) Apex overlay flottant (mic, chat, copy URL, screenshot, fullscreen)
 *  I) Sécurité : iframe sandbox + blocklist domaines + logs nav perso (pas tracking)
 *
 * Anti-patterns évités :
 *  - escapeHtml partout (anti-XSS)
 *  - Pas d'innerHTML brut sur user content (URL, titre, tags)
 *  - Per-user logique pas critique (browser perso, données locales)
 *  - Validation URL stricte avant navigation (SSRF/javascript: scheme bloqué)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { isFeatureEnabled, renderDisabledNotice } from '../../services/auth/feature-toggles.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
/* v13.4.344 (leçon #108/#116 — doublon feature/service) : source unique.
 * buildArchiveUrl/buildReaderUrl vivaient à l'identique ici ET dans browser-controller
 * (le commentaire "cohérent avec features/browser" y annonçait le risque de dérive).
 * On importe depuis le service (bon sens de dépendance, pas de cycle) + on ré-exporte
 * pour préserver l'API publique du feature. */
import { buildArchiveUrl, buildReaderUrl } from '../../services/integrations/browser-controller.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeBrowserScope: CleanupScope | null = null;

export function dispose(): void {
  activeBrowserScope?.cleanup();
  activeBrowserScope = null;
}

/* ============================================================
   Types
   ============================================================ */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  ts_opened: number;
  ts_last_active: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  favicon: string;
  tags: readonly string[];
  ts_created: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  ts_visited: number;
}

export type FallbackMethod = 'direct' | 'archive' | 'reader' | 'gcache' | 'safari';

export interface NavigateResult {
  url: string;
  method: FallbackMethod;
  blocked: boolean;
}

export interface ReaderStats {
  title: string;
  paragraphs: readonly string[];
  wordCount: number;
  readingTimeMin: number;
  toc: readonly { level: 1 | 2 | 3; text: string }[];
}

export interface IframeBlockedDetection {
  blocked: boolean;
  reason: 'cross-origin' | 'no-content' | 'load-error' | 'ok';
}

/* ============================================================
   Storage keys + caps
   ============================================================ */

const STORAGE_TABS = 'apex_v13_browser_tabs';
const STORAGE_BOOKMARKS = 'apex_v13_bookmarks';
const STORAGE_HISTORY = 'apex_v13_browser_history';
const STORAGE_LAST_URL = 'apex_v13_browser_last_url';
const STORAGE_ACTIVE_TAB = 'apex_v13_browser_active_tab';

const MAX_TABS = 20;
const MAX_HISTORY = 500;
const MAX_BOOKMARKS = 1000;

/* ============================================================
   Domains blocklist (basique — extensible)
   Source : DNS Cloudflare 1.1.1.2 family + listes publiques
   Garde en local, doublé d'une heuristique URL à l'usage.
   ============================================================ */

const BLOCKED_KEYWORDS: readonly string[] = [
  'porn',
  'xxx',
  'malware',
  'phishing',
  'pirate',
  'casino-xxx',
];

/* ============================================================
   Helpers
   ============================================================ */

export function isValidUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  /* Anti-XSS scheme */
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isBlockedUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return BLOCKED_KEYWORDS.some((kw) => lower.includes(kw));
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

/* ============================================================
   Tabs store
   ============================================================ */

class TabsStore {
  load(): BrowserTab[] {
    try {
      const raw = localStorage.getItem(STORAGE_TABS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValidTab);
    } catch (err) {
      logger.warn('browser.tabs', 'load failed', { err });
      return [];
    }
  }

  private isValidTab(t: unknown): t is BrowserTab {
    if (!t || typeof t !== 'object') return false;
    const o = t as Record<string, unknown>;
    return (
      typeof o['id'] === 'string'
      && typeof o['url'] === 'string'
      && typeof o['title'] === 'string'
      && typeof o['ts_opened'] === 'number'
      && typeof o['ts_last_active'] === 'number'
    );
  }

  save(tabs: readonly BrowserTab[]): boolean {
    try {
      localStorage.setItem(STORAGE_TABS, JSON.stringify(tabs));
      return true;
    } catch (err) {
      logger.warn('browser.tabs', 'save failed (quota?)', { err });
      return false;
    }
  }

  add(url: string, title?: string): BrowserTab | null {
    if (!isValidUrl(url)) return null;
    const normalized = normalizeUrl(url);
    if (isBlockedUrl(normalized)) return null;
    const tabs = this.load();
    const tab: BrowserTab = {
      id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      title: (title ?? extractDomain(normalized) ?? normalized).slice(0, 200),
      ts_opened: Date.now(),
      ts_last_active: Date.now(),
    };
    tabs.push(tab);
    /* FIFO : si > MAX_TABS, retirer le plus ancien (par ts_last_active) */
    if (tabs.length > MAX_TABS) {
      tabs.sort((a, b) => a.ts_last_active - b.ts_last_active);
      tabs.shift();
    }
    if (!this.save(tabs)) return null;
    return tab;
  }

  close(id: string): boolean {
    const tabs = this.load().filter((t) => t.id !== id);
    return this.save(tabs);
  }

  update(id: string, patch: Partial<Pick<BrowserTab, 'url' | 'title' | 'ts_last_active'>>): boolean {
    const tabs = this.load();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const existing = tabs[idx];
    if (!existing) return false;
    tabs[idx] = {
      ...existing,
      ...(patch.url !== undefined && isValidUrl(patch.url) && { url: normalizeUrl(patch.url) }),
      ...(patch.title !== undefined && { title: patch.title.slice(0, 200) }),
      ts_last_active: patch.ts_last_active ?? Date.now(),
    };
    return this.save(tabs);
  }

  reorder(ids: readonly string[]): boolean {
    const tabs = this.load();
    const map = new Map(tabs.map((t) => [t.id, t]));
    const reordered: BrowserTab[] = [];
    for (const id of ids) {
      const tab = map.get(id);
      if (tab) reordered.push(tab);
    }
    /* Conserver les non-listés à la fin */
    for (const t of tabs) {
      if (!ids.includes(t.id)) reordered.push(t);
    }
    return this.save(reordered);
  }

  getActive(): string | null {
    return localStorage.getItem(STORAGE_ACTIVE_TAB);
  }

  setActive(id: string): void {
    if (id) localStorage.setItem(STORAGE_ACTIVE_TAB, id);
  }

  count(): number {
    return this.load().length;
  }

  clear(): boolean {
    try {
      localStorage.removeItem(STORAGE_TABS);
      localStorage.removeItem(STORAGE_ACTIVE_TAB);
      return true;
    } catch {
      return false;
    }
  }
}

export const tabsStore = new TabsStore();

/* ============================================================
   Bookmarks store
   ============================================================ */

class BookmarksStore {
  load(): Bookmark[] {
    try {
      const raw = localStorage.getItem(STORAGE_BOOKMARKS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValid);
    } catch (err) {
      logger.warn('browser.bookmarks', 'load failed', { err });
      return [];
    }
  }

  private isValid(b: unknown): b is Bookmark {
    if (!b || typeof b !== 'object') return false;
    const o = b as Record<string, unknown>;
    return (
      typeof o['id'] === 'string'
      && typeof o['url'] === 'string'
      && typeof o['title'] === 'string'
      && Array.isArray(o['tags'])
      && typeof o['ts_created'] === 'number'
    );
  }

  save(bookmarks: readonly Bookmark[]): boolean {
    try {
      localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(bookmarks));
      return true;
    } catch (err) {
      logger.warn('browser.bookmarks', 'save failed', { err });
      return false;
    }
  }

  add(partial: { url: string; title?: string; tags?: readonly string[] }): Bookmark | null {
    if (!isValidUrl(partial.url)) return null;
    const url = normalizeUrl(partial.url);
    if (isBlockedUrl(url)) return null;
    const bookmarks = this.load();
    /* Dédup par URL */
    if (bookmarks.some((b) => b.url === url)) return null;
    const bookmark: Bookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url,
      title: (partial.title ?? extractDomain(url) ?? url).slice(0, 200),
      favicon: getFaviconUrl(url),
      tags: (partial.tags ?? []).slice(0, 10).map((t) => t.toLowerCase().trim()).filter(Boolean),
      ts_created: Date.now(),
    };
    bookmarks.unshift(bookmark);
    if (bookmarks.length > MAX_BOOKMARKS) bookmarks.length = MAX_BOOKMARKS;
    if (!this.save(bookmarks)) return null;
    return bookmark;
  }

  remove(id: string): boolean {
    const bookmarks = this.load().filter((b) => b.id !== id);
    return this.save(bookmarks);
  }

  isBookmarked(url: string): boolean {
    if (!url) return false;
    const normalized = normalizeUrl(url);
    return this.load().some((b) => b.url === normalized);
  }

  toggle(url: string, title?: string): boolean {
    if (!isValidUrl(url)) return false;
    const normalized = normalizeUrl(url);
    const bookmarks = this.load();
    const existing = bookmarks.find((b) => b.url === normalized);
    if (existing) return this.remove(existing.id);
    return this.add({ url: normalized, ...(title !== undefined && { title }) }) !== null;
  }

  search(query: string): Bookmark[] {
    if (!query.trim()) return this.load();
    const q = query.toLowerCase().trim();
    return this.load().filter(
      (b) =>
        b.title.toLowerCase().includes(q)
        || b.url.toLowerCase().includes(q)
        || b.tags.some((t) => t.includes(q)),
    );
  }

  count(): number {
    return this.load().length;
  }

  clear(): boolean {
    try {
      localStorage.removeItem(STORAGE_BOOKMARKS);
      return true;
    } catch {
      return false;
    }
  }
}

export const bookmarksStore = new BookmarksStore();

/* ============================================================
   History store
   ============================================================ */

class HistoryStore {
  load(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValid);
    } catch (err) {
      logger.warn('browser.history', 'load failed', { err });
      return [];
    }
  }

  private isValid(h: unknown): h is HistoryEntry {
    if (!h || typeof h !== 'object') return false;
    const o = h as Record<string, unknown>;
    return (
      typeof o['id'] === 'string'
      && typeof o['url'] === 'string'
      && typeof o['title'] === 'string'
      && typeof o['ts_visited'] === 'number'
    );
  }

  save(entries: readonly HistoryEntry[]): boolean {
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(entries));
      return true;
    } catch (err) {
      logger.warn('browser.history', 'save failed', { err });
      return false;
    }
  }

  push(url: string, title?: string): HistoryEntry | null {
    if (!isValidUrl(url)) return null;
    const normalized = normalizeUrl(url);
    if (isBlockedUrl(normalized)) return null;
    const entries = this.load();
    const entry: HistoryEntry = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      title: (title ?? extractDomain(normalized) ?? normalized).slice(0, 200),
      ts_visited: Date.now(),
    };
    entries.unshift(entry);
    if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;
    if (!this.save(entries)) return null;
    return entry;
  }

  search(query: string): HistoryEntry[] {
    if (!query.trim()) return this.load();
    const q = query.toLowerCase().trim();
    return this.load().filter(
      (h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q),
    );
  }

  count(): number {
    return this.load().length;
  }

  clear(): boolean {
    try {
      localStorage.removeItem(STORAGE_HISTORY);
      return true;
    } catch {
      return false;
    }
  }
}

export const historyStore = new HistoryStore();

/* ============================================================
   Anti X-Frame-Options bypass
   ============================================================ */

/* buildArchiveUrl / buildReaderUrl : importés depuis browser-controller (source unique)
 * puis ré-exportés ci-dessous pour conserver l'API publique historique du feature. */
export { buildArchiveUrl, buildReaderUrl };

export function buildGoogleCacheUrl(url: string): string {
  return `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
}

/**
 * Tente la navigation avec fallback chain :
 * 1. URL directe
 * 2. Cache web archive
 * 3. reader.jina.ai (texte propre)
 * 4. Google Cache
 * 5. Safari (window.open) → flag blocked:true, le caller décide
 *
 * Pas de fetch HEAD réel ici : retourne juste la stratégie suggérée.
 * L'iframe `error` event déclenche `nextFallback()` côté UI.
 */
export function getFallbackChain(url: string): readonly { method: FallbackMethod; url: string }[] {
  const normalized = normalizeUrl(url);
  return [
    { method: 'direct', url: normalized },
    { method: 'archive', url: buildArchiveUrl(normalized) },
    { method: 'reader', url: buildReaderUrl(normalized) },
    { method: 'gcache', url: buildGoogleCacheUrl(normalized) },
    { method: 'safari', url: normalized },
  ];
}

/**
 * Détecte si une iframe est probablement bloquée (X-Frame-Options DENY/SAMEORIGIN
 * ou CSP frame-ancestors).
 *
 * Heuristiques cumulables :
 *  1. `iframe.contentDocument` null/throw → cross-origin block (ex: google, youtube)
 *  2. `iframe.contentDocument.body.innerHTML` vide après load → blank
 *  3. `iframe.contentWindow.location.href` reste 'about:blank' après 2s → load failed
 *
 * Sur navigateurs modernes, `contentDocument` jette `SecurityError` si cross-origin
 * a échoué le frame check. Si direct cross-origin OK (ex: site sans X-Frame-Options),
 * on ne peut pas non plus le lire mais l'iframe affiche le contenu — d'où l'heuristique
 * height/width qu'on ne peut pas tester en jsdom mais qui fait foi côté UI.
 */
export function detectIframeBlocked(iframe: HTMLIFrameElement | null): IframeBlockedDetection {
  if (!iframe) return { blocked: true, reason: 'load-error' };
  /* Test 1 : contentDocument lecture (throw si cross-origin block actif) */
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    /* SecurityError sur cross-origin = iframe affiche peut-être OK, ou bien blocked.
       On retourne 'cross-origin' qui est ambigu. UI garde le contenu et propose fallback en option. */
    return { blocked: false, reason: 'cross-origin' };
  }
  /* Test 2 : si contentDocument null ET src ≠ about:blank → bloqué */
  const src = iframe.src ?? '';
  if (!doc) {
    if (!src || src === 'about:blank') return { blocked: true, reason: 'load-error' };
    /* contentDocument null sur un src valide = cross-origin (probable blocage XFO) */
    return { blocked: false, reason: 'cross-origin' };
  }
  /* Test 3 : body vide après load → page n'a rien rendu */
  const body = doc.body;
  if (!body) return { blocked: true, reason: 'no-content' };
  const html = (body.innerHTML ?? '').trim();
  if (html.length === 0) return { blocked: true, reason: 'no-content' };
  return { blocked: false, reason: 'ok' };
}

/**
 * HTML overlay user-friendly à afficher quand iframe est bloquée.
 * 4 boutons : archive / reader / cache / safari.
 * Pas d'event handlers ici (caller les wire via [data-fallback]).
 */
export function buildBlockedOverlay(url: string): string {
  const safe = escapeHtml(url);
  const archive = escapeHtml(buildArchiveUrl(url));
  const reader = escapeHtml(buildReaderUrl(url));
  const gcache = escapeHtml(buildGoogleCacheUrl(url));
  return `
<div class="ax-browser-blocked-overlay" role="dialog" aria-label="Site bloqué"
  style="position:absolute;inset:0;background:rgba(10,10,20,0.96);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:50;color:#fff;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">🛡️</div>
    <h2 style="color:#c9a227;font-size:18px;margin:0 0 8px 0">Ce site refuse l'embed iframe</h2>
    <p style="color:#bbb;font-size:13px;margin:0 0 20px 0;word-break:break-all">${safe}</p>
    <p style="color:#999;font-size:12px;margin:0 0 16px 0">Le site envoie <code class="ax-gs-198">X-Frame-Options</code> qui bloque l'affichage. Voici 4 façons de le voir quand même :</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <button data-fallback="archive" data-fallback-url="${archive}"
        class="ax-gs-345">📚 Archive</button>
      <button data-fallback="reader" data-fallback-url="${reader}"
        class="ax-gs-345">📖 Lecture</button>
      <button data-fallback="gcache" data-fallback-url="${gcache}"
        class="ax-gs-345">🔍 Cache</button>
      <button data-fallback="safari" data-fallback-url="${safe}"
        class="ax-gs-345">🌐 Safari</button>
    </div>
    <button data-fallback="dismiss"
      style="margin-top:8px;padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#bbb;border-radius:6px;cursor:pointer;font-size:12px">Fermer</button>
  </div>
</div>`;
}

/**
 * Map FallbackMethod → label user-friendly (pour toast).
 */
export function fallbackLabel(method: FallbackMethod): string {
  switch (method) {
    case 'archive': return 'Archive web';
    case 'reader': return 'Mode lecture';
    case 'gcache': return 'Cache Google';
    case 'safari': return 'Safari (nouvel onglet)';
    case 'direct':
    default:
      return 'Direct';
  }
}

/* ============================================================
   Reader mode boost — extraction titre, paragraphes, TOC, stats
   ============================================================ */

/**
 * Compte les mots dans un texte (séparateurs : espaces, ponctuation).
 * Robuste sur multi-langues (latin, accents, asiatique 1 mot ≈ 2 chars).
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const cleaned = text.trim();
  if (!cleaned) return 0;
  /* Séparateurs : whitespace + ponctuation usuelle */
  const tokens = cleaned.split(/[\s.,;:!?()[\]{}«»""''/—–\-]+/u).filter(Boolean);
  return tokens.length;
}

/**
 * Estimation temps de lecture (250 mots/minute moyenne adulte FR).
 * Retourne le nombre de minutes (min 1).
 */
export function readingTimeMinutes(wordCount: number, wpm = 250): number {
  if (wordCount <= 0 || wpm <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / wpm));
}

/**
 * Extrait stats reader d'un Document (pour mode lecture amélioré).
 * Si pas de Document (cross-origin), retourne stats par défaut.
 */
export function extractReaderStats(doc: Document | null): ReaderStats {
  const empty: ReaderStats = { title: '', paragraphs: [], wordCount: 0, readingTimeMin: 0, toc: [] };
  if (!doc) return empty;
  const title = (doc.title ?? '').trim();
  /* Paragraphes : <p> + <article> text content, dédup espaces */
  const pNodes = Array.from(doc.querySelectorAll('p, article'));
  const paragraphs = pNodes
    .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 20);  // skip tiny blurbs
  const fullText = paragraphs.join(' ');
  const wordCount = countWords(fullText);
  const readingTimeMin = readingTimeMinutes(wordCount);
  /* TOC : H1/H2/H3 */
  const headingNodes = Array.from(doc.querySelectorAll('h1, h2, h3'));
  const toc: { level: 1 | 2 | 3; text: string }[] = [];
  for (const h of headingNodes) {
    const lvl = h.tagName.toLowerCase();
    const text = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (lvl === 'h1') toc.push({ level: 1, text });
    else if (lvl === 'h2') toc.push({ level: 2, text });
    else if (lvl === 'h3') toc.push({ level: 3, text });
  }
  return { title, paragraphs, wordCount, readingTimeMin, toc };
}

/**
 * Cherche une chaîne dans un Document iframe (mode "search in page").
 * Retourne les noeuds Element parents qui contiennent le terme (case-insensitive).
 */
export function searchInDocument(doc: Document | null, query: string): readonly Element[] {
  if (!doc || !query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const candidates = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, span, div'));
  const matches: Element[] = [];
  for (const el of candidates) {
    const text = (el.textContent ?? '').toLowerCase();
    if (text.includes(q)) {
      /* Skip parents qui contiennent déjà un match (évite doublons profonds) */
      if (matches.some((m) => m.contains(el))) continue;
      matches.push(el);
      if (matches.length >= 50) break;  // cap
    }
  }
  return matches;
}

/* ============================================================
   AI Search detection
   ============================================================ */

export function isAiQuery(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  return trimmed.startsWith('?') && trimmed.length > 1;
}

export function extractAiQuery(input: string): string {
  return input.trim().replace(/^\?\s*/, '').trim();
}

/* ============================================================
   Auto-complete suggestions
   ============================================================ */

export interface Suggestion {
  type: 'history' | 'bookmark' | 'ai';
  url?: string;
  title: string;
  query?: string;
}

export function getSuggestions(input: string, limit = 8): Suggestion[] {
  if (!input.trim()) return [];
  if (isAiQuery(input)) {
    return [{ type: 'ai', title: `Demander à Apex : ${extractAiQuery(input)}`, query: extractAiQuery(input) }];
  }
  const q = input.toLowerCase().trim();
  const results: Suggestion[] = [];
  /* Bookmarks d'abord (poids fort) */
  for (const b of bookmarksStore.load()) {
    if (b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) {
      results.push({ type: 'bookmark', url: b.url, title: b.title });
      if (results.length >= limit) break;
    }
  }
  /* History ensuite */
  if (results.length < limit) {
    for (const h of historyStore.load()) {
      if (h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)) {
        /* Dédup par URL */
        if (!results.some((r) => r.url === h.url)) {
          results.push({ type: 'history', url: h.url, title: h.title });
          if (results.length >= limit) break;
        }
      }
    }
  }
  return results;
}

/* ============================================================
   UI Render (HTML statique testé E2E Playwright)
   istanbul ignore next — exclu coverage via vitest.config.ts
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeBrowserScope?.cleanup();
  activeBrowserScope = createCleanupScope('browser');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout) */
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id;
  if (!isFeatureEnabled('browser.iframe', uid)) {
    rootEl.innerHTML = renderDisabledNotice('browser.iframe');
    return;
  }
  const tabs = tabsStore.load();
  const activeTabId = tabsStore.getActive();
  /* Reuse last URL or open Google as default */
  const lastUrl = localStorage.getItem(STORAGE_LAST_URL) ?? 'https://www.google.com';
  const currentUrl = (activeTabId ? tabs.find((t) => t.id === activeTabId)?.url : null) ?? lastUrl;
  const currentTitle = (activeTabId ? tabs.find((t) => t.id === activeTabId)?.title : null) ?? 'Apex Browser';
  const isBookmarked = bookmarksStore.isBookmarked(currentUrl);

  /* Premium reusable button styles */
  const navBtn = 'min-width:40px;min-height:40px;padding:8px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.85);border-radius:10px;cursor:pointer;font-size:14px;-webkit-tap-highlight-color:transparent;transition:all 160ms cubic-bezier(0.16,1,0.3,1);display:inline-flex;align-items:center;justify-content:center';
  const overlayBtn = 'border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:linear-gradient(135deg,rgba(20,20,35,0.95),rgba(14,14,28,0.85));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.4),0 1px 3px rgba(0,0,0,0.3);-webkit-tap-highlight-color:transparent;transition:all 200ms cubic-bezier(0.34,1.56,0.64,1);display:inline-flex;align-items:center;justify-content:center';
  const bottomBtn = 'min-height:40px;padding:8px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(232,184,48,0.9);cursor:pointer;font-size:13px;font-weight:500;border-radius:10px;-webkit-tap-highlight-color:transparent;transition:all 160ms cubic-bezier(0.16,1,0.3,1);white-space:nowrap';

  const tabsHtml = tabs.length === 0
    ? `<div data-tab-empty style="color:rgba(255,255,255,0.4);padding:8px 14px;font-size:12px;font-style:italic">Aucun onglet ouvert</div>`
    : tabs
        .map(
          (t) => {
            const isActive = t.id === activeTabId;
            return `
          <div class="ax-browser-tab ax-bounce-tap${isActive ? ' active' : ''}" data-tab-id="${escapeHtml(t.id)}" draggable="true"
            style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:${isActive ? 'linear-gradient(135deg,rgba(232,184,48,0.18),rgba(201,162,39,0.1))' : 'rgba(255,255,255,0.04)'};border:1px solid ${isActive ? 'rgba(232,184,48,0.35)' : 'rgba(255,255,255,0.08)'};border-bottom:${isActive ? '2px solid #e8b830' : 'none'};border-radius:10px 10px 0 0;cursor:pointer;max-width:200px;min-height:36px;font-size:12px;color:${isActive ? '#fff' : 'rgba(255,255,255,0.7)'};font-weight:${isActive ? '600' : '500'};-webkit-tap-highlight-color:transparent;transition:all 180ms cubic-bezier(0.16,1,0.3,1)" title="${escapeHtml(t.title)}">
            <img src="${escapeHtml(getFaviconUrl(t.url))}" alt="" loading="lazy" decoding="async" style="width:14px;height:14px;flex-shrink:0;border-radius:3px" onerror="this.style.display='none'">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px">${escapeHtml(t.title)}</span>
            <span data-tab-close="${escapeHtml(t.id)}" style="opacity:0.5;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;transition:all 160ms" title="Fermer">✕</span>
          </div>`;
          },
        )
        .join('');

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      .ax-bounce-tap { transition: transform 120ms cubic-bezier(0.16,1,0.3,1); }
      .ax-bounce-tap:active { transform: scale(0.95); }
      .ax-browser-page button:hover { transform: translateY(-1px); }
      .ax-browser-overlay button:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(0,0,0,0.5),0 0 0 1px rgba(232,184,48,0.2); }
      .ax-browser-tab:hover { background: rgba(232,184,48,0.1) !important; }
      #ax-browser-url:focus { outline: none; border-color: rgba(232,184,48,0.5) !important; box-shadow: 0 0 0 3px rgba(232,184,48,0.12); }
      @media (prefers-reduced-motion: reduce) {
        .ax-bounce-tap, .ax-browser-page button, .ax-browser-overlay button, .ax-browser-tab { transition: none !important; }
        .ax-browser-page button:hover, .ax-browser-overlay button:hover { transform: none !important; }
      }
    </style>
    <div class="ax-browser-page ax-modernized-card" style="display:flex;flex-direction:column;height:100vh;background:#0a0a14;position:relative;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">

      <!-- Top bar : nav + URL + bookmark + share -->
      <div style="padding:10px 12px;padding-top:max(10px, env(safe-area-inset-top));background:linear-gradient(180deg,rgba(20,20,35,0.95),rgba(14,14,28,0.85));backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <a href="#chat" data-action="back-to-chat" class="ax-bounce-tap" style="color:#e8b830;text-decoration:none;padding:8px 14px;border-radius:24px;background:rgba(232,184,48,0.1);border:1px solid rgba(232,184,48,0.2);font-size:13px;font-weight:600;min-height:40px;display:inline-flex;align-items:center;-webkit-tap-highlight-color:transparent;transition:all 160ms" title="Retour chat">← Chat</a>
        <button class="ax-btn ax-btn-sm ax-bounce-tap" data-action="back" title="Précédent" style="${navBtn}">←</button>
        <button class="ax-btn ax-btn-sm ax-bounce-tap" data-action="forward" title="Suivant" style="${navBtn}">→</button>
        <button class="ax-btn ax-btn-sm ax-bounce-tap" data-action="reload" title="Recharger" style="${navBtn}">⟳</button>

        <div style="flex:1;position:relative;min-width:200px">
          <input type="url" id="ax-browser-url" autocomplete="off"
            aria-label="URL ou recherche pour le navigateur Apex"
            value="${escapeHtml(currentUrl)}"
            placeholder="URL ou ?question pour Apex IA…"
            style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;font-family:ui-monospace,'SF Mono',Menlo,monospace;min-height:40px;-webkit-appearance:none;transition:all 160ms cubic-bezier(0.16,1,0.3,1);box-sizing:border-box">
          <div id="ax-browser-suggestions" style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:linear-gradient(135deg,rgba(20,20,35,0.98),rgba(14,14,28,0.95));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;display:none;max-height:280px;overflow-y:auto;z-index:100;box-shadow:0 12px 32px rgba(0,0,0,0.4)"></div>
        </div>

        <button data-action="bookmark" class="ax-bounce-tap" title="${isBookmarked ? 'Retirer favori' : 'Ajouter aux favoris'}" style="${navBtn};color:${isBookmarked ? '#e8b830' : 'rgba(255,255,255,0.85)'};font-size:18px;${isBookmarked ? 'background:rgba(232,184,48,0.12);border-color:rgba(232,184,48,0.3)' : ''}">${isBookmarked ? '★' : '☆'}</button>
        <button data-action="share" class="ax-bounce-tap" title="Partager URL" style="${navBtn}">📤</button>
        <button data-action="toggle-sidebar" class="ax-bounce-tap" title="Sidebar" style="${navBtn}">☰</button>
        <button class="ax-btn ax-btn-primary ax-btn-sm ax-bounce-tap" data-action="go" style="padding:10px 22px;background:linear-gradient(135deg,#c9a227,#e8b830);border:none;color:#000;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px;min-height:40px;-webkit-tap-highlight-color:transparent;transition:all 180ms cubic-bezier(0.16,1,0.3,1);box-shadow:0 4px 12px rgba(232,184,48,0.2)">Go</button>
      </div>

      <!-- Tabs bar -->
      <div style="display:flex;gap:6px;align-items:flex-end;padding:8px 12px 0;background:linear-gradient(180deg,rgba(15,15,25,0.95),rgba(10,10,20,0.85));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.04);overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;scrollbar-width:thin">
        ${tabsHtml}
        <button data-action="new-tab" class="ax-bounce-tap" title="Nouvel onglet" style="padding:8px 14px;background:rgba(232,184,48,0.08);border:1px dashed rgba(232,184,48,0.35);color:#e8b830;border-radius:10px 10px 0 0;cursor:pointer;flex-shrink:0;min-height:36px;font-size:12px;font-weight:600;-webkit-tap-highlight-color:transparent;transition:all 160ms;white-space:nowrap">+ Nouveau</button>
      </div>

      <!-- Body : sidebar + iframe -->
      <div style="display:flex;flex:1;overflow:hidden">

        <!-- Sidebar (collapsible) -->
        <aside id="ax-browser-sidebar" style="width:280px;background:linear-gradient(135deg,rgba(15,15,25,0.98),rgba(10,10,20,0.95));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;display:none;flex-direction:column">
          <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.06);padding:6px;gap:4px">
            <button data-sidebar-tab="bookmarks" class="active ax-bounce-tap" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(232,184,48,0.18),rgba(201,162,39,0.1));border:1px solid rgba(232,184,48,0.3);color:#e8b830;cursor:pointer;font-size:12px;border-radius:8px;font-weight:600;-webkit-tap-highlight-color:transparent;min-height:40px;transition:all 160ms">⭐ Favoris</button>
            <button data-sidebar-tab="history" class="ax-bounce-tap ax-gs-346">🕒 Historique</button>
            <button data-sidebar-tab="ai" class="ax-bounce-tap ax-gs-346">🤖 IA</button>
          </div>
          <div id="ax-sidebar-content" style="flex:1;padding:10px;overflow-y:auto"></div>
        </aside>

        <!-- Iframe principale + overlay flottant -->
        <div style="flex:1;position:relative;background:#fff">
          <iframe id="ax-browser-iframe"
            src="${escapeHtml(currentUrl)}"
            title="${escapeHtml(currentTitle)}"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            style="width:100%;height:100%;border:none"></iframe>

          <!-- Apex overlay flottant TOUJOURS visible (premium glassmorphism) -->
          <div class="ax-browser-overlay" style="position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);right:14px;display:flex;flex-direction:column;gap:10px;z-index:9999">
            <button data-action="overlay-mic" title="Dis Apex" style="${overlayBtn};width:52px;height:52px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;font-size:22px;box-shadow:0 6px 24px rgba(232,184,48,0.4),0 2px 6px rgba(0,0,0,0.3)">🎙</button>
            <button data-action="overlay-chat" title="Retour chat" style="${overlayBtn};width:44px;height:44px;font-size:17px">💬</button>
            <button data-action="overlay-copy" title="Copier URL" style="${overlayBtn};width:44px;height:44px;font-size:17px">📋</button>
            <button data-action="overlay-screenshot" title="Capture" style="${overlayBtn};width:44px;height:44px;font-size:17px">📷</button>
            <button data-action="overlay-fullscreen" title="Plein écran" style="${overlayBtn};width:44px;height:44px;font-size:17px">⛶</button>
          </div>
        </div>
      </div>

      <!-- Bottom toolbar -->
      <div style="padding:8px 10px;padding-bottom:max(8px, env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(20,20,35,0.95),rgba(14,14,28,0.85));backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;align-items:center;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch">
        <button data-action="reader-mode" class="ax-bounce-tap" title="Mode lecture" style="${bottomBtn}">📖 Lecture</button>
        <button data-action="search-in-page" class="ax-bounce-tap" title="Rechercher dans la page" style="${bottomBtn}">🔍 Chercher</button>
        <button data-action="show-toc" class="ax-bounce-tap" title="Sommaire (H1/H2/H3)" style="${bottomBtn}">📑 Sommaire</button>
        <button data-action="translate" class="ax-bounce-tap" title="Traduire" style="${bottomBtn}">🌐 Traduire</button>
        <button data-action="save-pdf" class="ax-bounce-tap" title="Exporter PDF" style="${bottomBtn}">📥 PDF</button>
        <button data-action="share-bottom" class="ax-bounce-tap" title="Partager" style="${bottomBtn}">📤 Partager</button>
      </div>
    </div>
  `);
  attachHandlers(rootEl);
  logger.info('feature-browser', 'rendered', { tabs: tabs.length, bookmarks: bookmarksStore.count(), history: historyStore.count() });
}

/* ============================================================
   UI Handlers (exclus coverage — testé E2E Playwright)
   ============================================================ */

function attachHandlers(rootEl: HTMLElement): void {
  const iframe = rootEl.querySelector<HTMLIFrameElement>('#ax-browser-iframe');
  const urlInput = rootEl.querySelector<HTMLInputElement>('#ax-browser-url');
  const suggestionsBox = rootEl.querySelector<HTMLDivElement>('#ax-browser-suggestions');
  const sidebar = rootEl.querySelector<HTMLElement>('#ax-browser-sidebar');
  const sidebarContent = rootEl.querySelector<HTMLDivElement>('#ax-sidebar-content');
  const iframeContainer = iframe?.parentElement ?? null;

  /* ============================================================
     X-Frame-Options blocked detection + auto-fallback overlay
     ============================================================ */
  let blockedTimer: ReturnType<typeof setTimeout> | null = null;
  let blockedOverlayEl: HTMLElement | null = null;

  const removeBlockedOverlay = (): void => {
    if (blockedOverlayEl && blockedOverlayEl.parentNode) {
      blockedOverlayEl.parentNode.removeChild(blockedOverlayEl);
    }
    blockedOverlayEl = null;
  };

  const showBlockedOverlay = (currentSrc: string): void => {
    if (!iframeContainer || blockedOverlayEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildBlockedOverlay(currentSrc).trim();
    const overlay = tmp.firstElementChild as HTMLElement | null;
    if (!overlay) return;
    blockedOverlayEl = overlay;
    iframeContainer.appendChild(overlay);
    /* Click delegation pour les boutons fallback */
    activeBrowserScope!.bind(overlay, 'click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('[data-fallback]');
      if (!btn) return;
      const method = btn.dataset['fallback'] as FallbackMethod | 'dismiss' | undefined;
      const fbUrl = btn.dataset['fallbackUrl'] ?? '';
      if (method === 'dismiss') {
        removeBlockedOverlay();
        return;
      }
      if (method === 'safari') {
        try {
          window.open(fbUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
          logger.warn('feature-browser', 'window.open failed', { err });
        }
        removeBlockedOverlay();
        return;
      }
      if (method && fbUrl && iframe) {
        iframe.src = fbUrl;
        if (urlInput) urlInput.value = fbUrl;
        removeBlockedOverlay();
        /* Toast informatif (lazy import) */
        import('../../ui/toast.js')
          .then((m) => m.toast.info(`🔄 Fallback : ${fallbackLabel(method as FallbackMethod)}`))
          .catch(() => undefined);
        logger.info('feature-browser', 'fallback used', { method, url: fbUrl });
      }
    });
  };

  const checkBlocked = (): void => {
    if (!iframe) return;
    const detection = detectIframeBlocked(iframe);
    if (detection.blocked) {
      showBlockedOverlay(iframe.src);
      logger.info('feature-browser', 'iframe blocked detected', { reason: detection.reason });
    }
  };

  if (iframe) {
    activeBrowserScope!.bind(iframe, 'load', () => {
      removeBlockedOverlay();
      if (blockedTimer) clearTimeout(blockedTimer);
      /* Attendre 2s post-load pour laisser le content render */
      blockedTimer = setTimeout(checkBlocked, 2000);
    });
    activeBrowserScope!.bind(iframe, 'error', () => {
      logger.warn('feature-browser', 'iframe error event');
      showBlockedOverlay(iframe.src);
    });
  }

  const navigate = (rawUrl: string): void => {
    if (!rawUrl) return;
    if (isAiQuery(rawUrl)) {
      const q = extractAiQuery(rawUrl);
      window.location.hash = `#chat?q=${encodeURIComponent(q)}`;
      return;
    }
    if (!isValidUrl(rawUrl)) {
      logger.warn('feature-browser', 'invalid url', { rawUrl });
      return;
    }
    const url = normalizeUrl(rawUrl);
    if (isBlockedUrl(url)) {
      logger.warn('feature-browser', 'blocked url', { url });
      return;
    }
    localStorage.setItem(STORAGE_LAST_URL, url);
    historyStore.push(url);
    const activeId = tabsStore.getActive();
    if (activeId) {
      tabsStore.update(activeId, { url, ts_last_active: Date.now() });
    } else {
      const tab = tabsStore.add(url);
      if (tab) tabsStore.setActive(tab.id);
    }
    if (iframe) iframe.src = url;
    if (urlInput) urlInput.value = url;
  };

  /* URL bar : Enter + suggestions live */
  if (urlInput) {
    activeBrowserScope!.bind(urlInput, 'keydown', (e) => {
      if (e.key === 'Enter' && urlInput.value.trim()) navigate(urlInput.value);
    });
    activeBrowserScope!.bind(urlInput, 'input', () => {
      const sugs = getSuggestions(urlInput.value, 6);
      if (suggestionsBox) {
        if (sugs.length === 0) {
          suggestionsBox.style.display = 'none';
        } else {
          suggestionsBox.innerHTML = sugs
            .map(
              (s) => `
              <div class="ax-suggestion" data-suggestion-url="${escapeHtml(s.url ?? '')}" data-suggestion-query="${escapeHtml(s.query ?? '')}" data-suggestion-type="${s.type}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(201,162,39,0.1);color:#fff;font-size:13px">
                ${s.type === 'ai' ? '🤖' : s.type === 'bookmark' ? '⭐' : '🕒'} ${escapeHtml(s.title)}
              </div>`,
            )
            .join('');
          suggestionsBox.style.display = 'block';
        }
      }
    });
    activeBrowserScope!.bind(urlInput, 'blur', () => {
      setTimeout(() => {
        if (suggestionsBox) suggestionsBox.style.display = 'none';
      }, 200);
    });
  }

  /* Suggestion click */
  if (suggestionsBox) activeBrowserScope!.bind(suggestionsBox, 'click', (e) => {
    const target = e.target as HTMLElement;
    const sugEl = target.closest<HTMLElement>('[data-suggestion-url], [data-suggestion-query]');
    if (!sugEl) return;
    const url = sugEl.dataset['suggestionUrl'];
    const query = sugEl.dataset['suggestionQuery'];
    if (url) navigate(url);
    else if (query) window.location.hash = `#chat?q=${encodeURIComponent(query)}`;
  });

  /* Action buttons (delegation) */
  rootEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-action]');
    if (btn) {
      const action = btn.dataset['action'];
      handleAction(action ?? '', { rootEl, iframe, urlInput, sidebar, sidebarContent, navigate });
      return;
    }
    /* Tab click */
    const tabEl = target.closest<HTMLElement>('.ax-browser-tab');
    if (tabEl) {
      const closeBtn = target.closest<HTMLElement>('[data-tab-close]');
      if (closeBtn) {
        const id = closeBtn.dataset['tabClose'];
        if (id) {
          tabsStore.close(id);
          render(rootEl);
        }
        return;
      }
      const tabId = tabEl.dataset['tabId'];
      if (tabId) {
        tabsStore.setActive(tabId);
        render(rootEl);
      }
    }
    /* Sidebar tabs */
    const sideTab = target.closest<HTMLElement>('[data-sidebar-tab]');
    if (sideTab) {
      renderSidebar(rootEl, sideTab.dataset['sidebarTab'] ?? 'bookmarks');
    }
  });

  /* Drag & drop tabs reorder */
  rootEl.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement;
    const tabEl = target.closest<HTMLElement>('.ax-browser-tab');
    if (tabEl && e.dataTransfer) e.dataTransfer.setData('text/plain', tabEl.dataset['tabId'] ?? '');
  });
  rootEl.addEventListener('dragover', (e) => e.preventDefault());
  rootEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer?.getData('text/plain');
    const target = e.target as HTMLElement;
    const dropEl = target.closest<HTMLElement>('.ax-browser-tab');
    const dropId = dropEl?.dataset['tabId'];
    if (draggedId && dropId && draggedId !== dropId) {
      const tabs = tabsStore.load();
      const ids = tabs.map((t) => t.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(dropId);
      if (fromIdx !== -1 && toIdx !== -1) {
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, draggedId);
        tabsStore.reorder(ids);
        render(rootEl);
      }
    }
  });
}

interface ActionContext {
  rootEl: HTMLElement;
  iframe: HTMLIFrameElement | null;
  urlInput: HTMLInputElement | null;
  sidebar: HTMLElement | null;
  sidebarContent: HTMLDivElement | null;
  navigate: (url: string) => void;
}

function handleAction(action: string, ctx: ActionContext): void {
  const { rootEl, iframe, urlInput, sidebar, navigate } = ctx;
  switch (action) {
    case 'go': {
      if (urlInput) navigate(urlInput.value);
      break;
    }
    case 'back': {
      try {
        iframe?.contentWindow?.history.back();
      } catch (err) {
        logger.warn('feature-browser', 'back failed', { err });
      }
      break;
    }
    case 'forward': {
      try {
        iframe?.contentWindow?.history.forward();
      } catch (err) {
        logger.warn('feature-browser', 'forward failed', { err });
      }
      break;
    }
    case 'reload': {
      if (iframe) {
        const src = iframe.src;
        iframe.src = '';
        iframe.src = src;
      }
      break;
    }
    case 'bookmark': {
      const url = urlInput?.value ?? '';
      const title = iframe?.contentDocument?.title ?? extractDomain(url);
      bookmarksStore.toggle(url, title);
      render(rootEl);
      break;
    }
    case 'share':
    case 'share-bottom': {
      const url = urlInput?.value ?? '';
      if (url && navigator.share) {
        navigator.share({ url, title: iframe?.contentDocument?.title ?? url }).catch(() => undefined);
      } else if (url && navigator.clipboard) {
        navigator.clipboard.writeText(url).catch(() => undefined);
      }
      break;
    }
    case 'toggle-sidebar': {
      if (sidebar) {
        sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
        if (sidebar.style.display === 'flex') renderSidebar(rootEl, 'bookmarks');
      }
      break;
    }
    case 'new-tab': {
      const tab = tabsStore.add('https://www.google.com', 'Nouvel onglet');
      if (tab) {
        tabsStore.setActive(tab.id);
        render(rootEl);
      }
      break;
    }
    case 'overlay-mic': {
      window.location.hash = '#chat?action=mic';
      break;
    }
    case 'overlay-chat':
    case 'back-to-chat': {
      window.location.hash = '#chat';
      break;
    }
    case 'overlay-copy': {
      const url = urlInput?.value ?? '';
      if (url && navigator.clipboard) navigator.clipboard.writeText(url).catch(() => undefined);
      break;
    }
    case 'overlay-screenshot': {
      /* P1-10 fix (audit v13.2.5) : implémentation honnête au lieu de TODO silencieux.
       * iframe cross-origin = pas de canvas.drawImage possible (tainted canvas).
       * Solution : demande à l'utilisateur d'utiliser screenshot natif iOS/macOS
       * (Cmd+Shift+4 / longpress home+power) avec toast informatif. */
      void import('../../ui/toast.js').then(({ toast }) => {
        const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent);
        toast.info(
          isApple
            ? '📸 Utilise Cmd+Shift+4 (Mac) ou longpress home+power (iPhone) pour capturer'
            : '📸 Utilise Win+Shift+S (Windows) ou outil Capture Android pour capturer',
        );
      });
      logger.info('feature-browser', 'screenshot fallback : OS native (cross-origin iframe limit)');
      break;
    }
    case 'overlay-fullscreen': {
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void iframe?.requestFullscreen();
      } catch (err) {
        logger.warn('feature-browser', 'fullscreen failed', { err });
      }
      break;
    }
    case 'reader-mode': {
      const url = urlInput?.value ?? '';
      if (url && iframe) {
        iframe.src = buildReaderUrl(url);
      }
      break;
    }
    case 'translate': {
      const url = urlInput?.value ?? '';
      if (url && iframe) {
        iframe.src = `https://translate.google.com/translate?sl=auto&tl=fr&u=${encodeURIComponent(url)}`;
      }
      break;
    }
    case 'save-pdf': {
      /* Export PDF via window.print() avec CSS print pour rendu propre.
         Si cross-origin → on print la page parent (limitation browser). */
      try {
        const win = iframe?.contentWindow;
        if (win) {
          win.print();
        } else {
          window.print();
        }
        import('../../ui/toast.js').then((m) => m.toast.info('📥 Export PDF lancé')).catch(() => undefined);
      } catch (err) {
        logger.warn('feature-browser', 'print failed', { err });
        try {
          window.print();
        } catch {
          /* skip */
        }
      }
      break;
    }
    case 'search-in-page': {
      /* Prompt user pour query, puis recherche dans iframe (si same-origin). */
      const query = window.prompt('Rechercher dans la page :', '');
      if (!query || query.trim().length < 2) break;
      try {
        const doc = iframe?.contentDocument ?? null;
        const results = searchInDocument(doc, query);
        if (results.length === 0) {
          import('../../ui/toast.js').then((m) => m.toast.warn(`Aucun résultat pour "${query}"`)).catch(() => undefined);
        } else {
          /* Scroll vers le 1er match + highlight visible */
          const first = results[0];
          if (first && 'scrollIntoView' in first) {
            (first as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
            (first as HTMLElement).style.outline = '3px solid #c9a227';
            setTimeout(() => {
              if (first instanceof HTMLElement) first.style.outline = '';
            }, 3000);
          }
          import('../../ui/toast.js').then((m) => m.toast.success(`${results.length} résultat(s) trouvé(s)`)).catch(() => undefined);
        }
      } catch (err) {
        logger.warn('feature-browser', 'search-in-page cross-origin', { err });
        import('../../ui/toast.js').then((m) => m.toast.warn('Recherche impossible (site cross-origin)')).catch(() => undefined);
      }
      break;
    }
    case 'show-toc': {
      try {
        const doc = iframe?.contentDocument ?? null;
        const stats = extractReaderStats(doc);
        if (stats.toc.length === 0) {
          import('../../ui/toast.js').then((m) => m.toast.info('Aucun titre H1/H2/H3 trouvé')).catch(() => undefined);
          break;
        }
        /* Affiche un mini panel TOC dans le sidebar */
        const sidebarEl = rootEl.querySelector<HTMLElement>('#ax-browser-sidebar');
        const sidebarContent = rootEl.querySelector<HTMLDivElement>('#ax-sidebar-content');
        if (sidebarEl && sidebarContent) {
          sidebarEl.style.display = 'flex';
          sidebarContent.innerHTML = `
            <div class="ax-gs-27">
              <h3 style="color:#c9a227;font-size:14px;margin:0 0 8px 0">📑 Sommaire</h3>
              <p style="color:#999;font-size:11px;margin:0 0 8px 0">${stats.wordCount} mots • ${stats.readingTimeMin} min de lecture</p>
              <ul class="ax-gs-286">
                ${stats.toc.map((h) => `
                  <li style="padding:4px 0;padding-left:${(h.level - 1) * 12}px;color:#fff;font-size:${14 - h.level}px;border-bottom:1px solid rgba(201,162,39,0.1)">
                    ${escapeHtml(h.text)}
                  </li>`).join('')}
              </ul>
            </div>`;
        }
      } catch (err) {
        logger.warn('feature-browser', 'show-toc cross-origin', { err });
        import('../../ui/toast.js').then((m) => m.toast.warn('TOC impossible (site cross-origin)')).catch(() => undefined);
      }
      break;
    }
    default:
      break;
  }
}

function renderSidebar(rootEl: HTMLElement, tab: string): void {
  const sidebar = rootEl.querySelector<HTMLElement>('#ax-browser-sidebar');
  const content = rootEl.querySelector<HTMLDivElement>('#ax-sidebar-content');
  if (!sidebar || !content) return;
  /* Update active tab style */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-sidebar-tab]').forEach((b) => {
    if (b.dataset['sidebarTab'] === tab) {
      b.style.background = 'rgba(201,162,39,0.15)';
      b.style.color = '#c9a227';
      b.style.borderBottom = '2px solid #c9a227';
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--ax-text-dim,#999)';
      b.style.borderBottom = 'none';
    }
  });

  if (tab === 'bookmarks') {
    const list = bookmarksStore.load();
    content.innerHTML = list.length === 0
      ? '<p class="ax-gs-347">Aucun favori. Clique ☆ pour ajouter.</p>'
      : list
          .map(
            (b) => `
            <div data-nav-url="${escapeHtml(b.url)}" class="ax-gs-348">
              <img src="${escapeHtml(b.favicon)}" alt="" loading="lazy" decoding="async" style="width:16px;height:16px" onerror="this.style.display='none'">
              <span class="ax-gs-125">${escapeHtml(b.title)}</span>
              <span data-bookmark-remove="${escapeHtml(b.id)}" style="opacity:0.5;cursor:pointer;color:#ff6666;font-size:11px">✕</span>
            </div>`,
          )
          .join('');
  } else if (tab === 'history') {
    const entries = historyStore.load().slice(0, 50);
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:0 4px">
        <span style="color:var(--ax-text-dim,#999);font-size:12px">${historyStore.count()} entrées</span>
        <button data-action="clear-history" style="padding:4px 8px;background:rgba(255,100,100,0.1);border:1px solid rgba(255,100,100,0.3);color:#ff6666;border-radius:4px;cursor:pointer;font-size:11px">Effacer</button>
      </div>
      ${entries.length === 0
        ? '<p class="ax-gs-347">Aucun historique.</p>'
        : entries
            .map(
              (h) => `
              <div data-nav-url="${escapeHtml(h.url)}" class="ax-gs-348">
                <span class="ax-gs-87">🕒</span>
                <span class="ax-gs-125">${escapeHtml(h.title)}</span>
              </div>`,
            )
            .join('')}
    `;
  } else if (tab === 'ai') {
    content.innerHTML = `
      <div class="ax-gs-27">
        <p style="color:#c9a227;font-size:13px;margin:0 0 12px 0">🤖 Apex IA Search</p>
        <p style="color:var(--ax-text-dim,#999);font-size:12px;margin:0 0 12px 0">Tape <code class="ax-gs-198">?</code> dans la barre URL suivi de ta question pour interroger Apex.</p>
        <p style="color:var(--ax-text-dim,#999);font-size:12px;margin:0">Exemples :</p>
        <ul style="color:var(--ax-text-dim,#999);font-size:12px;padding-left:16px">
          <li>?résume cette page</li>
          <li>?recette tomate</li>
          <li>?meteo Monaco</li>
        </ul>
      </div>`;
  }

  /* Click delegation pour bookmarks/history nav + remove + clear */
  content.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest<HTMLElement>('[data-bookmark-remove]');
      if (removeBtn) {
        const id = removeBtn.dataset['bookmarkRemove'];
        if (id) {
          bookmarksStore.remove(id);
          renderSidebar(rootEl, 'bookmarks');
        }
        return;
      }
      const navEl = target.closest<HTMLElement>('[data-nav-url]');
      if (navEl) {
        const url = navEl.dataset['navUrl'];
        if (url) {
          const iframe = rootEl.querySelector<HTMLIFrameElement>('#ax-browser-iframe');
          const urlInput = rootEl.querySelector<HTMLInputElement>('#ax-browser-url');
          if (iframe) iframe.src = url;
          if (urlInput) urlInput.value = url;
          historyStore.push(url);
        }
        return;
      }
      const clearBtn = target.closest<HTMLElement>('[data-action="clear-history"]');
      if (clearBtn) {
        historyStore.clear();
        renderSidebar(rootEl, 'history');
      }
    },
    { once: true },
  );
}
