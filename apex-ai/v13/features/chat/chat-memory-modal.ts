/**
 * APEX v13 — chat-memory-modal.ts
 * Modal historique/journal du chat : conversations archivées (charger/archiver)
 * + journal des actions. Onglets Historique / Journal.
 *
 * Extrait de features/chat/index.ts (v13.4.311, refactor monolithe). conversation
 * liée une fois via setMemoryModalConversation (réf stable, mutée in-place).
 */
import { toast } from '../../ui/toast.js';

import { escapeHtml } from './chat-markdown.js';
import { persistConversation } from './chat-persistence.js';
import { renderMessages } from './chat-render-loop.js';
import { archiveSession, loadSessionsHistory } from './chat-sessions-history.js';

import type { DisplayMessage } from './index.js';

/* Réf STABLE vers la conversation (fournie une fois au boot). */
let conversation: DisplayMessage[] = [];

/** Lie le modal mémoire à la conversation du module chat. */
export function setMemoryModalConversation(conv: DisplayMessage[]): void {
  conversation = conv;
}

export function openMemoryModal(rootEl: HTMLElement): void {
  const existing = document.getElementById('ax-chat-memory-modal');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'ax-chat-memory-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Mémoire et historique');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
  overlay.innerHTML = `
    <div style="background:var(--ax-bg-flat,#10110f);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0;font-size:17px;color:#fff">📜 Mémoire d'Apex</h2>
        <button id="ax-mem-close" aria-label="Fermer" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;min-width:44px;min-height:44px">×</button>
      </div>
      <div style="display:flex;gap:6px">
        <button id="ax-mem-tab-hist" class="ax-mem-tab" style="flex:1;padding:9px;border-radius:8px;border:1px solid rgba(201,162,39,0.4);background:rgba(201,162,39,0.15);color:var(--ax-gold,#e8b830);cursor:pointer;font-size:13px;min-height:44px">🗂 Conversations</button>
        <button id="ax-mem-tab-jrn" class="ax-mem-tab" style="flex:1;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:var(--ax-text-dim,#aaa);cursor:pointer;font-size:13px;min-height:44px">📒 Journal permanent</button>
      </div>
      <input id="ax-mem-search" type="search" placeholder="🔍 Rechercher dans le journal…" aria-label="Rechercher dans le journal"
        style="display:none;width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#fff;font-size:14px;min-height:44px">
      <div id="ax-mem-body" style="overflow-y:auto;flex:1;min-height:120px;display:flex;flex-direction:column;gap:8px"></div>
      <div id="ax-mem-actions" style="display:none;gap:8px">
        <button id="ax-mem-export" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(74,158,255,0.3);background:rgba(74,158,255,0.1);color:var(--ax-blue-bright,#4a9eff);cursor:pointer;font-size:13px;min-height:44px">📥 Exporter</button>
        <button id="ax-mem-clear-jrn" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,91,91,0.3);background:rgba(255,91,91,0.1);color:var(--ax-error,#ff5b5b);cursor:pointer;font-size:13px;min-height:44px">🗑 Vider le journal</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const body = overlay.querySelector<HTMLDivElement>('#ax-mem-body');
  const searchEl = overlay.querySelector<HTMLInputElement>('#ax-mem-search');
  const actionsEl = overlay.querySelector<HTMLDivElement>('#ax-mem-actions');
  const tabHist = overlay.querySelector<HTMLButtonElement>('#ax-mem-tab-hist');
  const tabJrn = overlay.querySelector<HTMLButtonElement>('#ax-mem-tab-jrn');
  const close = (): void => overlay.remove();
  overlay.querySelector<HTMLButtonElement>('#ax-mem-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const setActiveTab = (active: 'hist' | 'jrn'): void => {
    const on = 'flex:1;padding:9px;border-radius:8px;border:1px solid rgba(201,162,39,0.4);background:rgba(201,162,39,0.15);color:var(--ax-gold,#e8b830);cursor:pointer;font-size:13px;min-height:44px';
    const off = 'flex:1;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:var(--ax-text-dim,#aaa);cursor:pointer;font-size:13px;min-height:44px';
    if (tabHist) tabHist.style.cssText = active === 'hist' ? on : off;
    if (tabJrn) tabJrn.style.cssText = active === 'jrn' ? on : off;
    if (searchEl) searchEl.style.display = active === 'jrn' ? 'block' : 'none';
    if (actionsEl) actionsEl.style.display = active === 'jrn' ? 'flex' : 'none';
  };

  const empty = (txt: string): string =>
    `<div style="padding:24px;text-align:center;color:var(--ax-text-muted,#888);font-size:13px">${escapeHtml(txt)}</div>`;

  const renderHistory = (): void => {
    if (!body) return;
    const sessions = loadSessionsHistory().slice().reverse(); /* plus récent d'abord */
    if (sessions.length === 0) {
      body.innerHTML = empty('Aucune conversation archivée.\nUtilise « 🌿 Nouvelle conversation » pour en garder une.');
      return;
    }
    body.innerHTML = sessions.map((s, revIdx) => {
      const realIdx = sessions.length - 1 - revIdx; /* index dans l'ordre d'origine */
      const d = new Date(s.ts).toLocaleString('fr-FR');
      const firstUser = s.messages.find((m) => m.role === 'user');
      const preview = firstUser ? firstUser.text.slice(0, 90) : '(vide)';
      return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px">
        <div style="font-size:11px;color:var(--ax-text-muted,#888)">${escapeHtml(d)} · ${s.messages.length} messages</div>
        <div style="font-size:13px;color:#fff;margin:4px 0 8px;word-break:break-word">${escapeHtml(preview)}${firstUser && firstUser.text.length > 90 ? '…' : ''}</div>
        <button data-mem-open="${realIdx}" style="padding:7px 12px;border-radius:7px;border:1px solid rgba(201,162,39,0.35);background:rgba(201,162,39,0.12);color:var(--ax-gold,#e8b830);cursor:pointer;font-size:12px;min-height:40px">↩ Rouvrir</button>
      </div>`;
    }).join('');
    body.querySelectorAll<HTMLButtonElement>('[data-mem-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-mem-open') ?? '-1', 10);
        const all = loadSessionsHistory();
        const sess = all[idx];
        if (!sess) return;
        /* Archive la conversation courante (ne rien perdre) puis charge l'archivée. */
        if (conversation.length > 0) archiveSession([...conversation]);
        conversation.length = 0;
        for (const m of sess.messages) {
          conversation.push({ id: m.id ?? `h_${m.ts}_${Math.random().toString(36).slice(2, 7)}`, role: m.role, text: m.text, ts: m.ts });
        }
        persistConversation(conversation);
        renderMessages(rootEl);
        close();
        toast.success('↩ Conversation rouverte');
      });
    });
  };

  const renderJournal = (filter = ''): void => {
    if (!body) return;
    void import('../../services/ai/chat-journal.js').then(({ chatJournal }) => {
      const entries = (filter ? chatJournal.search(filter) : chatJournal.list()).slice().reverse();
      if (entries.length === 0) {
        body.innerHTML = empty(filter ? 'Aucune entrée pour cette recherche.' : 'Journal vide.\nTout ce que tu déposes dans le chat s\'enregistrera ici (les clés sont masquées).');
        return;
      }
      const SRC_ICON: Record<string, string> = { user: '💬', paste: '📋', planning: '📅', note: '📝' };
      body.innerHTML = entries.map((e) => {
        const d = new Date(e.ts).toLocaleString('fr-FR');
        return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px">
          <div style="font-size:11px;color:var(--ax-text-muted,#888)">${SRC_ICON[e.source] ?? '💬'} ${escapeHtml(d)}${e.hadSecret ? ' · 🔒 secret masqué' : ''}</div>
          <div style="font-size:13px;color:#fff;margin-top:4px;white-space:pre-wrap;word-break:break-word">${escapeHtml(e.text.slice(0, 600))}${e.text.length > 600 ? '…' : ''}</div>
        </div>`;
      }).join('');
    });
  };

  tabHist?.addEventListener('click', () => { setActiveTab('hist'); renderHistory(); });
  tabJrn?.addEventListener('click', () => { setActiveTab('jrn'); renderJournal(searchEl?.value ?? ''); });
  searchEl?.addEventListener('input', () => renderJournal(searchEl.value));
  overlay.querySelector<HTMLButtonElement>('#ax-mem-export')?.addEventListener('click', () => {
    void import('../../services/ai/chat-journal.js').then(({ chatJournal }) => {
      const blob = new Blob([chatJournal.exportText()], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `apex-journal-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success('📥 Journal exporté');
    });
  });
  overlay.querySelector<HTMLButtonElement>('#ax-mem-clear-jrn')?.addEventListener('click', () => {
    if (!confirm('🗑 Vider DÉFINITIVEMENT le journal permanent ?\n\nTout l\'historique de ce que tu as déposé sera supprimé (local + cloud). Cette action est rare et irréversible.')) return;
    void import('../../services/ai/chat-journal.js').then(({ chatJournal }) => {
      void chatJournal.clearAll().then(() => { renderJournal(''); toast.success('🗑 Journal vidé'); });
    });
  });

  /* Onglet par défaut : conversations. */
  setActiveTab('hist');
  renderHistory();
}
