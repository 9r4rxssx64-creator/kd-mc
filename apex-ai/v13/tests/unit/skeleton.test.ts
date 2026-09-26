/**
 * Tests skeleton loaders (UX 17→20 + H3 audit fix v13.3.73).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderSkeleton, renderChatSkeleton, renderCardSkeleton, renderListSkeleton,
  skeleton, renderSkeletonHTML,
} from '../../ui/skeleton.js';

describe('Skeleton loaders', () => {
  it('renderSkeleton line par défaut', () => {
    const html = renderSkeleton({ shape: 'line' });
    expect(html).toContain('ax-skel-line');
  });

  it('renderSkeleton circle', () => {
    expect(renderSkeleton({ shape: 'circle' })).toContain('ax-skel-circle');
  });

  it('renderSkeleton card', () => {
    expect(renderSkeleton({ shape: 'card' })).toContain('ax-skel-card');
  });

  it('renderSkeleton avec width + height', () => {
    const html = renderSkeleton({ shape: 'line', width: '60%', height: '14px' });
    expect(html).toContain('width:60%');
    expect(html).toContain('height:14px');
  });

  it('renderSkeleton count multiple', () => {
    const html = renderSkeleton({ shape: 'line', count: 3 });
    const matches = html.match(/ax-skel-line/g);
    expect(matches?.length).toBe(3);
  });

  it('renderChatSkeleton avatar + 3 lines', () => {
    const html = renderChatSkeleton();
    expect(html).toContain('ax-skel-avatar');
    expect(html).toContain('ax-skel-line');
  });

  it('renderCardSkeleton 3 cards défaut', () => {
    const html = renderCardSkeleton();
    const matches = html.match(/ax-skel-card-full/g);
    expect(matches?.length).toBe(3);
  });

  it('renderCardSkeleton custom count', () => {
    const html = renderCardSkeleton(7);
    const matches = html.match(/ax-skel-card-full/g);
    expect(matches?.length).toBe(7);
  });

  it('renderListSkeleton 5 items défaut', () => {
    const html = renderListSkeleton();
    const matches = html.match(/ax-skel-list-item/g);
    expect(matches?.length).toBe(5);
  });
});

/* ============================================================
 * H3 audit fix v13.3.73 — high-level skeleton(rootEl, type) helper
 * ============================================================ */

describe('skeleton(rootEl, type) — H3 audit fix v13.3.73', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('renderSkeletonHTML(type)', () => {
    it('chat-message → 3 message blocks with shimmer', () => {
      const html = renderSkeletonHTML('chat-message');
      expect(html).toContain('ax-skel-chat-msg');
      expect(html).toContain('ax-skel-shimmer');
      const occurrences = (html.match(/ax-skel-chat-msg__avatar/g) ?? []).length;
      expect(occurrences).toBe(3);
    });

    it('feature-list → 6 items', () => {
      const html = renderSkeletonHTML('feature-list');
      expect(html).toContain('ax-skel-feat-list');
      const items = (html.match(/ax-skel-feat-list__item/g) ?? []).length;
      expect(items).toBe(6);
    });

    it('vault-cards → 6 cards', () => {
      const html = renderSkeletonHTML('vault-cards');
      expect(html).toContain('ax-skel-vault-cards');
      const cards = (html.match(/ax-skel-vault-cards__card/g) ?? []).length;
      expect(cards).toBe(6);
    });

    it('studio-grid → 8 tiles', () => {
      const html = renderSkeletonHTML('studio-grid');
      const tiles = (html.match(/ax-skel-studio-grid__tile/g) ?? []).length;
      expect(tiles).toBe(8);
    });

    it('admin-table → 8 rows', () => {
      const html = renderSkeletonHTML('admin-table');
      const rows = (html.match(/ax-skel-admin-table__row/g) ?? []).length;
      expect(rows).toBe(8);
    });

    it('all types contain data-ax-skel-marker', () => {
      const types = ['chat-message', 'feature-list', 'vault-cards', 'studio-grid', 'admin-table'] as const;
      for (const t of types) {
        expect(renderSkeletonHTML(t)).toContain('data-ax-skel-marker');
      }
    });
  });

  describe('skeleton() DOM helper', () => {
    it('injects HTML + ARIA + cleanup classes', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const dispose = skeleton(root, 'feature-list');
      expect(root.innerHTML).toContain('ax-skel-feat-list');
      expect(root.getAttribute('aria-busy')).toBe('true');
      expect(root.getAttribute('data-ax-skeleton')).toBe('feature-list');
      expect(root.classList.contains('ax-skel-host')).toBe(true);
      dispose();
      expect(root.getAttribute('aria-busy')).toBeNull();
      expect(root.classList.contains('ax-skel-host')).toBe(false);
    });

    it('idempotent style injection (single <style> across calls)', () => {
      const root1 = document.createElement('div');
      const root2 = document.createElement('div');
      document.body.append(root1, root2);
      skeleton(root1, 'chat-message');
      skeleton(root2, 'admin-table');
      const styles = document.querySelectorAll('#ax-skeleton-styles');
      expect(styles.length).toBe(1);
    });

    it('null rootEl → no-op safe', () => {
      const dispose = skeleton(null, 'chat-message');
      expect(typeof dispose).toBe('function');
      expect(() => dispose()).not.toThrow();
    });

    it('CSS contains prefers-reduced-motion media query', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      skeleton(root, 'feature-list');
      const styleEl = document.getElementById('ax-skeleton-styles');
      expect(styleEl?.textContent).toContain('prefers-reduced-motion');
    });

    it('preserves user content if injected after mount', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const dispose = skeleton(root, 'admin-table');
      root.innerHTML = '<div class="real-content">Loaded!</div>';
      dispose();
      expect(root.querySelector('.real-content')).not.toBeNull();
    });
  });
});
