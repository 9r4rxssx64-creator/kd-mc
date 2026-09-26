/**
 * v13.4.211 — Tests régression audit-log-viewer.
 *
 * Vue admin créée pour combler gap audit subagent "Audit log query endpoint
 * absent". Tests vérifient :
 *  - Module exporte render() async
 *  - Render produit HTML avec sections clés (Stats, Filtres, Table)
 *  - Render avec audit-log vide ne crash pas
 *  - Render avec entries affiche bonne structure
 *  - Bouton export JSON présent
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditLog } from '../../services/observability/audit-log.js';

describe('audit-log-viewer (v13.4.211)', () => {
  let rootEl: HTMLElement;

  beforeEach(() => {
    rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    try { localStorage.removeItem('ax_audit_log_v13'); } catch { /* ignore */ }
  });

  afterEach(() => {
    rootEl.remove();
    try { localStorage.removeItem('ax_audit_log_v13'); } catch { /* ignore */ }
  });

  it('module exporte render() async', async () => {
    const mod = await import('../../features/admin/audit-log-viewer/index');
    expect(typeof mod.render).toBe('function');
    expect(mod.render).toBeInstanceOf(Function);
  });

  it('render avec audit-log vide ne crash pas + affiche sections clés', async () => {
    const mod = await import('../../features/admin/audit-log-viewer/index');
    await mod.render(rootEl);
    const html = rootEl.innerHTML;
    expect(html).toContain('Audit Log Viewer');
    expect(html).toContain('Stats');
    expect(html).toContain('Filtres');
    expect(html).toContain('Export JSON');
  });

  it('render avec entries affiche stats + ligne tableau', async () => {
    auditLog.init();
    await auditLog.record('test_action', { actor: 'kevin', target: 'config.json', details: { value: 42 } });
    await auditLog.record('test_action_2', { actor: 'kevin', target: 'vault.key', details: { changed: true } });

    const mod = await import('../../features/admin/audit-log-viewer/index');
    await mod.render(rootEl);
    const html = rootEl.innerHTML;
    expect(html).toContain('test_action');
    expect(html).toContain('kevin');
    /* Filtré et affichage : 2 entries totales doivent être visibles */
    expect(html).toMatch(/2.*entries/);
  });

  it('bouton export JSON présent et cliquable', async () => {
    const mod = await import('../../features/admin/audit-log-viewer/index');
    await mod.render(rootEl);
    const exportBtn = rootEl.querySelector('#audit-export-json');
    expect(exportBtn).not.toBeNull();
    expect(exportBtn?.tagName).toBe('BUTTON');
  });

  it('filtres inputs présents (action, actor, search)', async () => {
    const mod = await import('../../features/admin/audit-log-viewer/index');
    await mod.render(rootEl);
    expect(rootEl.querySelector('#audit-filter-action')).not.toBeNull();
    expect(rootEl.querySelector('#audit-filter-actor')).not.toBeNull();
    expect(rootEl.querySelector('#audit-filter-search')).not.toBeNull();
    expect(rootEl.querySelector('#audit-filter-reset')).not.toBeNull();
  });
});
