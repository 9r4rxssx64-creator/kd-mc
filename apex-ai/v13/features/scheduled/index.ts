/**
 * APEX v13 — Tâches programmées (vue de gestion).
 *
 * Parité flagship 2026 (ChatGPT Tasks). Créer des prompts récurrents / ponctuels.
 * Les tâches dues s'exécutent quand l'app est ouverte (boot/focus) — cf.
 * services/ai/scheduled-tasks + le runner câblé dans le chat.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { store } from '../../core/store.js';
import { scheduledTasks, type ScheduleKind, type ScheduledTask } from '../../services/ai/scheduled-tasks.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

export { escapeHtml };

let scope: CleanupScope | null = null;

export function dispose(): void {
  scope?.cleanup();
  scope = null;
}

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function describe(t: ScheduledTask): string {
  const hm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
  switch (t.kind) {
    case 'once':
      return `Une fois — ${new Date(t.at ?? t.nextRun).toLocaleString('fr-FR')}`;
    case 'daily':
      return `Chaque jour à ${hm(t.timeMin ?? 540)}`;
    case 'weekly':
      return `Chaque ${WEEKDAYS[t.weekday ?? 1]} à ${hm(t.timeMin ?? 540)}`;
    case 'interval':
      return `Toutes les ${t.everyMin ?? 15} min`;
    default:
      return '';
  }
}

export function render(rootEl: HTMLElement): void {
  scope?.cleanup();
  scope = createCleanupScope('scheduled');
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  if (!guardFeatureEnabled('module.scheduled', rootEl, uid)) return;

  const list = scheduledTasks.list(uid);
  const cards = list.length
    ? list
        .map(
          (t) => `
        <article class="ax-note-card ax-gs-400" style="${t.enabled ? '' : 'opacity:.55'}">
          <p style="margin:0 0 6px;white-space:pre-wrap">${escapeHtml(t.prompt.slice(0, 200))}${t.prompt.length > 200 ? '…' : ''}</p>
          <div style="font-size:12px;color:var(--ax-text-dim);margin-bottom:8px">
            🗓 ${escapeHtml(describe(t))} · prochaine : ${new Date(t.nextRun).toLocaleString('fr-FR')}${t.lastRun ? ` · dernière : ${new Date(t.lastRun).toLocaleString('fr-FR')}` : ''}
          </div>
          <footer style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="ax-btn ax-btn-sm" data-action="toggle" data-task-id="${escapeHtml(t.id)}">${t.enabled ? '⏸ Désactiver' : '▶️ Activer'}</button>
            <button class="ax-btn ax-btn-sm" data-action="delete" data-task-id="${escapeHtml(t.id)}">Supprimer</button>
          </footer>
        </article>`,
        )
        .join('')
    : '<p class="ax-gs-213">Aucune tâche programmée.</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">⏰ Tâches programmées</h1>
        <span class="ax-gs-3">${list.length} tâche${list.length > 1 ? 's' : ''}</span>
      </header>
      <p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 12px">
        Programme des prompts récurrents ou ponctuels. Ils s'exécutent quand l'app est ouverte
        (une PWA ne tourne pas en arrière-plan — le résultat apparaît dans le chat à l'ouverture).
      </p>

      <form id="ax-sched-form" class="ax-form ax-gs-350">
        <textarea id="ax-sched-prompt" placeholder="Prompt à exécuter (ex : « Résume l'actu tech du jour »)…" aria-label="Prompt de la tâche" rows="2" maxlength="2000" required style="width:100%;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
          <select id="ax-sched-kind" aria-label="Fréquence" style="padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;min-height:44px">
            <option value="daily">Chaque jour</option>
            <option value="weekly">Chaque semaine</option>
            <option value="interval">Toutes les N minutes</option>
            <option value="once">Une seule fois (demain)</option>
          </select>
          <input type="time" id="ax-sched-time" value="09:00" aria-label="Heure" style="padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;min-height:44px">
          <select id="ax-sched-weekday" aria-label="Jour" style="padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;min-height:44px;display:none">
            ${WEEKDAYS.map((w, i) => `<option value="${i}"${i === 1 ? ' selected' : ''}>${w}</option>`).join('')}
          </select>
          <input type="number" id="ax-sched-every" value="60" min="15" max="1440" aria-label="Minutes" style="width:80px;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;min-height:44px;display:none">
        </div>
        <button type="submit" class="ax-btn ax-btn-primary ax-gs-401" style="margin-top:8px">➕ Programmer</button>
      </form>

      <div id="ax-sched-list" style="margin-top:14px">${cards}</div>
      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const kindSel = rootEl.querySelector<HTMLSelectElement>('#ax-sched-kind');
  const timeEl = rootEl.querySelector<HTMLInputElement>('#ax-sched-time');
  const wdEl = rootEl.querySelector<HTMLSelectElement>('#ax-sched-weekday');
  const everyEl = rootEl.querySelector<HTMLInputElement>('#ax-sched-every');
  const syncFields = (): void => {
    const k = kindSel?.value;
    if (timeEl) timeEl.style.display = k === 'daily' || k === 'weekly' ? '' : 'none';
    if (wdEl) wdEl.style.display = k === 'weekly' ? '' : 'none';
    if (everyEl) everyEl.style.display = k === 'interval' ? '' : 'none';
  };
  if (kindSel) {
    scope!.bind(kindSel, 'change', syncFields);
    syncFields();
  }

  const form = rootEl.querySelector<HTMLFormElement>('#ax-sched-form');
  if (form) {
    scope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      const prompt = rootEl.querySelector<HTMLTextAreaElement>('#ax-sched-prompt')?.value ?? '';
      const kind = (kindSel?.value ?? 'daily') as ScheduleKind;
      const [h, m] = (timeEl?.value ?? '09:00').split(':').map(Number);
      const timeMin = (h ?? 9) * 60 + (m ?? 0);
      const input: Parameters<typeof scheduledTasks.create>[0] = { prompt, kind };
      if (kind === 'daily') input.timeMin = timeMin;
      else if (kind === 'weekly') { input.timeMin = timeMin; input.weekday = Number(wdEl?.value ?? 1); }
      else if (kind === 'interval') input.everyMin = Math.max(15, Number(everyEl?.value ?? 60));
      else if (kind === 'once') input.at = Date.now() + 24 * 60 * 60 * 1000;
      const t = scheduledTasks.create(input);
      if (!t) {
        toast.warn('Prompt requis (ou limite atteinte)');
        return;
      }
      toast.success('⏰ Tâche programmée');
      render(rootEl);
    });
  }

  scope!.bind(rootEl, 'click', (e) => {
    const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const id = el.dataset['taskId'];
    if (!id) return;
    if (el.dataset['action'] === 'toggle') {
      const on = scheduledTasks.toggle(id, uid);
      toast.info(on ? '▶️ Tâche activée' : '⏸ Tâche désactivée');
      render(rootEl);
    } else if (el.dataset['action'] === 'delete') {
      if (scheduledTasks.remove(id, uid)) {
        toast.info('Tâche supprimée');
        render(rootEl);
      }
    }
  });
}
