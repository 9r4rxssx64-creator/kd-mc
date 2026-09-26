/**
 * Tests apex-zoom-inspector v13.4.140 (Kevin "100/100 réel").
 *
 * Module : services/apex-zoom-inspector.ts (114 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apexZoomInspector } from '../../services/admin/apex-zoom-inspector.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('apex-zoom-inspector (v13.4.140 coverage)', () => {
  beforeEach(() => {
    /* cleanup DOM avant chaque test */
    document.body.innerHTML = '';
    if (apexZoomInspector.isVisible()) {
      apexZoomInspector.hide();
    }
  });

  afterEach(() => {
    if (apexZoomInspector.isVisible()) {
      apexZoomInspector.hide();
    }
    document.body.innerHTML = '';
  });

  describe('API publique', () => {
    it('expose show/hide/isVisible/snapshot', () => {
      expect(apexZoomInspector.show).toBeTypeOf('function');
      expect(apexZoomInspector.hide).toBeTypeOf('function');
      expect(apexZoomInspector.isVisible).toBeTypeOf('function');
      expect(apexZoomInspector.snapshot).toBeTypeOf('function');
    });
  });

  describe('show/hide', () => {
    it('isVisible=false initialement', () => {
      expect(apexZoomInspector.isVisible()).toBe(false);
    });

    it('show() rend panel visible', () => {
      apexZoomInspector.show();
      expect(apexZoomInspector.isVisible()).toBe(true);
      const panel = document.getElementById('apex-zoom-inspector-panel');
      expect(panel).toBeTruthy();
    });

    it('hide() retire panel', () => {
      apexZoomInspector.show();
      expect(apexZoomInspector.isVisible()).toBe(true);
      apexZoomInspector.hide();
      expect(apexZoomInspector.isVisible()).toBe(false);
      expect(document.getElementById('apex-zoom-inspector-panel')).toBeNull();
    });

    it('show() est idempotent', () => {
      apexZoomInspector.show();
      apexZoomInspector.show(); /* 2e appel ne casse rien */
      expect(document.querySelectorAll('#apex-zoom-inspector-panel').length).toBe(1);
    });

    it('hide() avant show() ne crash pas', () => {
      expect(() => apexZoomInspector.hide()).not.toThrow();
    });

    it('panel contient bouton fermer', () => {
      apexZoomInspector.show();
      const closeBtn = document.getElementById('apex-zoom-inspector-close');
      expect(closeBtn).toBeTruthy();
    });
  });

  describe('snapshot', () => {
    it('retourne objet metrics complet', () => {
      const m = apexZoomInspector.snapshot();
      expect(m).toBeDefined();
      expect(m.visual_viewport_scale).toBeTypeOf('number');
      expect(m.width_ratio).toBeTypeOf('number');
      expect(m.inputs_below_16px).toBeTypeOf('number');
      expect(m.scaled_elements).toBeTypeOf('number');
      expect(m.touch_action_html).toBeTypeOf('string');
      expect(m.touch_action_body).toBeTypeOf('string');
      expect(m.viewport_meta).toBeTypeOf('string');
      expect(m.text_size_adjust).toBeTypeOf('string');
      expect(m.ts).toBeTypeOf('number');
    });

    it('détecte inputs avec font-size < 16px', () => {
      document.body.innerHTML = `
        <input type="text" style="font-size:12px" />
        <input type="number" style="font-size:14px" />
        <input type="email" style="font-size:16px" />
        <textarea style="font-size:18px"></textarea>
      `;
      const m = apexZoomInspector.snapshot();
      /* 2 inputs <16 (12 + 14), 16 et 18 ne comptent pas */
      expect(m.inputs_below_16px).toBeGreaterThanOrEqual(2);
    });

    it('lit viewport meta si présent', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', 'width=device-width,initial-scale=1.0');
      document.head.appendChild(meta);
      const m = apexZoomInspector.snapshot();
      expect(m.viewport_meta).toContain('width=device-width');
      meta.remove();
    });

    it('retourne "(absent)" si viewport meta absent', () => {
      document.querySelectorAll('meta[name="viewport"]').forEach((e) => e.remove());
      const m = apexZoomInspector.snapshot();
      expect(m.viewport_meta).toBe('(absent)');
    });
  });

  describe('update live (interval)', () => {
    it('panel update sans crash après show', async () => {
      vi.useFakeTimers();
      apexZoomInspector.show();
      vi.advanceTimersByTime(600);
      const panel = document.getElementById('apex-zoom-inspector-panel');
      expect(panel?.innerHTML).toContain('ZOOM INSPECTOR LIVE');
      vi.useRealTimers();
    });
  });
});
