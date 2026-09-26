/**
 * APEX v13.4.111 — Zoom Inspector live (Kevin "UX zoom encore" 8e fois).
 *
 * Kevin signale depuis v13.4.93 un zoom persistant sur iPhone Safari PWA.
 * 8 patches en aveugle (gesturestart preventDefault inline, touch-action,
 * -webkit-text-size-adjust, font-size 16px inputs) → bug persiste.
 *
 * SOLUTION : diagnostic LIVE visible Kevin pour identifier la cause EXACTE.
 * Au lieu de patcher en aveugle, montrer les vraies valeurs runtime.
 *
 * Affiche un panel flottant top-right (admin only) qui update toutes les 500ms :
 *   - visualViewport.scale (1.0 = pas zoom, >1 = zoom actif)
 *   - innerWidth / clientWidth ratio (1.0 = OK)
 *   - Nombre inputs avec font-size < 16px (cause auto-zoom Safari iOS)
 *   - Éléments avec transform: scale(...) appliqué
 *   - touch-action computed sur html / body
 *   - viewport meta content actuel (peut être modifié par scripts)
 *
 * Activable via Réglages → bouton "🔍 Zoom Inspector".
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

interface InspectorMetrics {
  visual_viewport_scale: number;
  width_ratio: number;
  inputs_below_16px: number;
  scaled_elements: number;
  touch_action_html: string;
  touch_action_body: string;
  viewport_meta: string;
  text_size_adjust: string;
  ts: number;
}

let panelEl: HTMLDivElement | null = null;
let intervalId: number | null = null;

function collect(): InspectorMetrics {
  let scale = 1;
  let widthRatio = 1;
  try {
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      scale = window.visualViewport.scale;
    }
    if (window.innerWidth && document.documentElement.clientWidth) {
      widthRatio = window.innerWidth / document.documentElement.clientWidth;
    }
  } catch { /* ignore */ }

  let inputsBelow16 = 0;
  let scaledElements = 0;
  try {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach((el) => {
      const fontSize = parseFloat(getComputedStyle(el).fontSize);
      if (fontSize < 16) inputsBelow16++;
    });
    /* Cherche transform: scale(X) où X != 1 */
    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none' && /scale\([^)]*\)/.test(t)) {
        const m = t.match(/scale\(([0-9.]+)/);
        if (m && m[1] && parseFloat(m[1]) !== 1) scaledElements++;
      }
    });
  } catch { /* ignore */ }

  let viewportMeta = '';
  try {
    const m = document.querySelector('meta[name="viewport"]');
    viewportMeta = m?.getAttribute('content') ?? '(absent)';
  } catch { /* ignore */ }

  let touchHtml = 'auto';
  let touchBody = 'auto';
  let textSizeAdjust = 'auto';
  try {
    touchHtml = getComputedStyle(document.documentElement).touchAction || 'auto';
    touchBody = getComputedStyle(document.body).touchAction || 'auto';
    /* webkit-text-size-adjust est sur html */
    const cs = getComputedStyle(document.documentElement);
    textSizeAdjust = cs.getPropertyValue('-webkit-text-size-adjust') ||
                     cs.getPropertyValue('text-size-adjust') ||
                     'auto';
  } catch { /* ignore */ }

  return {
    visual_viewport_scale: scale,
    width_ratio: widthRatio,
    inputs_below_16px: inputsBelow16,
    scaled_elements: scaledElements,
    touch_action_html: touchHtml,
    touch_action_body: touchBody,
    viewport_meta: viewportMeta,
    text_size_adjust: textSizeAdjust,
    ts: Date.now(),
  };
}

