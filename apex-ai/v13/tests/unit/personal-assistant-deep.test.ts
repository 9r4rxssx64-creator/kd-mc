/**
 * Tests personal-assistant deep v13.4.154 (Kevin "100/100 réel").
 *
 * Module : services/personal-assistant.ts (1071 stmts, était 67.1%).
 * Focus : deeplinks (whatsapp/gmail) + OAuth required paths + social posts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockVault, mockAuditLog } = vi.hoisted(() => ({
  mockVault: { readKey: vi.fn() },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { personalAssistant } from '../../services/core-svc/personal-assistant.js';

describe('personal-assistant deep (v13.4.154)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVault.readKey.mockResolvedValue('');
    mockAuditLog.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('whatsappSendMessage', () => {
    it('génère deeplink wa.me valide', () => {
      const r = personalAssistant.whatsappSendMessage({
        phone: '+33612345678',
        message: 'Salut Kevin',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.url).toContain('wa.me/');
        expect(r.url).toContain('text=');
        expect(r.service).toBe('whatsapp');
      }
    });

    it('refuse numéro invalide', () => {
      const r = personalAssistant.whatsappSendMessage({
        phone: 'abc',
        message: 'test',
      });
      expect(r.ok).toBe(false);
    });

    it('encode message correctement', () => {
      const r = personalAssistant.whatsappSendMessage({
        phone: '+33600000000',
        message: 'Hello & friends',
      });
      if (r.ok) {
        expect(r.url).toContain('Hello%20%26%20friends');
      }
    });
  });

  describe('whatsappCall', () => {
    it('génère deeplink call audio', () => {
      const r = personalAssistant.whatsappCall({ phone: '+33612345678' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.visual?.icon).toBe('📞');
      }
    });

    it('génère deeplink call vidéo', () => {
      const r = personalAssistant.whatsappCall({ phone: '+33600000000', video: true });
      if (r.ok) {
        expect(r.visual?.icon).toBe('📹');
        expect(r.visual?.title).toContain('vidéo');
      }
    });

    it('refuse numéro invalide', () => {
      const r = personalAssistant.whatsappCall({ phone: 'invalid' });
      expect(r.ok).toBe(false);
    });
  });

  describe('gmailCompose', () => {
    it('génère URL mail.google.com', () => {
      const r = personalAssistant.gmailCompose({
        to: 'kevin@example.com',
        subject: 'Test',
        body: 'Hello',
      });
      expect(r.ok).toBe(true);
      expect(r.url).toContain('mail.google.com');
      expect(r.url).toContain('to=kevin%40example.com');
    });

    it('encode subject + body', () => {
      const r = personalAssistant.gmailCompose({
        to: 'x@y.fr',
        subject: 'Hello & World',
        body: 'Line 1\nLine 2',
      });
      expect(r.url).toContain('Hello%20%26%20World');
    });
  });

  describe('gmailListUnread', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.gmailListUnread();
      expect(r.ok).toBe(false);
      if (!r.ok && 'oauthRequired' in r) {
        expect(r.oauthRequired).toBe(true);
        expect(r.service).toBe('gmail');
      }
    });
  });

  describe('outlookListUnread', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.outlookListUnread();
      expect(r.ok).toBe(false);
    });
  });

  describe('facebookPost', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.facebookPost({ message: 'Hello' });
      expect(r.ok).toBe(false);
    });
  });

  describe('instagramPost', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.instagramPost({
        caption: 'Test',
        imageUrl: 'https://x/img.jpg',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('tiktokPost', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.tiktokPost({
        videoUrl: 'https://x/v.mp4',
        caption: 'Test',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('youtubeUpload', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.youtubeUpload({
        title: 'Test',
        description: 'desc',
        videoBase64: 'data:video/mp4;base64,xxx',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('linkedinPost', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.linkedinPost({ text: 'Hello' });
      expect(r.ok).toBe(false);
    });
  });

  describe('twitterPost', () => {
    it('retourne oauthRequired si pas token', async () => {
      const r = await personalAssistant.twitterPost({ text: 'tweet' });
      expect(r.ok).toBe(false);
    });
  });

  describe('telegramSendMessage', () => {
    it('retourne unavailable si pas bot token', async () => {
      const r = await personalAssistant.telegramSendMessage({
        chatId: '12345',
        text: 'Hello',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('discordWebhook', () => {
    it('post via webhook URL', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));
      const r = await personalAssistant.discordWebhook({
        url: 'https://discord.com/api/webhooks/test',
        content: 'Hello',
      });
      expect(r.ok).toBe(true);
    });

    it('refuse URL Discord invalide', async () => {
      const r = await personalAssistant.discordWebhook({
        url: 'https://wrong-domain.com/webhook',
        content: 'Hello',
      });
      expect(r.ok).toBe(false);
      if (!r.ok && 'reason' in r) {
        expect(r.reason).toContain('invalide');
      }
    });
  });

  describe('checkAllOAuth', () => {
    it('retourne tableau status OAuth', async () => {
      const r = await personalAssistant.checkAllOAuth();
      expect(Array.isArray(r)).toBe(true);
      r.forEach((entry) => {
        expect(entry.service).toBeTypeOf('string');
        expect(entry.valid).toBeTypeOf('boolean');
      });
    });
  });
});
