/**
 * APEX v13 — Skeleton loaders (UX 17→20).
 *
 * Demande Kevin : "skeleton loaders + micro-interactions"
 * Affiche placeholders animés pendant chargement (better UX que spinner).
 *
 * v13.3.74 (H3 audit fix) :
 * - `skeleton(rootEl, type)` — helper haut-niveau pour features lazy-loaded
 * - Types prédéfinis : chat-message / feature-list / vault-cards / studio-grid / admin-table
 * - CSS animation shimmer auto-injecté
 * - Reduced-motion respecté (`prefers-reduced-motion`)
 * - Auto-cleanup quand contenu réel est rendu
 */

export type SkeletonShape = 'line' | 'circle' | 'card' | 'avatar' | 'button';

/**
 * Types de skeleton pour features lazy-loaded.
 */
export type SkeletonType =
  | 'chat-message'
  | 'feature-list'
  | 'vault-cards'
  | 'studio-grid'
  | 'admin-table';

interface SkeletonOptions {
  shape: SkeletonShape;
  width?: string;
  height?: string;
  count?: number;
}

export function renderSkeleton(opts: SkeletonOptions): string {
  const count = opts.count ?? 1;
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    let style = '';
    if (opts.width) style += `width:${opts.width};`;
    if (opts.height) style += `height:${opts.height};`;
    items.push(`<div class="ax-skel ax-skel-${opts.shape}" ${style ? `style="${style}"` : ''}></div>`);
  }
  return `<div class="ax-skel-group">${items.join('')}</div>`;
}

export function renderChatSkeleton(): string {
  return `
    <div class="ax-skel-chat">
      ${renderSkeleton({ shape: 'avatar', width: '40px', height: '40px' })}
      <div class="ax-skel-msg">
        ${renderSkeleton({ shape: 'line', width: '60%', height: '14px' })}
        ${renderSkeleton({ shape: 'line', width: '80%', height: '14px' })}
        ${renderSkeleton({ shape: 'line', width: '40%', height: '14px' })}
      </div>
    </div>
  `;
}

export function renderCardSkeleton(count = 3): string {
  return Array.from({ length: count }, () => `
    <div class="ax-skel-card-full">
      ${renderSkeleton({ shape: 'line', width: '40%', height: '16px' })}
      ${renderSkeleton({ shape: 'line', width: '90%', height: '12px' })}
      ${renderSkeleton({ shape: 'line', width: '70%', height: '12px' })}
    </div>
  `).join('');
}

export function renderListSkeleton(count = 5): string {
  return Array.from({ length: count }, () => `
    <div class="ax-skel-list-item">
      ${renderSkeleton({ shape: 'avatar', width: '32px', height: '32px' })}
      ${renderSkeleton({ shape: 'line', width: '60%', height: '14px' })}
    </div>
  `).join('');
}

/* ============================================================
 * v13.3.74 H3 — High-level skeleton helper
 * ============================================================ */

/**
 * Injection idempotente des styles shimmer + reduced-motion.
 * Idempotence basée sur la présence du <style id="ax-skeleton-styles"> dans le DOM
 * (pas un flag module-level — survive aux test resets de head).
 */
