/**
 * APEX v13 — Loading premium (Kevin redesign UX premium 2026-05-04).
 *
 * Helpers HTML pour spinners + skeleton loaders premium :
 * - spinner() : spinner conic-gradient or premium (3 tailles)
 * - thinking() : 3 dots animation pour "Apex réfléchit"
 * - confetti() : burst confetti success (auto-cleanup 2s)
 * - shimmer() : skeleton ligne shimmer effect
 * - cardShimmer() : skeleton carte complète
 * - listShimmer() : skeleton liste d'items
 *
 * Tous respectent prefers-reduced-motion via CSS.
 */

import { escapeHtml } from '../core/escape-html.js';

export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerOptions {
  size?: SpinnerSize;
  ariaLabel?: string;
}

/**
 * Premium spinner (conic gold gradient).
 */
export function spinner(opts: SpinnerOptions = {}): string {
  const size = opts.size ?? 'md';
  const sizeClass = size === 'md' ? '' : ` ax-spinner-premium-${size}`;
  const label = opts.ariaLabel ?? 'Chargement';
  return `<div class="ax-spinner-premium${sizeClass}" role="status" aria-label="${escapeHtml(label)}"></div>`;
}

/**
 * "Apex réfléchit" 3 dots typing indicator.
 */
export function thinking(label = 'Apex réfléchit'): string {
  return `
    <div class="ax-thinking" role="status" aria-live="polite">
      <span>${escapeHtml(label)}</span>
      <span class="ax-thinking-dots" aria-hidden="true">
        <span class="ax-thinking-dot"></span>
        <span class="ax-thinking-dot"></span>
        <span class="ax-thinking-dot"></span>
      </span>
    </div>
  `.trim();
}

/**
 * Shimmer skeleton ligne unique.
 */
export function shimmerLine(width = '100%', height = '14px'): string {
  return `<div class="ax-shimmer" style="width:${escapeAttr(width)};height:${escapeAttr(height)}"></div>`;
}

/**
 * Skeleton carte complète (titre + 3 lignes).
 */
export function cardShimmer(): string {
  return `
    <div class="ax-card-elevated ax-shimmer-card-wrap" aria-busy="true" aria-label="Chargement contenu">
      ${shimmerLine('40%', '18px')}
      <div style="height:8px"></div>
      ${shimmerLine('100%', '12px')}
      <div style="height:6px"></div>
      ${shimmerLine('80%', '12px')}
      <div style="height:6px"></div>
      ${shimmerLine('60%', '12px')}
    </div>
  `.trim();
}

/**
 * Skeleton liste d'items (avatar + 2 lignes par row).
 */
export function listShimmer(count = 4): string {
  if (count < 1) count = 1;
  if (count > 50) count = 50;
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    items.push(`
      <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--ax-border)">
        <div class="ax-shimmer" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          ${shimmerLine('60%', '14px')}
          ${shimmerLine('40%', '11px')}
        </div>
      </div>
    `);
  }
  return `<div role="status" aria-busy="true" aria-label="Chargement liste">${items.join('')}</div>`;
}

/**
 * Confetti burst (success).
 * Crée N pieces colorées qui tombent + auto-cleanup après 2s.
 * Respecte prefers-reduced-motion (no-op).
 */
export function confetti(count = 40): void {
  if (typeof document === 'undefined') return;
  /* prefers-reduced-motion : skip animation */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const container = document.createElement('div');
  container.className = 'ax-confetti';
  container.setAttribute('aria-hidden', 'true');
  const colors = ['#c9a227', '#e8b830', '#f5cc4a', '#22cc77', '#6a8aff', '#ff6b9d'];
  let n = count;
  if (n < 1) n = 1;
  if (n > 200) n = 200;
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('div');
    piece.className = 'ax-confetti-piece';
    const color = colors[i % colors.length] ?? '#e8b830';
    const left = Math.random() * 100;
    const delay = Math.random() * 200;
    const duration = 1200 + Math.random() * 800;
    const size = 6 + Math.random() * 6;
    piece.style.cssText =
      `background:${color};` +
      `left:${left}%;` +
      `width:${size}px;` +
      `height:${size * 1.5}px;` +
      `animation-delay:${delay}ms;` +
      `animation-duration:${duration}ms;`;
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => {
    container.remove();
  }, 2200);
}

/**
 * Inline loading state in target element (replace innerHTML safely).
 * Returns a function pour stopper le loading et restaurer le contenu original.
 */
export function inlineLoading(
  target: HTMLElement,
  variant: 'spinner' | 'thinking' | 'shimmer' = 'spinner',
): () => void {
  if (!target) return () => {};
  const original = target.innerHTML;
  const wasAriaBusy = target.getAttribute('aria-busy');
  target.setAttribute('aria-busy', 'true');
  let html = '';
  if (variant === 'spinner') html = `<div style="display:flex;justify-content:center;padding:16px">${spinner()}</div>`;
  else if (variant === 'thinking') html = thinking();
  else html = cardShimmer();
  target.innerHTML = html;
  return (): void => {
    target.innerHTML = original;
    if (wasAriaBusy === null) target.removeAttribute('aria-busy');
    else target.setAttribute('aria-busy', wasAriaBusy);
  };
}

/* ───────── Helpers escape ───────── */
function escapeAttr(s: string): string {
  /* Whitelist alphanumeric + % + px + - + . + ! pour CSS values */
  return s.replace(/[^a-zA-Z0-9%.\-px! ]/g, '');
}

/* Default export pratique */
export const loading = {
  spinner,
  thinking,
  shimmerLine,
  cardShimmer,
  listShimmer,
  confetti,
  inlineLoading,
};
