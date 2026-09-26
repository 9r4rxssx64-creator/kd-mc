/**
 * APEX v13 — Tests deep skills generators (pdf, docx, xlsx, video-use).
 *
 * Cible : pousser coverage à 95%+ lines/branches sur :
 *  - services/skills/pdf-generator.ts (templates invoice/quote/report/custom + watermark/footer/logo + erreurs)
 *  - services/skills/docx-generator.ts (6 templates + custom + JSZip succès + erreurs)
 *  - services/skills/xlsx-generator.ts (formats, cols, freeze + erreurs)
 *  - services/skills/video-use.ts (composeHyperframes + branches edit erreurs)
 *
 * Méthode : pré-injecter <script src="CDN"> dans le DOM (loaders détectent
 * existence et résolvent instantanément avec globalThis.XXX stubs), puis
 * stubber les libs (jsPDF, JSZip, XLSX) avec API minimum.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn(async () => undefined) },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/* CDN URLs utilisés par les générateurs (gardons-les en sync avec source). */
const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const JSPDF_AUTOTABLE_CDN =
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/dist/xlsx.full.min.js';

/* Helper : injecte <script src=URL> via innerHTML pour court-circuiter
 * la branche document.createElement du loader (querySelector match → resolve direct).
 * On utilise innerHTML car happy-dom n'auto-loade pas les scripts insérés via innerHTML
 * (= pas de DOMException stderr). */
