/**
 * APEX v13 — Tests render features/studios/{xlsx,pdf,pptx,docx}
 *
 * Couvre la fonction render() de chaque studio (auparavant 0% lines coverage)
 * + handlers click qui appellent generator.generate() (mocké).
 *
 * Méthode : DOM happy-dom + vi.mock générateurs + vi.spyOn toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/skills/xlsx-generator.js', () => ({
  xlsxGenerator: {
    generate: vi.fn(async () => ({
      success: true,
      filename: 'tableau.xlsx',
      sheetCount: 1,
      sizeBytes: 2048,
      blobUrl: 'blob:fake',
    })),
  },
}));

vi.mock('../../services/skills/pdf-generator.js', () => ({
  pdfGenerator: {
    generate: vi.fn(async () => ({
      success: true,
      filename: 'doc.pdf',
      pageCount: 1,
      sizeBytes: 4096,
      blobUrl: 'blob:fake-pdf',
    })),
  },
}));

vi.mock('../../services/skills/pptx-generator.js', () => ({
  pptxGenerator: {
    generate: vi.fn(async () => ({
      success: true,
      filename: 'pres.pptx',
      slideCount: 2,
      sizeBytes: 8192,
      blobUrl: 'blob:fake-pptx',
    })),
  },
}));

vi.mock('../../services/skills/docx-generator.js', () => ({
  docxGenerator: {
    generate: vi.fn(async () => ({
      success: true,
      filename: 'doc.docx',
      sizeBytes: 6144,
      blobUrl: 'blob:fake-docx',
    })),
  },
}));

vi.mock('../../ui/toast.js', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { render as renderXlsx } from '../../features/studios/xlsx/index.js';
import { render as renderPdf } from '../../features/studios/pdf/index.js';
import { render as renderPptx } from '../../features/studios/pptx/index.js';
import { render as renderDocx } from '../../features/studios/docx/index.js';
import { xlsxGenerator } from '../../services/skills/xlsx-generator.js';
import { pdfGenerator } from '../../services/skills/pdf-generator.js';
import { pptxGenerator } from '../../services/skills/pptx-generator.js';
import { docxGenerator } from '../../services/skills/docx-generator.js';
import { toast } from '../../ui/toast.js';

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('features/studios/xlsx — render', () => {
  it('rend le formulaire avec inputs requis', () => {
    renderXlsx(root);
    expect(root.querySelector('#xlsx-filename')).toBeTruthy();
    expect(root.querySelector('#xlsx-sheetname')).toBeTruthy();
    expect(root.querySelector('#xlsx-data')).toBeTruthy();
    expect(root.querySelector('#xlsx-freeze')).toBeTruthy();
    expect(root.querySelector('#xlsx-generate')).toBeTruthy();
  });

  it('appelle xlsxGenerator.generate au click avec données CSV parsées', async () => {
    renderXlsx(root);
    const btn = root.querySelector<HTMLButtonElement>('#xlsx-generate')!;
    btn.click();
    /* attendre microtask + résolution */
    await new Promise((r) => setTimeout(r, 10));
    expect(xlsxGenerator.generate).toHaveBeenCalledTimes(1);
    const arg = (xlsxGenerator.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.filename).toBe('tableau.xlsx');
    expect(arg.sheets).toHaveLength(1);
    expect(arg.sheets[0].data.length).toBeGreaterThan(0);
    /* Première ligne = headers, 2ᵉ ligne = data avec nombre */
    expect(arg.sheets[0].data[1]).toContain(4500);
  });

  it('toast.error si données vides', async () => {
    renderXlsx(root);
    const ta = root.querySelector<HTMLTextAreaElement>('#xlsx-data')!;
    ta.value = '';
    const btn = root.querySelector<HTMLButtonElement>('#xlsx-generate')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.error).toHaveBeenCalledWith('Aucune donnée à exporter');
    expect(xlsxGenerator.generate).not.toHaveBeenCalled();
  });

  it('affiche bloc succès avec lien téléchargement après génération réussie', async () => {
    renderXlsx(root);
    const btn = root.querySelector<HTMLButtonElement>('#xlsx-generate')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    const result = root.querySelector('#xlsx-result');
    expect(result?.innerHTML).toContain('tableau.xlsx');
    expect(result?.innerHTML).toContain('Télécharger');
    expect(toast.success).toHaveBeenCalled();
  });

  it('gère erreur generator (success=false)', async () => {
    (xlsxGenerator.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Boom',
      filename: '',
      sheetCount: 0,
      sizeBytes: 0,
    });
    renderXlsx(root);
    const btn = root.querySelector<HTMLButtonElement>('#xlsx-generate')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    const result = root.querySelector('#xlsx-result');
    expect(result?.innerHTML).toContain('Boom');
    expect(toast.error).toHaveBeenCalled();
  });

  it('catch exception générateur (rejected promise)', async () => {
    (xlsxGenerator.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('crash'));
    renderXlsx(root);
    const btn = root.querySelector<HTMLButtonElement>('#xlsx-generate')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.error).toHaveBeenCalledWith('❌ crash');
  });
});

