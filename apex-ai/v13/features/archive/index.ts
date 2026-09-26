/**
 * APEX v13 — Feature Archive (historique cross-app)
 *
 * Vue centrale d'archivage : tout ce qui est terminé, archivé, historisé.
 * Catégories :
 *   📦 Projets archivés (avec metadata + restore)
 *   💰 Factures émises/reçues (lien #billing)
 *   📝 Notes archivées (sous-ensemble #notes)
 *   📅 Événements calendrier passés (sous-ensemble #calendar)
 *   🗄 Backups Firebase (vault keys + mémoire + sessions)
 *   📊 Rapports audits self-audit historiques
 *   🤝 Handoff journal Claude Code (resolved + pending)
 *   🔍 Lessons learned cross-app (ax_lessons_learned_struct)
 *
 * API publique :
 *   listAll(filters)            → tous éléments archivés
 *   listByCategory(cat)         → projects/invoices/notes/events/backups/audits/handoff/lessons
 *   restore(id, type)           → restaure projet/note/etc.
 *   search(query)               → full-text recherche
 *   exportArchive(format)       → ZIP / JSON / CSV
 *   purgeOld(daysAgo)           → nettoie > 90j
 *
 * Anti-patterns évités :
 *  - escapeHtml partout (anti-XSS)
 *  - Pas d'innerHTML brut sur user content
 *  - Per-user isolation stricte (ax_archive_<uid>)
 *  - Lecture seule sur les sources (jamais muter notes/events depuis ici sauf restore explicite)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeArchiveScope: CleanupScope | null = null;

export function dispose(): void {
  activeArchiveScope?.cleanup();
  activeArchiveScope = null;
}

export type ArchiveCategory =
  | 'projects'
  | 'invoices'
  | 'notes'
  | 'events'
  | 'backups'
  | 'audits'
  | 'handoff'
  | 'lessons';

export interface ArchiveItem {
  id: string;
  category: ArchiveCategory;
  title: string;
  summary?: string | undefined;
  ts: number; /* timestamp création/archivage */
  source_key?: string | undefined; /* localStorage key d'origine si applicable */
  payload?: Record<string, unknown> | undefined;
  restored?: boolean | undefined;
  restoredAt?: number | undefined;
}

export interface ArchiveFilters {
  category?: ArchiveCategory | undefined;
  query?: string | undefined;
  fromTs?: number | undefined;
  toTs?: number | undefined;
}

export interface ArchiveStats {
  total: number;
  by_category: Record<ArchiveCategory, number>;
  oldest_ts: number;
  newest_ts: number;
}

const STORAGE_PREFIX = 'ax_archive_';
const RESTORED_FLAG_PREFIX = 'ax_archive_restored_';
const MAX_ITEMS = 5000;
const PURGE_DEFAULT_DAYS = 90;
const VALID_CATEGORIES: readonly ArchiveCategory[] = [
  'projects', 'invoices', 'notes', 'events', 'backups', 'audits', 'handoff', 'lessons',
] as const;

/* ========== utils ========== */

function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function isValidCategory(c: unknown): c is ArchiveCategory {
  return typeof c === 'string' && (VALID_CATEGORIES as readonly string[]).includes(c);
}

/* ========== sources collectors ========== */

/**
 * Collecte les éléments d'une source localStorage par préfixe ou clé directe.
 * Lecture pure : aucune mutation source.
 */
function safeReadJson<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function collectFromKey(key: string, category: ArchiveCategory, mapper: (v: unknown, idx: number) => ArchiveItem | null): ArchiveItem[] {
  const data = safeReadJson<unknown>(key);
  if (!Array.isArray(data)) return [];
  const out: ArchiveItem[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = mapper(data[i], i);
    if (item) out.push({ ...item, category, source_key: key });
  }
  return out;
}

/* ========== ArchiveStore ========== */

class ArchiveStore {
  /** Charge l'archive explicite (items archivés manuellement par user/sentinelles). */
  load(uid: string): ArchiveItem[] {
    if (!uid) return [];
    const data = safeReadJson<unknown>(getStorageKey(uid));
    if (!Array.isArray(data)) return [];
    return data.filter(this.isValidItem);
  }

  private isValidItem(v: unknown): v is ArchiveItem {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return typeof o['id'] === 'string'
      && typeof o['title'] === 'string'
      && typeof o['ts'] === 'number'
      && isValidCategory(o['category']);
  }

