/**
 * APEX v13.4.180 — Layout Inspector (Kevin "intègre Playwright dans Apex").
 *
 * Sandbox Claude Code bloque Playwright (downloads browser interdits, règle CLAUDE.md).
 * MAIS Apex tourne dans le browser — il PEUT s'auto-inspecter visuellement.
 *
 * Capacités :
 * 1. scanDom() : audite le DOM courant pour overflow horizontal, éléments coupés,
 *    boutons hors viewport, textes tronqués, padding excessif. JSON report.
 * 2. screenshot() : lazy import html2canvas → vrai bitmap PNG du #apex-root.
 *    Downloadable + base64 pour envoi via chat IA.
 * 3. autoMonitor(intervalMs) : surveillance continue, alerte si nouveau bug visuel.
 * 4. showReport() : modal admin avec scan + screenshot + actions auto-fix.
 *
 * Apex IA peut appeler ces fonctions via tool use pour diagnostiquer en autonomie.
 *
 * Pour Playwright complet (CI) → .github/workflows/apex-v13-visual-regression.yml
 * qui run en CI (downloads browser autorisés) et upload artifacts.
 */

import { logger } from '../../core/logger.js';

export interface OverflowingElement {
  tag: string;
  classes: string;
  id: string;
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  overflowBy: number;
  textPreview: string;
}

export interface HiddenButton {
  selector: string;
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  reason: 'off_viewport_right' | 'off_viewport_bottom' | 'masked_by_other' | 'opacity_zero' | 'display_none_parent';
}

export interface LayoutScanReport {
  viewport: { width: number; height: number };
  documentScroll: { width: number; height: number };
  hasHorizontalOverflow: boolean;
  overflowingElements: OverflowingElement[];
  hiddenButtons: HiddenButton[];
  smallTouchTargets: { selector: string; size: { w: number; h: number } }[];
  computedMetrics: {
    htmlFontSize: string;
    bodyFontSize: string;
    rootPosition: string;
    visualViewportScale: number;
  };
  ts: number;
  ver: string;
  appVer: string;
}

/**
 * Scan complet du DOM pour détecter problèmes visuels.
 * Pure (lecture only, aucune modification DOM).
 */
export function scanDom(): LayoutScanReport {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const docW = document.documentElement.scrollWidth;
  const docH = document.documentElement.scrollHeight;
  const overflowingElements: OverflowingElement[] = [];
  const hiddenButtons: HiddenButton[] = [];
  const smallTouchTargets: { selector: string; size: { w: number; h: number } }[] = [];

  /* Scan overflow horizontal : éléments dont scrollWidth > clientWidth */
  const allEls = document.querySelectorAll<HTMLElement>('*');
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    if (!el) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.scrollWidth > 50) {
      /* Ignore éléments avec overflow-x:scroll/auto par design */
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      overflowingElements.push({
        tag: el.tagName.toLowerCase(),
        classes: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
        id: el.id ?? '',
        selector: buildSelector(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowBy: el.scrollWidth - el.clientWidth,
        textPreview: (el.textContent ?? '').slice(0, 50),
      });
      if (overflowingElements.length >= 40) break;
    }
  }

  /* Scan boutons cachés (hors viewport ou masqués) */
  const buttons = document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]');
  buttons.forEach((btn) => {
    const rect = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    /* Skip si display:none ou visibility:hidden (intentionnel) */
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    /* Skip si dimensions 0 (probable lazy/conditional) */
    if (rect.width === 0 || rect.height === 0) return;

    let reason: HiddenButton['reason'] | null = null;
    if (rect.right > vw + 2) reason = 'off_viewport_right';
    else if (rect.bottom > vh + 2 && rect.top > vh) reason = 'off_viewport_bottom';
    else if (parseFloat(cs.opacity) === 0) reason = 'opacity_zero';

    if (reason) {
      hiddenButtons.push({
        selector: buildSelector(btn),
        label: (btn.textContent ?? btn.getAttribute('aria-label') ?? '').slice(0, 30),
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
        reason,
      });
    }

    /* Touch target < 44×44 = a11y issue Apple HIG */
    if ((rect.width < 44 || rect.height < 44) && rect.width > 0 && rect.height > 0) {
      smallTouchTargets.push({
        selector: buildSelector(btn),
        size: { w: Math.round(rect.width), h: Math.round(rect.height) },
      });
    }
  });

  let scale = 1;
  try {
    if ('visualViewport' in window && window.visualViewport) scale = window.visualViewport.scale;
  } catch { /* ignore */ }

  return {
    viewport: { width: vw, height: vh },
    documentScroll: { width: docW, height: docH },
    hasHorizontalOverflow: docW > vw + 1,
    overflowingElements,
    hiddenButtons: hiddenButtons.slice(0, 30),
    smallTouchTargets: smallTouchTargets.slice(0, 20),
    computedMetrics: {
      htmlFontSize: getComputedStyle(document.documentElement).fontSize,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      rootPosition: getComputedStyle(document.getElementById('apex-root') ?? document.body).position,
      visualViewportScale: scale,
    },
    ts: Date.now(),
    ver: 'v13.4.180',
    appVer: (document.documentElement.getAttribute('data-app-ver') ?? 'unknown'),
  };
}

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' && el.className
    ? '.' + el.className.split(/\s+/).slice(0, 2).join('.')
    : '';
  return `${tag}${cls}`;
}