function renderPanel(m: InspectorMetrics): string {
  const scaleColor = Math.abs(m.visual_viewport_scale - 1) < 0.05 ? '#22cc77' : '#ff5b5b';
  const ratioColor = Math.abs(m.width_ratio - 1) < 0.05 ? '#22cc77' : '#ff5b5b';
  const inputsColor = m.inputs_below_16px === 0 ? '#22cc77' : '#ff8844';
  return `
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.4;color:#fff">
      <div style="font-weight:700;color:#c9a227;margin-bottom:6px">🔍 ZOOM INSPECTOR LIVE</div>
      <div>scale: <span style="color:${scaleColor};font-weight:700">${m.visual_viewport_scale.toFixed(3)}</span></div>
      <div>ratio: <span style="color:${ratioColor};font-weight:700">${m.width_ratio.toFixed(3)}</span></div>
      <div>inputs &lt;16px: <span style="color:${inputsColor};font-weight:700">${m.inputs_below_16px}</span></div>
      <div>scaled els: <span style="font-weight:700">${m.scaled_elements}</span></div>
      <div>touch html: <span>${m.touch_action_html}</span></div>
      <div>touch body: <span>${m.touch_action_body}</span></div>
      <div>txt-size-adj: <span>${m.text_size_adjust}</span></div>
      <div style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.6);max-width:240px;word-wrap:break-word">viewport: ${m.viewport_meta}</div>
      <button id="apex-zoom-inspector-close" style="margin-top:8px;background:#ff5b5b;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">Fermer</button>
    </div>
  `;
}

function show(): void {
  if (panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'apex-zoom-inspector-panel';
  /* v13.4.177 (Kevin screenshot v13.4.176 "panel masque titre + tabs") :
   * Repositionné BAS-GAUCHE (au-dessus nav iPhone PWA), max-width 200px,
   * draggable, opacity 0.9 → moins envahissant que top-left 260px. */
  panelEl.style.cssText =
    'position:fixed;' +
    'bottom:max(80px,calc(env(safe-area-inset-bottom,0px) + 80px));' +
    'left:8px;' +
    'background:rgba(15,15,25,0.92);' +
    'border:1px solid #c9a227;' +
    'border-radius:10px;' +
    'padding:8px 10px;' +
    'z-index:99999;' +
    'max-width:200px;' +
    'opacity:0.92;' +
    'backdrop-filter:blur(10px);' +
    '-webkit-backdrop-filter:blur(10px);' +
    'box-shadow:0 4px 20px rgba(0,0,0,0.5);' +
    'cursor:move;' +
    'touch-action:none;';
  document.body.appendChild(panelEl);
  /* Drag-to-reposition (touch + mouse) */
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragging = false;
  const onDragStart = (clientX: number, clientY: number): void => {
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
    dragging = true;
  };
  const onDragMove = (clientX: number, clientY: number): void => {
    if (!dragging || !panelEl) return;
    panelEl.style.left = `${Math.max(0, clientX - dragOffsetX)}px`;
    panelEl.style.top = `${Math.max(0, clientY - dragOffsetY)}px`;
    panelEl.style.bottom = 'auto';
  };
  const onDragEnd = (): void => { dragging = false; };
  panelEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) onDragStart(t.clientX, t.clientY);
  }, { passive: true });
  panelEl.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) onDragMove(t.clientX, t.clientY);
  }, { passive: true });
  panelEl.addEventListener('touchend', onDragEnd, { passive: true });
  panelEl.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
  document.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onDragEnd);
  /* Update toutes les 500ms */
  const updateFn = (): void => {
    if (!panelEl) return;
    const m = collect();
    safeSetHTML(panelEl, renderPanel(m));
    /* Re-bind close button */
    const closeBtn = panelEl.querySelector('#apex-zoom-inspector-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', hide);
    }
  };
  updateFn();
  intervalId = window.setInterval(updateFn, 500);
  /* v13.4.126 (Kevin "qualité pro" audit P1) : wire lifecycle pour cleanup
   * global au logout/reload (au cas où hide() oublié). */
  const intervalIdForLifecycle = intervalId;
  void import('../core-svc/service-lifecycle.js').then(({ lifecycle }) => {
    lifecycle.trackInterval('zoom-inspector', intervalIdForLifecycle as unknown as ReturnType<typeof setInterval>);
  }).catch(() => { /* skip si service absent */ });
  logger.info('zoom-inspector', '🔍 Panel live affiché');
}

function hide(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  logger.info('zoom-inspector', 'Panel masqué');
}

function isVisible(): boolean {
  return panelEl !== null;
}

function snapshot(): InspectorMetrics {
  return collect();
}

export const apexZoomInspector = { show, hide, isVisible, snapshot };
