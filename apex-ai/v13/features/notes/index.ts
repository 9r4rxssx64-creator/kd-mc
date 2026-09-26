/**
 * APEX v13 — Feature Notes (bloc-notes personnel)
 *
 * Port v12 vNotes : bloc-notes simple, persistant per-user.
 * - Liste de notes (titre + contenu + tags + favoris)
 * - Ajout/édition/suppression rapide
 * - Recherche full-text
 * - Persistence localStorage per-user (clé `ax_notes_<uid>`)
 * - Export JSON pour backup
 *
 * Anti-patterns évités :
 * - escapeHtml partout (anti-XSS)
 * - Pas de innerHTML brut sur user content
 * - Per-user isolation stricte
 */

export { escapeHtml } from '../../core/escape-html.js';

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

/* P1-6 (audit v13.2.7) : scope listener pour anti-leak SPA navigation. */
let activeNotesScope: CleanupScope | null = null;

export function dispose(): void {
  activeNotesScope?.cleanup();
  activeNotesScope = null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: readonly string[];
  favorite: boolean;
  ts_created: number;
  ts_updated: number;
}

const STORAGE_PREFIX = 'ax_notes_';

function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

class NotesStore {
  load(uid: string): Note[] {
    if (!uid) return [];
    try {
      const raw = localStorage.getItem(getStorageKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValidNote);
    } catch (err) {
      logger.warn('notes', 'load failed', { err });
      return [];
    }
  }

  private isValidNote(n: unknown): n is Note {
    if (!n || typeof n !== 'object') return false;
    const o = n as Record<string, unknown>;
    return typeof o['id'] === 'string'
      && typeof o['title'] === 'string'
      && typeof o['content'] === 'string'
      && Array.isArray(o['tags'])
      && typeof o['favorite'] === 'boolean'
      && typeof o['ts_created'] === 'number'
      && typeof o['ts_updated'] === 'number';
  }

  save(uid: string, notes: readonly Note[]): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid), JSON.stringify(notes));
      return true;
    } catch (err) {
      logger.warn('notes', 'save failed (quota?)', { err });
      return false;
    }
  }

  add(uid: string, partial: { title: string; content: string; tags?: readonly string[] }): Note | null {
    if (!uid || !partial.title.trim()) return null;
    const notes = this.load(uid);
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: partial.title.trim().slice(0, 200),
      content: partial.content.slice(0, 50000),
      tags: (partial.tags ?? []).slice(0, 10).map((t) => t.toLowerCase().trim()).filter(Boolean),
      favorite: false,
      ts_created: Date.now(),
      ts_updated: Date.now(),
    };
    notes.unshift(note);
    if (notes.length > 500) notes.length = 500;
    if (!this.save(uid, notes)) return null;
    return note;
  }

  update(uid: string, id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'favorite'>>): boolean {
    if (!uid) return false;
    const notes = this.load(uid);
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    const existing = notes[idx];
    if (!existing) return false;
    const updated: Note = {
      ...existing,
      ...(patch.title !== undefined && { title: patch.title.trim().slice(0, 200) }),
      ...(patch.content !== undefined && { content: patch.content.slice(0, 50000) }),
      ...(patch.tags !== undefined && { tags: patch.tags.slice(0, 10) }),
      ...(patch.favorite !== undefined && { favorite: patch.favorite }),
      ts_updated: Date.now(),
    };
    notes[idx] = updated;
    return this.save(uid, notes);
  }

  remove(uid: string, id: string): boolean {
    if (!uid) return false;
    const notes = this.load(uid).filter((n) => n.id !== id);
    return this.save(uid, notes);
  }

  search(uid: string, query: string): Note[] {
    if (!uid || !query.trim()) return this.load(uid);
    const q = query.toLowerCase().trim();
    return this.load(uid).filter((n) =>
      n.title.toLowerCase().includes(q)
      || n.content.toLowerCase().includes(q)
      || n.tags.some((t) => t.includes(q)),
    );
  }

  toggleFavorite(uid: string, id: string): boolean {
    const notes = this.load(uid);
    const note = notes.find((n) => n.id === id);
    if (!note) return false;
    return this.update(uid, id, { favorite: !note.favorite });
  }

  exportJson(uid: string): string {
    return JSON.stringify(this.load(uid), null, 2);
  }

  count(uid: string): number {
    return this.load(uid).length;
  }
}

