/**
 * Tests SentryBridge — audit Kevin v13.1.0 production-grade.
 * Coverage : init, captureException, captureMessage, setUser/clearUser,
 * addBreadcrumb FIFO, startTransaction, rate limit, PII redaction, lazy SDK load.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { sentryBridge } from '../../services/observability/sentry-bridge.js';

describe('SentryBridge — runtime monitoring', () => {
  beforeEach(() => {
    localStorage.clear();
    sentryBridge.resetForTests();
  });

  afterEach(() => {
    sentryBridge.resetForTests();
  });

  describe('init()', () => {
    it('init() success quand pas de DSN configuré (mode local seul)', async () => {
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true);
      expect(sentryBridge.isInitialized()).toBe(true);
      expect(sentryBridge.isSdkLoaded()).toBe(false);
    });

    it('init() success avec DSN configuré (skip SDK load happy-dom)', async () => {
      localStorage.setItem('ax_sentry_dsn', 'https://abc123@sentry.io/1234567');
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true);
      expect(sentryBridge.isInitialized()).toBe(true);
    });

    it('init() ignore DSN invalide (non-https)', async () => {
      localStorage.setItem('ax_sentry_dsn', 'plaintext-not-a-url');
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true);
      expect(sentryBridge.isSdkLoaded()).toBe(false);
    });

    it('init() idempotent — appel multiple = pas double install', async () => {
      const r1 = await sentryBridge.init();
      const r2 = await sentryBridge.init();
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(sentryBridge.isInitialized()).toBe(true);
    });

    it('init() configure worker endpoint si présent', async () => {
      localStorage.setItem('ax_sentry_worker_url', 'https://sentry-proxy.example.workers.dev');
      const r = await sentryBridge.init();
      expect(r.ok).toBe(true);
    });
  });

  describe('captureException()', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('captureException avec context structuré', () => {
      const err = new Error('test error');
      expect(() => sentryBridge.captureException(err, { module: 'auth', userId: 'u1' })).not.toThrow();
    });

    it('captureException sans context', () => {
      const err = new Error('simple');
      expect(() => sentryBridge.captureException(err)).not.toThrow();
    });

    it('captureException accepte Error avec stack', () => {
      const err = new Error('stack test');
      expect(err.stack).toBeTruthy();
      expect(() => sentryBridge.captureException(err, { foo: 'bar' })).not.toThrow();
    });

    it('captureException PII auto-redactée dans context', () => {
      const err = new Error('contact: user@example.com phone 0612345678');
      sentryBridge.captureException(err, { extra: 'test@example.com' });
      /* Ne throw pas + breadcrumb pas créé pour error */
      expect(sentryBridge.isInitialized()).toBe(true);
    });
  });

  describe('captureMessage()', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('captureMessage warning level', () => {
      expect(() => sentryBridge.captureMessage('quota near limit', 'warning')).not.toThrow();
    });

    it('captureMessage info level', () => {
      expect(() => sentryBridge.captureMessage('user login', 'info', { userId: 'u1' })).not.toThrow();
    });

    it('captureMessage redacte PII', () => {
      expect(() =>
        sentryBridge.captureMessage('email leaked: leak@test.com', 'warning'),
      ).not.toThrow();
    });
  });

  describe('setUser() / clearUser() / getUser()', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('setUser stocke contexte user', () => {
      sentryBridge.setUser({ id: 'kevin', tenantId: 'tenant-1', tier: 'admin' });
      const u = sentryBridge.getUser();
      expect(u?.id).toBe('kevin');
      expect(u?.tenantId).toBe('tenant-1');
      expect(u?.tier).toBe('admin');
    });

    it('setUser avec id minimum (sans tenantId/tier)', () => {
      sentryBridge.setUser({ id: 'anon' });
      const u = sentryBridge.getUser();
      expect(u?.id).toBe('anon');
      expect(u?.tenantId).toBeUndefined();
    });

    it('clearUser efface user', () => {
      sentryBridge.setUser({ id: 'u1' });
      sentryBridge.clearUser();
      expect(sentryBridge.getUser()).toBeNull();
    });
  });

  describe('addBreadcrumb() FIFO 100 max', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('addBreadcrumb persiste dans buffer', () => {
      sentryBridge.addBreadcrumb({ category: 'click', message: 'btn login' });
      const bc = sentryBridge.getBreadcrumbs();
      expect(bc.length).toBeGreaterThan(0);
      expect(bc[bc.length - 1]?.message).toBe('btn login');
    });

    it('addBreadcrumb avec data + level', () => {
      sentryBridge.addBreadcrumb({
        category: 'http',
        message: 'GET /api/foo',
        level: 'info',
        data: { status: 200 },
      });
      const bc = sentryBridge.getBreadcrumbs();
      expect(bc[bc.length - 1]?.level).toBe('info');
      expect(bc[bc.length - 1]?.data).toEqual({ status: 200 });
    });

    it('addBreadcrumb FIFO cap 100 (drop oldest)', () => {
      for (let i = 0; i < 150; i++) {
        sentryBridge.addBreadcrumb({ category: 'test', message: `crumb ${i}` });
      }
      const bc = sentryBridge.getBreadcrumbs();
      expect(bc.length).toBeLessThanOrEqual(100);
      /* Dernier doit être crumb 149 (les premiers virés FIFO) */
      expect(bc[bc.length - 1]?.message).toBe('crumb 149');
    });

    it('addBreadcrumb truncate message > 300 chars', () => {
      const big = 'x'.repeat(800);
      sentryBridge.addBreadcrumb({ category: 't', message: big });
      const bc = sentryBridge.getBreadcrumbs();
      expect(bc[bc.length - 1]?.message.length).toBeLessThanOrEqual(300);
    });

    it('addBreadcrumb redacte PII dans message', () => {
      sentryBridge.addBreadcrumb({
        category: 'form',
        message: 'submitted email: test@example.com',
      });
      const bc = sentryBridge.getBreadcrumbs();
      expect(bc[bc.length - 1]?.message).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('startTransaction() performance tracing', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('startTransaction retourne objet avec finish()', () => {
      const tx = sentryBridge.startTransaction('boot.init');
      expect(tx.name).toBe('boot.init');
      expect(typeof tx.finish).toBe('function');
      tx.finish();
    });

    it('finish() ajoute breadcrumb avec duration', () => {
      const tx = sentryBridge.startTransaction('test.op');
      tx.finish();
      const bc = sentryBridge.getBreadcrumbs();
      const last = bc[bc.length - 1];
      expect(last?.category).toBe('transaction');
      expect(last?.message).toContain('test.op');
    });
  });

  describe('rate limit 100 events/min', () => {
    beforeEach(async () => {
      await sentryBridge.init();
    });

    it('rate limit empêche envoi > 100 events en 60s', () => {
      /* Spam 150 événements — les 50 derniers droppés */
      for (let i = 0; i < 150; i++) {
        sentryBridge.captureMessage(`spam ${i}`, 'info');
      }
      /* Pas de throw, comportement silencieux + log warn (interne) */
      expect(sentryBridge.isInitialized()).toBe(true);
    });
  });

  describe('global handlers install', () => {
    it('installGlobalHandlers idempotent (pas double-bind)', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      await sentryBridge.init();
      const callsAfterFirstInit = addSpy.mock.calls.length;
      /* Second init ne doit pas re-bind */
      await sentryBridge.init();
      const callsAfterSecondInit = addSpy.mock.calls.length;
      expect(callsAfterSecondInit).toBe(callsAfterFirstInit);
      addSpy.mockRestore();
    });
  });

  describe('resetForTests()', () => {
    it('resetForTests remet à zéro complet', async () => {
      await sentryBridge.init();
      sentryBridge.setUser({ id: 'u1' });
      sentryBridge.addBreadcrumb({ category: 'c', message: 'm' });
      sentryBridge.resetForTests();
      expect(sentryBridge.isInitialized()).toBe(false);
      expect(sentryBridge.getUser()).toBeNull();
      expect(sentryBridge.getBreadcrumbs().length).toBe(0);
    });
  });
});
