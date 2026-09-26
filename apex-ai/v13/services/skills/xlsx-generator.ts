/**
 * APEX v13 — Skill : XLSX Generator
 *
 * Génère tableaux Excel .xlsx via SheetJS (CDN lazy).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/dist/xlsx.full.min.js';

export type XlsxCellValue =
  | string
  | number
  | boolean
  | null
  | { f: string }
  | { v: unknown; t?: 's' | 'n' | 'b' | 'd'; z?: string };

export interface XlsxSheet {
  name: string;
  data: XlsxCellValue[][];
  formats?:
    | Record<string, 'currency_eur' | 'currency_usd' | 'percent' | 'date_fr' | 'number_2dec'>
    | undefined;
  freezeHeader?: boolean | undefined;
  columnWidths?: number[] | undefined;
}

export interface XlsxGenerateInput {
  filename: string;
  sheets: XlsxSheet[];
}

export interface XlsxGenerateOutput {
  success: boolean;
  filename: string;
  blobUrl: string;
  sheetCount: number;
  sizeBytes: number;
  error?: string | undefined;
}

let libLoaded = false;

async function loadLib(): Promise<unknown> {
  const g = globalThis as Record<string, unknown>;
  if (libLoaded) return g['XLSX'];
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${XLSX_CDN}"]`);
    if (existing) {
      libLoaded = true;
      resolve(g['XLSX']);
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.onload = () => {
      libLoaded = true;
      resolve(g['XLSX']);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

const FORMAT_CODES: Record<string, string> = {
  currency_eur: '#,##0.00 €',
  currency_usd: '$#,##0.00',
  percent: '0.00%',
  date_fr: 'dd/mm/yyyy',
  number_2dec: '#,##0.00',
};

export const xlsxGenerator = {
  async generate(input: XlsxGenerateInput): Promise<XlsxGenerateOutput> {
    try {
      const XLSXLib = (await loadLib()) as Record<string, unknown> | null;
      if (!XLSXLib) {
        return {
          success: false,
          filename: input.filename,
          blobUrl: '',
          sheetCount: 0,
          sizeBytes: 0,
          error: 'XLSX CDN load failed',
        };
      }

      const utils = XLSXLib['utils'] as Record<string, unknown>;
      const bookNew = utils['book_new'] as () => Record<string, unknown>;
      const aoaToSheet = utils['aoa_to_sheet'] as (data: unknown[][]) => Record<string, unknown>;
      const bookAppendSheet = utils['book_append_sheet'] as (
        wb: unknown,
        ws: unknown,
        name: string,
      ) => void;
      const writeFn = XLSXLib['write'] as (
        wb: unknown,
        opts: Record<string, unknown>,
      ) => ArrayBuffer;

      const wb = bookNew();

      for (const sheet of input.sheets) {
        const ws = aoaToSheet(sheet.data);

        /* Apply formats */
        if (sheet.formats) {
          for (const [col, fmtKey] of Object.entries(sheet.formats)) {
            const code = FORMAT_CODES[fmtKey];
            if (!code) continue;
            const colLetter = col.replace(/:.*$/, '');
            for (let r = 2; r <= sheet.data.length; r++) {
              const cellRef = `${colLetter}${r}`;
              if (ws[cellRef]) {
                const cell = ws[cellRef] as Record<string, unknown>;
                cell['z'] = code;
              }
            }
          }
        }

        /* Column widths */
        if (sheet.columnWidths) {
          ws['!cols'] = sheet.columnWidths.map((w) => ({ wch: w }));
        }

        /* Freeze header */
        if (sheet.freezeHeader) {
          ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        }

        bookAppendSheet(wb, ws, sheet.name);
      }

      const arrBuf = writeFn(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([arrBuf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const blobUrl = URL.createObjectURL(blob);

      await auditLog.record('skill.xlsx.generated', {
        details: { sheets: input.sheets.length, size: blob.size, filename: input.filename },
      });

      logger.info('skill.xlsx', `Generated ${input.filename} (${input.sheets.length} sheets)`);

      return {
        success: true,
        filename: input.filename,
        blobUrl,
        sheetCount: input.sheets.length,
        sizeBytes: blob.size,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.xlsx', 'generate failed', { err: errMsg });
      return {
        success: false,
        filename: input.filename,
        blobUrl: '',
        sheetCount: 0,
        sizeBytes: 0,
        error: errMsg,
      };
    }
  },
};