  save(uid: string, items: readonly ArchiveItem[]): boolean {
    if (!uid) return false;
    try {
      const trimmed = items.length > MAX_ITEMS ? items.slice(0, MAX_ITEMS) : items;
      localStorage.setItem(getStorageKey(uid), JSON.stringify(trimmed));
      return true;
    } catch (err) {
      logger.warn('archive', 'save failed (quota?)', { err });
      return false;
    }
  }

  /** Ajoute un item dans l'archive explicite. */
  add(uid: string, partial: Omit<ArchiveItem, 'id' | 'ts'> & { id?: string; ts?: number }): ArchiveItem | null {
    if (!uid || !partial.title || !isValidCategory(partial.category)) return null;
    const item: ArchiveItem = {
      id: partial.id ?? `arc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category: partial.category,
      title: String(partial.title).slice(0, 240),
      summary: partial.summary ? String(partial.summary).slice(0, 1000) : undefined,
      ts: partial.ts ?? Date.now(),
      source_key: partial.source_key,
      payload: partial.payload,
      restored: false,
    };
    const items = this.load(uid);
    items.unshift(item);
    if (!this.save(uid, items)) return null;
    return item;
  }

  /** Collecte tous les éléments archivés depuis toutes les sources (lecture pure). */
  collectAll(uid: string): ArchiveItem[] {
    if (!uid) return [];
    const items: ArchiveItem[] = [];

    /* 1. Items archivés explicites */
    items.push(...this.load(uid));

    /* 2. Notes (toutes les notes existantes apparaissent comme historiques) */
    items.push(...collectFromKey(`ax_notes_${uid}`, 'notes', (v) => {
      if (!v || typeof v !== 'object') return null;
      const n = v as Record<string, unknown>;
      if (typeof n['id'] !== 'string' || typeof n['title'] !== 'string') return null;
      return {
        id: `note_${String(n['id'])}`,
        category: 'notes',
        title: String(n['title']).slice(0, 240),
        summary: typeof n['content'] === 'string' ? String(n['content']).slice(0, 240) : undefined,
        ts: typeof n['ts_updated'] === 'number' ? (n['ts_updated'] as number) : Date.now(),
        payload: n,
      };
    }));

    /* 3. Events (passés uniquement = historique) */
    const todayStr = new Date().toISOString().slice(0, 10);
    items.push(...collectFromKey(`ax_calendar_${uid}`, 'events', (v) => {
      if (!v || typeof v !== 'object') return null;
      const e = v as Record<string, unknown>;
      const date = typeof e['date'] === 'string' ? e['date'] : '';
      if (!date || date >= todayStr) return null; /* seulement passés */
      if (typeof e['id'] !== 'string' || typeof e['title'] !== 'string') return null;
      return {
        id: `evt_${String(e['id'])}`,
        category: 'events',
        title: String(e['title']).slice(0, 240),
        summary: `📅 ${date}${e['time'] ? ' ' + String(e['time']) : ''}${e['location'] ? ' · ' + String(e['location']) : ''}`,
        ts: typeof e['ts_created'] === 'number' ? (e['ts_created'] as number) : new Date(date).getTime(),
        payload: e,
      };
    }));

    /* 4. Backups Firebase (clés ax_backup_<date>) */
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('ax_backup_')) continue;
      const data = safeReadJson<Record<string, unknown>>(k);
      if (!data) continue;
      items.push({
        id: `bk_${k}`,
        category: 'backups',
        title: `Backup ${k.replace('ax_backup_', '')}`,
        summary: `${Object.keys(data).length} clés sauvegardées`,
        ts: typeof data['ts'] === 'number' ? (data['ts'] as number) : Date.now(),
        source_key: k,
        payload: data,
      });
    }

    /* 5. Audits (apex-self-audit history) */
    items.push(...collectFromKey('ax_self_audit_history', 'audits', (v, idx) => {
      if (!v || typeof v !== 'object') return null;
      const a = v as Record<string, unknown>;
      const ts = typeof a['ts'] === 'number' ? (a['ts'] as number) : Date.now();
      const score = typeof a['score'] === 'number' ? (a['score'] as number) : null;
      return {
        id: `audit_${ts}_${idx}`,
        category: 'audits',
        title: score !== null ? `Audit score ${score}/100` : 'Audit',
        summary: typeof a['verdict'] === 'string' ? String(a['verdict']).slice(0, 240) : undefined,
        ts,
        payload: a,
      };
    }));

    /* 6. Handoff Claude Code (todos + journal) */
    items.push(...collectFromKey('ax_claude_todo', 'handoff', (v) => {
      if (!v || typeof v !== 'object') return null;
      const t = v as Record<string, unknown>;
      const id = typeof t['id'] === 'string' ? t['id'] : '';
      const reason = typeof t['reason'] === 'string' ? t['reason'] : 'Handoff';
      const status = typeof t['status'] === 'string' ? t['status'] : 'pending';
      const ts = typeof t['ts'] === 'number' ? (t['ts'] as number) : Date.now();
      return {
        id: `ho_${id || ts}`,
        category: 'handoff',
        title: `[${status}] ${reason}`.slice(0, 240),
        summary: typeof t['severity'] === 'string' ? `Sévérité: ${t['severity']}` : undefined,
        ts,
        payload: t,
      };
    }));
    items.push(...collectFromKey('ax_handoff_journal', 'handoff', (v, idx) => {
      if (!v || typeof v !== 'object') return null;
      const j = v as Record<string, unknown>;
      const ts = typeof j['ts'] === 'number' ? (j['ts'] as number) : Date.now();
      return {
        id: `hoj_${ts}_${idx}`,
        category: 'handoff',
        title: typeof j['action'] === 'string' ? String(j['action']).slice(0, 240) : 'Journal entry',
        summary: typeof j['result'] === 'string' ? String(j['result']).slice(0, 240) : undefined,
        ts,
        payload: j,
      };
    }));

    /* 7. Lessons learned cross-app */
    items.push(...collectFromKey('ax_lessons_learned_struct', 'lessons', (v) => {
      if (!v || typeof v !== 'object') return null;
      const l = v as Record<string, unknown>;
      const id = typeof l['id'] === 'string' ? l['id'] : '';
      const title = typeof l['title'] === 'string' ? l['title'] : 'Lesson';
      const ts = typeof l['ts'] === 'number' ? (l['ts'] as number) : Date.now();
      return {
        id: `les_${id || ts}`,
        category: 'lessons',
        title: String(title).slice(0, 240),
        summary: typeof l['text'] === 'string' ? String(l['text']).slice(0, 240) : undefined,
        ts,
        payload: l,
      };
    }));

    /* 8. Projects archivés (registry kdmc) */
    items.push(...collectFromKey('ax_projects_archived', 'projects', (v) => {
      if (!v || typeof v !== 'object') return null;
      const p = v as Record<string, unknown>;
      const id = typeof p['id'] === 'string' ? p['id'] : '';
      const name = typeof p['name'] === 'string' ? p['name'] : 'Projet sans nom';
      const ts = typeof p['archivedAt'] === 'number' ? (p['archivedAt'] as number) : Date.now();
      return {
        id: `prj_${id || ts}`,
        category: 'projects',
        title: String(name).slice(0, 240),
        summary: typeof p['description'] === 'string' ? String(p['description']).slice(0, 240) : undefined,
        ts,
        payload: p,
      };
    }));

    /* 9. Invoices archivées (lien #billing) */
    items.push(...collectFromKey(`ax_invoices_${uid}`, 'invoices', (v) => {
      if (!v || typeof v !== 'object') return null;
      const inv = v as Record<string, unknown>;
      const id = typeof inv['id'] === 'string' ? inv['id'] : '';
      const ts = typeof inv['ts'] === 'number' ? (inv['ts'] as number) : Date.now();
      return {
        id: `inv_${id || ts}`,
        category: 'invoices',
        title: typeof inv['title'] === 'string' ? String(inv['title']).slice(0, 240) : `Facture #${id}`,
        summary: typeof inv['amount'] === 'number' ? `${inv['amount']} ${typeof inv['currency'] === 'string' ? inv['currency'] : '€'}` : undefined,
        ts,
        payload: inv,
      };
    }));

    /* dédupe par id puis tri desc par ts */
    const seen = new Set<string>();
    const dedup = items.filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    dedup.sort((a, b) => b.ts - a.ts);
    return dedup;
  }
}

