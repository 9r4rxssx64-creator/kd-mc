/**
 * APEX v13 — Skill : PPTX Generator
 *
 * Génère présentations .pptx via pptxgenjs (CDN lazy).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const PPTXGENJS_CDN = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';

export type PptxTemplate =
  | 'pitch-startup'
  | 'business-quarterly'
  | 'lecture-academic'
  | 'wedding-anniversary'
  | 'birthday-party'
  | 'casino-training'
  | 'product-launch'
  | 'custom';

export interface PptxSlide {
  title: string;
  content: string;
  imageUrl?: string | undefined;
  notes?: string | undefined;
}

export interface PptxGenerateInput {
  template: PptxTemplate;
  title: string;
  author: string;
  slides: PptxSlide[];
  mode?: 'pro' | 'fun' | undefined;
  themeColor?: string | undefined;
  filename?: string | undefined;
}

export interface PptxGenerateOutput {
  success: boolean;
  filename: string;
  blobUrl: string;
  slideCount: number;
  sizeBytes: number;
  error?: string | undefined;
}

let libLoaded = false;

async function loadLib(): Promise<unknown> {
  const g = globalThis as Record<string, unknown>;
  if (libLoaded) return g['PptxGenJS'];
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${PPTXGENJS_CDN}"]`)) {
      libLoaded = true;
      resolve(g['PptxGenJS']);
      return;
    }
    const script = document.createElement('script');
    script.src = PPTXGENJS_CDN;
    script.async = true;
    script.onload = () => {
      libLoaded = true;
      resolve(g['PptxGenJS']);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

const THEME_COLORS: Record<string, string> = {
  pro: '#1A365D',
  fun: '#FF6B6B',
  premium: '#D4AF37',
  tech: '#0A2540',
};

export const pptxGenerator = {
  async generate(input: PptxGenerateInput): Promise<PptxGenerateOutput> {
    try {
      const PptxGenJS = (await loadLib()) as (new () => unknown) | null;
      if (!PptxGenJS) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          slideCount: 0,
          sizeBytes: 0,
          error: 'pptxgenjs CDN load failed',
        };
      }

      const pptx = new PptxGenJS() as Record<string, unknown>;

      const author = input.author || 'Apex';
      const title = input.title || 'Présentation';

      pptx['title'] = title;
      pptx['author'] = author;
      pptx['company'] = 'Apex AI';
      pptx['layout'] = '16x9';

      const themeColor = input.themeColor ?? THEME_COLORS[input.mode ?? 'pro'] ?? '#1A365D';
      const themeNoHash = themeColor.replace('#', '');

      const addSlideFn = pptx['addSlide'] as () => Record<string, unknown>;
      const titleSlide = addSlideFn();
      titleSlide['background'] = { color: themeColor };
      const addTextTitle = titleSlide['addText'] as (txt: string, opts: Record<string, unknown>) => void;
      addTextTitle(title, {
        x: 0.5,
        y: 2,
        w: 9,
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
      });
      addTextTitle(author, {
        x: 0.5,
        y: 4,
        w: 9,
        h: 0.5,
        fontSize: 20,
        color: 'CCCCCC',
        align: 'center',
      });

      for (const slide of input.slides) {
        const s = addSlideFn();
        const addText = s['addText'] as (txt: string, opts: Record<string, unknown>) => void;
        addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 1,
          fontSize: 28,
          bold: true,
          color: themeNoHash,
        });
        addText(slide.content, {
          x: 0.5,
          y: 1.5,
          w: 9,
          h: 4.5,
          fontSize: 18,
          color: '333333',
        });
        if (slide.notes) {
          const addNotes = s['addNotes'] as ((txt: string) => void) | undefined;
          addNotes?.(slide.notes);
        }
      }

      const writeFn = pptx['write'] as (opts: { outputType: string }) => Promise<Blob>;
      const blob = await writeFn({ outputType: 'blob' });
      const blobUrl = URL.createObjectURL(blob);

      const filename = input.filename ?? `${input.template}_${Date.now()}.pptx`;

      await auditLog.record('skill.pptx.generated', {
        details: { template: input.template, slides: input.slides.length, size: blob.size },
      });

      logger.info('skill.pptx', `Generated ${filename} (${input.slides.length} slides)`);

      return {
        success: true,
        filename,
        blobUrl,
        slideCount: input.slides.length + 1,
        sizeBytes: blob.size,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.pptx', 'generate failed', { err: errMsg });
      return {
        success: false,
        filename: '',
        blobUrl: '',
        slideCount: 0,
        sizeBytes: 0,
        error: errMsg,
      };
    }
  },
};
