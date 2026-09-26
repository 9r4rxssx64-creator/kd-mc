/**
 * APEX v13.4.193 — Overlay dictée transparent fullscreen (Kevin "comme Claude Code").
 *
 * Kevin 2026-05-16 : "Ne s'affiche pas comme pour toi dans Claude Code, comme
 * j'aurais voulu en transparent au-dessus de la fenêtre du chat ou en écrit."
 *
 * Overlay modal fullscreen :
 * - Background semi-transparent (rgba 0,0,0,0.65 + backdrop-filter blur)
 * - Texte transcript en grand au centre (font-size 26px, line-height 1.5)
 * - Animation de pulse sur l'icône 🎙
 * - 2 boutons : "Stop" (rouge) + "Envoyer" (or)
 * - Auto-submit après 1.5s de silence
 * - Tap outside → ferme + reprend mode passif
 *
 * Pattern style Claude Code voice mode iOS.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

export interface VoiceOverlayOptions {
  onStop?: () => void;
  onSubmit?: (transcript: string) => void;
  initialMessage?: string;
}

let _overlayEl: HTMLDivElement | null = null;
let _transcriptEl: HTMLDivElement | null = null;
let _onSubmitCb: ((transcript: string) => void) | null = null;
let _onStopCb: (() => void) | null = null;
let _currentTranscript = '';

function injectStylesOnce(): void {
  if (document.getElementById('apex-voice-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'apex-voice-overlay-styles';
  style.textContent = `
    @keyframes ax-mic-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(232,184,48,0.5); }
      50% { transform: scale(1.06); box-shadow: 0 0 32px 16px rgba(232,184,48,0); }
    }
    @keyframes ax-overlay-fade-in {
      from { opacity: 0; backdrop-filter: blur(0px); }
      to { opacity: 1; backdrop-filter: blur(12px); }
    }
    @keyframes ax-transcript-pop {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

/** Ouvre l'overlay dictée transparent. Idempotent. */
export function show(opts: VoiceOverlayOptions = {}): void {
  if (_overlayEl) return; /* déjà visible */
  injectStylesOnce();
  _onSubmitCb = opts.onSubmit ?? null;
  _onStopCb = opts.onStop ?? null;
  _currentTranscript = opts.initialMessage ?? '';

  _overlayEl = document.createElement('div');
  _overlayEl.id = 'apex-voice-overlay';
  _overlayEl.setAttribute('role', 'dialog');
  _overlayEl.setAttribute('aria-modal', 'true');
  _overlayEl.setAttribute('aria-label', 'Dictée vocale en cours');
  _overlayEl.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483645', /* sous SOS rescue mais au-dessus tout autre */
    'background:rgba(0,0,0,0.65)',
    'backdrop-filter:blur(12px) saturate(140%)',
    '-webkit-backdrop-filter:blur(12px) saturate(140%)',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:env(safe-area-inset-top,20px) 20px env(safe-area-inset-bottom,20px) 20px',
    'animation:ax-overlay-fade-in 320ms cubic-bezier(0.16,1,0.3,1) forwards',
    'cursor:pointer',
  ].join(';');

  safeSetHTML(_overlayEl, `
    <div style="
      width:100%;max-width:520px;
      display:flex;flex-direction:column;align-items:center;gap:24px;
      cursor:default
    " id="apex-voice-overlay-inner">
      <div style="
        width:96px;height:96px;border-radius:50%;
        background:linear-gradient(135deg,#c9a227,#e8b830);
        display:flex;align-items:center;justify-content:center;
        font-size:48px;
        animation:ax-mic-pulse 1.8s ease-in-out infinite;
      " aria-hidden="true">🎙</div>
      <div id="apex-voice-overlay-status" style="
        color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:0.5px;
        text-transform:uppercase;font-weight:600
      ">Parle maintenant…</div>
      <div id="apex-voice-overlay-transcript" style="
        color:#fff;font-size:26px;line-height:1.45;text-align:center;
        font-weight:500;min-height:80px;max-height:50vh;overflow-y:auto;
        padding:0 8px;word-break:break-word;overflow-wrap:anywhere;
        animation:ax-transcript-pop 240ms ease-out forwards;
      ">${_currentTranscript || '<span style="opacity:0.4">…</span>'}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;width:100%;margin-top:8px">
        <button id="apex-voice-overlay-stop" type="button" aria-label="Arrêter dictée" style="
          padding:14px 24px;min-height:48px;min-width:120px;
          background:rgba(255,91,91,0.15);color:#ff5b5b;
          border:1.5px solid rgba(255,91,91,0.5);border-radius:24px;
          font-size:15px;font-weight:700;cursor:pointer;
          -webkit-tap-highlight-color:transparent;
        ">✕ Stop</button>
        <button id="apex-voice-overlay-submit" type="button" aria-label="Envoyer" style="
          padding:14px 28px;min-height:48px;min-width:140px;
          background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;
          border:none;border-radius:24px;
          font-size:15px;font-weight:800;cursor:pointer;
          box-shadow:0 4px 16px rgba(201,162,39,0.4);
          -webkit-tap-highlight-color:transparent;
        ">↑ Envoyer</button>
      </div>
    </div>
  `);

  document.body.appendChild(_overlayEl);
  _transcriptEl = _overlayEl.querySelector<HTMLDivElement>('#apex-voice-overlay-transcript');

  /* Wire buttons */
  _overlayEl.querySelector<HTMLButtonElement>('#apex-voice-overlay-stop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleStop();
  });
  _overlayEl.querySelector<HTMLButtonElement>('#apex-voice-overlay-submit')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSubmit();
  });
  /* Tap outside (sur backdrop) = stop */
  _overlayEl.addEventListener('click', (e) => {
    if (e.target === _overlayEl) handleStop();
  });
  /* Escape key = stop */
  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      handleStop();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  logger.info('voice-overlay', 'shown');
}

/** Met à jour le transcript affiché en temps réel. */
export function updateTranscript(transcript: string, isFinal: boolean = false): void {
  _currentTranscript = transcript;
  if (!_transcriptEl) return;
  if (!transcript) {
    safeSetHTML(_transcriptEl, '<span style="opacity:0.4">…</span>');
  } else {
    _transcriptEl.textContent = transcript + (isFinal ? '' : '…');
  }
}

/** Met à jour le status text. */
export function updateStatus(text: string): void {
  if (!_overlayEl) return;
  const statusEl = _overlayEl.querySelector<HTMLDivElement>('#apex-voice-overlay-status');
  if (statusEl) statusEl.textContent = text;
}

/** Ferme l'overlay. */
export function hide(): void {
  if (_overlayEl) {
    _overlayEl.remove();
    _overlayEl = null;
    _transcriptEl = null;
  }
  _onSubmitCb = null;
  _onStopCb = null;
  _currentTranscript = '';
}

/** Visible ? */
export function isVisible(): boolean {
  return _overlayEl !== null;
}

function handleStop(): void {
  const cb = _onStopCb;
  hide();
  if (cb) {
    try {
      cb();
    } catch (err: unknown) {
      logger.warn('voice-overlay', 'onStop callback failed', { err });
    }
  }
}

function handleSubmit(): void {
  const transcript = _currentTranscript.trim();
  const cb = _onSubmitCb;
  hide();
  if (cb && transcript) {
    try {
      cb(transcript);
    } catch (err: unknown) {
      logger.warn('voice-overlay', 'onSubmit callback failed', { err });
    }
  }
}

export const voiceOverlay = {
  show,
  hide,
  isVisible,
  updateTranscript,
  updateStatus,
};
