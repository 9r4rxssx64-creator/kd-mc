/**
 * APEX v13 — Skill : PDF Generator
 *
 * Génère PDFs professionnels via jsPDF + autoTable (CDN lazy).
 * Templates : invoice, quote, contract-signed, report-standard,
 * certificate, receipt, bofip-extract, legal-doc, custom.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';

export type PdfTemplate =
  | 'invoice'
  | 'quote'
  | 'contract-signed'
  | 'report-standard'
  | 'certificate'
  | 'receipt'
  | 'bofip-extract'
  | 'legal-doc'
  | 'custom';

export interface PdfGenerateInput {
  template: PdfTemplate;
  data: Record<string, unknown>;
  options?:
    | {
        watermark?: 'BROUILLON' | 'CONFIDENTIEL' | null | undefined;
        qrData?: string | undefined;
        logoBase64?: string | undefined;
        footerText?: string | undefined;
      }
    | undefined;
  filename?: string | undefined;
}

export interface PdfGenerateOutput {
  success: boolean;
  filename: string;
  blobUrl: string;
  pageCount: number;
  sizeBytes: number;
  error?: string | undefined;
}

let libsLoaded = false;

/* Helper safe string accessor */
function s(d: Record<string, unknown>, key: string, fallback = ''): string {
  const v = d[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
}

async function loadLibs(): Promise<unknown> {
  if (libsLoaded) return (globalThis as Record<string, unknown>)['jspdf'];
  await loadScript(JSPDF_CDN);
  await loadScript(AUTOTABLE_CDN);
  libsLoaded = true;
  return (globalThis as Record<string, unknown>)['jspdf'];
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed ${src}`));
    document.head.appendChild(script);
  });
}

const TITLES: Record<PdfTemplate, string> = {
  invoice: 'FACTURE',
  quote: 'DEVIS',
  'contract-signed': 'CONTRAT',
  'report-standard': 'RAPPORT',
  certificate: 'CERTIFICAT',
  receipt: 'REÇU',
  'bofip-extract': 'EXTRAIT BOFIP',
  'legal-doc': 'DOCUMENT JURIDIQUE',
  custom: 'DOCUMENT',
};

export const pdfGenerator = {
  async generate(input: PdfGenerateInput): Promise<PdfGenerateOutput> {
    try {
      const jspdfNs = (await loadLibs()) as Record<string, unknown> | null;
      if (!jspdfNs) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          pageCount: 0,
          sizeBytes: 0,
          error: 'jsPDF CDN load failed',
        };
      }

      /* Cast unknown lib à eslint-friendly `any` local pour appeler méthodes dynamiques. */
      const jsPDFCtor = jspdfNs['jsPDF'] as new (opts?: Record<string, unknown>) => unknown;
      const doc = new jsPDFCtor({ unit: 'mm', format: 'a4' }) as Record<string, unknown>;
      const d = doc as Record<string, (...args: unknown[]) => unknown>;

      /* Header logo */
      const logoBase64 = input.options?.logoBase64;
      if (logoBase64) {
        try {
          d['addImage']?.(logoBase64, 'PNG', 10, 10, 30, 15);
        } catch {
          /* ignore */
        }
      }

      const title =
        input.template === 'custom' ? s(input.data, 'title', TITLES['custom']) : TITLES[input.template];

      d['setFontSize']?.(20);
      d['text']?.(title, 105, 25, { align: 'center' });

      d['setFontSize']?.(11);
      let yPos = 45;

      if (input.template === 'invoice' || input.template === 'quote') {
        const lines = [
          `N° : ${s(input.data, 'number', 'F-2026-001')}`,
          `Date : ${s(input.data, 'date', new Date().toLocaleDateString('fr-FR'))}`,
          ``,
          `Client : ${s(input.data, 'client_name')}`,
          `Adresse : ${s(input.data, 'client_address')}`,
          ``,
        ];
        for (const line of lines) {
          d['text']?.(line, 15, yPos);
          yPos += 7;
        }

        const itemsRaw = input.data['items'];
        const items =
          Array.isArray(itemsRaw)
            ? (itemsRaw as Array<{ description?: string; quantity?: number; unit_price?: number }>)
            : [];
        const autoTable = d['autoTable'];
        if (items.length > 0 && typeof autoTable === 'function') {
          autoTable({
            startY: yPos,
            head: [['Description', 'Quantité', 'PU HT', 'Total HT']],
            body: items.map((it) => [
              it.description ?? '',
              String(it.quantity ?? 0),
              `${(it.unit_price ?? 0).toFixed(2)} €`,
              `${((it.quantity ?? 0) * (it.unit_price ?? 0)).toFixed(2)} €`,
            ]),
            theme: 'striped',
            headStyles: { fillColor: [26, 54, 93] },
          });
        }

        const totalHt = items.reduce((a, b) => a + (b.quantity ?? 0) * (b.unit_price ?? 0), 0);
        const tvaRate = typeof input.data['tva_rate'] === 'number' ? (input.data['tva_rate'] as number) : 0.2;
        const tva = totalHt * tvaRate;
        const lastTable = doc['lastAutoTable'] as { finalY?: number } | undefined;
        yPos = lastTable?.finalY ?? yPos + 20;
        yPos += 10;
        d['text']?.(`Total HT : ${totalHt.toFixed(2)} €`, 150, yPos);
        yPos += 6;
        d['text']?.(`TVA : ${tva.toFixed(2)} €`, 150, yPos);
        yPos += 6;
        d['setFont']?.('helvetica', 'bold');
        d['text']?.(`Total TTC : ${(totalHt + tva).toFixed(2)} €`, 150, yPos);
      } else {
        const body = s(input.data, 'body') || JSON.stringify(input.data, null, 2);
        const splitFn = d['splitTextToSize'];
        const split = typeof splitFn === 'function' ? (splitFn(body, 180) as string[]) : [body];
        d['text']?.(split, 15, yPos);
      }

      /* Watermark */
      const watermark = input.options?.watermark;
      if (watermark) {
        d['setFontSize']?.(60);
        d['setTextColor']?.(200, 200, 200);
        d['text']?.(watermark, 105, 150, { angle: 45, align: 'center' });
      }

      /* Footer */
      const footerText = input.options?.footerText;
      if (footerText) {
        d['setFontSize']?.(8);
        d['setTextColor']?.(120, 120, 120);
        d['text']?.(footerText, 15, 285);
      }

      const blob = d['output']?.('blob') as Blob;
      const blobUrl = URL.createObjectURL(blob);
      const internal = doc['internal'] as { getNumberOfPages?: () => number } | undefined;
      const pageCount = internal?.getNumberOfPages ? internal.getNumberOfPages() : 1;

      const filename = input.filename ?? `${input.template}_${Date.now()}.pdf`;

      await auditLog.record('skill.pdf.generated', {
        details: { template: input.template, pages: pageCount, size: blob.size },
      });

      logger.info('skill.pdf', `Generated ${filename} (${pageCount} pages)`);

      return {
        success: true,
        filename,
        blobUrl,
        pageCount,
        sizeBytes: blob.size,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.pdf', 'generate failed', { err: errMsg });
      return {
        success: false,
        filename: '',
        blobUrl: '',
        pageCount: 0,
        sizeBytes: 0,
        error: errMsg,
      };
    }
  },
};