function ensureSkeletonStyles(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('ax-skeleton-styles');
  if (existing) return;
  const style = document.createElement('style');
  style.id = 'ax-skeleton-styles';
  style.textContent = `
    .ax-skel-shimmer {
      background: linear-gradient(90deg,
        rgba(255, 255, 255, 0.04) 0%,
        rgba(255, 255, 255, 0.10) 50%,
        rgba(255, 255, 255, 0.04) 100%);
      background-size: 200% 100%;
      animation: axSkelShimmer 1.4s ease-in-out infinite;
      border-radius: 6px;
    }
    @keyframes axSkelShimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .ax-skel-host {
      width: 100%;
      display: block;
    }
    .ax-skel-chat-msg {
      display: flex;
      gap: 12px;
      padding: 12px;
      align-items: flex-start;
    }
    .ax-skel-chat-msg__avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      flex: 0 0 auto;
    }
    .ax-skel-chat-msg__body { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .ax-skel-chat-msg__line { height: 12px; }
    .ax-skel-feat-list {
      display: flex; flex-direction: column; gap: 8px; padding: 8px;
    }
    .ax-skel-feat-list__item { height: 48px; }
    .ax-skel-vault-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px; padding: 12px;
    }
    .ax-skel-vault-cards__card { height: 96px; }
    .ax-skel-studio-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px; padding: 12px;
    }
    .ax-skel-studio-grid__tile { height: 120px; }
    .ax-skel-admin-table {
      display: flex; flex-direction: column; gap: 4px; padding: 8px;
    }
    .ax-skel-admin-table__row { height: 36px; }
    @media (prefers-reduced-motion: reduce) {
      .ax-skel-shimmer { animation: none; opacity: 0.45; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Rend un skeleton du type donné dans un élément cible.
 *
 * @param rootEl Élément cible (vidé avant injection)
 * @param type Type de skeleton à rendre
 * @returns Fonction `dispose()` qui retire le skeleton (ou clear le contenu)
 *
 * @example
 * ```ts
 * const dispose = skeleton(document.getElementById('chat-area')!, 'chat-message');
 * await loadMessages();
 * dispose(); // ou rootEl.innerHTML = nouveau contenu
 * ```
 */
export function skeleton(rootEl: HTMLElement | null, type: SkeletonType): () => void {
  if (!rootEl) return () => { /* no-op */ };
  ensureSkeletonStyles();
  rootEl.innerHTML = renderSkeletonHTML(type);
  rootEl.classList.add('ax-skel-host');
  rootEl.setAttribute('aria-busy', 'true');
  rootEl.setAttribute('data-ax-skeleton', type);

  return () => {
    if (rootEl.getAttribute('data-ax-skeleton') === type) {
      rootEl.classList.remove('ax-skel-host');
      rootEl.removeAttribute('aria-busy');
      rootEl.removeAttribute('data-ax-skeleton');
      /* If still skeleton-only (no real content injected by caller), clear */
      if (rootEl.querySelector('[data-ax-skel-marker]')) {
        rootEl.innerHTML = '';
      }
    }
  };
}

/**
 * Génère le HTML pour un type donné (testable sans DOM).
 */
export function renderSkeletonHTML(type: SkeletonType): string {
  switch (type) {
    case 'chat-message':
      return Array.from({ length: 3 }, () => `
        <div class="ax-skel-chat-msg" data-ax-skel-marker>
          <div class="ax-skel-chat-msg__avatar ax-skel-shimmer"></div>
          <div class="ax-skel-chat-msg__body">
            <div class="ax-skel-chat-msg__line ax-skel-shimmer" style="width:35%"></div>
            <div class="ax-skel-chat-msg__line ax-skel-shimmer" style="width:88%"></div>
            <div class="ax-skel-chat-msg__line ax-skel-shimmer" style="width:62%"></div>
          </div>
        </div>
      `).join('');

    case 'feature-list':
      return `<div class="ax-skel-feat-list" data-ax-skel-marker>${
        Array.from({ length: 6 }, () =>
          `<div class="ax-skel-feat-list__item ax-skel-shimmer"></div>`,
        ).join('')
      }</div>`;

    case 'vault-cards':
      return `<div class="ax-skel-vault-cards" data-ax-skel-marker>${
        Array.from({ length: 6 }, () =>
          `<div class="ax-skel-vault-cards__card ax-skel-shimmer"></div>`,
        ).join('')
      }</div>`;

    case 'studio-grid':
      return `<div class="ax-skel-studio-grid" data-ax-skel-marker>${
        Array.from({ length: 8 }, () =>
          `<div class="ax-skel-studio-grid__tile ax-skel-shimmer"></div>`,
        ).join('')
      }</div>`;

    case 'admin-table':
      return `<div class="ax-skel-admin-table" data-ax-skel-marker>${
        Array.from({ length: 8 }, () =>
          `<div class="ax-skel-admin-table__row ax-skel-shimmer"></div>`,
        ).join('')
      }</div>`;

    default:
      return '';
  }
}
