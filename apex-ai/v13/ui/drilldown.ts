/**
 * APEX v13 — Drill-down universel récursif (axe UX 17→20).
 *
 * Demande Kevin (CLAUDE.md règle "Drill-down récursif") :
 * "Chaque info cliquable → modal récursif 5+ niveaux profondeur"
 *
 * Architecture :
 * - Stack de niveaux (push/pop)
 * - Animation fade entre niveaux
 * - Breadcrumb auto avec back button
 * - Keyboard nav (Esc → back, ← → back)
 * - Mobile-first touch targets ≥44px
 */

export interface DrillLevel {
  id: string;
  title: string;
  content: string | (() => string | Promise<string>);
  data?: Record<string, unknown>;
}

class DrillDownManager {
  private stack: DrillLevel[] = [];
  private mountEl: HTMLElement | null = null;
  private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Ouvre un drill-down sur un mount element.
   */
  open(level: DrillLevel, mount: HTMLElement): void {
    this.mountEl = mount;
    this.stack = [level];
    this.render();
    this.attachKeyboard();
  }

  /**
   * Push nouveau niveau (descend).
   */
  push(level: DrillLevel): void {
    this.stack.push(level);
    this.render();
  }

  /**
   * Pop niveau courant (back).
   */
  back(): void {
    if (this.stack.length <= 1) {
      this.close();
      return;
    }
    this.stack.pop();
    this.render();
  }

  /**
   * Ferme + cleanup.
   */
  close(): void {
    this.stack = [];
    if (this.mountEl) this.mountEl.innerHTML = '';
    this.detachKeyboard();
    this.mountEl = null;
  }

  isOpen(): boolean {
    return this.stack.length > 0;
  }

  private async render(): Promise<void> {
    if (!this.mountEl) return;
    const current = this.stack[this.stack.length - 1];
    if (!current) return;

    /* Breadcrumb : tous les titres sauf courant */
    const breadcrumb = this.stack.slice(0, -1).map((l, i) => {
      return `<button type="button" class="ax-drill-crumb" data-action="back-to" data-idx="${i}">${l.title}</button>`;
    }).join('<span class="ax-drill-sep">›</span>');

    const contentRaw = typeof current.content === 'function' ? await current.content() : current.content;

    this.mountEl.innerHTML = `
      <div class="ax-drilldown" role="dialog" aria-label="${current.title}">
        <header class="ax-drill-head">
          <button type="button" class="ax-drill-back" data-action="back" aria-label="Retour">‹</button>
          <div class="ax-drill-bread">${breadcrumb}${breadcrumb ? '<span class="ax-drill-sep">›</span>' : ''}<strong>${current.title}</strong></div>
          <button type="button" class="ax-drill-close" data-action="close" aria-label="Fermer">✕</button>
        </header>
        <div class="ax-drill-body">${contentRaw}</div>
      </div>
    `;
    this.wireEvents();
  }

  private wireEvents(): void {
    if (!this.mountEl) return;
    this.mountEl.addEventListener('click', this.onClick.bind(this));
  }

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const action = target.closest<HTMLElement>('[data-action]')?.dataset['action'];
    if (action === 'back') this.back();
    else if (action === 'close') this.close();
    else if (action === 'back-to') {
      const idx = Number(target.closest<HTMLElement>('[data-idx]')?.dataset['idx'] ?? '0');
      this.stack = this.stack.slice(0, idx + 1);
      void this.render();
    } else if (action === 'drill') {
      /* Push level défini par data-drill-* */
      const wrapper = target.closest<HTMLElement>('[data-action="drill"]');
      if (!wrapper) return;
      const id = wrapper.dataset['drillId'] ?? `level_${this.stack.length}`;
      const title = wrapper.dataset['drillTitle'] ?? 'Détails';
      const content = wrapper.dataset['drillContent'] ?? '<p>Pas de contenu</p>';
      this.push({ id, title, content });
    }
  }

  private attachKeyboard(): void {
    this.boundOnKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') this.back();
    };
    document.addEventListener('keydown', this.boundOnKeyDown);
  }

  private detachKeyboard(): void {
    if (this.boundOnKeyDown) {
      document.removeEventListener('keydown', this.boundOnKeyDown);
      this.boundOnKeyDown = null;
    }
  }

  /**
   * Helper : marquer un élément cliquable pour drill (anti-théâtre).
   */
  static makeDrillTrigger(opts: { id: string; title: string; content: string; label: string }): string {
    const safeContent = opts.content.replace(/"/g, '&quot;');
    return `<button type="button" class="ax-drill-trigger" data-action="drill" data-drill-id="${opts.id}" data-drill-title="${opts.title}" data-drill-content="${safeContent}">${opts.label}</button>`;
  }
}

export const drillDown = new DrillDownManager();