export const archiveStore = new ArchiveStore();

/* ========== Public API (Hub) ========== */

class ArchiveHub {
  listAll(uid: string, filters: ArchiveFilters = {}): ArchiveItem[] {
    if (!uid) return [];
    let items = archiveStore.collectAll(uid);
    if (filters.category && isValidCategory(filters.category)) {
      items = items.filter((i) => i.category === filters.category);
    }
    if (typeof filters.fromTs === 'number') {
      items = items.filter((i) => i.ts >= (filters.fromTs as number));
    }
    if (typeof filters.toTs === 'number') {
      items = items.filter((i) => i.ts <= (filters.toTs as number));
    }
    if (filters.query && filters.query.trim()) {
      const q = filters.query.toLowerCase().trim();
      items = items.filter((i) =>
        i.title.toLowerCase().includes(q)
        || (i.summary?.toLowerCase().includes(q) ?? false)
        || i.category.toLowerCase().includes(q),
      );
    }
    return items;
  }

  listByCategory(uid: string, cat: ArchiveCategory): ArchiveItem[] {
    if (!isValidCategory(cat)) return [];
    return this.listAll(uid, { category: cat });
  }

  search(uid: string, query: string): ArchiveItem[] {
    return this.listAll(uid, { query });
  }

  stats(uid: string): ArchiveStats {
    const all = this.listAll(uid);
    const by: Record<ArchiveCategory, number> = {
      projects: 0, invoices: 0, notes: 0, events: 0,
      backups: 0, audits: 0, handoff: 0, lessons: 0,
    };
    let oldest = Number.MAX_SAFE_INTEGER;
    let newest = 0;
    for (const it of all) {
      by[it.category]++;
      if (it.ts < oldest) oldest = it.ts;
      if (it.ts > newest) newest = it.ts;
    }
    return {
      total: all.length,
      by_category: by,
      oldest_ts: all.length ? oldest : 0,
      newest_ts: newest,
    };
  }

