/**
 * Tests RÉELS ui/haptic.ts (path A premier composant UI premium).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { haptic } from '../../ui/haptic.js';

describe('UI Haptic feedback (Jet 8 path A)', () => {
  let vibrateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    haptic.setEnabled(true);
    /* Mock navigator.vibrate (happy-dom n'a pas par défaut) */
    if (!navigator.vibrate) {
      Object.defineProperty(navigator, 'vibrate', {
        value: () => true,
        writable: true,
        configurable: true,
      });
    }
    vibrateSpy = vi.spyOn(navigator, 'vibrate').mockImplementation(() => true);
  });

  describe('isAvailable + setEnabled + isEnabled (P0 audit UX)', () => {
    it('isAvailable true si navigator.vibrate dispo', () => {
      expect(haptic.isAvailable()).toBe(true);
    });

    it('setEnabled(false) skip vibrate', () => {
      haptic.setEnabled(false);
      haptic.tap();
      expect(vibrateSpy).not.toHaveBeenCalled();
    });

    it('setEnabled(true) re-active', () => {
      haptic.setEnabled(false);
      haptic.setEnabled(true);
      haptic.tap();
      expect(vibrateSpy).toHaveBeenCalled();
    });

    it('isEnabled() retourne état courant (getter public)', () => {
      haptic.setEnabled(true);
      expect(haptic.isEnabled()).toBe(true);
      haptic.setEnabled(false);
      expect(haptic.isEnabled()).toBe(false);
      haptic.setEnabled(true);
    });
  });

  describe('Patterns', () => {
    it('tap() → vibrate 10ms', () => {
      haptic.tap();
      expect(vibrateSpy).toHaveBeenCalledWith(10);
    });

    it('selection() → vibrate 5ms', () => {
      haptic.selection();
      expect(vibrateSpy).toHaveBeenCalledWith(5);
    });

    it('medium() → vibrate 25ms', () => {
      haptic.medium();
      expect(vibrateSpy).toHaveBeenCalledWith(25);
    });

    it('heavy() → vibrate 50ms', () => {
      haptic.heavy();
      expect(vibrateSpy).toHaveBeenCalledWith(50);
    });

    it('success() → pattern array [10,50,20]', () => {
      haptic.success();
      expect(vibrateSpy).toHaveBeenCalledWith([10, 50, 20]);
    });

    it('warning() → pattern array [30,80,30]', () => {
      haptic.warning();
      expect(vibrateSpy).toHaveBeenCalledWith([30, 80, 30]);
    });

    it('error() → pattern array [50,100,50,100,50]', () => {
      haptic.error();
      expect(vibrateSpy).toHaveBeenCalledWith([50, 100, 50, 100, 50]);
    });
  });

  describe('Robustness', () => {
    it('vibrate throw → swallow silencieusement (no crash app)', () => {
      vibrateSpy.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      let threw = false;
      try {
        haptic.tap();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('navigator.vibrate undefined → isAvailable false + no crash', () => {
      const originalVibrate = navigator.vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(haptic.isAvailable()).toBe(false);
      let threw = false;
      try {
        haptic.tap();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      Object.defineProperty(navigator, 'vibrate', {
        value: originalVibrate,
        writable: true,
        configurable: true,
      });
    });
  });
});
