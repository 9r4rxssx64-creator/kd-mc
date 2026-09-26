/**
 * Tests features/sentinels/index.ts (UI feature).
 * Vérifie render shape, présence métriques, list count, buttons wires.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { render } from '../../features/sentinels/index.js';
import { bootstrapSentinelsRegistry, sentinelsRegistry } from '../../services/sentinels/sentinels-registry.js';

describe('features/sentinels — UI render', () => {
  let root: HTMLDivElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    localStorage.clear();
    sentinelsRegistry.resetMetrics();
    bootstrapSentinelsRegistry();
  });

  it('render insère un titre Sentinelles 24/7', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/Sentinelles 24\/7/);
  });

  it('render affiche le nombre de watchers', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/\d+ watchers/);
  });

  it('render contient le bouton "Run all"', async () => {
    await render(root);
    expect(root.querySelector('#ax-sent-run-all')).not.toBeNull();
  });

  it('render contient le bouton "Rafraîchir"', async () => {
    await render(root);
    expect(root.querySelector('#ax-sent-refresh')).not.toBeNull();
  });

  it('render affiche métriques perf (totalRuns, avg, auto-fix)', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/Métriques/);
    expect(root.innerHTML).toMatch(/runs/);
    expect(root.innerHTML).toMatch(/avg/);
    expect(root.innerHTML).toMatch(/auto-fix/);
  });

  it('render contient un row par sentinelle', async () => {
    await render(root);
    const buttons = root.querySelectorAll('.ax-sent-run');
    expect(buttons.length).toBeGreaterThanOrEqual(15);
  });

  it('render affiche compteurs OK/WARN/PENDING', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/OK/);
    expect(root.innerHTML).toMatch(/PENDING|WARN/);
  });

  it('chaque button run a un data-sent-id', async () => {
    await render(root);
    const buttons = root.querySelectorAll<HTMLButtonElement>('.ax-sent-run');
    for (const btn of Array.from(buttons)) {
      expect(btn.dataset['sentId']).toBeTruthy();
    }
  });

  it('escape XSS : noms sentinelles encodés', async () => {
    /* Ajout d'une sentinelle avec caractères spéciaux pour vérifier escape */
    const { sentinels } = await import('../../services/sentinels/sentinels.js');
    sentinels.register({
      id: 'xss-test-sentinel',
      name: '<script>alert(1)</script>',
      desc: 'Test XSS',
      intervalMs: 60000,
      check: async () => ({ ok: true, msg: 'OK' }),
    });
    await render(root);
    expect(root.innerHTML).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(root.innerHTML).toMatch(/&lt;script&gt;/);
  });

  it('list inclut capabilities-watch après bootstrap', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/capabilities-watch|Capabilities watch/);
  });

  it('list inclut sentinel-meta après bootstrap', async () => {
    await render(root);
    expect(root.innerHTML).toMatch(/Sentinel meta|sentinel-meta/);
  });
});