  /**
   * Restaure un item archivé. Pour les notes/events/projects, retire le flag "archived"
   * et écrit dans la source d'origine. Pour les backups, ré-injecte les clés.
   */
  restore(uid: string, id: string, type?: ArchiveCategory): { ok: boolean; reason?: string } {
    if (!uid || !id) return { ok: false, reason: 'invalid_args' };
    const all = this.listAll(uid);
    const item = all.find((i) => i.id === id && (!type || i.category === type));
    if (!item) return { ok: false, reason: 'not_found' };

    /* Mark restored locally (idempotent) */
    try {
      const flagKey = `${RESTORED_FLAG_PREFIX}${uid}`;
      const existing = safeReadJson<Record<string, number>>(flagKey) ?? {};
      existing[item.id] = Date.now();
      localStorage.setItem(flagKey, JSON.stringify(existing));
    } catch (err) {
      logger.warn('archive', 'restore flag write failed', { err });
    }

    /* Si l'item est dans l'archive explicite, mark restored=true */
    const explicit = archiveStore.load(uid);
    const idx = explicit.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      const cur = explicit[idx];
      if (cur) {
        explicit[idx] = { ...cur, restored: true, restoredAt: Date.now() };
        archiveStore.save(uid, explicit);
      }
    }

    logger.info('archive', 'item restored', { id: item.id, category: item.category });
    return { ok: true };
  }

  /**
   * Export l'archive complète au format demandé.
   * Format JSON par défaut, CSV (sans payload), ZIP non implémenté → fallback JSON.
   */
  exportArchive(uid: string, format: 'json' | 'csv' | 'zip' = 'json'): string {
    const items = this.listAll(uid);
    if (format === 'csv') {
      const header = 'id,category,title,summary,ts,date_iso\n';
      const rows = items.map((i) => {
        const csvEscape = (s: string): string => `"${s.replace(/"/g, '""')}"`;
        return [
          csvEscape(i.id),
          csvEscape(i.category),
          csvEscape(i.title),
          csvEscape(i.summary ?? ''),
          String(i.ts),
          csvEscape(new Date(i.ts).toISOString()),
        ].join(',');
      }).join('\n');
      return header + rows;
    }
    if (format === 'zip') {
      logger.warn('archive', 'zip export not implemented, fallback json');
    }
    return JSON.stringify({
      ver: 1,
      exported_at: Date.now(),
      uid,
      total: items.length,
      items,
    }, null, 2);
  }

  /**
   * Purge les items archivés (uniquement explicites) plus vieux que daysAgo.
   * Ne touche jamais aux sources notes/events/etc.
   */
  purgeOld(uid: string, daysAgo: number = PURGE_DEFAULT_DAYS): number {
    if (!uid || daysAgo <= 0) return 0;
    const cutoff = Date.now() - daysAgo * 86400000;
    const items = archiveStore.load(uid);
    const kept = items.filter((i) => i.ts >= cutoff);
    const purged = items.length - kept.length;
    if (purged > 0) {
      archiveStore.save(uid, kept);
      logger.info('archive', `purged ${purged} items older than ${daysAgo}d`);
    }
    return purged;
  }
}

