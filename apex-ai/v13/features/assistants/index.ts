/**
 * APEX v13 — Assistants personnalisés ("Gems" / Custom GPTs / Projects).
 *
 * Parité flagship 2026. Vue de gestion : créer / activer / modifier / supprimer
 * des assistants avec instructions dédiées. L'assistant ACTIF injecte ses
 * instructions en tête du system prompt du chat (cf. services/ai/custom-assistants
 * + features/chat/chat-engine.buildSystemPromptDeep).
 *
 * Additif, per-user, escapeHtml partout (anti-XSS). Presets 1-clic + export/import.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { ASSISTANT_PRESETS, customAssistants } from '../../services/ai/custom-assistants.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

export { escapeHtml };

let scope: CleanupScope | null = null;
/** Id en cours d'édition (null = création). Exposé pour tests. */
let editingId: string | null = null;

export function dispose(): void {
  scope?.cleanup();
  scope = null;
  editingId = null;
}

export function render(rootEl: HTMLElement): void {
  scope?.cleanup();
  scope = createCleanupScope('assistants');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  if (!guardFeatureEnabled('module.assistants', rootEl, uid)) return;

  const list = customAssistants.list(uid);
  const activeId = customAssistants.getActiveId(uid);
  const editing = editingId ? customAssistants.get(editingId, uid) : null;

  const activeBanner = activeId
    ? (() => {
        const a = customAssistants.get(activeId, uid);
        return a
          ? `<div class="ax-gs-400" style="border:1px solid rgba(232,184,48,.5);border-radius:10px;padding:12px;margin-bottom:12px;background:rgba(232,184,48,.06)">
               <strong>Assistant actif : ${escapeHtml(a.emoji)} ${escapeHtml(a.name)}</strong>
               <button class="ax-btn ax-btn-sm" data-action="deactivate" style="margin-left:10px">Désactiver</button>
             </div>`
          : '';
      })()
    : `<p style="color:var(--ax-text-dim);font-size:13px;margin-bottom:12px">Aucun assistant actif — Apex répond avec son ton par défaut.</p>`;

  const presetChips = ASSISTANT_PRESETS.map(
    (p, i) => `<button class="ax-btn ax-btn-sm" data-action="preset" data-preset-idx="${i}" title="${escapeHtml(p.instructions.slice(0, 80))}…">${escapeHtml(p.emoji)} ${escapeHtml(p.name)} +</button>`,
  ).join(' ');

  const cards = list.length
    ? list
        .map(
          (a) => `
        <article class="ax-note-card ax-gs-400" data-asst-id="${escapeHtml(a.id)}" style="${a.id === activeId ? 'border:1px solid rgba(232,184,48,.6)' : ''}">
          <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h3 class="ax-gs-319" style="margin:0">${escapeHtml(a.emoji)} ${escapeHtml(a.name)}${a.id === activeId ? ' <span style="color:var(--ax-gold);font-size:12px">● actif</span>' : ''}</h3>
          </header>
          <p style="margin:8px 0;color:var(--ax-text-dim);font-size:13px;white-space:pre-wrap">${escapeHtml(a.instructions.slice(0, 200))}${a.instructions.length > 200 ? '…' : ''}</p>
          ${a.modelHint ? `<p style="font-size:11px;color:#888;margin:0 0 8px">⚙️ ${escapeHtml(a.modelHint)}</p>` : ''}
          <footer style="display:flex;gap:8px;flex-wrap:wrap">
            ${a.id === activeId ? '' : `<button class="ax-btn ax-btn-sm ax-btn-primary" data-action="activate" data-asst-id="${escapeHtml(a.id)}">Activer</button>`}
            <button class="ax-btn ax-btn-sm" data-action="edit" data-asst-id="${escapeHtml(a.id)}">Modifier</button>
            <button class="ax-btn ax-btn-sm" data-action="delete" data-asst-id="${escapeHtml(a.id)}">Supprimer</button>
          </footer>
        </article>`,
        )
        .join('')
    : '<p class="ax-gs-213">Aucun assistant. Crée-en un ou clique un preset ci-dessous.</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🎭 Mes assistants</h1>
        <span class="ax-gs-3">${list.length} assistant${list.length > 1 ? 's' : ''}</span>
      </header>
      <p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 12px">
        Crée des assistants avec leurs propres instructions (persona, ton, expertise).
        L'assistant actif spécialise toutes tes réponses dans le chat.
      </p>

      ${activeBanner}

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${presetChips}</div>

      <form id="ax-asst-form" class="ax-form ax-gs-350">
        <div style="display:flex;gap:8px">
          <label for="ax-asst-emoji" class="sr-only">Emoji</label>
          <input type="text" id="ax-asst-emoji" placeholder="🤖" aria-label="Emoji de l'assistant" maxlength="4" value="${editing ? escapeHtml(editing.emoji) : ''}" style="width:56px;text-align:center;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px">
          <label for="ax-asst-name" class="sr-only">Nom</label>
          <input type="text" id="ax-asst-name" placeholder="Nom de l'assistant…" aria-label="Nom de l'assistant" maxlength="60" autocomplete="off" required value="${editing ? escapeHtml(editing.name) : ''}" class="ax-gs-351" style="flex:1">
        </div>
        <label for="ax-asst-instr" class="sr-only">Instructions</label>
        <textarea id="ax-asst-instr" placeholder="Instructions : qui est cet assistant, son ton, son expertise, ce qu'il doit toujours/jamais faire…" aria-label="Instructions de l'assistant" rows="5" maxlength="8000" style="width:100%;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;resize:vertical;margin-top:8px">${editing ? escapeHtml(editing.instructions) : ''}</textarea>
        <label for="ax-asst-hint" class="sr-only">Modèle préféré (indicatif)</label>
        <input type="text" id="ax-asst-hint" placeholder="Modèle préféré (indicatif, optionnel)" aria-label="Modèle préféré indicatif" maxlength="60" autocomplete="off" value="${editing?.modelHint ? escapeHtml(editing.modelHint) : ''}" style="width:100%;padding:8px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px;margin-top:8px">
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="ax-btn ax-btn-primary ax-gs-401">${editing ? '💾 Enregistrer' : '➕ Créer'}</button>
          ${editing ? '<button type="button" class="ax-btn" data-action="cancel-edit">Annuler</button>' : ''}
        </div>
      </form>

      <div id="ax-asst-list" style="margin-top:14px">${cards}</div>

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="ax-btn ax-btn-sm" data-action="export">⬇️ Exporter (JSON)</button>
        <button class="ax-btn ax-btn-sm" data-action="import">⬆️ Importer</button>
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  const form = rootEl.querySelector<HTMLFormElement>('#ax-asst-form');
  if (form) {
    scope!.bind(form, 'submit', (e) => {
      e.preventDefault();
      const emoji = rootEl.querySelector<HTMLInputElement>('#ax-asst-emoji')?.value ?? '';
      const name = rootEl.querySelector<HTMLInputElement>('#ax-asst-name')?.value ?? '';
      const instructions = rootEl.querySelector<HTMLTextAreaElement>('#ax-asst-instr')?.value ?? '';
      const modelHint = (rootEl.querySelector<HTMLInputElement>('#ax-asst-hint')?.value ?? '').trim();
      const saved = customAssistants.save(
        { ...(editingId ? { id: editingId } : {}), name, emoji, instructions, ...(modelHint ? { modelHint } : {}) },
        uid,
      );
      if (!saved) {
        toast.warn('Nom et instructions requis');
        return;
      }
      logger.info('assistants', editingId ? 'updated' : 'created', { id: saved.id });
      toast.success(editingId ? 'Assistant mis à jour' : `Assistant « ${saved.name} » créé`);
      editingId = null;
      render(rootEl);
    });
  }

  scope!.bind(rootEl, 'click', (e) => {
    const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.dataset['action'];
    const id = el.dataset['asstId'];
    switch (action) {
      case 'activate':
        if (id) {
          customAssistants.setActive(id, uid);
          const a = customAssistants.get(id, uid);
          toast.success(`${a?.emoji ?? '🎭'} ${a?.name ?? 'Assistant'} activé`);
          render(rootEl);
        }
        break;
      case 'deactivate':
        customAssistants.setActive(null, uid);
        toast.info('Assistant désactivé — ton par défaut');
        render(rootEl);
        break;
      case 'edit':
        if (id) {
          editingId = id;
          render(rootEl);
          rootEl.querySelector<HTMLInputElement>('#ax-asst-name')?.focus();
        }
        break;
      case 'cancel-edit':
        editingId = null;
        render(rootEl);
        break;
      case 'delete':
        if (id && customAssistants.remove(id, uid)) {
          toast.info('Assistant supprimé');
          if (editingId === id) editingId = null;
          render(rootEl);
        }
        break;
      case 'preset': {
        const idx = Number(el.dataset['presetIdx']);
        const p = ASSISTANT_PRESETS[idx];
        if (p) {
          const saved = customAssistants.save({ name: p.name, emoji: p.emoji, instructions: p.instructions, ...(p.modelHint ? { modelHint: p.modelHint } : {}) }, uid);
          if (saved) {
            toast.success(`${p.emoji} ${p.name} créé`);
            render(rootEl);
          }
        }
        break;
      }
      case 'export': {
        try {
          const blob = new Blob([customAssistants.exportJson(uid)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `apex-assistants-${Date.now()}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
          logger.warn('assistants', 'export failed', { err });
          toast.error('Export impossible — réessaie');
        }
        break;
      }
      case 'import': {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const n = customAssistants.importJson(String(reader.result ?? ''), uid);
            if (n > 0) {
              toast.success(`${n} assistant${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`);
              render(rootEl);
            } else {
              toast.warn('Fichier invalide ou vide');
            }
          };
          reader.readAsText(file);
        };
        input.click();
        break;
      }
    }
  });
}
