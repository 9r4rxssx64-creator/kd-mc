/**
 * Tests features/admin/financial-bilan.ts (UX 20/20 hyper-perfectionniste).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '../../features/admin/financial-bilan.js';

describe('Vue Bilan Financier (features admin)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
    localStorage.clear();
  });

  it('render injecte hero "Bilan Apex Live"', () => {
    render(root);
    expect(root.innerHTML).toContain('Bilan Apex Live');
    expect(root.innerHTML).toContain('💰');
  });

  it('render inclut burn rate card 🔥', () => {
    render(root);
    expect(root.innerHTML).toContain('Burn rate live');
    expect(root.innerHTML).toContain('🔥');
    expect(root.innerHTML).toContain('ax-fin-burn');
  });

  it('render inclut KPIs (today, month, projection, savings)', () => {
    render(root);
    expect(root.innerHTML).toContain("Aujourd'hui");
    expect(root.innerHTML).toContain('Ce mois');
    expect(root.innerHTML).toContain('Projection');
    expect(root.innerHTML).toContain('Économisé');
  });

  it('render inclut sparkline + heatmap graphs', () => {
    render(root);
    expect(root.innerHTML).toContain('Tendance 30 jours');
    expect(root.innerHTML).toContain('Heatmap 24h');
    expect(root.innerHTML).toContain('ax-heatmap-24h');
  });

  it('render inclut ROI block', () => {
    render(root);
    expect(root.innerHTML).toContain('ROI commercialisation Apex');
    expect(root.innerHTML).toContain('Users payants');
    expect(root.innerHTML).toContain('Break-even');
    expect(root.innerHTML).toContain('Marge');
  });

  it('render inclut Comparison vs Concurrence table', () => {
    render(root);
    expect(root.innerHTML).toContain('vs Concurrence');
    expect(root.innerHTML).toContain('ChatGPT');
    expect(root.innerHTML).toContain('Cursor');
  });

  it('render inclut footer health emoji + updated', () => {
    render(root);
    expect(root.innerHTML).toContain('Mis à jour');
    /* health emoji ✅ ou ⚠️ ou 🚨 */
    const hasHealthIcon = ['✅', '⚠️', '🚨'].some((e) => root.innerHTML.includes(e));
    expect(hasHealthIcon).toBe(true);
  });

  it('render heatmap 24 cells', () => {
    render(root);
    const cells = root.querySelectorAll('.ax-heat-cell');
    expect(cells.length).toBe(24);
  });

  it('render inclut categories services', () => {
    render(root);
    /* Au moins une category section présente */
    const categoryEmojis = ['🧠', '💼', '✉️', '☁️', '💳'];
    const hasCategoryEmoji = categoryEmojis.some((e) => root.innerHTML.includes(e));
    expect(hasCategoryEmoji).toBe(true);
  });
});