describe('features/studios/pdf — render', () => {
  it('rend select template avec 7 options', () => {
    renderPdf(root);
    const sel = root.querySelector<HTMLSelectElement>('#pdf-template');
    expect(sel).toBeTruthy();
    expect(sel?.options.length).toBe(7);
  });

  it('inputs principaux présents', () => {
    renderPdf(root);
    expect(root.querySelector('#pdf-number')).toBeTruthy();
    expect(root.querySelector('#pdf-client')).toBeTruthy();
    expect(root.querySelector('#pdf-address')).toBeTruthy();
    expect(root.querySelector('#pdf-items')).toBeTruthy();
    expect(root.querySelector('#pdf-watermark')).toBeTruthy();
  });

  it('parse les items "desc | qty | prix" et appelle generate', async () => {
    renderPdf(root);
    (root.querySelector('#pdf-number') as HTMLInputElement).value = 'F-001';
    (root.querySelector('#pdf-client') as HTMLInputElement).value = 'Acme';
    (root.querySelector('#pdf-items') as HTMLTextAreaElement).value =
      'Service A | 2 | 500\nService B | 1 | 100';
    const btn = root.querySelector<HTMLButtonElement>('#pdf-generate')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    const arg = (pdfGenerator.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.template).toBe('invoice');
    expect(arg.data.number).toBe('F-001');
    expect(arg.data.client_name).toBe('Acme');
    expect(arg.data.items).toHaveLength(2);
    expect(arg.data.items[0]).toEqual({ description: 'Service A', quantity: 2, unit_price: 500 });
  });

  it('passe watermark si sélectionné', async () => {
    renderPdf(root);
    (root.querySelector('#pdf-watermark') as HTMLSelectElement).value = 'CONFIDENTIEL';
    root.querySelector<HTMLButtonElement>('#pdf-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    const arg = (pdfGenerator.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.options.watermark).toBe('CONFIDENTIEL');
  });

  it('affiche succès + lien téléchargement', async () => {
    renderPdf(root);
    root.querySelector<HTMLButtonElement>('#pdf-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    const r2 = root.querySelector('#pdf-result');
    expect(r2?.innerHTML).toContain('doc.pdf');
    expect(r2?.innerHTML).toContain('Télécharger');
  });

  it('affiche erreur si success=false', async () => {
    (pdfGenerator.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Bad input',
      filename: '',
      pageCount: 0,
      sizeBytes: 0,
    });
    renderPdf(root);
    root.querySelector<HTMLButtonElement>('#pdf-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('#pdf-result')?.innerHTML).toContain('Bad input');
  });

  it('catch exception generator', async () => {
    (pdfGenerator.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('pdf fail'));
    renderPdf(root);
    root.querySelector<HTMLButtonElement>('#pdf-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.error).toHaveBeenCalledWith('❌ pdf fail');
  });
});

describe('features/studios/pptx — render', () => {
  it('rend formulaire avec 7 templates et 1 slide initial', () => {
    renderPptx(root);
    const sel = root.querySelector<HTMLSelectElement>('#pptx-template');
    expect(sel?.options.length).toBe(7);
    expect(root.querySelectorAll('[data-slide-title]').length).toBe(1);
  });

  it('ajoute slide au click "Ajouter slide"', () => {
    renderPptx(root);
    root.querySelector<HTMLButtonElement>('#pptx-add-slide')!.click();
    expect(root.querySelectorAll('[data-slide-title]').length).toBeGreaterThanOrEqual(2);
  });

  it('génère pptx avec slides DOM lus', async () => {
    renderPptx(root);
    (root.querySelector('#pptx-title') as HTMLInputElement).value = 'Mon pitch';
    (root.querySelector('#pptx-author') as HTMLInputElement).value = 'Kevin';
    (root.querySelector('[data-slide-title="0"]') as HTMLInputElement).value = 'Intro';
    root.querySelector<HTMLButtonElement>('#pptx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    const arg = (pptxGenerator.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.title).toBe('Mon pitch');
    expect(arg.author).toBe('Kevin');
    expect(arg.slides[0].title).toBe('Intro');
  });

  it('affiche bloc succès', async () => {
    renderPptx(root);
    root.querySelector<HTMLButtonElement>('#pptx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('#pptx-result')?.innerHTML).toContain('pres.pptx');
  });

  it('gère erreur generate', async () => {
    (pptxGenerator.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'pptx err',
      filename: '',
      slideCount: 0,
      sizeBytes: 0,
    });
    renderPptx(root);
    root.querySelector<HTMLButtonElement>('#pptx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('#pptx-result')?.innerHTML).toContain('pptx err');
  });

  it('catch exception generator', async () => {
    (pptxGenerator.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    renderPptx(root);
    root.querySelector<HTMLButtonElement>('#pptx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.error).toHaveBeenCalledWith('❌ boom');
  });
});

describe('features/studios/docx — render', () => {
  it('rend select template avec 6 templates', () => {
    renderDocx(root);
    const sel = root.querySelector<HTMLSelectElement>('#docx-template-select');
    expect(sel?.options.length).toBe(6);
  });

  it('change template re-render fields', () => {
    renderDocx(root);
    const sel = root.querySelector<HTMLSelectElement>('#docx-template-select')!;
    sel.value = 'cv-modern';
    sel.dispatchEvent(new Event('change'));
    /* CV moderne a 8 fields */
    expect(root.querySelectorAll('[data-field]').length).toBe(8);
  });

  it('génère docx avec data formulaire', async () => {
    renderDocx(root);
    (root.querySelector('[data-field="sender_name"]') as HTMLInputElement).value = 'Kevin';
    (root.querySelector('[data-field="recipient_name"]') as HTMLInputElement).value = 'Laurence';
    root.querySelector<HTMLButtonElement>('#docx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    const arg = (docxGenerator.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.template).toBe('letter-formal');
    expect(arg.data.sender_name).toBe('Kevin');
    expect(arg.data.recipient_name).toBe('Laurence');
  });

  it('affiche succès', async () => {
    renderDocx(root);
    root.querySelector<HTMLButtonElement>('#docx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('#docx-result')?.innerHTML).toContain('doc.docx');
  });

  it('gère erreur generate', async () => {
    (docxGenerator.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'docx fail',
      filename: '',
      sizeBytes: 0,
    });
    renderDocx(root);
    root.querySelector<HTMLButtonElement>('#docx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('#docx-result')?.innerHTML).toContain('docx fail');
  });

  it('catch exception generator', async () => {
    (docxGenerator.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom-docx'));
    renderDocx(root);
    root.querySelector<HTMLButtonElement>('#docx-generate')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.error).toHaveBeenCalledWith('❌ boom-docx');
  });
});
