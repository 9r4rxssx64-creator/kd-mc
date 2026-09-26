/**
 * xlsx-generator — couverture (campagne 100% réel, 2026-06-02). Aucun test dédié avant.
 * Mock globalThis.XLSX + script CDN déjà présent (loadLib branche `existing` → pas de hang réseau).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { xlsxGenerator } from '../../services/skills/xlsx-generator.js';

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/dist/xlsx.full.min.js';
const g = globalThis as Record<string, unknown>;

function mockXLSX(opts: { writeThrows?: boolean } = {}): Record<string, unknown> {
  return {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (data: unknown[][]) => {
        const ws: Record<string, unknown> = {};
        for (let r = 1; r <= data.length; r++) ws[`A${r}`] = { v: 'x' };
        return ws;
      },
      book_append_sheet: () => {},
    },
    write: () => { if (opts.writeThrows) throw new Error('write fail'); return new ArrayBuffer(32); },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  /* script CDN présent → loadLib prend la branche `existing` (résolution immédiate) */
  if (!document.querySelector(`script[src="${XLSX_CDN}"]`)) {
    const s = document.createElement('script'); s.src = XLSX_CDN; document.head.appendChild(s);
  }
  g['XLSX'] = mockXLSX();
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete g['XLSX']; });

const baseInput = {
  filename: 'test.xlsx',
  sheets: [{ name: 'S1', data: [['H'], ['a'], ['b']], formats: { A: 'currency_eur' as const }, freezeHeader: true, columnWidths: [20] }],
};

describe('xlsx-generator — generate', () => {
  /* EN PREMIER (libLoaded encore false) : chemin loadLib nouveau-script + onerror.
     onerror NE met PAS libLoaded → les tests suivants couvrent encore la branche `existing`. */
  it('loadLib : pas de script existant → nouveau script, onerror → null → CDN failed', async () => {
    document.querySelectorAll(`script[src="${XLSX_CDN}"]`).forEach((s) => s.remove());
    g['XLSX'] = undefined;
    const promise = xlsxGenerator.generate(baseInput);
    const scr = document.querySelector(`script[src="${XLSX_CDN}"]`) as HTMLScriptElement | null;
    if (scr?.onerror) scr.onerror(new Event('error'));
    const r = await promise;
    expect(r.success).toBe(false);
    expect(r.error).toContain('CDN load failed');
  });

  it('succès complet (formats + widths + freeze) → success true', async () => {
    const r = await xlsxGenerator.generate(baseInput);
    expect(r.success).toBe(true);
    expect(r.sheetCount).toBe(1);
    expect(r.blobUrl).toBe('blob:mock');
  });

  it('format inconnu → continue (skip), cellule absente → ignorée', async () => {
    const r = await xlsxGenerator.generate({
      filename: 'f.xlsx',
      sheets: [{ name: 'S', data: [['H'], ['a']], formats: { A: 'unknown_fmt' as unknown as 'percent', Z: 'percent' } }],
    });
    expect(r.success).toBe(true);
  });

  it('sheet sans options (formats/widths/freeze) → success', async () => {
    const r = await xlsxGenerator.generate({ filename: 'p.xlsx', sheets: [{ name: 'P', data: [['x']] }] });
    expect(r.success).toBe(true);
  });

  it('XLSX lib absente (globalThis.XLSX undefined) → CDN load failed', async () => {
    g['XLSX'] = undefined;
    const r = await xlsxGenerator.generate(baseInput);
    expect(r.success).toBe(false);
    expect(r.error).toContain('CDN load failed');
  });

  it('write throw → catch → error', async () => {
    g['XLSX'] = mockXLSX({ writeThrows: true });
    const r = await xlsxGenerator.generate(baseInput);
    expect(r.success).toBe(false);
    expect(r.error).toContain('write fail');
  });

  it('write throw non-Error (string) → catch String(err)', async () => {
    g['XLSX'] = {
      utils: { book_new: () => ({}), aoa_to_sheet: () => ({}), book_append_sheet: () => {} },
      // eslint-disable-next-line no-throw-literal -- test intentionnel : throw non-Error pour couvrir String(err)
      write: () => { throw 'str-fail'; },
    };
    const r = await xlsxGenerator.generate({ filename: 'f.xlsx', sheets: [{ name: 'S', data: [['x']] }] });
    expect(r.success).toBe(false);
    expect(r.error).toBe('str-fail');
  });
});
