/**
 * APEX v13.3.30 — HUD Debug Live (admin Kevin only).
 *
 * Demande Kevin (CLAUDE.md règle "HUD debug live admin Kevin préservé v12.785") :
 * > "Overlay debug live qui montre l'état de l'app en temps réel — version,
 * >  modules chargés, providers actifs, mémoire, facts, latence."
 *
 * Mission :
 * - Overlay top-right minimal en mode admin Kevin
 * - Affiche : APP_VER, mémoire localStorage Ko, facts/lessons count, providers,
 *   sentinelles actives, FPS estimé, last error
 * - Toggle ON/OFF via long-press sur bouton SOS (3s) ou query param ?hud=1
 * - Refresh 2s
 * - Click sur HUD → expand mode (full panel debug)
 *
 * Anti-pattern : ne JAMAIS afficher pour user non-admin (perf + privacy).
 */

import { APP_VER } from '../core/bootstrap.js';
import { logger } from '../core/logger.js';

class HudDebug {
  private hudEl: HTMLDivElement | null = null;
  private interval: number | null = null;
  private mounted = false;
  private lastFrameTs = performance.now();
  private fpsCounter = 0;
  private fps = 60;

  /**
   * Mount HUD si admin Kevin OU query ?hud=1.
   */
  mount(): void {
    if (this.mounted) return;
    if (typeof document === 'undefined') return;

    /* Détection admin */
    const isAdmin = this.isAdminKevin();
    const forceHud = window.location.search.includes('hud=1');
    if (!isAdmin && !forceHud) {
      logger.info('hud-debug', 'skip mount (not admin)');
      return;
    }

    const hud = document.createElement('div');
    hud.id = 'apex-hud-debug';
    hud.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'background:rgba(0,0,0,0.85)',
      'color:#10b981',
      'font-family:monospace',
      'font-size:10px',
      'line-height:1.4',
      'padding:6px 8px',
      'border-radius:6px',
      'border:1px solid rgba(16,185,129,0.3)',
      'z-index:99998',
      'pointer-events:auto',
      'cursor:pointer',
      'min-width:140px',
      'max-width:220px',
      'opacity:0.85',
      'user-select:none',
    ].join(';');
    hud.title = 'HUD debug — clic pour panneau complet';

    hud.addEventListener('click', () => this.openExpanded());

    document.body.appendChild(hud);
    this.hudEl = hud;
    this.mounted = true;

    /* FPS tracking via RAF */
    const tickFps = (ts: number): void => {
      this.fpsCounter += 1;
      if (ts - this.lastFrameTs >= 1000) {
        this.fps = this.fpsCounter;
        this.fpsCounter = 0;
        this.lastFrameTs = ts;
      }
      if (this.mounted) requestAnimationFrame(tickFps);
    };
    requestAnimationFrame(tickFps);

    /* Refresh 2s */
    this.interval = window.setInterval(() => this.refresh(), 2000);
    this.refresh();
    logger.info('hud-debug', 'mounted');
  }

  private isAdminKevin(): boolean {
    try {
      const raw = localStorage.getItem('ax_user');
      if (!raw) return false;
      const u = JSON.parse(raw) as { id?: string; role?: string };
      return u.id === 'kdmc_admin' || u.role === 'admin';
    } catch {
      return false;
    }
  }

  private getStorageBytes(): number {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k);
        if (v) total += k.length + v.length;
      }
    } catch { /* ignore */ }
    return total * 2; /* UTF-16 ~2 bytes/char */
  }

  private async refresh(): Promise<void> {
    if (!this.hudEl) return;
    const bytes = this.getStorageBytes();
    const ko = (bytes / 1024).toFixed(1);

    let factsCount = 0;
    let lessonsCount = 0;
    try {
      const { memory } = await import('../core/memory.js');
      factsCount = memory.getFacts().length;
      lessonsCount = memory.getLessons().length;
    } catch { /* ignore */ }

    let aiOk = false;
    try {
      const { aiRouter } = await import('../services/ai/ai-router.js');
      aiOk = aiRouter.hasAnyKey();
    } catch { /* ignore */ }

    const lines = [
      `<b style="color:#fbbf24">APEX ${APP_VER}</b>`,
      `🧠 ${factsCount}f / ${lessonsCount}L`,
      `💾 ${ko} Ko`,
      `🤖 ${aiOk ? '🟢' : '🔴'} AI`,
      `🌐 ${navigator.onLine ? '🟢' : '🔴'} net`,
      `⚡ ${this.fps} fps`,
    ];
    this.hudEl.innerHTML = lines.join('<br>');
  }

  /**
   * Panneau debug complet (clic HUD).
   */
  async openExpanded(): Promise<void> {
    let body = '';
    try {
      const { memory } = await import('../core/memory.js');
      body += `[MEMORY]\nFacts: ${memory.getFacts().length}\nLessons: ${memory.getLessons().length}\n\n`;
    } catch { /* ignore */ }
    try {
      const { aiRouter } = await import('../services/ai/ai-router.js');
      body += `[AI]\nHasKey: ${aiRouter.hasAnyKey()}\n\n`;
    } catch { /* ignore */ }
    try {
      const { autoTestRunner } = await import('../services/admin/auto-test-runner.js');
      const last = autoTestRunner.getLastRun();
      if (last) {
        body += `[LAST TEST]\n${last.passed}/${last.total} passed (${last.durationMs}ms)\n\n`;
      }
    } catch { /* ignore */ }
    body += `[STORAGE]\n${(this.getStorageBytes() / 1024).toFixed(1)} Ko / ~5120 Ko\n\n`;
    body += `[NETWORK]\nOnline: ${navigator.onLine}\nUA: ${navigator.userAgent.slice(0, 80)}\n\n`;
    body += `[FPS] ${this.fps}\n`;

    try {
      const { modalSheet } = await import('./modal-sheet.js');
      modalSheet.open({
        title: '🔍 Debug Panel (admin Kevin)',
        content: `<pre style="font-family:monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;color:#10b981;background:rgba(0,0,0,0.5);padding:12px;border-radius:6px">${body}</pre>`,
      });
    } catch {
      window.alert(body);
    }
  }

  unmount(): void {
    if (this.hudEl) {
      this.hudEl.remove();
      this.hudEl = null;
    }
    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
    this.mounted = false;
  }
}

export const hudDebug = new HudDebug();