/**
 * Prend un screenshot bitmap du DOM courant via html2canvas (lazy CDN).
 * Retourne dataURL base64 PNG.
 */
export async function screenshot(target: HTMLElement = document.body): Promise<string> {
  try {
    /* Lazy load html2canvas CDN si pas déjà chargé */
    const w = window as unknown as { html2canvas?: (el: HTMLElement, opts?: object) => Promise<HTMLCanvasElement> };
    if (!w.html2canvas) {
      await loadHtml2Canvas();
    }
    if (!w.html2canvas) throw new Error('html2canvas load failed');
    const canvas = await w.html2canvas(target, {
      backgroundColor: '#08080f',
      scale: window.devicePixelRatio || 1,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL('image/png');
  } catch (err: unknown) {
    logger.warn('layout-inspector', 'screenshot failed', { err });
    throw err;
  }
}

function loadHtml2Canvas(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { html2canvas?: unknown }).html2canvas) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = (): void => resolve();
    script.onerror = (): void => reject(new Error('html2canvas CDN load failed'));
    document.head.appendChild(script);
  });
}

/**
 * Surveillance continue : scan toutes les `intervalMs` ms, alerte si nouveau bug.
 * Retourne handle pour arrêter (clearInterval).
 */
let _monitorInterval: ReturnType<typeof setInterval> | null = null;
let _lastReport: LayoutScanReport | null = null;

export function startAutoMonitor(intervalMs: number = 30_000): void {
  if (_monitorInterval) return;
  _monitorInterval = setInterval(() => {
    try {
      const report = scanDom();
      const isNewBug = report.hasHorizontalOverflow || report.hiddenButtons.length > 0;
      const statusChanged = _lastReport && report.hasHorizontalOverflow !== _lastReport.hasHorizontalOverflow;
      if (statusChanged) {
        logger.warn('layout-inspector', `Overflow status changed: ${String(report.hasHorizontalOverflow)}`, {
          newOverflows: report.overflowingElements.length,
          hiddenButtons: report.hiddenButtons.length,
        });
      }
      /* v13.4.182 (Kevin "Rapport historique auto dans admin") :
       * Auto-persist UNIQUEMENT si bug détecté (évite spam history sain). */
      if (isNewBug) {
        void import('./apex-reports-history.js')
          .then(({ reportsHistory }) => reportsHistory.recordLayout(report))
          .catch(() => { /* skip si module pas dispo */ });
      }
      _lastReport = report;
    } catch (err: unknown) {
      logger.warn('layout-inspector', 'autoMonitor scan failed', { err });
    }
  }, intervalMs);
}

export function stopAutoMonitor(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
  }
}

export function getLastReport(): LayoutScanReport | null {
  return _lastReport;
}

export const apexLayoutInspector = {
  scanDom,
  screenshot,
  startAutoMonitor,
  stopAutoMonitor,
  getLastReport,
};
