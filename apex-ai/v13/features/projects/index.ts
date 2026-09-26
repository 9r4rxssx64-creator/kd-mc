/**
 * APEX v13 — Projects / Workspaces (vue de gestion).
 *
 * Parité flagship 2026. Créer / activer / éditer des projets = instructions +
 * base de connaissances (notes/fichiers). Le projet actif cadre toutes les réponses
 * du chat (cf. services/ai/projects + chat-engine.buildSystemPromptDeep).
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { projects } from '../../services/ai/projects.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

export { escapeHtml };

let scope: CleanupScope | null = null;
let editingId: string | null = null;
let openNotesId: string | null = null;

export function dispose(): void {
  scope?.cleanup();
  scope = null;
  editingId = null;
  openNotesId = null;
}

export function render(rootEl: HTMLElement): void {
  scope?.cleanup();
  scope = createCleanupScope('projects');
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  if (!guardFeatureEnabled('module.projects', rootEl, uid)) return;

  const list = projects.list(uid);
  const activeId = projects.getActiveId(uid);
  const editing = editingId ? projects.get(editingId, uid) : null;

  const activeBanner = activeId
    ? (() => {
        const p = projects.get(activeId, uid);
        return p
          ? `<div class="ax-gs-400" style="border:1px solid rgba(232,184,48,.5);border-radius:10px;padding:12px;margin-bottom:12px;background:rgba(232,184,48,.06)">
               <strong>Projet actif : ${escapeHtml(p.emoji)} ${escapeHtml(p.name)}</strong>
               <span style="color:var(--ax-text-dim);font-size:12px"> · ${p.knowledge.length} note${p.knowledge.length > 1 ? 's' : ''}</span>
               <button class="ax-btn ax-btn-sm" data-action="deactivate" style="margin-left:10px">Désactiver</button>
             </div>`
          : '';
      })()
    : `<p style="color:var(--ax-text-dim);font-size:13px;margin-bottom:12px">Aucun projet actif — le chat répond sans cadre projet.</p>`;

  const cards = list.length
    ? list
        .map((p) => {
          const notesOpen = openNotesId === p.id;
          const notesHtml = notesOpen
            ? `<div style="margin-top:10px;border-top:1px solid #2a2a3a;padding-top:10px">
                 ${p.knowledge
                   .map(
                     (n, i) => `<div style="display:flex;gap:8px;align-items:start;margin-bottom:6px">
                       <div style="flex:1"><strong style="font-size:12px">${escapeHtml(n.title)}</strong>
                         <div style="color:var(--ax-text-dim);font-size:12px;white-space:pre-wrap">${escapeHtml(n.content.slice(0, 160))}${n.content.length > 160 ? '…' : ''}</div></div>
                       <button class="ax-btn ax-btn-sm" data-action="delnote" data-proj-id="${escapeHtml(p.id)}" data-note-idx="${i}">🗑</button>
                     </div>`,
                   )
                   .join('') || '<p style="color:#888;font-size:12px">Aucune note.</p>'}
                 <form class="ax-proj-note-form" data-proj-id="${escapeHtml(p.id)}" style="margin-top:8px">
                   <input type="text" class="ax-proj-note-title" placeholder="Titre de la note" maxlength="80" autocomplete="off" style="width:100%;padding:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;margin-bottom:6px">
                   <textarea class="ax-proj-note-content" placeholder="Contenu (colle un texte, des specs, un doc…)" rows="3" maxlength="20000" style="width:100%;padding:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical"></textarea>
                   <button type="submit" class="ax-btn ax-btn-sm ax-btn-primary" style="margin-top:6px">+ Ajouter la note</button>
                 </form>
               </div>`
            : '';
          return `
        <article class="ax-note-card ax-gs-400" style="${p.id === activeId ? 'border:1px solid rgba(232,184,48,.6)' : ''}">
          <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h3 class="ax-gs-319" style="margin:0">${escapeHtml(p.emoji)} ${escapeHtml(p.name)}${p.id === activeId ? ' <span style="color:var(--ax-gold);font-size:12px">● actif</span>' : ''}</h3>
          </header>
          ${p.instructions ? `<p style="margin:8px 0;color:var(--ax-text-dim);font-size:13px;white-space:pre-wrap">${escapeHtml(p.instructions.slice(0, 160))}${p.instructions.length > 160 ? '…' : ''}</p>` : ''}
          <footer style="display:flex;gap:8px;flex-wrap:wrap">
            ${p.id === activeId ? '' : `<button class="ax-btn ax-btn-sm ax-btn-primary" data-action="activate" data-proj-id="${escapeHtml(p.id)}">Activer</button>`}
            <button class="ax-btn ax-btn-sm" data-action="notes" data-proj-id="${escapeHtml(p.id)}">📚 Connaissances (${p.knowledge.length})</button>
            <button class="ax-btn ax-btn-sm" data-action="edit" data-proj-id="${escapeHtml(p.id)}">Modifier</button>
            <button class="ax-btn ax-btn-sm" data-action="delete" data-proj-id="${escapeHtml(p.id)}">Supprimer</button>
          </footer>
          ${notesHtml}
        </article>`;
        })
        .join('')
    : '<p class="ax-gs-213">Aucun projet. Crée un espace de travail ci-dessous.</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📁 Mes projets</h1>
        <span class="ax-gs-3">${list.length} projet${list.length > 1 ? 's' : ''}</span>
      </header>
      <p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 12px">
        Un projet regroupe des instructions + une base de connaissances (notes/fichiers).
        Le projet actif cadre toutes tes réponses dans le chat.
      </p>

      ${activeBanner}

      <form id="ax-proj-form" class="ax-form ax-gs-350">
        <div style="display:flex;gap:8px">
          <input type="text" id="ax-proj-emoji" placeholder="📁" aria-label="Emoji" maxlength="4" value="${editing ? escapeHtml(editing.emoji) : ''}" style="width:56px;text-align:center;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px">
          <input type="text" id="ax-proj-name" placeholder="Nom du projet…" aria-label="Nom du projet" maxlength="60" autocomplete="off" required value="${editing ? escapeHtml(editing.name) : ''}" class="ax-gs-351" style="flex:1">
        </div>
        <textarea id="ax-proj-instr" placeholder="Instructions du projet (ton, objectif, contraintes)…" aria-label="Instructions du projet" rows="3" maxlength="8000" style="width:100%;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical;margin-top:8px">${editing ? escapeHtml(editing.instructions) : ''}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="ax-btn ax-btn-primary ax-gs-401">${editing ? '💾 Enregistrer' : '➕ Créer le projet'}</button>
          ${editing ? '<button type="button" class="ax-btn" data-action="cancel-edit">Annuler</button>' : ''}
        </div>
      </form>

      <div id="ax-proj-list" style="margin-top:14px">${cards}</div>
      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const form = rootEl.querySelector<HTMLFormElement>('#ax-proj-form');
  if (form) {
    scope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      const emoji = rootEl.querySelector<HTMLInputElement>('#ax-proj-emoji')?.value ?? '';
      const name = rootEl.querySelector<HTMLInputElement>('#ax-proj-name')?.value ?? '';
      const instructions = rootEl.querySelector<HTMLTextAreaElement>('#ax-proj-instr')?.value ?? '';
      const saved = projects.save({ ...(editingId ? { id: editingId } : {}), name, emoji, instructions }, uid);
      if (!saved) {
        toast.warn('Nom requis');
        return;
      }
      toast.success(editingId ? 'Projet mis à jour' : `Projet « ${saved.name} » créé`);
      editingId = null;
      render(rootEl);
    });
  }

  rootEl.querySelectorAll<HTMLFormElement>('.ax-proj-note-form').forEach((nf) => {
    scope!.bind(nf, 'submit', (e) => {
      e.preventDefault();
      const pid = nf.dataset['projId'];
      const title = nf.querySelector<HTMLInputElement>('.ax-proj-note-title')?.value ?? '';
      const content = nf.querySelector<HTMLTextAreaElement>('.ax-proj-note-content')?.value ?? '';
      if (pid && projects.addNote(pid, { title, content }, uid)) {
        toast.success('Note ajoutée à la base de connaissances');
        render(rootEl);
      } else {
        toast.warn('Contenu de la note requis');
      }
    });
  });

  scope!.bind(rootEl, 'click', (e) => {
    const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.dataset['action'];
    const id = el.dataset['projId'];
    switch (action) {
      case 'activate':
        if (id) {
          projects.setActive(id, uid);
          const p = projects.get(id, uid);
          toast.success(`${p?.emoji ?? '📁'} ${p?.name ?? 'Projet'} activé`);
          render(rootEl);
        }
        break;
      case 'deactivate':
        projects.setActive(null, uid);
        toast.info('Projet désactivé');
        render(rootEl);
        break;
      case 'notes':
        openNotesId = openNotesId === id ? null : (id ?? null);
        render(rootEl);
        break;
      case 'delnote': {
        const idx = Number(el.dataset['noteIdx']);
        if (id && projects.removeNote(id, idx, uid)) {
          toast.info('Note supprimée');
          render(rootEl);
        }
        break;
      }
      case 'edit':
        if (id) {
          editingId = id;
          render(rootEl);
          rootEl.querySelector<HTMLInputElement>('#ax-proj-name')?.focus();
        }
        break;
      case 'cancel-edit':
        editingId = null;
        render(rootEl);
        break;
      case 'delete':
        if (id && projects.remove(id, uid)) {
          toast.info('Projet supprimé');
          if (editingId === id) editingId = null;
          if (openNotesId === id) openNotesId = null;
          render(rootEl);
        }
        break;
    }
  });
  logger.debug('projects', 'handlers attached');
}
