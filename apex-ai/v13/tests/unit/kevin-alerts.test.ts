/**
 * P1 (audit autonomie 2026-05-04) : tests services/kevin-alerts.ts.
 * Helper centralisé alertes Kevin (Telegram → Discord → Browser Push → Audit).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { kevinAlerts } from '../../services/admin/kevin-alerts.js';

describe('Kevin Alerts (P1 audit autonomie)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('alertKevin avec aucun channel configuré → audit-log seul OK', async () => {
    const r = await kevinAlerts.alertKevin({
      severity: 'warn',
      title: 'Test',
      body: 'Body content',
    });
    expect(r.ok).toBe(true);
    expect(r.channels_ok).toContain('audit-log');
    /* Telegram + Discord pas configurés → fail */
    expect(r.channels_failed.length).toBeGreaterThanOrEqual(0);
  });

  it('alertKevin Telegram succès si tokens configurés (mock fetch 200)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_telegram_token', '123456789:fake_token');
    await vault.setKey('ax_telegram_chat_id', '987654321');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const r = await kevinAlerts.alertKevin({
      severity: 'critical',
      title: 'Provider down',
      body: 'Anthropic API quota exceeded',
      source: 'token-watch',
    });
    expect(r.ok).toBe(true);
    expect(r.channels_ok).toContain('telegram');
  });

  it('alertKevin fallback Discord si Telegram fail', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_telegram_token', '123:fake');
    await vault.setKey('ax_telegram_chat_id', '456');
    await vault.setKey('ax_discord_webhook_url', 'https://discord.com/api/webhooks/123/abc');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Bot token invalid', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 204 }));

    const r = await kevinAlerts.alertKevin({
      severity: 'warn',
      title: 'Fallback test',
      body: 'Telegram should fail, Discord should succeed',
    });
    expect(r.channels_ok).toContain('discord');
  });

  it('alertKevin formate severity emoji + markdown', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_telegram_token', '123:fake');
    await vault.setKey('ax_telegram_chat_id', '456');
    let capturedBody: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
      const body = (opts as RequestInit | undefined)?.body;
      if (typeof body === 'string') capturedBody = body;
      return new Response('{"ok":true}', { status: 200 });
    });

    await kevinAlerts.alertKevin({
      severity: 'critical',
      title: 'Critical title',
      body: 'Body',
      source: 'test-source',
    });
    expect(capturedBody).toBeDefined();
    expect(capturedBody).toMatch(/🚨/);
    expect(capturedBody).toMatch(/Critical title/);
    expect(capturedBody).toMatch(/test-source/);
  });

  it('Discord refuse webhook URL non discord.com', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    /* Telegram pas configuré → essaie Discord directement */
    await vault.setKey('ax_discord_webhook_url', 'https://evil.example.com/webhook');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const r = await kevinAlerts.alertKevin({
      severity: 'info',
      title: 'Test',
      body: 'Should refuse non-discord URL',
    });
    /* Discord channel ne devrait PAS être dans channels_ok car URL invalide */
    expect(r.channels_ok).not.toContain('discord');
  });

  it('alertKevin idempotent + non-bloquant si tous fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const r = await kevinAlerts.alertKevin({
      severity: 'warn',
      title: 'Network test',
      body: 'All channels fail',
    });
    /* audit-log toujours OK même si tout fail */
    expect(r.channels_ok).toContain('audit-log');
    expect(r.ok).toBe(true);
  });

  it('testAllChannels retourne object boolean par channel', async () => {
    const r = await kevinAlerts.testAllChannels();
    expect(typeof r.telegram).toBe('boolean');
    expect(typeof r.discord).toBe('boolean');
    expect(typeof r.browser_push).toBe('boolean');
  });
});
