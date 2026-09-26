/**
 * pdf-generator — branches restantes (campagne 100% réel, 2026-06-03).
 * Cibles : libsLoaded déjà true (2e appel), splitTextToSize absent ([body]),
 * String(err) non-Error, et les `?? défaut` des items (description/quantity/unit_price).
 * vi.resetModules() avant chaque test pour réinitialiser le singleton module `libsLoaded`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN =
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';
const g = globalThis as Record<string, unknown>;

/* Injecte <script src=URL> sans déclencher de load réseau (querySelector match → resolve direct). */
function injectScriptStub(url: string): void {
  if (document.querySelector(`script[src="${url}"]`)) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<script src="${url}"></script>`;
  const node = wrap.firstChild;
  if (node) document.head.appendChild(node);
}

/* Stub jsPDF ; opts.noSplit → pas de splitTextToSize (branche [body]). */
function makeJsPDFStub(opts: { noSplit?: boolean } = {}): Record<string, unknown> {
  const docInstance: Record<string, unknown> = {
    setFontSize: () => {},
    setFont: () => {},
    setTextColor: () => {},
    text: () => {},
    addImage: () => {},
    autoTable: () => { docInstance['lastAutoTable'] = { finalY: 100 }; },
    output: () => new Blob(['PDF'], { type: 'application/pdf' }),
    internal: { getNumberOfPages: () => 1 },
  };
  if (!opts.noSplit) docInstance['splitTextToSize'] = (t: string) => String(t).split('\n');
  const ctor = function (this: unknown) { return docInstance; } as unknown as new () => unknown;
  return { jsPDF: ctor };
}

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  delete g['jspdf'];
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  }
});
afterEach(() => { document.head.innerHTML = ''; delete g['jspdf']; });

describe('pdf-generator — branches', () => {
  it('2e appel → libsLoaded déjà true (early return)', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(AUTOTABLE_CDN);
    g['jspdf'] = makeJsPDFStub();
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r1 = await pdfGenerator.generate({ template: 'custom', data: { body: 'x' } });
    expect(r1.success).toBe(true); // 1er appel : libsLoaded false → load
    const r2 = await pdfGenerator.generate({ template: 'custom', data: { body: 'y' } });
    expect(r2.success).toBe(true); // 2e appel : libsLoaded true → branche early-return
  });

  it('invoice items sans champs → `?? défaut` (description/quantity/unit_price)', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(AUTOTABLE_CDN);
    g['jspdf'] = makeJsPDFStub();
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'invoice',
      data: { items: [{}, {}] }, // tous champs undefined → ?? '' / ?? 0 (body + reduce)
    });
    expect(r.success).toBe(true);
  });

  it('template non-invoice sans splitTextToSize → branche [body]', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(AUTOTABLE_CDN);
    g['jspdf'] = makeJsPDFStub({ noSplit: true });
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({ template: 'report-standard', data: { body: 'contenu' } });
    expect(r.success).toBe(true);
  });

  it('ctor jsPDF throw non-Error (string) → catch String(err)', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(AUTOTABLE_CDN);
    g['jspdf'] = {
      // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
      jsPDF: function () { throw 'boom-pdf'; } as unknown as new () => unknown,
    };
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({ template: 'custom', data: {} });
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom-pdf');
  });
});