export const notesStore = new NotesStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeNotesScope?.cleanup();
  activeNotesScope = createCleanupScope('notes');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('module.notes', rootEl, uid)) return;
  const notes = notesStore.load(uid);

  const cards = notes.length > 0
    ? notes.map((n) => `
        <article class="ax-note-card ax-gs-400" data-note-id="${escapeHtml(n.id)}">
          <header class="ax-gs-219">
            <h3 class="ax-gs-319">${escapeHtml(n.title)}</h3>
            <span style="font-size:18px;cursor:pointer" data-action="favorite" data-note-id="${escapeHtml(n.id)}" title="Favoris">${n.favorite ? '⭐' : '☆'}</span>
          </header>
          <p style="margin:8px 0;color:var(--ax-text-dim);font-size:13px;white-space:pre-wrap">${escapeHtml(n.content.slice(0, 240))}${n.content.length > 240 ? '…' : ''}</p>
          <footer style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#888">
            <span>${new Date(n.ts_updated).toLocaleString('fr-FR')}</span>
            <button class="ax-btn ax-btn-sm ax-gs-349" data-action="delete" data-note-id="${escapeHtml(n.id)}">Supprimer</button>
          </footer>
        </article>
      `).join('')
    : '<p class="ax-gs-213">Aucune note. Crée ta première !</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📝 Bloc-notes</h1>
        <span class="ax-gs-3">${notes.length} note${notes.length > 1 ? 's' : ''}</span>
      </header>

      <form id="ax-notes-form" class="ax-form ax-gs-350">
        <label for="ax-notes-title" class="sr-only">Titre de la note</label>
        <input type="text" id="ax-notes-title" placeholder="Titre…" aria-label="Titre de la note" maxlength="200" autocomplete="off" required class="ax-gs-351">
        <label for="ax-notes-content" class="sr-only">Contenu de la note</label>
        <textarea id="ax-notes-content" placeholder="Contenu…" aria-label="Contenu de la note" rows="3" maxlength="50000" style="width:100%;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <label for="ax-notes-tags" class="sr-only">Tags (séparés par des virgules)</label>
          <input type="text" id="ax-notes-tags" placeholder="tags séparés par des virgules" aria-label="Tags de la note séparés par des virgules" autocomplete="off" maxlength="100" style="flex:1;padding:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;margin-right:8px">
          <button type="submit" class="ax-btn ax-btn-primary ax-gs-401">Ajouter</button>
        </div>
      </form>

      <label for="ax-notes-search" class="sr-only">Rechercher une note</label>
      <input type="text" id="ax-notes-search" placeholder="🔍 Rechercher…" aria-label="Rechercher dans les notes" autocomplete="off" maxlength="100" class="ax-gs-335">

      <div id="ax-notes-list">${cards}</div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const form = rootEl.querySelector<HTMLFormElement>('#ax-notes-form');
  if (form) {
    activeNotesScope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      const titleEl = rootEl.querySelector<HTMLInputElement>('#ax-notes-title');
      const contentEl = rootEl.querySelector<HTMLTextAreaElement>('#ax-notes-content');
      const tagsEl = rootEl.querySelector<HTMLInputElement>('#ax-notes-tags');
      const title = titleEl?.value.trim() ?? '';
      const content = contentEl?.value ?? '';
      const tags = (tagsEl?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      if (!title) return;
      const note = notesStore.add(uid, { title, content, tags });
      if (note) {
        logger.info('notes', 'created', { id: note.id });
        if (titleEl) titleEl.value = '';
        if (contentEl) contentEl.value = '';
        if (tagsEl) tagsEl.value = '';
        render(rootEl);
      }
    });
  }

  const searchEl = rootEl.querySelector<HTMLInputElement>('#ax-notes-search');
  if (searchEl) {
    activeNotesScope!.bind(searchEl, 'input', () => {
      const q = searchEl.value.trim();
      const notes = q ? notesStore.search(uid, q) : notesStore.load(uid);
      const listEl = rootEl.querySelector<HTMLElement>('#ax-notes-list');
      if (!listEl) return;
      listEl.innerHTML = notes.length > 0
        ? notes.map((n) => `
            <article class="ax-note-card ax-gs-400" data-note-id="${escapeHtml(n.id)}">
              <h3 class="ax-gs-319">${escapeHtml(n.title)}</h3>
              <p style="margin:8px 0;color:var(--ax-text-dim);font-size:13px">${escapeHtml(n.content.slice(0, 240))}</p>
            </article>
          `).join('')
        : '<p class="ax-gs-213">Aucun résultat</p>';
    });
  }

  rootEl.querySelectorAll<HTMLElement>('[data-action="delete"]').forEach((btn) => {
    activeNotesScope!.bind(btn, 'click', () => {
      const id = btn.dataset['noteId'];
      if (!id) return;
      if (notesStore.remove(uid, id)) render(rootEl);
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="favorite"]').forEach((el) => {
    activeNotesScope!.bind(el, 'click', () => {
      const id = el.dataset['noteId'];
      if (!id) return;
      if (notesStore.toggleFavorite(uid, id)) render(rootEl);
    });
  });
}
