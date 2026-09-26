/**
 * v13.4.216 — Tests régression ui/loading.ts.
 *
 * Coverage 0 → 11 tests. Garantit que les fonctions de loading rendues
 * dans le chat (Apex thinking, shimmer, spinner) restent valides après
 * refactor markdown.ts v13.4.207/213.
 */
import { describe, expect, it } from 'vitest';

import {
  cardShimmer,
  inlineLoading,
  listShimmer,
  loading,
  shimmerLine,
  spinner,
  thinking,
} from '../../ui/loading.js';

describe('ui/loading.ts (v13.4.216 coverage)', () => {
  it('spinner() retourne HTML avec class', () => {
    const html = spinner();
    expect(html).toContain('class');
    expect(html.length).toBeGreaterThan(20);
  });

  it('spinner({size:"lg"}) accepte taille', () => {
    const html = spinner({ size: 'lg' });
    expect(html).toBeDefined();
    expect(typeof html).toBe('string');
  });

  it('thinking() default label "Apex"', () => {
    const html = thinking();
    expect(html).toContain('Apex');
  });

  it('thinking("Loading...") custom label', () => {
    const html = thinking('Loading...');
    expect(html).toContain('Loading...');
  });

  it('shimmerLine() default 100% width / 14px height', () => {
    const html = shimmerLine();
    expect(html).toContain('width:100%');
    expect(html).toContain('height:14px');
    expect(html).toContain('ax-shimmer');
  });

  it('shimmerLine() escape attr values (XSS protection)', () => {
    const html = shimmerLine('100%" onload="alert(1)', '14px');
    expect(html).not.toContain('onload="alert');
  });

  it('cardShimmer() contient aria-busy + 3+ shimmerLine', () => {
    const html = cardShimmer();
    expect(html).toContain('aria-busy="true"');
    expect((html.match(/ax-shimmer/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('listShimmer(3) génère 3 items avatar round', () => {
    const html = listShimmer(3);
    expect((html.match(/border-radius:50%/g) ?? []).length).toBe(3);
  });

  it('listShimmer(100) cap à 50 maximum', () => {
    const html = listShimmer(100);
    expect((html.match(/border-radius:50%/g) ?? []).length).toBe(50);
  });

  it('listShimmer(0) cap à 1 minimum', () => {
    const html = listShimmer(0);
    expect((html.match(/border-radius:50%/g) ?? []).length).toBe(1);
  });

  it('loading default export contient spinner/thinking/shimmerLine', () => {
    expect(loading).toBeDefined();
    expect(typeof loading.spinner).toBe('function');
    expect(typeof loading.thinking).toBe('function');
    expect(typeof loading.shimmerLine).toBe('function');
  });

  it('inlineLoading() ne crash pas avec HTMLElement', () => {
    const el = document.createElement('div');
    expect(() => inlineLoading(el, 'spinner')).not.toThrow();
    expect(() => inlineLoading(el, 'thinking')).not.toThrow();
    expect(() => inlineLoading(el, 'shimmer')).not.toThrow();
  });
});
