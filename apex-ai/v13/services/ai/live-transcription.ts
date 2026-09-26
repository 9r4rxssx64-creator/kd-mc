/**
 * APEX v13.4.50 — Live Transcription Overlay (Kevin "comme dans Claude Code").
 *
 * Affiche en TEMPS REEL le texte que l'utilisateur dicte, AU-DESSUS de la zone
 * d'input chat. Style : italique, fond semi-transparent, animation typing fluide.
 *
 * Inspiration : la capture Kevin montre claude.ai/code qui affiche en italic
 * gris-clair la transcription interim pendant que SpeechRecognition tourne.
 *
 * Architecture universelle :
 * - Service singleton avec start()/stop()/onTranscript()
 * - Overlay DOM injecté en position fixed au-dessus de l'input cible
 * - Auto-detect targetInput via querySelector ou param explicite
 * - Cleanup auto au stop
 *
 * Reutilisable :
 * - Apex chat input (auto-wire)
 * - CMCteams search/chat (wire identique)
 * - Tous projets futurs (import + start)
 *
 * iOS Safari PWA : continuous=false sur iOS (recognition coupe a 15-30s),
 * onresult interim TRUE, onend auto-restart si actif.
 */

import { logger } from '../../core/logger.js';

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ length: number; isFinal: boolean; [key: number]: { transcript: string } }>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

interface LiveTranscriptOptions {
  lang?: string;
  targetInput?: HTMLElement | string | null;
  position?: 'above-input' | 'top-center' | 'bottom-center';
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
}

