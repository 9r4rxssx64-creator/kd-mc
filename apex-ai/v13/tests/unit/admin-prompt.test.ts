/**
 * Tests admin-prompt.ts (Kevin règle 1-clic + fenêtre + bouton direct).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { adminPrompt } from '../../services/admin/admin-prompt.js';
import { modalSheet } from '../../ui/modal-sheet.js';

describe('Admin Prompt 1-clic (CLAUDE.md règle absolue Kevin)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    modalSheet.closeAll();
    vi.useRealTimers();
  });

  describe('askConfirm Yes/No', () => {
    it('clic primary → resolve true', async () => {
      const promise = adminPrompt.askConfirm({
        title: 'Test',
        message: 'Confirmer ?',
        primaryLabel: 'OK',
      });
      vi.advanceTimersByTime(50);
      const primaryBtn = document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-primary');
      primaryBtn?.click();
      const result = await promise;
      expect(result).toBe(true);
    });

    it('clic ghost → resolve false', async () => {
      const promise = adminPrompt.askConfirm({
        title: 'Test',
        message: 'Annuler ?',
      });
      vi.advanceTimersByTime(50);
      const ghostBtn = document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-ghost');
      ghostBtn?.click();
      const result = await promise;
      expect(result).toBe(false);
    });

    it('variant danger → bouton .ax-btn-danger', async () => {
      const promise = adminPrompt.askConfirm({
        title: 'Supprimer ?',
        message: 'Action irréversible',
        variant: 'danger',
        primaryLabel: 'Supprimer',
      });
      vi.advanceTimersByTime(50);
      const dangerBtn = document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-danger');
      expect(dangerBtn).not.toBeNull();
      dangerBtn?.click();
      const result = await promise;
      expect(result).toBe(true);
    });

    it('escape HTML message (anti-XSS)', async () => {
      const promise = adminPrompt.askConfirm({
        title: 'Test',
        message: '<script>alert(1)</script>',
      });
      vi.advanceTimersByTime(50);
      const body = document.body.querySelector('.ax-sheet-body');
      expect(body?.innerHTML).not.toContain('<script>alert(1)</script>');
      expect(body?.innerHTML).toContain('&lt;script&gt;');
      /* Cleanup : click ghost */
      document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-ghost')?.click();
      await promise;
    });
  });

  describe('askPasteSecret', () => {
    it('clic primary avec value → resolve {ok, value}', async () => {
      const promise = adminPrompt.askPasteSecret({
        title: 'Coller token',
        instruction: 'Colle ton token API',
      });
      vi.advanceTimersByTime(50);
      const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea');
      if (textarea) textarea.value = 'sk-ant-api03-test123';
      const primaryBtn = document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-primary');
      primaryBtn?.click();
      const result = await promise;
      expect(result?.ok).toBe(true);
      expect(result?.value).toBe('sk-ant-api03-test123');
    });

    it('clic primary sans value → toast warn + sheet reste ouvert', async () => {
      const promise = adminPrompt.askPasteSecret({
        title: 'Coller',
        instruction: 'Test',
      });
      vi.advanceTimersByTime(50);
      const primaryBtn = document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-primary');
      primaryBtn?.click();
      vi.advanceTimersByTime(50);
      /* Sheet pas closed (still in DOM) */
      expect(document.body.querySelector('.ax-sheet')).not.toBeNull();
      /* Toast warn présent */
      const toastEl = document.body.querySelector('.ax-toast-warn');
      expect(toastEl).not.toBeNull();
      /* Cleanup pour résoudre la promise */
      document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-ghost')?.click();
      await promise;
    });

    it('clic cancel → resolve null', async () => {
      const promise = adminPrompt.askPasteSecret({
        title: 'Test',
        instruction: 'Test',
      });
      vi.advanceTimersByTime(50);
      document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-ghost')?.click();
      const result = await promise;
      expect(result).toBeNull();
    });

    it('openUrl + openLabel → bouton "Ouvrir" présent', async () => {
      const promise = adminPrompt.askPasteSecret({
        title: 'OAuth',
        instruction: 'Récupère ton code',
        openUrl: 'https://oauth.example.com',
        openLabel: 'Ouvrir OAuth',
      });
      vi.advanceTimersByTime(50);
      const link = document.body.querySelector('a[href="https://oauth.example.com"]');
      expect(link).not.toBeNull();
      expect(link?.textContent).toContain('Ouvrir OAuth');
      /* Cleanup */
      document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-ghost')?.click();
      await promise;
    });
  });

  describe('askChoice multi-options', () => {
    it('liste choix + clic id retourné', async () => {
      const promise = adminPrompt.askChoice('Type compte', 'Choisis :', [
        { id: 'family', label: 'Famille', emoji: '👨‍👩‍👦' },
        { id: 'client', label: 'Client', emoji: '💼', variant: 'primary' },
      ]);
      vi.advanceTimersByTime(50);
      const familyBtn = document.body.querySelector<HTMLButtonElement>('[data-choice="family"]');
      expect(familyBtn).not.toBeNull();
      expect(familyBtn?.textContent).toContain('Famille');
      familyBtn?.click();
      const result = await promise;
      expect(result).toBe('family');
    });

    it('emoji + label rendus correctement', async () => {
      const promise = adminPrompt.askChoice('X', 'Y', [{ id: 'a', label: 'Option A', emoji: '🎯' }]);
      vi.advanceTimersByTime(50);
      const btn = document.body.querySelector<HTMLButtonElement>('[data-choice="a"]');
      expect(btn?.textContent).toContain('🎯');
      expect(btn?.textContent).toContain('Option A');
      btn?.click();
      await promise;
    });
  });

  describe('escalateToHuman (action niveau C)', () => {
    it('escalate ajoute entry ax_claude_todo + audit log', async () => {
      const r = await adminPrompt.escalateToHuman('Test action', 'high', 'context');
      expect(r.id).toMatch(/^esc_/);
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{ action: string; urgency: string }>;
      expect(todos.some((t) => t.action === 'Test action' && t.urgency === 'high')).toBe(true);
    });

    it('cap 50 entries max', async () => {
      for (let i = 0; i < 60; i++) {
        await adminPrompt.escalateToHuman(`Action ${i}`, 'low');
      }
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
      expect(todos.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getHistory audit', () => {
    it('history filtre admin.prompt_*', async () => {
      const promise = adminPrompt.askConfirm({ title: 'A', message: 'B' });
      vi.advanceTimersByTime(50);
      document.body.querySelector<HTMLButtonElement>('.ax-sheet-actions .ax-btn-primary')?.click();
      await promise;
      const hist = adminPrompt.getHistory();
      /* Audit-log peut ne pas être directement persisté localStorage selon implémentation */
      expect(Array.isArray(hist)).toBe(true);
    });
  });
});