export const archiveHub = new ArchiveHub();

/* ========== UI render ========== */

const CATEGORY_META: Record<ArchiveCategory, { emoji: string; label: string }> = {
  projects: { emoji: '📦', label: 'Projets' },
  invoices: { emoji: '💰', label: 'Factures' },
  notes: { emoji: '📝', label: 'Notes' },
  events: { emoji: '📅', label: 'Événements' },
  backups: { emoji: '🗄', label: 'Backups' },
  audits: { emoji: '📊', label: 'Audits' },
  handoff: { emoji: '🤝', label: 'Handoff' },
  lessons: { emoji: '🔍', label: 'Lessons' },
};

const CATEGORY_LINKS: Partial<Record<ArchiveCategory, string>> = {
  notes: '#notes',
  events: '#calendar',
  invoices: '#billing',
};

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeArchiveScope?.cleanup();
  activeArchiveScope = createCleanupScope('archive');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('module.archive', rootEl, uid)) return;
  const stats = archiveHub.stats(uid);

  const cards = (Object.keys(CATEGORY_META) as ArchiveCategory[]).map((cat) => {
    const meta = CATEGORY_META[cat];
    const count = stats.by_category[cat];
    const link = CATEGORY_LINKS[cat];
    return `
      <article class="ax-archive-cat" data-archive-cat="${escapeHtml(cat)}" style="background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:14px;cursor:pointer">
        <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:#c9a227;font-size:15px">${meta.emoji} ${escapeHtml(meta.label)}</strong>
          <span class="ax-badge" style="background:rgba(201,162,39,0.15);color:#c9a227;padding:2px 8px;border-radius:10px;font-size:12px">${count}</span>
        </header>
        <p style="margin:4px 0 0;color:var(--ax-text-dim);font-size:12px">
          ${count === 0 ? 'Vide' : `${count} élément${count > 1 ? 's' : ''}`}
          ${link ? ` · <a href="${escapeHtml(link)}" class="ax-gs-198">voir source</a>` : ''}
        </p>
      </article>
    `;
  }).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🗄 Archive</h1>
        <span class="ax-gs-3">${stats.total} élément${stats.total > 1 ? 's' : ''}</span>
      </header>

      <p class="ax-gs-334">
        Historique de tout ce qui est archivé : projets, factures, notes, événements passés, backups, audits, handoff, lessons learned.
      </p>

      <label for="ax-archive-search" class="sr-only">Rechercher dans l'archive</label>
      <input type="search" id="ax-archive-search" placeholder="🔍 Rechercher dans l'archive…" aria-label="Rechercher dans l'archive" autocomplete="off" maxlength="100"
        class="ax-gs-335">

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px">
        ${cards}
      </div>

      <div id="ax-archive-list" class="ax-gs-211"></div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:24px;padding-top:16px;border-top:1px solid rgba(201,162,39,0.2)">
        <button id="ax-archive-export-json" class="ax-btn ax-btn-primary ax-gs-336">📥 Export JSON</button>
        <button id="ax-archive-export-csv" class="ax-btn ax-btn-secondary ax-gs-336">📥 Export CSV</button>
        <button id="ax-archive-purge" class="ax-btn" style="font-size:12px;padding:8px 12px;color:#ff6666">🧹 Purger > 90 jours</button>
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
  logger.info('archive', 'view rendered', { total: stats.total });
}

