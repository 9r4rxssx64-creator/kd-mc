/**
 * APEX v13.4.3 — iOS Simulator Preview service (Kevin 2026-05-09 — Shubham Skill #5)
 *
 * Pas un vrai simulateur (impossible PWA browser) : preview iframe wrapped avec
 * frame iPhone 15 Pro (393×852, DPR 3, safe-area-insets simulés via CSS).
 *
 * API :
 *  - previewURL(url): retourne HTML iframe wrapped avec frame iPhone
 *  - previewHTML(html): retourne HTML iframe avec srcdoc
 *  - openPreview(html): ouvre modal-sheet avec iframe (best-effort si modal dispo)
 *
 * Storage : `apex_v13_ios_simulator_history` (max 10).
 */

import { logger } from '../../core/logger.js';

const HISTORY_KEY = 'apex_v13_ios_simulator_history';
const HISTORY_MAX = 10;

export interface IOSSimulatorOptions {
  /** Modèle iPhone (defaults: iphone-15-pro) */
  model?: 'iphone-15-pro' | 'iphone-se' | 'iphone-14';
  /** Mode dark/light */
  scheme?: 'dark' | 'light';
}

const MODEL_DIMENSIONS: Record<NonNullable<IOSSimulatorOptions['model']>, { w: number; h: number }> = {
  'iphone-15-pro': { w: 393, h: 852 },
  'iphone-se': { w: 375, h: 667 },
  'iphone-14': { w: 390, h: 844 },
};

class IOSSimulatorService {
  /**
   * Construit HTML wrapper avec frame iPhone simulé autour d'une iframe URL.
   */
  previewURL(url: string, opts: IOSSimulatorOptions = {}): string {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('URL invalide (doit être http(s))');
    }
    return this.buildFrameHtml({ url }, opts);
  }

  /**
   * Construit HTML wrapper avec frame iPhone simulé autour d'une iframe srcdoc HTML.
   */
  previewHTML(html: string, opts: IOSSimulatorOptions = {}): string {
    if (!html) throw new Error('HTML vide');
    return this.buildFrameHtml({ srcdoc: html }, opts);
  }

  /**
   * Ouvre une preview dans modal-sheet (best-effort).
   */
  async openPreview(html: string, opts: IOSSimulatorOptions = {}): Promise<void> {
    const wrapper = this.previewHTML(html, opts);
    try {
      const { modalSheet } = await import('../../ui/modal-sheet.js');
      modalSheet.open({
        title: '📱 iOS Simulator Preview',
        content: wrapper,
        actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
      });
      this.persist({ html: html.slice(0, 500), at: Date.now() });
    } catch (err: unknown) {
      logger.warn('ios-simulator', 'modal not available', { err });
      throw new Error('Modal-sheet indispo — preview en context console seulement');
    }
  }

  history(): Array<{ html: string; at: number }> {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as Array<{ html: string; at: number }>;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private buildFrameHtml(src: { url?: string; srcdoc?: string }, opts: IOSSimulatorOptions): string {
    const model = opts.model ?? 'iphone-15-pro';
    const dims = MODEL_DIMENSIONS[model];
    const scheme = opts.scheme ?? 'dark';
    const escAttr = (s: string): string => s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const iframeAttrs = src.url
      ? `src="${escAttr(src.url)}"`
      : `srcdoc="${escAttr(src.srcdoc ?? '')}"`;

    return `
<div class="ax-ios-sim" style="display:flex;justify-content:center;align-items:center;padding:20px;background:linear-gradient(135deg,#1a1a2e,#0e0e1c)">
  <div style="position:relative;width:${dims.w + 16}px;height:${dims.h + 60}px;background:#0a0a0a;border-radius:48px;padding:8px;box-shadow:0 30px 60px rgba(0,0,0,0.6),inset 0 1px 2px rgba(255,255,255,0.1);border:2px solid #2a2a2a">
    <div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);width:120px;height:30px;background:#000;border-radius:20px;z-index:10" aria-hidden="true"></div>
    <div style="position:relative;width:${dims.w}px;height:${dims.h}px;background:${scheme === 'dark' ? '#000' : '#fff'};border-radius:42px;overflow:hidden;margin:30px 0">
      <div style="position:absolute;top:0;left:0;right:0;height:env(safe-area-inset-top,44px);min-height:44px;background:${scheme === 'dark' ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)'};display:flex;align-items:center;justify-content:space-between;padding:0 24px;z-index:5;font-family:-apple-system,BlinkMacSystemFont,system-ui;font-size:14px;font-weight:600;color:${scheme === 'dark' ? '#fff' : '#000'}">
        <span>9:41</span>
        <span aria-hidden="true">📶 📡 🔋</span>
      </div>
      <iframe ${iframeAttrs} sandbox="allow-scripts allow-forms allow-same-origin"
        style="width:100%;height:100%;border:0;display:block;background:${scheme === 'dark' ? '#000' : '#fff'}"
        title="iOS Simulator preview"></iframe>
      <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;background:${scheme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'};border-radius:3px;z-index:5" aria-hidden="true"></div>
    </div>
  </div>
</div>
<p style="text-align:center;color:rgba(255,255,255,0.55);font-size:12px;margin-top:14px;font-family:system-ui">
  Simulateur visuel iPhone ${model.replace('iphone-', '').toUpperCase()} (${dims.w}×${dims.h}). Pas un vrai runtime iOS.
</p>`;
  }

  private persist(entry: { html: string; at: number }): void {
    try {
      const hist = this.history();
      hist.unshift(entry);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('ios-simulator', 'persist failed', { err });
    }
  }
}

export const iosSimulator = new IOSSimulatorService();