class LiveTranscription {
  private recognition: RecognitionInstance | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private active = false;
  private currentInterim = '';
  private currentFinal = '';
  private opts: LiveTranscriptOptions = {};
  private isIos =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  /** Disponibilité Web Speech API */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }

  /** Vérifie permission micro (sans la demander) */
  async checkMicPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof navigator === 'undefined' || !navigator.permissions) return 'unsupported';
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state as 'granted' | 'denied' | 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  /** Demande accès micro explicite */
  async requestMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      logger.warn('live-transcription', 'mic denied', { err });
      return false;
    }
  }

  /** Lance la transcription live */
  async start(opts: LiveTranscriptOptions = {}): Promise<boolean> {
    if (this.active) {
      this.stop();
    }
    this.opts = opts;
    if (!this.isSupported()) {
      logger.warn('live-transcription', 'SpeechRecognition unsupported');
      return false;
    }

    /* Pré-flight mic */
    const perm = await this.checkMicPermission();
    if (perm === 'denied') {
      logger.warn('live-transcription', 'mic permission denied');
      return false;
    }

    const w = window as unknown as { SpeechRecognition?: new () => RecognitionInstance; webkitSpeechRecognition?: new () => RecognitionInstance };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return false;

    const rec = new Ctor();
    rec.lang = opts.lang ?? 'fr-FR';
    rec.interimResults = true; /* CRITIQUE : pour temps réel */
    rec.continuous = !this.isIos; /* iOS Safari coupe si continuous=true */

    this.currentInterim = '';
    this.currentFinal = '';

    rec.onstart = () => {
      this.active = true;
      this.injectOverlay();
      logger.info('live-transcription', 'started', { lang: rec.lang, continuous: rec.continuous });
    };

    rec.onresult = (e) => {
      let interim = '';
      let finalNow = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalNow += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalNow) {
        this.currentFinal += finalNow;
        opts.onFinal?.(finalNow);
      }
      this.currentInterim = interim;
      opts.onInterim?.(interim);
      this.updateOverlay();
    };

    rec.onerror = (e) => {
      /* iOS Safari : no-speech tres frequent, on ignore silencieusement */
      if (e.error === 'no-speech' || e.error === 'aborted') {
        logger.debug('live-transcription', `silent ignore: ${e.error}`);
        return;
      }
      logger.warn('live-transcription', `recognition error: ${e.error}`);
    };

    rec.onend = () => {
      /* iOS auto-restart si toujours actif */
      if (this.active && this.isIos) {
        setTimeout(() => {
          try {
            rec.start();
          } catch {
            this.cleanup();
          }
        }, 200);
      } else {
        this.cleanup();
      }
    };

    try {
      rec.start();
      this.recognition = rec;
      return true;
    } catch (err) {
      logger.warn('live-transcription', 'start failed', { err });
      return false;
    }
  }

  /** Stop + cleanup */
  stop(): { final: string; interim: string } {
    this.active = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        try {
          this.recognition.abort();
        } catch { /* ignore */ }
      }
    }
    const result = { final: this.currentFinal, interim: this.currentInterim };
    this.cleanup();
    return result;
  }

  /** Toggle (clic mic) */
  async toggle(opts: LiveTranscriptOptions = {}): Promise<boolean> {
    if (this.active) {
      this.stop();
      return false;
    }
    return this.start(opts);
  }

  isActive(): boolean {
    return this.active;
  }

  /* === Display-only API (pour intégration dans chat existant) ===
   * Permet d'utiliser l'overlay SANS lancer notre propre SpeechRecognition
   * (le chat Apex gère déjà sa dictée — on lui prête juste l'UI overlay). */

  /** Affiche overlay vide au-dessus de targetInput */
  showOverlay(opts: LiveTranscriptOptions = {}): void {
    this.opts = opts;
    this.currentFinal = '';
    this.currentInterim = '';
    this.active = true;
    this.injectOverlay();
  }

  /** Met à jour le texte affiché (final + interim) */
  updateText(finalText: string, interimText: string): void {
    this.currentFinal = finalText;
    this.currentInterim = interimText;
    this.updateOverlay();
  }

  /** Cache l'overlay (sans toucher à recognition) */
  hideOverlay(): void {
    this.active = false;
    this.removeOverlay();
  }

  /* === Overlay DOM === */

  private injectOverlay(): void {
    this.removeOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'apex-live-transcription-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    const targetInput = this.resolveTargetInput();
    let bottom = '120px';
    let left = '50%';
    let transform = 'translateX(-50%)';
    let width = 'min(90vw, 600px)';
    if (targetInput) {
      const rect = targetInput.getBoundingClientRect();
      bottom = `${window.innerHeight - rect.top + 8}px`;
      left = `${rect.left}px`;
      transform = 'none';
      width = `${rect.width}px`;
    } else if (this.opts.position === 'top-center') {
      bottom = `${window.innerHeight - 80}px`;
    } else if (this.opts.position === 'bottom-center') {
      bottom = '12px';
    }

    overlay.style.cssText = `
      position: fixed;
      bottom: ${bottom};
      left: ${left};
      transform: ${transform};
      width: ${width};
      max-width: 90vw;
      z-index: 99999;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(99, 102, 241, 0.5);
      border-radius: 14px;
      padding: 14px 18px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(99, 102, 241, 0.2);
      color: #cbd5e1;
      font-style: italic;
      font-size: 15px;
      line-height: 1.5;
      min-height: 44px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      will-change: opacity, transform;
    `;
    /* v13.4.344 audit UX : bottom-center au-dessus du home indicator iOS (safe-area).
     * setProperty après cssText → les vrais navigateurs appliquent le calc(env()) ;
     * happy-dom (tests) rejette env() comme no-op → conserve la base 12px (testable). */
    if (this.opts.position === 'bottom-center') {
      overlay.style.setProperty('bottom', 'calc(env(safe-area-inset-bottom, 0px) + 12px)');
    }
    overlay.innerHTML = `
      <div style="display:flex;align-items:start;gap:10px">
        <span style="display:inline-flex;align-items:center;gap:4px;color:#6366f1;font-size:12px;font-style:normal;font-weight:600;white-space:nowrap;padding-top:2px">
          <span class="apex-mic-pulse" style="width:8px;height:8px;background:#ef4444;border-radius:50%;animation:apex-mic-pulse 1.2s ease-in-out infinite"></span>
          🎙 Live
        </span>
        <span id="apex-live-transcript-text" style="flex:1;color:#e2e8f0">${this.escape(this.currentFinal + this.currentInterim) || '<span style="color:#64748b">Parle...</span>'}</span>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    /* Inject animation keyframes once */
    if (!document.getElementById('apex-mic-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'apex-mic-pulse-style';
      style.textContent = `
        @keyframes apex-mic-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `;
      document.head.appendChild(style);
    }
    /* Fade in */
    requestAnimationFrame(() => {
      if (overlay) overlay.style.opacity = '1';
    });
  }

  private updateOverlay(): void {
    if (!this.overlayEl) return;
    const textEl = this.overlayEl.querySelector('#apex-live-transcript-text');
    if (!textEl) return;
    const combined = (this.currentFinal + ' ' + this.currentInterim).trim();
    if (!combined) {
      textEl.innerHTML = '<span style="color:#64748b">Parle...</span>';
      return;
    }
    /* Final en blanc, interim en gris italique plus clair */
    const finalHtml = this.currentFinal ? `<span style="color:#f1f5f9">${this.escape(this.currentFinal)}</span>` : '';
    const interimHtml = this.currentInterim ? `<span style="color:#94a3b8">${this.escape(this.currentInterim)}</span>` : '';
    const space = this.currentFinal && this.currentInterim ? ' ' : '';
    textEl.innerHTML = `${finalHtml}${space}${interimHtml}`;
  }

  private removeOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
      const el = this.overlayEl;
      setTimeout(() => {
        try {
          el.remove();
        } catch { /* ignore */ }
      }, 200);
      this.overlayEl = null;
    }
  }

  private cleanup(): void {
    this.active = false;
    this.removeOverlay();
    this.recognition = null;
  }

  private resolveTargetInput(): HTMLElement | null {
    const t = this.opts.targetInput;
    if (typeof t === 'string') return document.querySelector(t);
    if (t instanceof HTMLElement) return t;
    /* Auto-detect : chercher input/textarea visible le plus en bas */
    const inputs = Array.from(
      document.querySelectorAll<HTMLElement>('textarea, input[type="text"], [contenteditable="true"]'),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 100 && r.height > 0 && r.top < window.innerHeight;
    });
    if (inputs.length === 0) return null;
    /* Le plus bas (probablement la chat input active) */
    return inputs.reduce((best, el) => {
      const r = el.getBoundingClientRect();
      const br = best.getBoundingClientRect();
      return r.top > br.top ? el : best;
    });
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  }
}

export const liveTranscription = new LiveTranscription();
