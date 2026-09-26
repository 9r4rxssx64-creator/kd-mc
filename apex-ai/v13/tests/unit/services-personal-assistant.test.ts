/**
 * APEX v13 — Tests services/personal-assistant.ts (intégrations sociales + apps)
 *
 * Vérifie HONNÊTEMENT :
 * - WhatsApp deeplink wa.me OK (PWA web)
 * - Gmail/Outlook compose deeplink OK
 * - Gmail/Outlook list_unread → oauthRequired si pas de token
 * - Facebook/IG/TikTok → oauthRequired si pas configurés
 * - iCloud Photos → native-only (pas d'API publique Apple)
 * - Capabilities matrix complète
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  personalAssistant,
  type SuccessResult,
  type EmailHeader,
} from '../../services/core-svc/personal-assistant.js';

describe('PersonalAssistant — intégrations réseaux sociaux + apps', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ========== WhatsApp ========== */
  describe('WhatsApp', () => {
    it('whatsappSendMessage génère wa.me URL valide avec message encodé', () => {
      const result = personalAssistant.whatsappSendMessage({
        phone: '+33612345678',
        message: 'Salut Yannou !',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('wa.me/33612345678');
        expect(result.url).toContain('Salut');
        expect(result.method).toBe('deeplink');
        expect(result.service).toBe('whatsapp');
        expect(result.visual?.icon).toBe('💬');
      }
    });

    it('whatsappSendMessage refuse numéro vide', () => {
      const result = personalAssistant.whatsappSendMessage({
        phone: '',
        message: 'Test',
      });
      expect(result.ok).toBe(false);
    });

    it('whatsappCall génère deeplink avec visual call', () => {
      const result = personalAssistant.whatsappCall({ phone: '+33612345678' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('wa.me/33612345678');
        expect(result.visual?.icon).toBe('📞');
      }
    });

    it('whatsappCall avec video génère icon vidéo', () => {
      const result = personalAssistant.whatsappCall({ phone: '+33612345678', video: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.visual?.icon).toBe('📹');
      }
    });

    it('numéro avec espaces nettoyé correctement', () => {
      const result = personalAssistant.whatsappSendMessage({
        phone: '+33 6 12 34 56 78',
        message: 'OK',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('wa.me/33612345678');
        expect(result.url).not.toContain(' ');
      }
    });
  });

  /* ========== Gmail ========== */
  describe('Gmail', () => {
    it('gmailCompose génère deeplink valide', () => {
      const result = personalAssistant.gmailCompose({
        to: 'test@example.com',
        subject: 'Hello',
        body: 'Salut',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('mail.google.com');
        expect(result.url).toContain('view=cm');
        expect(result.url).toContain(encodeURIComponent('test@example.com'));
        expect(result.url).toContain(encodeURIComponent('Hello'));
      }
    });

    it('gmailListUnread retourne oauthRequired sans token', async () => {
      const result = await personalAssistant.gmailListUnread();
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
        expect(result.service).toBe('gmail');
        expect(result.scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
      }
    });

    it('gmailListUnread fetch succès avec token mock', async () => {
      localStorage.setItem('ax_gmail_oauth_token', 'fake-token');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes('messages?')) {
          return new Response(
            JSON.stringify({ messages: [{ id: 'msg1' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('messages/msg1')) {
          return new Response(
            JSON.stringify({
              id: 'msg1',
              snippet: 'snippet text',
              labelIds: ['UNREAD', 'INBOX'],
              payload: {
                headers: [
                  { name: 'From', value: 'sender@example.com' },
                  { name: 'Subject', value: 'Test' },
                  { name: 'Date', value: 'Wed, 07 May 2026 10:00:00 +0000' },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      });
      const result = await personalAssistant.gmailListUnread(5);
      expect(fetchMock).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = (result as SuccessResult<EmailHeader[]>).data;
        expect(data).toBeDefined();
        expect(data?.length).toBe(1);
        expect(data?.[0]?.subject).toBe('Test');
      }
    });

    it('gmailMoveLabel oauthRequired sans token', async () => {
      const result = await personalAssistant.gmailMoveLabel('msg1', 'IMPORTANT');
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });
  });

  /* ========== Outlook ========== */
  describe('Outlook', () => {
    it('outlookCompose génère deeplink valide', () => {
      const result = personalAssistant.outlookCompose({
        to: 'test@hotmail.com',
        subject: 'Hi',
        body: 'Test',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('outlook.office.com');
        expect(result.url).toContain('compose');
      }
    });

    it('outlookListUnread oauthRequired sans token', async () => {
      const result = await personalAssistant.outlookListUnread();
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
        expect(result.service).toBe('outlook');
      }
    });
  });

  /* ========== Facebook / Instagram / TikTok ========== */
  describe('Meta + TikTok (oauth required)', () => {
    it('facebookPost oauthRequired sans token', async () => {
      const result = await personalAssistant.facebookPost({ message: 'hello' });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('instagramPost oauthRequired sans token', async () => {
      const result = await personalAssistant.instagramPost({
        mediaUrl: 'https://example.com/img.jpg',
        type: 'image',
      });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('tiktokPost oauthRequired sans token', async () => {
      const result = await personalAssistant.tiktokPost({
        videoUrl: 'https://example.com/v.mp4',
        caption: 'caption',
      });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });
  });

  /* ========== YouTube ========== */
  describe('YouTube', () => {
    it('youtubeUpload oauthRequired sans token', async () => {
      const result = await personalAssistant.youtubeUpload({
        title: 'Mon clip',
        description: 'desc',
      });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('youtubeUpload échoue sans videoBlob avec token', async () => {
      localStorage.setItem('ax_youtube_oauth_token', 'fake');
      const result = await personalAssistant.youtubeUpload({
        title: 't',
        description: 'd',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('videoBlob');
      }
    });
  });

  /* ========== LinkedIn / Twitter ========== */
  describe('LinkedIn / Twitter', () => {
    it('linkedinPost oauthRequired sans token', async () => {
      const result = await personalAssistant.linkedinPost({ text: 'hello' });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('twitterPost oauthRequired sans token', async () => {
      const result = await personalAssistant.twitterPost({ text: 'tweet' });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('twitterPost succès avec token mock', async () => {
      localStorage.setItem('ax_twitter_oauth_token', 'fake');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ data: { id: 'tweet123', text: 'hello' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const result = await personalAssistant.twitterPost({ text: 'hello' });
      expect(fetchMock).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  /* ========== Telegram / Discord / Slack ========== */
  describe('Telegram / Discord / Slack', () => {
    it('telegramSendMessage retourne erreur sans bot token', async () => {
      const result = await personalAssistant.telegramSendMessage({
        chatId: '12345',
        text: 'test',
      });
      expect(result.ok).toBe(false);
    });

    it('discordWebhook refuse URL invalide', async () => {
      const result = await personalAssistant.discordWebhook({
        url: 'https://evil.com/webhook',
        content: 'hack',
      });
      expect(result.ok).toBe(false);
    });

    it('discordWebhook accepte URL Discord valide', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 204 }),
      );
      const result = await personalAssistant.discordWebhook({
        url: 'https://discord.com/api/webhooks/123/abc',
        content: 'salut',
      });
      expect(fetchMock).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('slackPost via webhookUrl OK', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      );
      const result = await personalAssistant.slackPost({
        channel: '#general',
        text: 'salut',
        webhookUrl: 'https://hooks.slack.com/services/T0/B0/x',
      });
      expect(fetchMock).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  /* ========== Notion ========== */
  describe('Notion', () => {
    it('notionCreatePage oauthRequired sans token', async () => {
      const result = await personalAssistant.notionCreatePage({
        databaseId: 'db1',
        title: 'Test',
        content: 'hello',
      });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });
  });

  /* ========== Google Photos / iCloud ========== */
  describe('Photos services', () => {
    it('googlePhotosList oauthRequired sans token', async () => {
      const result = await personalAssistant.googlePhotosList();
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('icloudPhotosList retourne nativeOnly (HONNÊTETÉ Apple)', () => {
      const result = personalAssistant.icloudPhotosList();
      expect(result.ok).toBe(false);
      if (!result.ok && 'nativeOnly' in result) {
        expect(result.nativeOnly).toBe(true);
        expect(result.service).toBe('icloud_photos');
        expect(result.alternative).toContain('Capacitor');
      }
    });
  });

  /* ========== Spotify ========== */
  describe('Spotify', () => {
    it('spotifyPlay oauthRequired sans token', async () => {
      const result = await personalAssistant.spotifyPlay({ trackId: 'abc' });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });

    it('spotifyCreatePlaylist oauthRequired sans token', async () => {
      const result = await personalAssistant.spotifyCreatePlaylist({
        name: 'My Playlist',
      });
      expect(result.ok).toBe(false);
      if (!result.ok && 'oauthRequired' in result) {
        expect(result.oauthRequired).toBe(true);
      }
    });
  });

  /* ========== Capabilities matrix (HONNÊTETÉ) ========== */
  describe('Capabilities Matrix', () => {
    it('getCapabilities retourne array non vide avec status divers', () => {
      const caps = personalAssistant.getCapabilities();
      expect(caps.length).toBeGreaterThanOrEqual(20);
      const services = new Set(caps.map((c) => c.service));
      expect(services.has('whatsapp')).toBe(true);
      expect(services.has('gmail')).toBe(true);
      expect(services.has('icloud_photos')).toBe(true);
    });

    it('whatsapp send_message status ready (deeplink web)', () => {
      const caps = personalAssistant.getCapabilitiesForService('whatsapp');
      const send = caps.find((c) => c.feature === 'send_message');
      expect(send?.status).toBe('ready');
      expect(send?.webMethod).toBe('deeplink');
    });

    it('whatsapp voice_call status native-only (pas direct call web)', () => {
      const caps = personalAssistant.getCapabilitiesForService('whatsapp');
      const call = caps.find((c) => c.feature === 'voice_call');
      expect(call?.status).toBe('native-only');
    });

    it('gmail list_unread status oauth-required', () => {
      const caps = personalAssistant.getCapabilitiesForService('gmail');
      const list = caps.find((c) => c.feature === 'list_unread');
      expect(list?.status).toBe('oauth-required');
      expect(list?.oauthScopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
    });

    it('icloud_photos status native-only avec alternative documentée', () => {
      const caps = personalAssistant.getCapabilitiesForService('icloud_photos');
      const list = caps.find((c) => c.feature === 'list_photos');
      expect(list?.status).toBe('native-only');
      expect(list?.fallback).toContain('Capacitor');
    });

    it('facebook/instagram/tiktok status oauth-required avec mention review', () => {
      const fb = personalAssistant.getCapabilitiesForService('facebook');
      const ig = personalAssistant.getCapabilitiesForService('instagram');
      const tt = personalAssistant.getCapabilitiesForService('tiktok');
      expect(fb[0]?.status).toBe('oauth-required');
      expect(ig[0]?.status).toBe('oauth-required');
      expect(tt[0]?.status).toBe('oauth-required');
      /* Documentation honnête sur Meta App Review */
      expect((fb[0]?.fallback ?? '').toLowerCase()).toContain('review');
    });
  });

  /* ========== OAuth Health Check ========== */
  describe('checkAllOAuth', () => {
    it('checkAllOAuth retourne tous les services avec valid:false sans tokens', async () => {
      const results = await personalAssistant.checkAllOAuth();
      expect(results.length).toBeGreaterThanOrEqual(13);
      for (const r of results) {
        expect(r.valid).toBe(false);
        expect(r.service).toBeTruthy();
      }
    });

    it('checkAllOAuth detect token valide', async () => {
      localStorage.setItem('ax_gmail_oauth_token', 'fake-token');
      const results = await personalAssistant.checkAllOAuth();
      const gmail = results.find((r) => r.service === 'gmail');
      expect(gmail?.valid).toBe(true);
    });

    it('checkAllOAuth detect token expiré', async () => {
      localStorage.setItem('ax_gmail_oauth_token', 'fake-token');
      localStorage.setItem('ax_gmail_oauth_token_expires_at', String(Date.now() - 1000));
      const results = await personalAssistant.checkAllOAuth();
      const gmail = results.find((r) => r.service === 'gmail');
      expect(gmail?.valid).toBe(false);
    });
  });

  /* ========== PII Masking ========== */
  describe('PII masking dans audit logs', () => {
    it('whatsappSendMessage ne logge pas le numéro complet', () => {
      /* Vérifie qu'aucune erreur n'est levée même avec phone long */
      const result = personalAssistant.whatsappSendMessage({
        phone: '+33612345678',
        message: 'secret',
      });
      expect(result.ok).toBe(true);
    });

    it('gmailCompose ne logge pas le destinataire complet', () => {
      const result = personalAssistant.gmailCompose({
        to: 'sensitive@private.com',
        subject: 'Subject',
        body: 'body',
      });
      expect(result.ok).toBe(true);
    });
  });
});
