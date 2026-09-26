/**
 * pptx-generator — couverture (campagne 100% réel, 2026-06-02).
 * Mock globalThis.PptxGenJS (constructeur) + loadLib (onerror-first, libLoaded false → existing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { pptxGenerator } from '../../services/skills/pptx-generator.js';

const PPTX_CDN = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
const g = globalThis as Record<string, unknown>;

function mockPptx(opts: { writeThrows?: boolean | 'string' } = {}): unknown {
  return class {
    addSlide(): Record<string, unknown> {
      return { background: {}, addText: () => {}, addNotes: () => {} };
    }
    async write(): Promise<Blob> {
      // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
      if (opts.writeThrows === 'string') throw 'str-write';
      if (opts.writeThrows) throw new Error('write fail');
      return new Blob(['x']);
    }
  };
}

const baseInput = {
  template: 'pitch' as const,
  title: 'T',
  author: 'A',
  slides: [{ title: 'S1', content: 'c', notes: 'n' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  if (!document.querySelector(`script[src="${PPTX_CDN}"]`)) {
    const s = document.createElement('script'); s.src = PPTX_CDN; document.head.appendChild(s);
  }
  g['PptxGenJS'] = mockPptx();
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete g['PptxGenJS']; });

describe('pptx-generator — generate', () => {
  /* EN PREMIER (libLoaded false) : loadLib nouveau-script + onerror (ne set pas libLoaded). */
  it('loadLib : pas de script → nouveau script onerror → null → CDN failed', async () => {
    document.querySelectorAll(`script[src="${PPTX_CDN}"]`).forEach((s) => s.remove());
    g['PptxGenJS'] = undefined;
    const promise = pptxGenerator.generate(baseInput);
    const scr = document.querySelector(`script[src="${PPTX_CDN}"]`) as HTMLScriptElement | null;
    if (scr?.onerror) scr.onerror(new Event('error'));
    const r = await promise;
    expect(r.success).toBe(false);
    expect(r.error).toContain('CDN load failed');
  });

  it('succès complet (slide avec notes, mode défaut pro) → success', async () => {
    const r = await pptxGenerator.generate(baseInput);
    expect(r.success).toBe(true);
    expect(r.slideCount).toBe(2); // 1 titre + 1 slide
    expect(r.blobUrl).toBe('blob:mock');
  });

  it('themeColor fourni → 1er opérande ??', async () => {
    const r = await pptxGenerator.generate({ ...baseInput, themeColor: '#123456' });
    expect(r.success).toBe(true);
  });

  it('mode fun → THEME_COLORS[fun]', async () => {
    const r = await pptxGenerator.generate({ ...baseInput, mode: 'fun' });
    expect(r.success).toBe(true);
  });

  it('mode invalide → ?? "#1A365D" (fallback défensif)', async () => {
    const r = await pptxGenerator.generate({ ...baseInput, mode: 'zzz' as unknown as 'pro' });
    expect(r.success).toBe(true);
  });

  it('slide sans notes → addNotes non appelé', async () => {
    const r = await pptxGenerator.generate({ ...baseInput, slides: [{ title: 'S', content: 'c' }] });
    expect(r.success).toBe(true);
  });

  it('lib absente → CDN load failed', async () => {
    g['PptxGenJS'] = undefined;
    const r = await pptxGenerator.generate(baseInput);
    expect(r.success).toBe(false);
    expect(r.error).toContain('CDN load failed');
  });

  it('write throw Error → catch', async () => {
    g['PptxGenJS'] = mockPptx({ writeThrows: true });
    const r = await pptxGenerator.generate(baseInput);
    expect(r.success).toBe(false);
    expect(r.error).toBe('write fail');
  });

  it('write throw non-Error (string) → catch String(err)', async () => {
    g['PptxGenJS'] = mockPptx({ writeThrows: 'string' });
    const r = await pptxGenerator.generate(baseInput);
    expect(r.success).toBe(false);
    expect(r.error).toBe('str-write');
  });

  it('filename fourni → utilisé', async () => {
    const r = await pptxGenerator.generate({ ...baseInput, filename: 'custom.pptx' });
    expect(r.filename).toBe('custom.pptx');
  });
});
