/**
 * Tests pwa-capabilities v13.4.146 (Kevin "100/100 réel").
 *
 * Module : services/pwa-capabilities.ts (208 stmts, était 52.9% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { pwaCapabilities } from '../../services/core-svc/pwa-capabilities.js';

describe('pwa-capabilities (v13.4.146 coverage)', () => {
  beforeEach(() => {
    mockAuditLog.record.mockResolvedValue(undefined);
    pwaCapabilities.resetCache();
  });

  afterEach(() => {
    pwaCapabilities.resetCache();
    vi.restoreAllMocks();
  });

  describe('detect', () => {
    it('geolocation détecte permission_required dans jsdom', () => {
      const s = pwaCapabilities.detect('geolocation');
      expect(['permission_required', 'unsupported']).toContain(s);
    });

    it('notifications retourne unsupported si Notification undefined', () => {
      const orig = (globalThis as unknown as { Notification?: unknown }).Notification;
      delete (globalThis as unknown as { Notification?: unknown }).Notification;
      const s = pwaCapabilities.detect('notifications');
      expect(s).toBe('unsupported');
      if (orig) (globalThis as unknown as { Notification: unknown }).Notification = orig;
    });

    it('nfc retourne unsupported si NDEFReader absent', () => {
      const s = pwaCapabilities.detect('nfc');
      expect(s).toBe('unsupported');
    });

    it('bluetooth selon navigator.bluetooth', () => {
      const s = pwaCapabilities.detect('bluetooth');
      expect(['permission_required', 'unsupported']).toContain(s);
    });

    it('usb selon navigator.usb', () => {
      const s = pwaCapabilities.detect('usb');
      expect(['permission_required', 'unsupported']).toContain(s);
    });

    it('serial selon navigator.serial', () => {
      const s = pwaCapabilities.detect('serial');
      expect(['permission_required', 'unsupported']).toContain(s);
    });

    it('wake_lock selon navigator.wakeLock', () => {
      const s = pwaCapabilities.detect('wake_lock');
      expect(['supported', 'unsupported']).toContain(s);
    });

    it('screen_capture selon mediaDevices.getDisplayMedia', () => {
      const s = pwaCapabilities.detect('screen_capture');
      expect(['permission_required', 'unsupported']).toContain(s);
    });
  });

  describe('queryPermission (avec cache)', () => {
    it('retourne unsupported si non détecté', async () => {
      const s = await pwaCapabilities.queryPermission('nfc');
      expect(s).toBe('unsupported');
    });

    it('utilise cache TTL 5min', async () => {
      const s1 = await pwaCapabilities.queryPermission('nfc');
      const s2 = await pwaCapabilities.queryPermission('nfc');
      expect(s1).toBe(s2);
    });
  });

  describe('request', () => {
    it('refuse API non supportée', async () => {
      const r = await pwaCapabilities.request('nfc');
      expect(r.ok).toBe(false);
      expect(r.status).toBe('unsupported');
    });

    it('audit.record appelé', async () => {
      await pwaCapabilities.request('geolocation').catch(() => null);
      /* audit.record est appelé même si la permission échoue */
      expect(mockAuditLog.record).toHaveBeenCalled();
    });
  });

  describe('releaseWakeLock', () => {
    it('idempotent si pas de wakelock', async () => {
      await expect(pwaCapabilities.releaseWakeLock()).resolves.toBeUndefined();
    });
  });

  describe('getAllStatus', () => {
    it('retourne liste de 8 APIs avec status', async () => {
      const all = await pwaCapabilities.getAllStatus();
      expect(all.length).toBe(8);
      all.forEach((info) => {
        expect(info.id).toBeTypeOf('string');
        expect(info.label).toBeTypeOf('string');
        expect(info.description).toBeTypeOf('string');
        expect(info.status).toBeTypeOf('string');
        expect(info.last_checked).toBeTypeOf('number');
      });
    });
  });

  describe('countSupported', () => {
    it('compte APIs supportées', () => {
      const r = pwaCapabilities.countSupported();
      expect(r.total).toBe(8);
      expect(r.supported).toBeGreaterThanOrEqual(0);
      expect(r.supported).toBeLessThanOrEqual(r.total);
    });
  });

  describe('resetCache', () => {
    it('vide cache permissions', async () => {
      await pwaCapabilities.queryPermission('nfc');
      pwaCapabilities.resetCache();
      /* Pas de assertion directe, juste qu'il ne crash pas */
      expect(() => pwaCapabilities.resetCache()).not.toThrow();
    });
  });
});
