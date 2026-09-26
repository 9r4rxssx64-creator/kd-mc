/**
 * APEX v13.3.58 — Tests Pushcut bridge (Kevin 2026-05-08).
 *
 * Couvre :
 * - setWebhookUrl rejette URL invalide
 * - setWebhookUrl persiste valide URL HTTPS pushcut.io
 * - setApiToken persiste
 * - trigger sans webhook retourne reason='no_webhook'
 * - trigger avec action invalide retourne 'invalid_action'
 * - trigger respect rate limit (1/2s)
 * - trigger réussi POST + audit log
 * - trigger erreur réseau retourne 'network'
 * - trigger erreur HTTP retourne 'http_error' + statusCode
 * - helpers scanBluetooth / readNFC / controlHome / speak
 * - status retourne config + count
 * - reset clear vault + storage
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pushcutBridge } from '../../services/integrations/pushcut-bridge.js';

const VALID_WEBHOOK = 'https://api.pushcut.io/v1/notifications/abc123';
const STORAGE_KEYS = [
  'ax_pushcut_webhook_url',
  'ax_pushcut_api_token',
  'ax_pushcut_last_trigger',
  'ax_pushcut_trigger_log_24h',
];

describe('pushcut-bridge — webhook trigger to iOS', () => {
  beforeEach(async () => {
    for (const k of STORAGE_KEYS) localStorage.removeItem(k);
    await pushcutBridge.reset();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await pushcutBridge.reset();
    vi.restoreAllMocks();
  });

  describe('setWebhookUrl()', () => {
    it('accepte URL pushcut.io HTTPS valide', async () => {
      const r = await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      expect(r.ok).toBe(true);
    });

    it('rejette URL HTTP non-HTTPS', async () => {
      const r = await pushcutBridge.setWebhookUrl('http://api.pushcut.io/v1/notifications/abc');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('invalide');
    });

    it('rejette URL hors pushcut.io', async () => {
      const r = await pushcutBridge.setWebhookUrl('https://example.com/webhook');
      expect(r.ok).toBe(false);
    });

    it('rejette URL malformée', async () => {
      const r = await pushcutBridge.setWebhookUrl('not-a-url');
      expect(r.ok).toBe(false);
    });

    it('rejette URL vide', async () => {
      const r = await pushcutBridge.setWebhookUrl('');
      expect(r.ok).toBe(false);
    });
  });

  describe('setApiToken()', () => {
    it('accepte token valide (>10 chars)', async () => {
      const r = await pushcutBridge.setApiToken('pcut_abcdef123456');
      expect(r.ok).toBe(true);
    });

    it('rejette token trop court', async () => {
      const r = await pushcutBridge.setApiToken('short');
      expect(r.ok).toBe(false);
    });
  });

  describe('trigger()', () => {
    it('rejette si webhook non configuré', async () => {
      const r = await pushcutBridge.trigger({ action: 'bt_scan' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('no_webhook');
    });

    it('rejette action invalide', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      const r = await pushcutBridge.trigger({ action: 'invalid_xx' as never });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('invalid_action');
    });

    it('réussit POST 200 et retourne delivered=true', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const r = await pushcutBridge.trigger({ action: 'bt_scan', title: 'Test' });
      expect(r.ok).toBe(true);
      expect(r.delivered).toBe(true);
      expect(r.statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        VALID_WEBHOOK,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('retourne http_error sur 500', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('error', { status: 500 }),
      );
      const r = await pushcutBridge.trigger({ action: 'bt_scan' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('http_error');
      expect(r.statusCode).toBe(500);
    });

    it('retourne network sur fetch fail', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
      const r = await pushcutBridge.trigger({ action: 'nfc_read' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('network');
    });

    it('respecte rate limit 2s', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const r1 = await pushcutBridge.trigger({ action: 'bt_scan' });
      expect(r1.ok).toBe(true);
      const r2 = await pushcutBridge.trigger({ action: 'bt_scan' });
      expect(r2.ok).toBe(false);
      expect(r2.reason).toBe('rate_limited');
    });

    it('inclut actions array dans payload (max 3)', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      await pushcutBridge.trigger({
        action: 'control_home',
        actions: [
          { name: 'On', shortcut: 'apex_lights_on' },
          { name: 'Off', shortcut: 'apex_lights_off' },
        ],
      });
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.actions).toHaveLength(2);
      expect(body.actions[0].name).toBe('On');
    });
  });

  describe('helpers ergonomiques', () => {
    beforeEach(async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
    });

    it('scanBluetooth déclenche action bt_scan', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const r = await pushcutBridge.scanBluetooth();
      expect(r.ok).toBe(true);
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.input).toBe('bt_scan');
    });

    it('readNFC déclenche action nfc_read', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const r = await pushcutBridge.readNFC();
      expect(r.ok).toBe(true);
    });

    it('controlHome passe scene + action en input JSON', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      await pushcutBridge.controlHome('salon', 'on');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const input = JSON.parse(body.input);
      expect(input.scene).toBe('salon');
      expect(input.action).toBe('on');
    });

    it('speak passe texte en input', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      await pushcutBridge.speak('Bonjour Kevin');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.input).toBe('Bonjour Kevin');
    });

    it('addCalendarEvent passe title + start en JSON', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      await pushcutBridge.addCalendarEvent('Réunion', '2026-05-15T10:00:00Z');
      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const input = JSON.parse(body.input);
      expect(input.title).toBe('Réunion');
    });
  });

  describe('status()', () => {
    it('retourne configured=false sans webhook', async () => {
      const s = await pushcutBridge.status();
      expect(s.configured).toBe(false);
      expect(s.triggerCount24h).toBe(0);
    });

    it('retourne configured=true + host avec webhook', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      const s = await pushcutBridge.status();
      expect(s.configured).toBe(true);
      expect(s.webhookHost).toBe('api.pushcut.io');
    });

    it('hasApiToken=true si token configuré', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      await pushcutBridge.setApiToken('pcut_secret_token_abc');
      const s = await pushcutBridge.status();
      expect(s.hasApiToken).toBe(true);
    });
  });

  describe('reset()', () => {
    it('clear toute la config', async () => {
      await pushcutBridge.setWebhookUrl(VALID_WEBHOOK);
      await pushcutBridge.setApiToken('pcut_secret_token_abc');
      await pushcutBridge.reset();
      const s = await pushcutBridge.status();
      expect(s.configured).toBe(false);
      expect(s.hasApiToken).toBe(false);
    });
  });
});
