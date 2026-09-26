/**
 * APEX v13 — Feature Calendar (agenda personnel)
 *
 * Port v12 vCalendar : événements personnels persistants.
 * - CRUD événements (titre, date, heure, lieu, notes)
 * - Vue mensuelle simple
 * - Rappels (prochains 7 jours)
 * - Persistence per-user
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Pas de innerHTML brut
 * - Per-user isolation stricte
 * - Validation date stricte
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeCalendarScope: CleanupScope | null = null;

export function dispose(): void {
  activeCalendarScope?.cleanup();
  activeCalendarScope = null;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; /* ISO YYYY-MM-DD */
  time?: string | undefined; /* HH:MM */
  location?: string | undefined;
  notes?: string | undefined;
  ts_created: number;
}

const STORAGE_PREFIX = 'ax_calendar_';

function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

class CalendarStore {
  load(uid: string): CalEvent[] {
    if (!uid) return [];
    try {
      const raw = localStorage.getItem(getStorageKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(this.isValidEvent);
    } catch (err) {
      logger.warn('calendar', 'load failed', { err });
      return [];
    }
  }

  private isValidEvent(e: unknown): e is CalEvent {
    if (!e || typeof e !== 'object') return false;
    const o = e as Record<string, unknown>;
    return typeof o['id'] === 'string'
      && typeof o['title'] === 'string'
      && typeof o['date'] === 'string'
      && typeof o['ts_created'] === 'number';
  }

  save(uid: string, events: readonly CalEvent[]): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid), JSON.stringify(events));
      return true;
    } catch (err) {
      logger.warn('calendar', 'save failed', { err });
      return false;
    }
  }

  add(
    uid: string,
    p: { title: string; date: string; time?: string; location?: string; notes?: string },
  ): CalEvent | null {
    if (!uid || !p.title.trim() || !isValidDate(p.date)) return null;
    if (p.time && !isValidTime(p.time)) return null;
    const events = this.load(uid);
    const ev: CalEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: p.title.trim().slice(0, 200),
      date: p.date,
      time: p.time,
      location: p.location ? p.location.slice(0, 200) : undefined,
      notes: p.notes ? p.notes.slice(0, 5000) : undefined,
      ts_created: Date.now(),
    };
    events.push(ev);
    events.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
    if (events.length > 1000) events.length = 1000;
    if (!this.save(uid, events)) return null;
    return ev;
  }

  remove(uid: string, id: string): boolean {
    if (!uid) return false;
    return this.save(uid, this.load(uid).filter((e) => e.id !== id));
  }

  upcoming(uid: string, days = 7): CalEvent[] {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const limit = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
    return this.load(uid).filter((e) => e.date >= todayStr && e.date <= limit);
  }

  byMonth(uid: string, year: number, month: number): CalEvent[] {
    /* month = 1-12 */
    if (month < 1 || month > 12) return [];
    const prefix = `${year}-${month.toString().padStart(2, '0')}`;
    return this.load(uid).filter((e) => e.date.startsWith(prefix));
  }

  count(uid: string): number {
    return this.load(uid).length;
  }
}

export const calendarStore = new CalendarStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeCalendarScope?.cleanup();
  activeCalendarScope = createCleanupScope('calendar');
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('module.calendar', rootEl, uid)) return;
  const upcoming = calendarStore.upcoming(uid, 30);

  const eventsHtml = upcoming.length > 0
    ? upcoming.map((e) => `
        <article class="ax-cal-event ax-gs-338" data-event-id="${escapeHtml(e.id)}">
          <header class="ax-gs-219">
            <strong class="ax-gs-266">${escapeHtml(e.title)}</strong>
            <button class="ax-btn ax-btn-sm ax-gs-349" data-action="delete-event" data-event-id="${escapeHtml(e.id)}">Supprimer</button>
          </header>
          <p style="margin:6px 0;color:var(--ax-text-dim);font-size:13px">
            📅 ${escapeHtml(e.date)}${e.time ? ' à ' + escapeHtml(e.time) : ''}
            ${e.location ? '<br>📍 ' + escapeHtml(e.location) : ''}
          </p>
          ${e.notes ? `<p style="margin:6px 0;color:var(--ax-text-dim);font-size:12px;white-space:pre-wrap">${escapeHtml(e.notes)}</p>` : ''}
        </article>
      `).join('')
    : '<p class="ax-gs-213">Aucun événement à venir</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📅 Calendrier</h1>
        <span class="ax-gs-3">${calendarStore.count(uid)} évt total</span>
      </header>

      <form id="ax-cal-form" class="ax-form ax-gs-350">
        <label for="ax-cal-title" class="sr-only">Titre de l'événement</label>
        <input type="text" id="ax-cal-title" placeholder="Titre événement…" aria-label="Titre de l'événement" maxlength="200" autocomplete="off" required class="ax-gs-351">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <label for="ax-cal-date" class="sr-only">Date de l'événement</label>
          <input type="date" id="ax-cal-date" aria-label="Date de l'événement" required style="flex:1;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px">
          <label for="ax-cal-time" class="sr-only">Heure de l'événement</label>
          <input type="time" id="ax-cal-time" aria-label="Heure de l'événement" style="width:120px;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px">
        </div>
        <label for="ax-cal-location" class="sr-only">Lieu de l'événement</label>
        <input type="text" id="ax-cal-location" placeholder="Lieu (optionnel)…" aria-label="Lieu de l'événement (optionnel)" maxlength="200" autocomplete="off" class="ax-gs-351">
        <label for="ax-cal-notes" class="sr-only">Notes additionnelles</label>
        <textarea id="ax-cal-notes" placeholder="Notes (optionnel)…" aria-label="Notes additionnelles (optionnel)" rows="2" maxlength="5000" style="width:100%;padding:10px;margin-bottom:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical"></textarea>
        <button type="submit" class="ax-btn ax-btn-primary ax-gs-352">Ajouter événement</button>
      </form>

      <h2 style="color:#c9a227;font-size:16px;margin:16px 0 8px">⏰ 30 prochains jours</h2>
      <div id="ax-cal-list">${eventsHtml}</div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const form = rootEl.querySelector<HTMLFormElement>('#ax-cal-form');
  if (form) {
    activeCalendarScope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      const title = rootEl.querySelector<HTMLInputElement>('#ax-cal-title')?.value ?? '';
      const date = rootEl.querySelector<HTMLInputElement>('#ax-cal-date')?.value ?? '';
      const time = rootEl.querySelector<HTMLInputElement>('#ax-cal-time')?.value ?? '';
      const location = rootEl.querySelector<HTMLInputElement>('#ax-cal-location')?.value ?? '';
      const notes = rootEl.querySelector<HTMLTextAreaElement>('#ax-cal-notes')?.value ?? '';
      const ev = calendarStore.add(uid, {
        title,
        date,
        ...(time && { time }),
        ...(location && { location }),
        ...(notes && { notes }),
      });
      if (ev) {
        logger.info('calendar', 'event added', { id: ev.id });
        render(rootEl);
      }
    });
  }

  rootEl.querySelectorAll<HTMLElement>('[data-action="delete-event"]').forEach((btn) => {
    activeCalendarScope!.bind(btn, 'click', () => {
      const id = btn.dataset['eventId'];
      if (!id) return;
      if (calendarStore.remove(uid, id)) render(rootEl);
    });
  });
}