function injectScriptStub(url: string): void {
  const existing = document.querySelector(`script[src="${url}"]`);
  if (existing) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<script src="${url}"></script>`;
  /* Attache directement le script-node sans déclencher load. */
  const node = wrap.firstChild;
  if (node) document.head.appendChild(node);
}

/* Stub jsPDF minimal — capture les appels pour vérifier templates. */
function makeJsPDFStub(): {
  jspdfNs: Record<string, unknown>;
  capture: { calls: Array<[string, unknown[]]>; lastBlob?: Blob };
} {
  const calls: Array<[string, unknown[]]> = [];
  const docInstance: Record<string, unknown> = {
    setFontSize: (...a: unknown[]) => calls.push(['setFontSize', a]),
    setFont: (...a: unknown[]) => calls.push(['setFont', a]),
    setTextColor: (...a: unknown[]) => calls.push(['setTextColor', a]),
    text: (...a: unknown[]) => calls.push(['text', a]),
    addImage: (...a: unknown[]) => calls.push(['addImage', a]),
    splitTextToSize: (text: string) => String(text).split('\n'),
    autoTable: (...a: unknown[]) => {
      calls.push(['autoTable', a]);
      docInstance['lastAutoTable'] = { finalY: 100 };
    },
    output: (kind: string) => {
      const b = new Blob(['PDF-FAKE'], { type: 'application/pdf' });
      capture.lastBlob = b;
      return kind === 'blob' ? b : '';
    },
    internal: { getNumberOfPages: () => 2 },
  };
  const ctor = function (this: unknown) {
    return docInstance;
  } as unknown as new () => unknown;
  const capture = { calls, lastBlob: undefined as Blob | undefined };
  return { jspdfNs: { jsPDF: ctor }, capture };
}

/* Stub JSZip minimal renvoyant Blob via generateAsync. */
function makeJSZipStub(): { ctor: new () => Record<string, unknown>; files: Map<string, string> } {
  const files = new Map<string, string>();
  function makeFolder(prefix: string): Record<string, unknown> {
    return {
      file: (name: string, data: string) => {
        files.set(`${prefix}${name}`, data);
      },
      folder: (sub: string) => makeFolder(`${prefix}${sub}/`),
    };
  }
  const ctor = function (this: Record<string, unknown>) {
    this['file'] = (name: string, data: string) => {
      files.set(name, data);
    };
    this['folder'] = (sub: string) => makeFolder(`${sub}/`);
    this['generateAsync'] = async () =>
      new Blob([JSON.stringify(Array.from(files.entries()))], { type: 'application/zip' });
  } as unknown as new () => Record<string, unknown>;
  return { ctor, files };
}

/* Stub XLSX minimal — captures sheets + écrit ArrayBuffer. */
function makeXLSXStub(): {
  ns: Record<string, unknown>;
  capture: { sheets: Array<{ name: string; ws: Record<string, unknown> }> };
} {
  const sheets: Array<{ name: string; ws: Record<string, unknown> }> = [];
  const ns = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (data: unknown[][]) => {
        const ws: Record<string, unknown> = {};
        /* Crée des cellules simples pour permettre format-cell test */
        if (Array.isArray(data) && data.length >= 2) {
          ws['A2'] = { v: data[1]?.[0] ?? null };
          ws['B2'] = { v: data[1]?.[1] ?? null };
        }
        return ws;
      },
      book_append_sheet: (_wb: unknown, ws: Record<string, unknown>, name: string) => {
        sheets.push({ name, ws });
      },
    },
    write: (_wb: unknown, _opts: Record<string, unknown>) => new ArrayBuffer(8),
  };
  return { ns, capture: { sheets } };
}

/* Reset module cache + globals + DOM avant chaque test. */
beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const g = globalThis as Record<string, unknown>;
  delete g['jspdf'];
  delete g['JSZip'];
  delete g['XLSX'];
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

/* ─────────────────────────────────────────────────────── */
describe('pdf-generator — succès templates', () => {
  it('template invoice : génère avec items + TVA, watermark, footer, logo', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs, capture } = makeJsPDFStub();
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;

    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'invoice',
      data: {
        number: 'F-2026-001',
        client_name: 'Acme',
        client_address: '12 rue Test, 98000 Monaco',
        items: [
          { description: 'Service A', quantity: 2, unit_price: 500 },
          { description: 'Service B', quantity: 1, unit_price: 100 },
        ],
        tva_rate: 0.2,
      },
      options: {
        watermark: 'CONFIDENTIEL',
        footerText: 'Footer test',
        logoBase64: 'data:image/png;base64,xxx',
      },
    });
    expect(r.success).toBe(true);
    expect(r.filename).toMatch(/invoice_/);
    expect(r.pageCount).toBe(2);
    expect(r.sizeBytes).toBeGreaterThan(0);
    /* Vérifier que autoTable / setFont bold / addImage / watermark setTextColor appelés */
    const types = capture.calls.map((c) => c[0]);
    expect(types).toContain('addImage');
    expect(types).toContain('autoTable');
    expect(types).toContain('setFont'); /* total TTC bold */
  });

  it('template invoice sans items : skip autoTable mais reste OK', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs, capture } = makeJsPDFStub();
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'quote',
      data: { number: 'D-001', client_name: 'X' },
    });
    expect(r.success).toBe(true);
    /* Pas autoTable car items vide */
    expect(capture.calls.find((c) => c[0] === 'autoTable')).toBeFalsy();
  });

  it('template custom : utilise data.title + body string', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs } = makeJsPDFStub();
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'custom',
      data: { title: 'Mon Doc', body: 'Ligne1\nLigne2' },
      filename: 'custom.pdf',
    });
    expect(r.success).toBe(true);
    expect(r.filename).toBe('custom.pdf');
  });

  it('template report-standard sans body : sérialise data en JSON', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs } = makeJsPDFStub();
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'report-standard',
      data: { foo: 'bar', n: 42 },
    });
    expect(r.success).toBe(true);
  });

  it('template certificate sans options : pas de watermark/footer', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs, capture } = makeJsPDFStub();
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'certificate',
      data: { body: 'Certificat de conformité' },
    });
    expect(r.success).toBe(true);
    /* Pas setTextColor (200,200,200) car pas de watermark */
    expect(capture.calls.find((c) => c[0] === 'setTextColor')).toBeFalsy();
  });

  it('template invoice fallback pageCount=1 si internal manquant', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs } = makeJsPDFStub();
    /* Re-build avec internal sans getNumberOfPages */
    const ctor = function () {
      return {
        setFontSize: () => {},
        text: () => {},
        setFont: () => {},
        setTextColor: () => {},
        splitTextToSize: (t: string) => [t],
        output: () => new Blob(['x']),
        internal: {},
      };
    };
    (jspdfNs as Record<string, unknown>)['jsPDF'] = ctor;
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'receipt',
      data: { body: 'Reçu' },
    });
    expect(r.success).toBe(true);
    expect(r.pageCount).toBe(1);
  });

  it('addImage qui throw : silencieusement ignoré (try/catch)', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    const { jspdfNs } = makeJsPDFStub();
    /* Override addImage pour throw */
    (jspdfNs as Record<string, unknown>)['jsPDF'] = function () {
      return {
        setFontSize: () => {},
        text: () => {},
        addImage: () => {
          throw new Error('image fail');
        },
        splitTextToSize: (t: string) => [t],
        output: () => new Blob(['x']),
        internal: { getNumberOfPages: () => 1 },
      };
    };
    (globalThis as Record<string, unknown>)['jspdf'] = jspdfNs;
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({
      template: 'custom',
      data: { body: 'x' },
      options: { logoBase64: 'data:image/png;base64,xxx' },
    });
    /* Reste OK malgré logo error */
    expect(r.success).toBe(true);
  });
});

describe('pdf-generator — branches erreurs', () => {
  it('lib jspdf absente du global : retourne success=false', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    /* Pas de globalThis.jspdf set */
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({ template: 'invoice', data: {} });
    expect(r.success).toBe(false);
    expect(r.error).toContain('jsPDF');
  });

  it('jsPDF ctor throw → catch global, success=false', async () => {
    injectScriptStub(JSPDF_CDN);
    injectScriptStub(JSPDF_AUTOTABLE_CDN);
    (globalThis as Record<string, unknown>)['jspdf'] = {
      jsPDF: function () {
        throw new Error('ctor boom');
      },
    };
    const { pdfGenerator } = await import('../../services/skills/pdf-generator.js');
    const r = await pdfGenerator.generate({ template: 'invoice', data: {} });
    expect(r.success).toBe(false);
    expect(r.error).toContain('ctor boom');
  });
});

/* ─────────────────────────────────────────────────────── */
describe('docx-generator — succès templates', () => {
  function setupSuccess(): void {
    injectScriptStub(JSZIP_CDN);
    const { ctor } = makeJSZipStub();
    (globalThis as Record<string, unknown>)['JSZip'] = ctor;
  }

  it('letter-formal génère docx avec sender/recipient/subject', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'letter-formal',
      data: {
        sender_name: 'Kevin DESARZENS',
        sender_address: 'Monaco',
        recipient_name: 'M. Dupont',
        recipient_address: 'Paris',
        subject: 'Demande',
        body: 'Bonjour\n\nVoilà.',
      },
    });
    expect(r.success).toBe(true);
    expect(r.filename).toMatch(/letter-formal_\d{4}-\d{2}-\d{2}\.docx$/);
    expect(r.templateUsed).toBe('letter-formal');
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it('contract-cdi : remplit toutes variables', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'contract-cdi',
      data: {
        employer_name: 'SBM',
        employer_address: 'Monaco',
        employee_name: 'Test',
        employee_address: 'Nice',
        job_title: 'Croupier',
        start_date: '2026-06-01',
        salary: 3000,
        hours_per_week: 39,
      },
    });
    expect(r.success).toBe(true);
    expect(r.templateUsed).toBe('contract-cdi');
  });

  it('contract-nda + cv-modern + meeting-minutes + report-monthly réussissent', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    for (const tpl of [
      'contract-nda',
      'cv-modern',
      'meeting-minutes',
      'report-monthly',
    ] as const) {
      const r = await docxGenerator.generate({ template: tpl, data: { foo: 'bar' } });
      expect(r.success).toBe(true);
      expect(r.templateUsed).toBe(tpl);
    }
  });

  it('custom avec customHtml : utilise le html fourni', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'custom',
      data: {},
      customHtml: 'Texte libre\nLigne 2',
    });
    expect(r.success).toBe(true);
  });

  it('custom sans customHtml : fallback sur data.custom_text', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'custom',
      data: { custom_text: 'Contenu de secours' },
    });
    expect(r.success).toBe(true);
  });

  it('filename custom préservé', async () => {
    setupSuccess();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'report-monthly',
      data: { period: 'Mai 2026' },
      filename: 'rapport.docx',
    });
    expect(r.success).toBe(true);
    expect(r.filename).toBe('rapport.docx');
  });

  it('listTemplates retourne 7 templates', async () => {
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const list = docxGenerator.listTemplates();
    expect(list).toHaveLength(7);
    expect(list).toContain('letter-formal');
    expect(list).toContain('custom');
  });
});

describe('docx-generator — branches erreurs', () => {
  it('JSZip non chargé : success=false avec error CDN', async () => {
    injectScriptStub(JSZIP_CDN);
    /* Pas de globalThis.JSZip */
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({ template: 'letter-formal', data: {} });
    expect(r.success).toBe(false);
    expect(r.error).toContain('JSZip');
  });

  it('generateAsync rejette : capté en catch', async () => {
    injectScriptStub(JSZIP_CDN);
    (globalThis as Record<string, unknown>)['JSZip'] = function (this: Record<string, unknown>) {
      this['file'] = () => {};
      this['folder'] = () => ({ file: () => {}, folder: () => ({ file: () => {} }) });
      this['generateAsync'] = async () => {
        throw new Error('zip explode');
      };
    };
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({ template: 'letter-formal', data: {} });
    expect(r.success).toBe(false);
    expect(r.error).toContain('zip explode');
  });

  it('buildDocumentXml : lignes vides → <w:p/>, lignes titre majuscules → bold', async () => {
    injectScriptStub(JSZIP_CDN);
    const { ctor, files } = makeJSZipStub();
    (globalThis as Record<string, unknown>)['JSZip'] = ctor;
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'custom',
      data: {},
      customHtml: 'TITRE EN MAJUSCULES\n\nligne normale\n\nARTICLE 1 — TEST',
    });
    expect(r.success).toBe(true);
    const docXml = files.get('word/document.xml') ?? '';
    expect(docXml).toContain('<w:p/>'); /* ligne vide */
    expect(docXml).toContain('<w:b/>'); /* titre bold */
  });
});

/* ─────────────────────────────────────────────────────── */
describe('xlsx-generator — succès', () => {
  function setupSuccess() {
    injectScriptStub(XLSX_CDN);
    const stub = makeXLSXStub();
    (globalThis as Record<string, unknown>)['XLSX'] = stub.ns;
    return stub;
  }

  it('génère 1 sheet basique avec headers + data', async () => {
    setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'budget.xlsx',
      sheets: [
        {
          name: 'Janvier',
          data: [
            ['Catégorie', 'Montant'],
            ['Loyer', 1200],
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.filename).toBe('budget.xlsx');
    expect(r.sheetCount).toBe(1);
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it('applique formats currency_eur sur cellule existante', async () => {
    const { capture } = setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'fmt.xlsx',
      sheets: [
        {
          name: 'F',
          data: [
            ['A', 'B'],
            ['x', 100],
          ],
          formats: { B: 'currency_eur' },
        },
      ],
    });
    expect(r.success).toBe(true);
    /* La cellule B2 doit avoir reçu z='#,##0.00 €' */
    const ws = capture.sheets[0]!.ws as Record<string, Record<string, unknown>>;
    expect(ws['B2']?.['z']).toBe('#,##0.00 €');
  });

  it('format inconnu : skip silencieusement', async () => {
    setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'x.xlsx',
      sheets: [
        {
          name: 'S',
          data: [
            ['a', 'b'],
            [1, 2],
          ],
          formats: { A: 'inexistant' as never },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('columnWidths + freezeHeader appliqués', async () => {
    const { capture } = setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'wide.xlsx',
      sheets: [
        {
          name: 'X',
          data: [
            ['a', 'b'],
            [1, 2],
          ],
          columnWidths: [10, 20],
          freezeHeader: true,
        },
      ],
    });
    expect(r.success).toBe(true);
    const ws = capture.sheets[0]!.ws as Record<string, unknown>;
    expect(ws['!cols']).toEqual([{ wch: 10 }, { wch: 20 }]);
    expect(ws['!freeze']).toEqual({ xSplit: 0, ySplit: 1 });
  });

  it('format avec colonne ranged (A:A) parsé via .split', async () => {
    const { capture } = setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'r.xlsx',
      sheets: [
        {
          name: 'R',
          data: [
            ['a', 'b'],
            [1, 2],
          ],
          formats: { 'B:B': 'percent' },
        },
      ],
    });
    expect(r.success).toBe(true);
    const ws = capture.sheets[0]!.ws as Record<string, Record<string, unknown>>;
    expect(ws['B2']?.['z']).toBe('0.00%');
  });

  it('multi-sheets : sheetCount cohérent', async () => {
    setupSuccess();
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'multi.xlsx',
      sheets: [
        { name: 'S1', data: [['x'], [1]] },
        { name: 'S2', data: [['y'], [2]] },
        { name: 'S3', data: [['z'], [3]] },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.sheetCount).toBe(3);
  });
});

describe('xlsx-generator — branches erreurs', () => {
  it('XLSX non chargé : success=false', async () => {
    injectScriptStub(XLSX_CDN);
    /* Pas de globalThis.XLSX set */
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({ filename: 'a.xlsx', sheets: [] });
    expect(r.success).toBe(false);
    expect(r.error).toContain('XLSX');
  });

  it('write throw → catch global, error capturé', async () => {
    injectScriptStub(XLSX_CDN);
    (globalThis as Record<string, unknown>)['XLSX'] = {
      utils: {
        book_new: () => ({}),
        aoa_to_sheet: () => ({}),
        book_append_sheet: () => {},
      },
      write: () => {
        throw new Error('write boom');
      },
    };
    const { xlsxGenerator } = await import('../../services/skills/xlsx-generator.js');
    const r = await xlsxGenerator.generate({
      filename: 'fail.xlsx',
      sheets: [{ name: 'S', data: [['a']] }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('write boom');
  });
});

/* ─────────────────────────────────────────────────────── */
describe('video-use — composeHyperframes succès & erreurs', () => {
  let savedMR: typeof MediaRecorder | undefined;
  let savedCaptureStream: ((this: HTMLCanvasElement, fps?: number) => MediaStream) | undefined;

  beforeEach(() => {
    savedMR = (globalThis as Record<string, unknown>)['MediaRecorder'] as
      | typeof MediaRecorder
      | undefined;
    savedCaptureStream = (HTMLCanvasElement.prototype as unknown as {
      captureStream?: (fps?: number) => MediaStream;
    }).captureStream;
  });

  afterEach(() => {
    if (savedMR) (globalThis as Record<string, unknown>)['MediaRecorder'] = savedMR;
    else delete (globalThis as Record<string, unknown>)['MediaRecorder'];
    (HTMLCanvasElement.prototype as unknown as {
      captureStream?: (fps?: number) => MediaStream;
    }).captureStream = savedCaptureStream;
  });

  it('composeHyperframes : succès avec MediaRecorder stub', async () => {
    /* Stub captureStream + getContext sur HTMLCanvasElement (happy-dom n'a pas Canvas 2D) */
    (HTMLCanvasElement.prototype as unknown as {
      captureStream: (fps?: number) => MediaStream;
    }).captureStream = function () {
      return {} as MediaStream;
    };
    const fakeCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as {
      getContext: (k: string) => unknown;
    }).getContext = function () {
      return fakeCtx;
    };
    /* MediaRecorder stub minimal — push chunk SYNC dans start, fire onstop sync dans stop */
    let onstopCb: (() => void) | null = null;
    let ondataCb: ((e: { data: Blob }) => void) | null = null;
    (globalThis as Record<string, unknown>)['MediaRecorder'] = function (this: Record<string, unknown>) {
      this['start'] = () => {
        if (ondataCb) ondataCb({ data: new Blob(['CHUNK'], { type: 'video/webm' }) });
      };
      this['stop'] = () => {
        if (onstopCb) onstopCb();
      };
      Object.defineProperty(this, 'ondataavailable', {
        set(cb: (e: { data: Blob }) => void) {
          ondataCb = cb;
        },
      });
      Object.defineProperty(this, 'onstop', {
        set(cb: () => void) {
          onstopCb = cb;
        },
      });
    };
    /* Image stub : auto-fire onload via getter/setter src */
    const OrigImage = globalThis.Image;
    (globalThis as Record<string, unknown>)['Image'] = function (this: Record<string, unknown>) {
      const self = this;
      Object.defineProperty(self, 'src', {
        configurable: true,
        set() {
          queueMicrotask(() => {
            const cb = (self as Record<string, unknown>)['onload'] as (() => void) | undefined;
            if (cb) cb();
          });
        },
      });
    };
    try {
      const { videoUse } = await import('../../services/skills/video-use.js');
      const r = await videoUse.composeHyperframes({
        compositionId: 'demo',
        dataWidth: 320,
        dataHeight: 240,
        dataFps: 24,
        beats: [
          { id: 'b1', durationMs: 5, html: '<h1>Slide 1</h1>', css: 'h1{color:red}' },
          { id: 'b2', durationMs: 5, html: '<p>Slide 2</p>' },
        ],
      });
      expect(r.success).toBe(true);
      expect(r.filename).toMatch(/hyperframes_demo_/);
      expect(r.resolution).toBe('320x240');
      expect(r.sizeBytes).toBeGreaterThan(0);
    } finally {
      (globalThis as Record<string, unknown>)['Image'] = OrigImage;
      (HTMLCanvasElement.prototype as unknown as {
        getContext: typeof origGetContext;
      }).getContext = origGetContext;
    }
  });

  it('composeHyperframes : Image onerror → continue silencieux', async () => {
    (HTMLCanvasElement.prototype as unknown as {
      captureStream: (fps?: number) => MediaStream;
    }).captureStream = function () {
      return {} as MediaStream;
    };
    const fakeCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const origGC = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as {
      getContext: (k: string) => unknown;
    }).getContext = function () {
      return fakeCtx;
    };
    let onstopCb: (() => void) | null = null;
    (globalThis as Record<string, unknown>)['MediaRecorder'] = function (this: Record<string, unknown>) {
      this['start'] = () => {};
      this['stop'] = () => {
        if (onstopCb) onstopCb();
      };
      Object.defineProperty(this, 'ondataavailable', { set() {} });
      Object.defineProperty(this, 'onstop', {
        set(cb: () => void) {
          onstopCb = cb;
        },
      });
    };
    const OrigImage = globalThis.Image;
    (globalThis as Record<string, unknown>)['Image'] = function (this: Record<string, unknown>) {
      const self = this;
      Object.defineProperty(self, 'src', {
        configurable: true,
        set() {
          queueMicrotask(() => {
            const cb = (self as Record<string, unknown>)['onerror'] as (() => void) | undefined;
            if (cb) cb();
          });
        },
      });
    };
    try {
      const { videoUse } = await import('../../services/skills/video-use.js');
      const r = await videoUse.composeHyperframes({
        compositionId: 'err',
        beats: [{ id: 'b', durationMs: 1, html: '<x/>' }],
      });
      expect(r.success).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>)['Image'] = OrigImage;
      (HTMLCanvasElement.prototype as unknown as {
        getContext: typeof origGC;
      }).getContext = origGC;
    }
  });

  it('composeHyperframes : canvas getContext null → throw catch → success=false', async () => {
    /* Force getContext à retourner null */
    const OrigCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = OrigCreate(tag);
      if (tag === 'canvas') {
        (el as HTMLCanvasElement).getContext = () => null;
      }
      return el;
    });
    try {
      const { videoUse } = await import('../../services/skills/video-use.js');
      const r = await videoUse.composeHyperframes({
        compositionId: 'noctx',
        beats: [{ id: 'b', durationMs: 1, html: '<x/>' }],
      });
      expect(r.success).toBe(false);
      expect(r.error).toContain('Canvas');
    } finally {
      spy.mockRestore();
    }
  });

  it('composeHyperframes : MediaRecorder absent → success=false', async () => {
    delete (globalThis as Record<string, unknown>)['MediaRecorder'];
    (HTMLCanvasElement.prototype as unknown as {
      captureStream: (fps?: number) => MediaStream;
    }).captureStream = function () {
      return {} as MediaStream;
    };
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.composeHyperframes({
      compositionId: 'no-mr',
      beats: [{ id: 'b', durationMs: 1, html: '<x/>' }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('video-use — edit succès via ffmpeg mock', () => {
  /* On mock les URLs CDN ffmpeg via vi.mock pour exercer les branches success/switch. */
  let ffStub: {
    writeFile: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };
  let exitCode = 0;
  let readBytes = new Uint8Array([1, 2, 3]);

  beforeEach(() => {
    vi.resetModules();
    exitCode = 0;
    readBytes = new Uint8Array([1, 2, 3, 4, 5]);
    ffStub = {
      writeFile: vi.fn(async () => undefined),
      readFile: vi.fn(async () => readBytes),
      exec: vi.fn(async () => exitCode),
    };
    vi.doMock('https://esm.sh/@ffmpeg/ffmpeg@0.12.10', () => ({
      FFmpeg: function () {
        return {
          load: async () => undefined,
          ...ffStub,
        };
      },
    }));
    vi.doMock('https://esm.sh/@ffmpeg/util@0.12.1', () => ({
      toBlobURL: async () => 'blob:fake-core',
      fetchFile: async () => new Uint8Array([0xff, 0xd8]),
    }));
    /* Stub global fetch pour fetchToBytes(input.videoSource) */
    (globalThis as Record<string, unknown>)['fetch'] = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
  });

  it('edit cut : succès, args bien formés', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'cut',
      videoSource: 'blob:input',
      params: { start_sec: 1, end_sec: 5 },
    });
    expect(r.success).toBe(true);
    expect(r.filename).toMatch(/cut_\d+\.mp4/);
    expect(ffStub.exec).toHaveBeenCalledWith([
      '-i',
      'in.mp4',
      '-ss',
      '1',
      '-to',
      '5',
      '-c',
      'copy',
      'out.mp4',
    ]);
  });

  it('edit resize 9:16 → filtre vertical', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'resize',
      videoSource: 'blob:input',
      params: { target_ratio: '9:16' },
    });
    expect(r.success).toBe(true);
    const args = ffStub.exec.mock.calls[0]![0] as string[];
    expect(args.join(' ')).toContain('1080:1920');
  });

  it('edit resize 1:1 → filtre carré', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'resize',
      videoSource: 'blob:input',
      params: { target_ratio: '1:1' },
    });
    expect(r.success).toBe(true);
    const args = ffStub.exec.mock.calls[0]![0] as string[];
    expect(args.join(' ')).toContain('1080:1080');
  });

  it('edit resize default 16:9', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'resize', videoSource: 'blob:in' });
    expect(r.success).toBe(true);
    const args = ffStub.exec.mock.calls[0]![0] as string[];
    expect(args.join(' ')).toContain('1920:1080');
  });

  it('edit extract_audio : produit audio.mp3', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'extract_audio', videoSource: 'blob:in' });
    expect(r.success).toBe(true);
    expect(r.filename).toMatch(/extract_audio_\d+\.mp3/);
  });

  it('edit watermark avec base64 valide : succès', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'watermark',
      videoSource: 'blob:in',
      params: {
        watermark_image_base64: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });
    expect(r.success).toBe(true);
    /* writeFile a été appelé pour input + logo.png */
    expect(ffStub.writeFile).toHaveBeenCalledWith('logo.png', expect.any(Uint8Array));
  });

  it('edit concat avec 2 sources : succès', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'concat',
      videoSource: 'blob:in',
      params: { sources: ['blob:a', 'blob:b'] },
    });
    expect(r.success).toBe(true);
    /* concat.txt écrit + 2 c{i}.mp4 */
    const calls = ffStub.writeFile.mock.calls.map((c) => c[0]);
    expect(calls).toContain('concat.txt');
    expect(calls).toContain('c0.mp4');
    expect(calls).toContain('c1.mp4');
  });

  it('edit captions avec srt : succès', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'captions',
      videoSource: 'blob:in',
      params: { srt_text: '1\n00:00:00,000 --> 00:00:01,000\nHello' },
    });
    expect(r.success).toBe(true);
    expect(ffStub.writeFile).toHaveBeenCalledWith('subs.srt', expect.any(Uint8Array));
  });

  it('edit exit code != 0 → success=false avec error code', async () => {
    exitCode = 137;
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'cut', videoSource: 'blob:in' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('137');
  });

  it('edit cut : params défaut start=0/end=10', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    await videoUse.edit({ operation: 'cut', videoSource: 'blob:in' });
    const args = ffStub.exec.mock.calls[0]![0] as string[];
    expect(args).toContain('0');
    expect(args).toContain('10');
  });

  it('edit watermark sans base64 (avec ffmpeg) → success=false avec error précise', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'watermark', videoSource: 'blob:in', params: {} });
    expect(r.success).toBe(false);
    expect(r.error).toContain('watermark_image_base64');
  });

  it('edit concat < 2 sources (avec ffmpeg) → error précise', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'concat',
      videoSource: 'blob:in',
      params: { sources: ['only-one'] },
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('2+ sources');
  });

  it('edit captions sans srt_text (avec ffmpeg) → error précise', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'captions', videoSource: 'blob:in' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('srt_text');
  });

  it('edit operation inconnue (avec ffmpeg) → "non implémentée"', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'totally-foobar' as never,
      videoSource: 'blob:in',
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('non implémentée');
  });

  it('edit catch global : si writeFile throw, error capturé', async () => {
    ffStub.writeFile = vi.fn(async () => {
      throw new Error('write boom');
    });
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'cut', videoSource: 'blob:in' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('write boom');
  });

  it('edit fetchFile fallback : si fetch global rejette, ffmpeg.fetchFile prend le relais', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = vi.fn(async () => {
      throw new Error('no network');
    });
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'cut', videoSource: 'blob:in' });
    /* Doit aboutir car fetchFile fournit le fallback */
    expect(r.success).toBe(true);
  });
});

describe('video-use — edit branches erreurs (sans ffmpeg réel)', () => {
  /* En env happy-dom les import('https://esm.sh/...') échoueront → loadFfmpeg renvoie null
   * → branche "ffmpeg.wasm CDN load failed" testée. Couvre la majorité du switch également via
   * pré-validations qui n'exigent pas ffmpeg. */

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
    vi.doUnmock('https://esm.sh/@ffmpeg/util@0.12.1');
  });

  it('edit cut : ffmpeg load fail → erreur structurée', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'cut', videoSource: 'blob:fake' });
    expect(r.success).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('edit unknown operation : retourne success=false', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'totally-unknown' as never,
      videoSource: 'blob:fake',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('edit watermark sans watermark_image_base64 : pas crash, error messagé', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'watermark', videoSource: 'blob:fake' });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('edit concat sans sources : pas crash, error messagé', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'concat', videoSource: 'blob:fake' });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('edit captions sans srt_text : pas crash, error messagé', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'captions', videoSource: 'blob:fake' });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
