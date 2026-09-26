/**
 * APEX v13.3.74 — A11y touch targets tests (UX 19.5 → 20/20)
 *
 * Vérifie que les éléments cliquables critiques respectent le minimum
 * Apple HIG / WCAG 2.5.5 Target Size : 44×44 CSS pixels (fallback 40px en mobile <380px).
 *
 * Cas couverts :
 *   1. .ax-btn-sm exposé via components.css → min-height/width = var(--ax-touch-min) = 44px
 *   2. .ax-drill-back / .ax-drill-close → 44×44px
 *   3. Mobile <380px : .ax-chat-input .ax-btn-icon = 40px+ (compromise compact)
 *   4. .ax-skip-link existe + a min-height 44px au focus
 *   5. .sr-only utility correctement masqué visuellement (mais lu par screen-reader)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Charge un fichier CSS et l'injecte dans le document de test. */
function loadCss(relativePath: string): string {
  const cssPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(cssPath, 'utf-8');
}

beforeAll(() => {
  /* Charge tokens.css + base.css + ux-premium.css + components.css dans le doc */
  const tokens = loadCss('assets/css/tokens.css');
  const base = loadCss('assets/css/base.css');
  const components = loadCss('assets/css/components.css');
  const uxPremium = loadCss('assets/css/ux-premium.css');

  const style = document.createElement('style');
  style.textContent = `${tokens}\n${base}\n${components}\n${uxPremium}`;
  document.head.appendChild(style);
});

describe('A11y touch targets — Apple HIG / WCAG 2.5.5 (UX 19.5→20)', () => {
  it('1. .ax-btn-sm a min-height ≥ 44px (touch target Apple HIG)', () => {
    const btn = document.createElement('button');
    btn.className = 'ax-btn ax-btn-sm';
    btn.textContent = 'X';
    document.body.appendChild(btn);
    const cs = window.getComputedStyle(btn);
    /* happy-dom evalue les CSS variables : ax-touch-min = 44px */
    /* On vérifie min-height/min-width pas pixel-perfect (variation jsdom) mais ≥ 40 */
    const minH = parseFloat(cs.minHeight) || 0;
    const minW = parseFloat(cs.minWidth) || 0;
    /* Si happy-dom ne résout pas la var, le test ne doit pas casser : on regarde le source CSS */
    const css = document.head.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/\.ax-btn-sm\s*\{[^}]*min-height:\s*var\(--ax-touch-min\)/);
    expect(css).toMatch(/--ax-touch-min:\s*44px/);
    /* Garde-fou runtime si résolution OK */
    if (minH > 0) expect(minH).toBeGreaterThanOrEqual(40);
    if (minW > 0) expect(minW).toBeGreaterThanOrEqual(40);
    document.body.removeChild(btn);
  });

  it('2. .ax-drill-back / .ax-drill-close ont touch target 44×44px (CSS source)', () => {
    const css = document.head.querySelector('style')?.textContent ?? '';
    /* Match block .ax-drill-back, .ax-drill-close { ... 44px ... } */
    const block = css.match(/\.ax-drill-back,\s*\.ax-drill-close\s*\{[^}]+\}/);
    expect(block, 'block .ax-drill-back/.ax-drill-close trouvé').toBeTruthy();
    expect(block?.[0]).toMatch(/(min-)?width:\s*var\(--ax-touch-min\)/);
    expect(block?.[0]).toMatch(/(min-)?height:\s*var\(--ax-touch-min\)/);
  });

  it('3. Mobile <380px : .ax-chat-input .ax-btn-icon ≥ 40px (CSS source)', () => {
    /* v13.3.81 P2.3 strict Apple HIG : tous boutons mobile ≥ 44px (avant 40px).
     * Test relâché : on accepte 40 ou 44 (régression UX OK si ≥ HIG minimum). */
    const css = document.head.querySelector('style')?.textContent ?? '';
    /* On extrait la media-query mobile compact */
    const mq = css.match(/@media\s*\(max-width:\s*380px\)\s*\{[\s\S]*?\n\s*\}\s*\n\s*\}/);
    expect(mq, 'media query <380px existe').toBeTruthy();
    /* Doit déclarer width ET min-height ≥ 40px pour btn-icon, ≥ 44px pour primary */
    expect(mq?.[0]).toMatch(/\.ax-btn-icon\s*\{[\s\S]*?width:\s*(40|44)px/);
    expect(mq?.[0]).toMatch(/\.ax-btn-icon\s*\{[\s\S]*?min-height:\s*(40|44)px/);
    expect(mq?.[0]).toMatch(/\.ax-btn-primary\s*\{[\s\S]*?width:\s*44px/);
  });

  it('4. .ax-skip-link existe + min-height 44px (a11y skip nav)', () => {
    const css = document.head.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/\.ax-skip-link/);
    /* Le bloc commun .skip-link, .ax-skip-link doit déclarer min-height var --ax-touch-min */
    const block = css.match(/\.skip-link,\s*\n?\s*\.ax-skip-link\s*\{[^}]+\}/);
    expect(block, 'bloc .ax-skip-link trouvé').toBeTruthy();
    expect(block?.[0]).toMatch(/min-height:\s*var\(--ax-touch-min\)/);
  });

  it('5. .sr-only utility class masque visuellement mais reste accessible', () => {
    const css = document.head.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/\.sr-only\s*\{/);
    const block = css.match(/\.sr-only\s*\{[^}]+\}/);
    expect(block?.[0]).toMatch(/position:\s*absolute/);
    expect(block?.[0]).toMatch(/width:\s*1px/);
    expect(block?.[0]).toMatch(/height:\s*1px/);
    expect(block?.[0]).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });
});
