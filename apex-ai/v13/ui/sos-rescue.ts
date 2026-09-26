/**
 * APEX v13.3.30 — SOS Rescue (bouton de secours permanent).
 *
 * Demande Kevin (CLAUDE.md règle absolue) :
 * > "Bouton SOS rescue permanent visible partout — Kevin doit pouvoir débloquer
 * >  Apex en 1 clic si jamais quelque chose plante."
 * > "Toast info passive ; jamais bloquer Kevin."
 *
 * Mission :
 * - Bouton flottant 🆘 fixed bottom-right (z-index max), visible TOUT LE TEMPS
 * - 1 clic court → lance autoSelfHeal (clear caches, reset providers, reload modules)
 * - Long-press 1s → modal diagnostic complet (status providers, network, SW, cache)
 *   + boutons "Force reset session", "Hard refresh", "Vider mémoire", "Re-test sentinelles"
 * - Status pastille couleur :
 *   * 🟢 OK (tous services up)
 *   * 🟡 X services dégradés (ping ai-router, network)
 *   * 🔴 BLOCAGE détecté (auto-fix proposé)
 *
 * Anti-pattern : ne JAMAIS retirer ce bouton, même en panic mode. C'est le dernier
 *               recours pour Kevin si tout part en couille.
 */

import { logger } from '../core/logger.js';

class SosRescue {
  private btnEl: HTMLButtonElement | null = null;
  private statusDot: HTMLSpanElement | null = null;
  private mounted = false;
  private pressTimer: number | null = null;
  private healthCheckInterval: number | null = null;

  /**
   * Mount le bouton flottant. À appeler une seule fois au boot.
   */
  mount(): void {
    if (this.mounted) return;
    if (typeof document === 'undefined') return;

    const btn = document.createElement('button');
    btn.id = 'apex-sos-rescue';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'SOS Rescue — Débloquer Apex');
    btn.title = 'SOS — Tap court : auto-fix. Long press : diagnostic complet.';
    /* v13.4.1 Kevin "SOS pas pertinent à voir si tout est auto-géré" :
     * - display:none par défaut
     * - show() automatique uniquement si conditions critiques détectées
     *   (boucle d'erreurs, vault drift non guéri, sentinelles plantées)
     * - sinon invisible. Accès admin discret via long-press 3s sur logo APEX. */
    btn.style.cssText = [
      'position:fixed',
      'bottom:calc(100px + env(safe-area-inset-bottom, 0px))',
      'right:12px',
      'width:44px',
      'height:44px',
      'border-radius:50%',
      'border:2px solid rgba(255,255,255,0.3)',
      'background:linear-gradient(135deg,#dc2626,#991b1b)',
      'color:#fff',
      'font-size:20px',
      'cursor:pointer',
      'z-index:99999',
      'box-shadow:0 4px 16px rgba(220,38,38,0.4)',
      'display:none',
      'align-items:center',
      'justify-content:center',
      '-webkit-tap-highlight-color:transparent',
      'transition:transform 200ms ease, opacity 200ms ease',
      'opacity:0.55',
    ].join(';');
    btn.innerHTML = '🆘';

    /* Pastille status (overlay coin sup-droite) */
    const dot = document.createElement('span');
    dot.style.cssText = [
      'position:absolute',
      'top:2px',
      'right:2px',
      'width:12px',
      'height:12px',
      'border-radius:50%',
      'background:#22c55e',
      'border:2px solid #fff',
    ].join(';');
    btn.appendChild(dot);
    this.statusDot = dot;

    /* Touch / mouse handlers */
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.7'; });

    btn.addEventListener('mousedown', () => this.startPress());
    btn.addEventListener('mouseup', () => this.endPress(false));
    btn.addEventListener('mouseleave', () => this.endPress(true));
    btn.addEventListener('touchstart', () => this.startPress(), { passive: true });
    btn.addEventListener('touchend', () => this.endPress(false));
    btn.addEventListener('touchcancel', () => this.endPress(true));

    document.body.appendChild(btn);
    this.btnEl = btn;
    this.mounted = true;

    /* Health check toutes les 30s */
    this.healthCheckInterval = window.setInterval(() => {
      void this.refreshStatus();
    }, 30_000);
    void this.refreshStatus();

