/**
 * Tests telegram-notifier v13.4.140 (Kevin "100/100 réel").
 *
 * Module : services/telegram-notifier.ts (155 stmts, était 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { telegramNotifier } from '../../services/integrations/telegram-notifier.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/integrations/push-notifications.js', () => ({
  pushNotifications: {
    send: vi.fn().mockResolvedValue(false),
  },
}));

describe('telegram-notifier (v13.4.140 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('notify (basic flow)', () => {
    it('retourne entry log structurée', async () => {
      const r = await telegramNotifier.notify({
        title: 'Test alert',
        body: 'Test body',
        priority: 'normal',
      });
      expect(r.ts).toBeTypeOf('number');
      expect(r.title).toBe('Test alert');
      expect(r.body).toBe('Test body');
      expect(r.priority).toBe('normal');
      expect(r.delivered).toBeDefined();
    });

    it('persiste log dans localStorage', async () => {
      await telegramNotifier.notify({ title: 'Persistent test', body: 'b' });
      const raw = localStorage.getItem('apex_v13_kevin_notifications_log');
      expect(raw).toBeTruthy();
      const arr = JSON.parse(raw ?? '[]');
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    });

    it('dedup notif identique en 6h', async () => {
      const r1 = await telegramNotifier.notify({ title: 'Dup test unique', body: 'b' });
      const r2 = await telegramNotifier.notify({ title: 'Dup test unique', body: 'b' });
      expect(r1.delivered.logged).toBe(true);
      expect(r2.delivered.logged).toBe(false);
    });

    it('critical passe toujours sans dedup', async () => {
      const r1 = await telegramNotifier.notify({ title: 'Crit', body: 'b', priority: 'critical' });
      const r2 = await telegramNotifier.notify({ title: 'Crit', body: 'b', priority: 'critical' });
      expect(r1.delivered.logged).toBe(true);
      expect(r2.delivered.logged).toBe(true);
    });

    it('utilise priority normal par défaut', async () => {
      const r = await telegramNotifier.notify({ title: 'No prio', body: 'b' });
      expect(r.priority).toBe('normal');
    });

    it('tronque title à 200 chars', async () => {
      const longTitle = 'x'.repeat(500);
      const r = await telegramNotifier.notify({ title: longTitle, body: 'b' });
      expect(r.title.length).toBe(200);
    });

    it('tronque body à 2000 chars', async () => {
      const longBody = 'y'.repeat(5000);
      const r = await telegramNotifier.notify({ title: 't', body: longBody });
      expect(r.body.length).toBe(2000);
    });
  });

  describe('getRecent', () => {
    it('retourne vide si pas de log', () => {
      expect(telegramNotifier.getRecent()).toEqual([]);
    });

    it('retourne entries en ordre inverse', async () => {
      await telegramNotifier.notify({ title: 'A', body: 'a' });
      await telegramNotifier.notify({ title: 'B', body: 'b' });
      const recent = telegramNotifier.getRecent(10);
      expect(recent.length).toBeGreaterThanOrEqual(2);
      /* dernière est en premier */
      expect(recent[0]?.title).toBe('B');
    });

    it('respecte limite', async () => {
      for (let i = 0; i < 5; i++) {
        await telegramNotifier.notify({ title: `M${i}`, body: 'b', priority: 'critical' });
      }
      expect(telegramNotifier.getRecent(2).length).toBeLessThanOrEqual(2);
    });

    it('gère localStorage corrompu', () => {
      localStorage.setItem('apex_v13_kevin_notifications_log', '{invalid');
      expect(telegramNotifier.getRecent()).toEqual([]);
    });
  });

  describe('sendTelegram (via worker)', () => {
    it('appelle worker URL si configuré', async () => {
      localStorage.setItem('apex_v13_telegram_worker_url', 'https://example.workers.dev/notify');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const r = await telegramNotifier.notify({ title: 'Worker test', body: 'b' });
      expect(fetchSpy).toHaveBeenCalled();
      expect(r.delivered.telegram).toBe(true);
      fetchSpy.mockRestore();
    });

    it('fallback direct si worker absent + bot configuré', async () => {
      localStorage.setItem('apex_v13_telegram_bot_token', 'TEST_TOKEN_123');
      localStorage.setItem('apex_v13_telegram_chat_id', '12345');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const r = await telegramNotifier.notify({ title: 'Direct test', body: 'b' });
      expect(fetchSpy).toHaveBeenCalled();
      const call = fetchSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('api.telegram.org');
      expect(r.delivered.telegram).toBe(true);
      fetchSpy.mockRestore();
    });

    it('retourne delivered.telegram=false si rien configuré', async () => {
      const r = await telegramNotifier.notify({ title: 'No config', body: 'b' });
      expect(r.delivered.telegram).toBe(false);
    });
  });

  describe('testConfig', () => {
    it('retourne ok=false si aucun canal délivré', async () => {
      const r = await telegramNotifier.testConfig();
      expect(r.ok).toBe(false);
      expect(r.msg).toBeTypeOf('string');
    });

    it('retourne ok=true si telegram délivré', async () => {
      localStorage.setItem('apex_v13_telegram_worker_url', 'https://example.workers.dev/notify');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const r = await telegramNotifier.testConfig();
      expect(r.ok).toBe(true);
      expect(r.msg).toContain('telegram');
      fetchSpy.mockRestore();
    });
  });

  describe('CTA URL', () => {
    it('inclut CTA URL dans notification', async () => {
      localStorage.setItem('apex_v13_telegram_worker_url', 'https://example.workers.dev/notify');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      await telegramNotifier.notify({
        title: 'CTA test',
        body: 'b',
        ctaUrl: 'https://example.com/action',
      });
      const body = fetchSpy.mock.calls[0]?.[1]?.body as string;
      expect(body).toContain('example.com/action');
      fetchSpy.mockRestore();
    });
  });
});
