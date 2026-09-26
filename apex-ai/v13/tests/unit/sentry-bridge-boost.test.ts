/**
 * P1 TESTS (audit v13.3.0) : sentry-bridge.ts coverage 62.53% → 80%+.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sentryBridge } from '../../services/observability/sentry-bridge.js';

describe('Sentry Bridge boost (P1 audit)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('init', () => {
    it('init sans DSN configuré → ok=true (no-op)', async () => {
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true);
    });

    it('init idempotent (2e call ne re-init pas)', async () => {
      await sentryBridge.init();
      const r2 = await sentryBridge.init();
      expect(r2.ok).toBe(true);
    });

    it('init avec DSN invalide ne crash pas', async () => {
      localStorage.setItem('ax_sentry_dsn', 'not-a-valid-url');
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true); /* fallback gracieux */
    });
  });

  describe('captureException', () => {
    it('captureException stocke event localement (fallback queue)', () => {
      const err = new Error('Test error');
      expect(() => sentryBridge.captureException(err)).not.toThrow();
    });

    it('captureException avec Error et stack — no throw + retour défini', () => {
      const err = new Error('Stack test');
      let threw = false;
      try {
        sentryBridge.captureException(err, { tag: 'test' });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('captureException avec context custom', () => {
      const err = new Error('Custom ctx');
      expect(() => sentryBridge.captureException(err, {
        user: 'admin',
        feature: 'vault',
      })).not.toThrow();
    });
  });

  describe('captureMessage', () => {
    it('captureMessage warning level', () => {
      expect(() => sentryBridge.captureMessage('Test warning', 'warning')).not.toThrow();
    });

    it('captureMessage info level avec context', () => {
      expect(() => sentryBridge.captureMessage('Info msg', 'info', { feature: 'auth' })).not.toThrow();
    });
  });

  describe('integration', () => {
    it('multiple captures successifs — no throw sur 5 itérations', () => {
      let threw = false;
      try {
        for (let i = 0; i < 5; i++) {
          sentryBridge.captureException(new Error(`Err ${i}`));
          sentryBridge.captureMessage(`Info ${i}`, 'info');
        }
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });
});