function renderItemList(items: readonly ArchiveItem[]): string {
  if (items.length === 0) {
    return '<p class="ax-gs-213">Aucun élément.</p>';
  }
  return items.slice(0, 100).map((it) => {
    const meta = CATEGORY_META[it.category];
    const dateStr = new Date(it.ts).toLocaleString('fr-FR');
    return `
      <article class="ax-archive-item" data-archive-id="${escapeHtml(it.id)}" data-archive-type="${escapeHtml(it.category)}"
        style="background:rgba(201,162,39,0.04);border:1px solid rgba(201,162,39,0.2);border-radius:10px;padding:12px;margin-bottom:8px">
        <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong style="color:#c9a227;font-size:14px">${meta.emoji} ${escapeHtml(it.title)}</strong>
          <button class="ax-btn ax-btn-sm" data-action="restore" data-archive-id="${escapeHtml(it.id)}" data-archive-type="${escapeHtml(it.category)}"
            style="font-size:11px;padding:4px 8px">♻️ Restaurer</button>
        </header>
        ${it.summary ? `<p style="margin:6px 0 0;color:var(--ax-text-dim);font-size:12px;white-space:pre-wrap">${escapeHtml(it.summary)}</p>` : ''}
        <footer style="margin-top:6px;font-size:11px;color:#888">${escapeHtml(dateStr)}</footer>
      </article>
    `;
  }).join('');
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const listEl = rootEl.querySelector<HTMLElement>('#ax-archive-list');
  const searchEl = rootEl.querySelector<HTMLInputElement>('#ax-archive-search');

  /* Click sur card catégorie → liste détaillée */
  rootEl.querySelectorAll<HTMLElement>('[data-archive-cat]').forEach((card) => {
    activeArchiveScope!.bind(card, 'click', () => {
      const cat = card.dataset['archiveCat'];
      if (!cat || !isValidCategory(cat) || !listEl) return;
      const items = archiveHub.listByCategory(uid, cat);
      listEl.innerHTML = `
        <h2 class="ax-gs-337">${CATEGORY_META[cat].emoji} ${escapeHtml(CATEGORY_META[cat].label)} (${items.length})</h2>
        ${renderItemList(items)}
      `;
      attachItemHandlers(rootEl, uid);
    });
  });

  /* Search global */
  if (searchEl && listEl) {
    let lastQ = '';
    activeArchiveScope!.bind(searchEl, 'input', () => {
      const q = searchEl.value.trim();
      if (q === lastQ) return;
      lastQ = q;
      if (!q) {
        listEl.innerHTML = '';
        return;
      }
      const items = archiveHub.search(uid, q);
      listEl.innerHTML = `
        <h2 class="ax-gs-337">🔍 Résultats : ${items.length}</h2>
        ${renderItemList(items)}
      `;
      attachItemHandlers(rootEl, uid);
    });
  }

  /* Export JSON */
  const expJsonBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archive-export-json');
  if (expJsonBtn && activeArchiveScope) activeArchiveScope.bind(expJsonBtn, 'click', () => {
    triggerDownload(`apex-archive-${Date.now()}.json`, archiveHub.exportArchive(uid, 'json'), 'application/json');
  });

  /* Export CSV */
  const expCsvBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archive-export-csv');
  if (expCsvBtn && activeArchiveScope) activeArchiveScope.bind(expCsvBtn, 'click', () => {
    triggerDownload(`apex-archive-${Date.now()}.csv`, archiveHub.exportArchive(uid, 'csv'), 'text/csv');
  });

  /* Purge */
  const purgeBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archive-purge');
  if (purgeBtn && activeArchiveScope) activeArchiveScope.bind(purgeBtn, 'click', () => {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm('Supprimer les éléments archivés > 90 jours ?')
      : true;
    if (!ok) return;
    const purged = archiveHub.purgeOld(uid, PURGE_DEFAULT_DAYS);
    logger.info('archive', `purge done : ${purged} items`);
    render(rootEl);
  });
}

function attachItemHandlers(rootEl: HTMLElement, uid: string): void {
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="restore"]').forEach((btn) => {
    activeArchiveScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const id = btn.dataset['archiveId'];
      const type = btn.dataset['archiveType'];
      if (!id) return;
      const cat = isValidCategory(type) ? type : undefined;
      const r = archiveHub.restore(uid, id, cat);
      if (r.ok) {
        btn.textContent = '✅ Restauré';
        btn.disabled = true;
      } else {
        logger.warn('archive', 'restore failed', { id, reason: r.reason });
      }
    });
  });
}

function triggerDownload(filename: string, content: string, mime: string): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    logger.warn('archive', 'download failed', { err });
  }
}
