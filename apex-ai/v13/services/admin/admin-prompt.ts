/**
 * APEX v13 — Admin Prompt 1-clic (Kevin règle absolue CLAUDE.md).
 *
 * Demande Kevin (CLAUDE.md 2026-05-01) :
 * "1 CLIC + FENÊTRE + BOUTON DIRECT — modal Apex dédiée
 *  Le plus simple pour moi le plus rapide et le plus sûr"
 * "Si besoin, il me sort le pop-up, fenêtre qui apparaît avec le 1-clic"
 * "Sinon toute autonomie, tout automatisé"
 *
 * Wrapper haut-niveau du modal-sheet pour les cas admin :
 * - askConfirm : Yes/No simple
 * - askPasteSecret : 1 input + 1 bouton coller (style WebAuthn confirm)
 * - askChoice : choix entre N options
 * - escalateToHuman : action niveau C avec notification Kevin
 *
 * Anti-pattern Kevin :
 * - JAMAIS prompt() / confirm() natifs (clavier saute iPhone PWA)
 * - JAMAIS de modal sans bouton primaire visible
 * - 1 clic max pour action standard
 */

import { haptic } from '../../ui/haptic.js';
import { modalSheet } from '../../ui/modal-sheet.js';
import { toast } from '../../ui/toast.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';

export interface AdminPromptOptions {
  title: string;
  message: string;
  primaryLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'ghost';
  haptic?: 'tap' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
}

export interface AdminPasteOptions {
  title: string;
  instruction: string;
  placeholder?: string;
  primaryLabel?: string;
  openLabel?: string;
  openUrl?: string;
}

class AdminPrompt {
  /**
   * Confirm Yes/No simple.
   * Returns Promise<true> si user clique primary, false si annule.
   */
  async askConfirm(opts: AdminPromptOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const sheet = modalSheet.open({
        title: opts.title,
        content: `<p style="color:var(--ax-text-dim);line-height:var(--ax-lh-normal)">${this.escapeHtml(opts.message)}</p>`,
        actions: [
          {
            label: opts.cancelLabel ?? 'Annuler',
            variant: 'ghost',
            onClick: () => {
              haptic.tap();
              sheet.close();
              resolve(false);
            },
          },
          {
            label: opts.primaryLabel ?? 'Confirmer',
            variant: opts.variant ?? 'primary',
            onClick: () => {
              haptic.trigger(opts.haptic ?? 'medium');
              sheet.close();
              resolve(true);
            },
          },
        ],
      });
      void auditLog.record('admin.prompt_shown', { details: { title: opts.title } });
    });
  }

  /**
   * Paste secret/credential 1-clic.
   * Returns Promise<{ok, value}> si user colle + valide, null si annule.
   */
  async askPasteSecret(opts: AdminPasteOptions): Promise<{ ok: boolean; value: string } | null> {
    return new Promise((resolve) => {
      const inputId = `paste_${Date.now()}`;
      const openButton = opts.openUrl
        ? `<a href="${opts.openUrl}" target="_blank" rel="noopener" class="ax-btn ax-btn-ghost ax-btn-block" style="margin-bottom:12px">📂 ${this.escapeHtml(opts.openLabel ?? 'Ouvrir')}</a>`
        : '';
      const sheet = modalSheet.open({
        title: opts.title,
        content: `
          ${openButton}
          <p style="color:var(--ax-text-dim);margin:0 0 12px">${this.escapeHtml(opts.instruction)}</p>
          <textarea id="${inputId}" rows="3" placeholder="${this.escapeHtml(opts.placeholder ?? 'Coller ici')}"
            style="width:100%;padding:12px;background:var(--ax-bg-input);border:1px solid var(--ax-border);border-radius:8px;color:var(--ax-text);font-family:var(--ax-font-mono);font-size:13px"
            autocomplete="off" spellcheck="false"></textarea>
        `,
        actions: [
          {
            label: 'Annuler',
            variant: 'ghost',
            onClick: () => {
              haptic.tap();
              sheet.close();
              resolve(null);
            },
          },
          {
            label: opts.primaryLabel ?? 'Coller',
            variant: 'primary',
            onClick: () => {
              const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
              const value = input?.value.trim() ?? '';
              if (!value) {
                haptic.warning();
                toast.warn('Colle une valeur d\'abord');
                return;
              }
              haptic.success();
              sheet.close();
              resolve({ ok: true, value });
            },
          },
        ],
      });
      void auditLog.record('admin.prompt_paste', { details: { title: opts.title } });
    });
  }

  /**
   * Choix entre N options.
   * Returns Promise<choice id | null>.
   */
  async askChoice(
    title: string,
    message: string,
    choices: ReadonlyArray<{ id: string; label: string; variant?: 'primary' | 'danger' | 'ghost'; emoji?: string }>,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const buttonsHtml = choices
        .map(
          (c) => `<button data-choice="${this.escapeHtml(c.id)}" class="ax-btn ax-btn-${c.variant ?? 'ghost'} ax-btn-block" style="margin-bottom:8px">${c.emoji ? c.emoji + ' ' : ''}${this.escapeHtml(c.label)}</button>`,
        )
        .join('');
      const sheet = modalSheet.open({
        title,
        content: `
          <p style="color:var(--ax-text-dim);margin:0 0 16px">${this.escapeHtml(message)}</p>
          <div id="choices-list">${buttonsHtml}</div>
        `,
        dismissable: true,
      });
      /* Wire choice buttons */
      sheet.el.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          haptic.tap();
          const id = btn.dataset['choice'] ?? '';
          sheet.close();
          resolve(id || null);
        });
      });
      /* If user dismisses → null */
      const closeBtn = sheet.el.querySelector('.ax-sheet-close');
      closeBtn?.addEventListener('click', () => resolve(null));
      void auditLog.record('admin.prompt_choice', { details: { title, choices_count: choices.length } });
    });
  }

  /**
   * Escalate to human (Kevin) — push entry dans ax_claude_todo + notify.
   * Pour actions niveau C qui ne peuvent attendre validation modal directe.
   */
  async escalateToHuman(
    action: string,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    context?: string,
  ): Promise<{ id: string; ts: number }> {
    const entry = {
      id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      action: action.slice(0, 200),
      urgency,
      context: (context ?? '').slice(0, 1000),
      ts: Date.now(),
      status: 'pending',
    };
    try {
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
      todos.push(entry);
      localStorage.setItem('ax_claude_todo', JSON.stringify(todos.slice(-50)));
    } catch {
      /* ignore quota */
    }
    void firebase.write('ax_claude_todo', entry);
    await auditLog.record('admin.escalate_human', { details: { action, urgency } });
    /* Toast info au user */
    toast.info(`Escalade Kevin (${urgency})`);
    haptic.medium();
    return { id: entry.id, ts: entry.ts };
  }

  /**
   * Liste prompts récents (admin debug).
   */
  getHistory(limit = 50): unknown[] {
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_audit_log') ?? '[]') as Array<{ event?: string }>;
      return log.filter((e) => e.event?.startsWith('admin.prompt')).slice(-limit);
    } catch {
      return [];
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(
      /[&<>"']/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
    );
  }
}

export const adminPrompt = new AdminPrompt();
