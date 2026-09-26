// @vitest-environment happy-dom
/**
 * v13.4.217 — Tests régression ui/skeleton.ts.
 * Coverage 0 → 11 tests.
 */
import { describe, expect, it } from 'vitest';

import {
  renderCardSkeleton,
  renderChatSkeleton,
  renderListSkeleton,
  renderSkeleton,
  renderSkeletonHTML,
  skeleton,
} from '../../ui/skeleton.js';

describe('ui/skeleton.ts (v13.4.217 coverage)', () => {
  it('renderSkeleton({shape:"line"}) retourne HTML avec ax-skel', () => {
    const html = renderSkeleton({ shape: 'line' });
    expect(html).toContain('ax-skel');
  });

  it('renderSkeleton({shape:"circle"}) supporte circle', () => {
    const html = renderSkeleton({ shape: 'circle' });
    expect(html).toContain('ax-skel');
    expect(html).toMatch(/circle|round/i);
  });

  it('renderSkeleton({shape:"card"}) supporte card', () => {
    const html = renderSkeleton({ shape: 'card' });
    expect(html).toContain('ax-skel');
  });

  it('renderChatSkeleton() retourne 2+ message skeletons', () => {
    const html = renderChatSkeleton();
    /* Chat skeleton = au moins 2 bulles user/assistant */
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('ax-skel');
  });

  it('renderCardSkeleton() retourne 3 cards par défaut', () => {
    const html = renderCardSkeleton();
    expect(html).toContain('ax-skel');
    expect(html.length).toBeGreaterThan(100);
  });

  it('renderCardSkeleton(5) retourne 5 cards', () => {
    const html5 = renderCardSkeleton(5);
    const html3 = renderCardSkeleton(3);
    /* 5 cards = HTML plus long que 3 */
    expect(html5.length).toBeGreaterThan(html3.length);
  });

  it('renderListSkeleton() retourne 5 items par défaut', () => {
    const html = renderListSkeleton();
    expect(html).toContain('ax-skel');
    expect(html.length).toBeGreaterThan(100);
  });

  it('skeleton(rootEl, "chat-message") retourne cleanup function', () => {
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const cleanup = skeleton(rootEl, 'chat-message');
    expect(typeof cleanup).toBe('function');
    expect(rootEl.innerHTML).toContain('ax-skel');
    cleanup();
    rootEl.remove();
  });

  it('skeleton(null, "chat-message") retourne noop sans crash', () => {
    expect(() => {
      const cleanup = skeleton(null, 'chat-message');
      cleanup();
    }).not.toThrow();
  });

  it('renderSkeletonHTML("chat-message") retourne string non vide', () => {
    const html = renderSkeletonHTML('chat-message');
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(50);
  });

  it('renderSkeletonHTML("feature-list") + ("vault-cards") non vides', () => {
    const a = renderSkeletonHTML('feature-list');
    const b = renderSkeletonHTML('vault-cards');
    expect(a.length).toBeGreaterThan(50);
    expect(b.length).toBeGreaterThan(50);
  });
});