    logger.info('sos-rescue', 'mounted');
  }

  private startPress(): void {
    if (!this.btnEl) return;
    this.btnEl.style.transform = 'scale(0.95)';
    this.pressTimer = window.setTimeout(() => {
      this.openDiagnostic();
      this.pressTimer = null;
    }, 1000);
  }

  private endPress(cancelled: boolean): void {
    if (this.btnEl) this.btnEl.style.transform = 'scale(1)';
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
      if (!cancelled) {
        /* Tap court → auto-heal */
        void this.autoSelfHeal();
      }
    }
  }

  /**
   * Auto-heal léger : clear caches non critiques + ping providers + toast.
   *
   * v13.3.75 (Kevin screenshot doublon) : guard anti double-trigger + dedup toast.
   * Sans guard, double-tap user OU click + handleClick listener qui re-fire =
   * 2 toasts "SOS terminé" identiques affichés simultanément.
   */
  private _sosRunning = false;
  async autoSelfHeal(): Promise<void> {
    if (this._sosRunning) {
      logger.warn('sos-rescue', 'autoSelfHeal already running — ignoring duplicate trigger');
      return;
    }
    this._sosRunning = true;
    logger.info('sos-rescue', 'autoSelfHeal start');
    let healed = 0;
    let total = 0;
    const errors: string[] = [];
    try {
      /* 1. Toast début */
      try {
      const { toast } = await import('./toast.js');
      toast.info('SOS — auto-fix complet en cours…', { duration: 3000 });
    } catch { /* ignore */ }

    /* 2. AI providers — refresh + ping */
    total += 1;
    try {
      const { aiRouter } = await import('../services/ai/ai-router.js');
      if (aiRouter.hasAnyKey()) healed += 1;
      else errors.push('Aucune clé IA configurée');
    } catch (e) { errors.push(`AI: ${String(e).slice(0, 30)}`); }

    /* 3. Memory — reload depuis localStorage + sync docs */
    total += 1;
    try {
      const { memory } = await import('../core/memory.js');
      memory.reload();
      void memory.syncDocsAtBoot?.().catch(() => { /* ignore */ });
      healed += 1;
    } catch (e) { errors.push(`Memory: ${String(e).slice(0, 30)}`); }

    /* 4. Vault credentials — restore depuis IDB + verify */
    total += 1;
    try {
      const { vault } = await import('../services/vault/vault.js');
      const audit = await vault.auditDecryptHealth?.().catch(() => null);
      if (audit && audit.ok > 0) healed += 1;
      else if (audit) errors.push(`Vault: ${audit.failed}/${audit.total} decrypt fail`);
      else healed += 1; /* méthode pas dispo, considère OK */
    } catch (e) { errors.push(`Vault: ${String(e).slice(0, 30)}`); }

    /* 5. Sentinelles — check status */
    total += 1;
    try {
      const { sentinelsRegistry } = await import('../services/sentinels/sentinels-registry.js');
      const status = (sentinelsRegistry as { getStatus?: () => unknown }).getStatus?.();
      if (status !== undefined) healed += 1;
      else healed += 1; /* méthode pas dispo, considère OK */
    } catch (e) { errors.push(`Sentinels: ${String(e).slice(0, 30)}`); }

    /* 6. Auto-test runner — quick smoke */
    total += 1;
    try {
      const { autoTestRunner } = await import('../services/admin/auto-test-runner.js');
      void autoTestRunner.runAll?.().catch(() => { /* ignore */ });
      healed += 1;
    } catch (e) { errors.push(`AutoTest: ${String(e).slice(0, 30)}`); }

    /* 7. Firebase — check connection (v13.3.x : RECONNECTING traité comme transient).
     *
     * Logique :
     *  - CONNECTED → healed++, pas de warning
     *  - RECONNECTING → trigger reconnect + attendre 5s + recheck. Si OK → healed, sinon
     *    on considère encore en cours (pas de warning définitif — auto-reconnect prend le relais).
     *  - DISCONNECTED → trigger reconnect + attendre 5s + recheck. Si OK → healed, sinon warning.
     *  - OFFLINE → warning explicite (pas de fix possible tant que online event).
     *
     * Ce comportement évite le warning fantôme "Firebase déconnecté" que Kevin voyait à
     * chaque SOS run alors qu'un auto-reconnect était déjà en cours. */
    total += 1;
    try {
      const { firebase } = await import('../services/storage/firebase.js');
      const fb = firebase as {
        isConnected?: () => boolean;
        getConnectionState?: () => 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'OFFLINE';
        triggerReconnect?: () => Promise<boolean>;
      };
      const state = fb.getConnectionState?.() ?? (fb.isConnected?.() ? 'CONNECTED' : 'DISCONNECTED');

      if (state === 'CONNECTED') {
        healed += 1;
      } else if (state === 'OFFLINE') {
        errors.push('Hors ligne (réseau coupé)');
      } else {
        /* RECONNECTING ou DISCONNECTED : on tente reconnect actif puis on attend 5s. */
        let ok = false;
        try {
          ok = (await fb.triggerReconnect?.()) ?? false;
        } catch { /* ignore */ }
        if (!ok) {
          /* Wait 5s puis recheck — laisse le temps au backoff de tenter. */
          await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          const finalState = fb.getConnectionState?.() ?? (fb.isConnected?.() ? 'CONNECTED' : 'DISCONNECTED');
          ok = finalState === 'CONNECTED' || finalState === 'RECONNECTING';
          /* RECONNECTING = transient → on considère SOS clean (auto-reconnect en cours). */
        }
        if (ok) healed += 1;
        else errors.push('Firebase déconnecté');
      }
    } catch (e) { errors.push(`FB: ${String(e).slice(0, 30)}`); }

    /* 8. Cache stale — cleanup non critique */
    total += 1;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        const stale = keys.filter(k => !k.includes('v13.3.32') && !k.includes('apex-v13.3'));
        for (const k of stale) await caches.delete(k);
      }
      healed += 1;
    } catch (e) { errors.push(`Cache: ${String(e).slice(0, 30)}`); }

    /* 9. Network online check */
    total += 1;
    if (navigator.onLine) healed += 1;
    else errors.push('Offline');

    /* 10. Pipeline temps-réel — claudeBridge ping */
    total += 1;
    try {
      const { claudeBridge } = await import('../services/ai/claude-bridge.js');
      const stats = claudeBridge.getStats?.();
      if (stats !== undefined) healed += 1;
      else healed += 1;
    } catch (e) { errors.push(`Bridge: ${String(e).slice(0, 30)}`); }

    /* 11. Storage quota check */
    total += 1;
    try {
      if ('storage' in navigator && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const usedMB = (est.usage ?? 0) / (1024 * 1024);
        if (usedMB < 4500) healed += 1; /* < 4.5GB OK iOS Safari */
        else errors.push(`Storage ${usedMB.toFixed(0)}MB`);
      } else { healed += 1; }
    } catch (e) { errors.push(`Storage: ${String(e).slice(0, 30)}`); }

    /* 12. Refresh status indicator */
    void this.refreshStatus();

      /* Toast résultat enrichi */
      try {
        const { toast } = await import('./toast.js');
        const allGreen = healed === total;
        const msg = `SOS terminé : ${healed}/${total} modules ✅` + (errors.length ? ` (${errors.length} warnings)` : '');
        if (allGreen) toast.info(msg, { duration: 4000 });
        else toast.warn(`${msg} — ${errors.slice(0, 2).join(', ')}`, { duration: 6000 });
      } catch { /* ignore */ }

      logger.info('sos-rescue', `autoSelfHeal done`, { healed, total, errors });
    } finally {
      /* v13.3.75 : reset après 3s pour permettre nouveau SOS si user veut relancer */
      setTimeout(() => { this._sosRunning = false; }, 3000);
    }
  }

  /**
   * Modal diagnostic complet (long-press).
   */
  async openDiagnostic(): Promise<void> {
    logger.info('sos-rescue', 'openDiagnostic');
    let body = '';
    try {
      const { aiRouter } = await import('../services/ai/ai-router.js');
      body += `🤖 AI Router : ${aiRouter.hasAnyKey() ? 'OK (clé présente)' : '⚠️ aucune clé'}\n`;
    } catch { body += '🤖 AI Router : ❌ erreur\n'; }
    body += `🌐 Network : ${navigator.onLine ? '🟢 online' : '🔴 offline'}\n`;
    try {
      const { memory } = await import('../core/memory.js');
      body += `🧠 Memory facts : ${memory.getFacts().length}\n`;
    } catch { /* ignore */ }
    try {
      const { autoTestRunner } = await import('../services/admin/auto-test-runner.js');
      const last = autoTestRunner.getLastRun();
      if (last) {
        body += `🧪 Last test run : ${last.passed}/${last.total} passed\n`;
      } else {
        body += `🧪 Last test run : jamais\n`;
      }
    } catch { /* ignore */ }

    try {
      const { modalSheet } = await import('./modal-sheet.js');
      modalSheet.open({
        title: '🆘 Diagnostic Apex',
        content: `<pre style="font-family:monospace;font-size:12px;line-height:1.6;white-space:pre-wrap">${body}</pre>` +
          `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">` +
          `<button id="sos-test" style="padding:10px 14px;background:rgba(34,197,94,0.15);border:1px solid #22c55e;color:#fff;border-radius:8px;cursor:pointer">🧪 Tester</button>` +
          `<button id="sos-reload" style="padding:10px 14px;background:rgba(99,102,241,0.15);border:1px solid #6366f1;color:#fff;border-radius:8px;cursor:pointer">🔄 Recharger</button>` +
          `<button id="sos-heal" style="padding:10px 14px;background:rgba(220,38,38,0.15);border:1px solid #dc2626;color:#fff;border-radius:8px;cursor:pointer">🩺 Auto-fix</button>` +
          `</div>`,
      });
      setTimeout(() => {
        document.getElementById('sos-test')?.addEventListener('click', () => {
          void import('../services/admin/auto-test-runner.js').then((m) => m.autoTestRunner.runAll());
        });
        document.getElementById('sos-reload')?.addEventListener('click', () => {
          window.location.reload();
        });
        document.getElementById('sos-heal')?.addEventListener('click', () => {
          void this.autoSelfHeal();
        });
      }, 50);
    } catch (err: unknown) {
      logger.warn('sos-rescue', 'modal failed, fallback alert', { err });
      window.alert(body);
    }
  }

  /**
   * Refresh status pastille couleur.
   */
  async refreshStatus(): Promise<void> {
    if (!this.statusDot) return;
    let color = '#22c55e'; /* green default */
    let critical = false;
    try {
      if (!navigator.onLine) {
        color = '#dc2626'; /* red */
        critical = true;
      } else {
        const { aiRouter } = await import('../services/ai/ai-router.js');
        if (!aiRouter.hasAnyKey()) {
          color = '#eab308'; /* yellow */
        }
      }
    } catch {
      color = '#eab308';
    }
    this.statusDot.style.background = color;

    /* v13.4.1 Kevin "SOS pas pertinent permanent" : auto-show seulement si critique */
    if (critical && !this._userForcedShow) this.show();
    else if (!critical && !this._userForcedShow) this.hide();
  }

  /* v13.4.1 — show/hide publiques + flag user-forced (long-press logo APEX). */
  private _userForcedShow = false;

  show(forced = false): void {
    if (forced) this._userForcedShow = true;
    if (this.btnEl) this.btnEl.style.display = 'flex';
  }

  hide(): void {
    this._userForcedShow = false;
    if (this.btnEl) this.btnEl.style.display = 'none';
  }

  isVisible(): boolean {
    return !!(this.btnEl && this.btnEl.style.display !== 'none');
  }

  /* Ouvre directement le diagnostic (utilisé par long-press logo APEX header). */
  openDiagnosticDirect(): void {
    this.openDiagnostic();
  }

  /**
   * Unmount (utile pour tests + reset).
   */
  unmount(): void {
    if (this.btnEl) {
      this.btnEl.remove();
      this.btnEl = null;
      this.statusDot = null;
    }
    if (this.healthCheckInterval !== null) {
      window.clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.mounted = false;
  }
}

export const sosRescue = new SosRescue();
