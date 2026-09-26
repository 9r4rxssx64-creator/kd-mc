/**
 * APEX v13 — Personal Assistant Hub (intégrations réseaux sociaux + apps + appareils)
 *
 * Demande Kevin (2026-05-07) :
 * "Apex doit avoir accès réellement à mes réseaux sociaux, sites, apps,
 *  appareils connectés. Quand je dis 'appelle Yannou', il prend mon
 *  compte WhatsApp et appelle. Avec un visuel dans Apex."
 *
 * VÉRITÉ TECHNIQUE (HONNÊTETÉ obligatoire — règle Kevin) :
 * - Apex est PWA web → sandboxé browser
 * - Plusieurs actions ne sont possibles QUE :
 *   a) via deeplinks (ouvre app native, user clique pour confirmer)
 *   b) via OAuth + API (Gmail, Outlook, Google Photos, YouTube...)
 *   c) via Capacitor app native (jamais en pure PWA web)
 * - Meta (Facebook/IG/TikTok) impose review d'app (semaines de délai)
 * - iCloud Photos = pas d'API publique (PhotoKit iOS Capacitor uniquement)
 * - WhatsApp call direct sans user click = impossible web
 *
 * Pour chaque méthode, retour structuré :
 * - status: 'ready' | 'oauth-required' | 'native-only' | 'unavailable'
 * - method: 'deeplink' | 'oauth-fetch' | 'web-share-api' | 'browser-only' | 'capacitor-required'
 * - fallback: explication ou alternative si impossible
 *
 * Sécurité :
 * - Tokens OAuth stockés via vault (chiffrés AES-GCM 256)
 * - Audit log à chaque action
 * - Confirmation Kevin obligatoire pour actions tier C (publier post, envoyer mass mail)
 * - PII redaction sur logs (numéros, emails masqués)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

/* =========================================================================
 * TYPES
 * ========================================================================= */

export type IntegrationStatus = 'ready' | 'oauth-required' | 'native-only' | 'unavailable';
export type IntegrationMethod =
  | 'deeplink'
  | 'oauth-fetch'
  | 'web-share-api'
  | 'browser-only'
  | 'capacitor-required'
  | 'webhook';

export interface IntegrationCapability {
  service: string;
  feature: string;
  status: IntegrationStatus;
  oauthScopes?: string[];
  webMethod?: IntegrationMethod;
  fallback?: string;
}

export interface DeeplinkResult {
  ok: true;
  url: string;
  method: 'deeplink';
  service: string;
  visual?: { /* Pour UI Apex bulle/card */
    title: string;
    description: string;
    buttonLabel: string;
    icon: string;
  };
}

export interface OAuthRequiredResult {
  ok: false;
  oauthRequired: true;
  service: string;
  authUrl?: string;
  scopes?: string[];
  reason: string;
}

export interface NativeOnlyResult {
  ok: false;
  nativeOnly: true;
  service: string;
  reason: string;
  alternative?: string;
}

export interface UnavailableResult {
  ok: false;
  reason: string;
  service?: string;
}

export interface SuccessResult<T = unknown> {
  ok: true;
  data?: T;
  method: IntegrationMethod;
  service: string;
}

export type ApiResult<T = unknown> =
  | DeeplinkResult
  | OAuthRequiredResult
  | NativeOnlyResult
  | UnavailableResult
  | SuccessResult<T>;

/* =========================================================================
 * EMAIL TYPES
 * ========================================================================= */

export interface EmailHeader {
  id: string;
  from: string;
  to?: string;
  subject: string;
  snippet: string;
  date: number; /* ms */
  unread: boolean;
  labels?: string[];
}

/* =========================================================================
 * CAPABILITIES MATRIX (vérité honnête web vs native)
 * ========================================================================= */

const CAPABILITIES_MATRIX: readonly IntegrationCapability[] = [
  /* === WhatsApp === */
  {
    service: 'whatsapp',
    feature: 'send_message',
    status: 'ready',
    webMethod: 'deeplink',
    fallback: 'Ouvre app WhatsApp native via wa.me — user doit cliquer envoyer',
  },
  {
    service: 'whatsapp',
    feature: 'voice_call',
    status: 'native-only',
    webMethod: 'deeplink',
    fallback: 'wa.me ouvre WhatsApp — user clique appel. Direct call sans click impossible web.',
  },
  {
    service: 'whatsapp',
    feature: 'video_call',
    status: 'native-only',
    webMethod: 'deeplink',
    fallback: 'Idem voice_call : ouvre WhatsApp, user clique caméra.',
  },
  /* === Gmail === */
  {
    service: 'gmail',
    feature: 'compose',
    status: 'ready',
    webMethod: 'deeplink',
    fallback: 'mailto: ou https://mail.google.com/mail/u/0/#inbox?compose=...',
  },
  {
    service: 'gmail',
    feature: 'list_unread',
    status: 'oauth-required',
    oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    webMethod: 'oauth-fetch',
    fallback: 'Token Gmail OAuth requis (Google Cloud project + consent screen).',
  },
  {
    service: 'gmail',
    feature: 'archive_label_delete',
    status: 'oauth-required',
    oauthScopes: ['https://www.googleapis.com/auth/gmail.modify'],
    webMethod: 'oauth-fetch',
  },
  /* === Outlook === */
  {
    service: 'outlook',
    feature: 'compose',
    status: 'ready',
    webMethod: 'deeplink',
    fallback: 'mailto: ou https://outlook.office.com/owa/?path=/mail/action/compose',
  },
  {
    service: 'outlook',
    feature: 'list_unread',
    status: 'oauth-required',
    oauthScopes: ['Mail.Read'],
    webMethod: 'oauth-fetch',
  },
  /* === Facebook === */
  {
    service: 'facebook',
    feature: 'post',
    status: 'oauth-required',
    oauthScopes: ['pages_manage_posts', 'pages_show_list'],
    webMethod: 'oauth-fetch',
    fallback: 'Meta App Review obligatoire (semaines délai) + page Facebook Business.',
  },
  /* === Instagram === */
  {
    service: 'instagram',
    feature: 'post',
    status: 'oauth-required',
    oauthScopes: ['instagram_content_publish', 'instagram_basic'],
    webMethod: 'oauth-fetch',
    fallback: 'Compte Business + page Facebook liée + Meta App Review obligatoire.',
  },
  /* === TikTok === */
  {
    service: 'tiktok',
    feature: 'post',
    status: 'oauth-required',
    oauthScopes: ['video.publish'],
    webMethod: 'oauth-fetch',
    fallback: 'TikTok Business account + app review TikTok obligatoires.',
  },
  /* === YouTube === */
  {
    service: 'youtube',
    feature: 'upload',
    status: 'oauth-required',
    oauthScopes: ['https://www.googleapis.com/auth/youtube.upload'],
    webMethod: 'oauth-fetch',
    fallback: 'Google Cloud project + OAuth consent. Quota daily 6 uploads gratuits.',
  },
  /* === LinkedIn === */
  {
    service: 'linkedin',
    feature: 'post',
    status: 'oauth-required',
    oauthScopes: ['w_member_social'],
    webMethod: 'oauth-fetch',
  },
  /* === Twitter / X === */
  {
    service: 'twitter',
    feature: 'post',
    status: 'oauth-required',
    oauthScopes: ['tweet.write', 'users.read', 'tweet.read'],
    webMethod: 'oauth-fetch',
    fallback: 'X API v2 — plan Basic 100$/mois pour write access.',
  },
  /* === Telegram === */
  {
    service: 'telegram',
    feature: 'send_message',
    status: 'ready',
    webMethod: 'oauth-fetch',
    fallback: 'Bot token (gratuit @BotFather) — chatId requis.',
  },
  /* === Discord === */
  {
    service: 'discord',
    feature: 'webhook',
    status: 'ready',
    webMethod: 'webhook',
    fallback: 'Webhook URL Discord (créé par user dans channel settings).',
  },
  /* === Slack === */
  {
    service: 'slack',
    feature: 'post',
    status: 'ready',
    webMethod: 'webhook',
    fallback: 'Webhook URL Slack ou Bot Token OAuth.',
  },
  /* === Notion === */
  {
    service: 'notion',
    feature: 'create_page',
    status: 'oauth-required',
    oauthScopes: ['create_content'],
    webMethod: 'oauth-fetch',
    fallback: 'Notion Internal Integration token + page partagée avec intégration.',
  },
  /* === Google Photos === */
  {
    service: 'google_photos',
    feature: 'list_photos',
    status: 'oauth-required',
    oauthScopes: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
    webMethod: 'oauth-fetch',
  },
  {
    service: 'google_photos',
    feature: 'organize',
    status: 'oauth-required',
    oauthScopes: ['https://www.googleapis.com/auth/photoslibrary.appendonly'],
    webMethod: 'oauth-fetch',
    fallback: 'Création albums OK, mais déplacements limités (API restrictive).',
  },
  /* === iCloud Photos === */
  {
    service: 'icloud_photos',
    feature: 'list_photos',
    status: 'native-only',
    webMethod: 'capacitor-required',
    fallback: "iCloud Photos n'a pas d'API publique. Capacitor + PhotoKit iOS uniquement.",
  },
  /* === Spotify === */
  {
    service: 'spotify',
    feature: 'play',
    status: 'oauth-required',
    oauthScopes: ['user-modify-playback-state'],
    webMethod: 'oauth-fetch',
    fallback: 'Spotify Premium requis pour play/pause via API.',
  },
  {
    service: 'spotify',
    feature: 'create_playlist',
    status: 'oauth-required',
    oauthScopes: ['playlist-modify-private', 'playlist-modify-public'],
    webMethod: 'oauth-fetch',
  },
];

/* =========================================================================
 * PERSONAL ASSISTANT CLASS
 * ========================================================================= */

class PersonalAssistant {
  /* ====================================================================
   * WHATSAPP
   * ==================================================================== */

  /**
   * Génère un deeplink wa.me pour envoyer un message WhatsApp.
   * Web : ouvre app native iPhone/Android, user clique "Envoyer".
   * Pas d'envoi automatique sans user click (limite plateforme).
   */
  whatsappSendMessage(opts: { phone: string; message: string }): DeeplinkResult | UnavailableResult {
    const phone = this.cleanPhone(opts.phone);
    if (!phone) return { ok: false, reason: 'Numéro invalide', service: 'whatsapp' };
    const text = encodeURIComponent(opts.message ?? '');
    const url = `https://wa.me/${phone}${text ? `?text=${text}` : ''}`;
    void auditLog.record('personal-assistant.whatsapp.send_message', {
      details: { phone_masked: this.maskPhone(opts.phone), len: opts.message.length },
    });
    return {
      ok: true,
      url,
      method: 'deeplink',
      service: 'whatsapp',
      visual: {
        title: 'Message WhatsApp',
        description: `Vers +${phone}`,
        buttonLabel: 'Ouvrir WhatsApp',
        icon: '💬',
      },
    };
  }

  /**
   * Génère un deeplink WhatsApp call. wa.me ouvre l'app, user clique sur l'icône appel.
   * HONNÊTETÉ : pas d'appel direct sans user click possible côté web.
   */
  whatsappCall(opts: { phone: string; video?: boolean }): DeeplinkResult | UnavailableResult {
    const phone = this.cleanPhone(opts.phone);
    if (!phone) return { ok: false, reason: 'Numéro invalide', service: 'whatsapp' };
    const url = `https://wa.me/${phone}`;
    void auditLog.record('personal-assistant.whatsapp.call', {
      details: { phone_masked: this.maskPhone(opts.phone), video: !!opts.video },
    });
    const callType = opts.video ? '📹 Appel vidéo' : '📞 Appel';
    return {
      ok: true,
      url,
      method: 'deeplink',
      service: 'whatsapp',
      visual: {
        title: callType + ' WhatsApp',
        description: `Vers +${phone}. WhatsApp s'ouvre, clique l'icône appel.`,
        buttonLabel: 'Ouvrir WhatsApp',
        icon: opts.video ? '📹' : '📞',
      },
    };
  }

  /* ====================================================================
   * GMAIL
   * ==================================================================== */

  /**
   * Compose email Gmail via deeplink (Gmail web compose ou mailto).
   */
  gmailCompose(opts: { to: string; subject: string; body: string }): DeeplinkResult {
    const su = encodeURIComponent(opts.subject);
    const body = encodeURIComponent(opts.body);
    const to = encodeURIComponent(opts.to);
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`;
    void auditLog.record('personal-assistant.gmail.compose', {
      details: { to_masked: this.maskEmail(opts.to), subject_len: opts.subject.length },
    });
    return {
      ok: true,
      url,
      method: 'deeplink',
      service: 'gmail',
      visual: {
        title: 'Compose Gmail',
        description: `Vers ${this.maskEmail(opts.to)}`,
        buttonLabel: 'Ouvrir Gmail',
        icon: '📧',
      },
    };
  }

  /**
   * Liste emails non lus Gmail (nécessite OAuth token stocké via vault).
   */
  async gmailListUnread(maxResults = 20): Promise<SuccessResult<EmailHeader[]> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_gmail_oauth_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'gmail',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        reason: 'Token Gmail OAuth manquant — connecter Gmail dans Apex Settings → Intégrations.',
      };
    }
    try {
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=${maxResults}`;
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (res.status === 401) {
          return {
            ok: false,
            oauthRequired: true,
            service: 'gmail',
            reason: 'Token Gmail expiré',
          };
        }
        return { ok: false, reason: `Gmail API HTTP ${res.status}`, service: 'gmail' };
      }
      const list = (await res.json()) as { messages?: Array<{ id: string }> };
      const ids = list.messages ?? [];
      /* Fetch headers de chaque message (parallel max 10 à la fois) */
      const headers: EmailHeader[] = [];
      const slice = ids.slice(0, Math.min(maxResults, 20));
      for (const m of slice) {
        try {
          const dRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
          );
          if (!dRes.ok) continue;
          const detail = (await dRes.json()) as {
            id: string;
            snippet?: string;
            labelIds?: string[];
            payload?: { headers?: Array<{ name: string; value: string }> };
            internalDate?: string;
          };
          const hdrs = detail.payload?.headers ?? [];
          const from = hdrs.find((h) => h.name === 'From')?.value ?? '(inconnu)';
          const subject = hdrs.find((h) => h.name === 'Subject')?.value ?? '(sans objet)';
          const dateStr = hdrs.find((h) => h.name === 'Date')?.value;
          const date = dateStr ? new Date(dateStr).getTime() : Number(detail.internalDate ?? 0);
          headers.push({
            id: detail.id,
            from,
            subject,
            snippet: detail.snippet ?? '',
            date,
            unread: (detail.labelIds ?? []).includes('UNREAD'),
            ...(detail.labelIds && { labels: detail.labelIds }),
          });
        } catch {
          /* skip ce message en erreur */
        }
      }
      void auditLog.record('personal-assistant.gmail.list_unread', { details: { count: headers.length } });
      return { ok: true, data: headers, method: 'oauth-fetch', service: 'gmail' };
    } catch (err: unknown) {
      logger.warn('personal-assistant', 'gmailListUnread failed', { err });
      return { ok: false, reason: String((err as Error).message ?? err), service: 'gmail' };
    }
  }

  /**
   * Déplace un email vers un label (archive, important, custom).
   */
  async gmailMoveLabel(emailId: string, labelToAdd: string, labelToRemove?: string): Promise<SuccessResult | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_gmail_oauth_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'gmail',
        reason: 'Token Gmail OAuth manquant',
      };
    }
    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`;
      const body: Record<string, string[]> = { addLabelIds: [labelToAdd] };
      if (labelToRemove) body['removeLabelIds'] = [labelToRemove];
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, reason: `Gmail API HTTP ${res.status}`, service: 'gmail' };
      void auditLog.record('personal-assistant.gmail.move_label', {
        details: { emailId, label: labelToAdd },
      });
      return { ok: true, method: 'oauth-fetch', service: 'gmail' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'gmail' };
    }
  }

  /* ====================================================================
   * OUTLOOK
   * ==================================================================== */

  outlookCompose(opts: { to: string; subject: string; body: string }): DeeplinkResult {
    const to = encodeURIComponent(opts.to);
    const su = encodeURIComponent(opts.subject);
    const body = encodeURIComponent(opts.body);
    const url = `https://outlook.office.com/owa/?path=/mail/action/compose&to=${to}&subject=${su}&body=${body}`;
    void auditLog.record('personal-assistant.outlook.compose', {
      details: { to_masked: this.maskEmail(opts.to) },
    });
    return {
      ok: true,
      url,
      method: 'deeplink',
      service: 'outlook',
      visual: {
        title: 'Compose Outlook',
        description: `Vers ${this.maskEmail(opts.to)}`,
        buttonLabel: 'Ouvrir Outlook',
        icon: '📧',
      },
    };
  }

  /**
   * Liste emails non lus Outlook (Microsoft Graph API).
   */
  async outlookListUnread(maxResults = 20): Promise<SuccessResult<EmailHeader[]> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_outlook_oauth_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'outlook',
        scopes: ['Mail.Read'],
        reason: 'Token Outlook OAuth manquant',
      };
    }
    try {
      const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=${maxResults}&$select=id,from,subject,bodyPreview,receivedDateTime,isRead`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (res.status === 401) {
          return { ok: false, oauthRequired: true, service: 'outlook', reason: 'Token expiré' };
        }
        return { ok: false, reason: `Outlook API HTTP ${res.status}`, service: 'outlook' };
      }
      const data = (await res.json()) as {
        value?: Array<{
          id: string;
          from?: { emailAddress?: { name?: string; address?: string } };
          subject?: string;
          bodyPreview?: string;
          receivedDateTime?: string;
          isRead?: boolean;
        }>;
      };
      const headers: EmailHeader[] = (data.value ?? []).map((m) => ({
        id: m.id,
        from: m.from?.emailAddress?.address ?? '(inconnu)',
        subject: m.subject ?? '(sans objet)',
        snippet: m.bodyPreview ?? '',
        date: m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0,
        unread: !m.isRead,
      }));
      void auditLog.record('personal-assistant.outlook.list_unread', { details: { count: headers.length } });
      return { ok: true, data: headers, method: 'oauth-fetch', service: 'outlook' };
    } catch (err: unknown) {
      logger.warn('personal-assistant', 'outlookListUnread failed', { err });
      return { ok: false, reason: String((err as Error).message ?? err), service: 'outlook' };
    }
  }

  /* ====================================================================
   * FACEBOOK
   * ==================================================================== */

  /**
   * Post sur page Facebook (nécessite OAuth + page Business + Meta app review).
   */
  async facebookPost(opts: {
    message?: string;
    mediaUrl?: string;
    pageId?: string;
  }): Promise<SuccessResult<{ postId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_facebook_page_token');
    const pageId = opts.pageId ?? localStorage.getItem('ax_facebook_page_id') ?? '';
    if (!token || !pageId) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'facebook',
        scopes: ['pages_manage_posts', 'pages_show_list'],
        reason: 'Page Facebook + token OAuth requis (Meta App Review obligatoire).',
      };
    }
    try {
      const fields: Record<string, string> = { access_token: token };
      if (opts.message) fields['message'] = opts.message;
      if (opts.mediaUrl) fields['link'] = opts.mediaUrl;
      const formBody = new URLSearchParams(fields).toString();
      const url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 401) {
          return { ok: false, oauthRequired: true, service: 'facebook', reason: 'Token expiré' };
        }
        return { ok: false, reason: `Facebook API HTTP ${res.status}`, service: 'facebook' };
      }
      const data = (await res.json()) as { id?: string };
      void auditLog.record('personal-assistant.facebook.post', {
        details: { postId: data.id ?? 'unknown' },
      });
      return {
        ok: true,
        data: { postId: data.id ?? '' },
        method: 'oauth-fetch',
        service: 'facebook',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'facebook' };
    }
  }

  /* ====================================================================
   * INSTAGRAM
   * ==================================================================== */

  /**
   * Post sur Instagram (Business account + Meta app review obligatoires).
   * 2-step API : create container puis publish.
   */
  async instagramPost(opts: {
    mediaUrl: string;
    caption?: string;
    type: 'image' | 'video' | 'reel';
  }): Promise<SuccessResult<{ igMediaId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_instagram_token');
    const igUserId = localStorage.getItem('ax_instagram_user_id') ?? '';
    if (!token || !igUserId) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'instagram',
        scopes: ['instagram_content_publish', 'instagram_basic'],
        reason: 'Compte Instagram Business + token OAuth + Meta App Review obligatoires.',
      };
    }
    try {
      /* Step 1 : create container */
      const containerParams: Record<string, string> = {
        access_token: token,
        ...(opts.type === 'image' ? { image_url: opts.mediaUrl } : { video_url: opts.mediaUrl, media_type: opts.type === 'reel' ? 'REELS' : 'VIDEO' }),
      };
      if (opts.caption) containerParams['caption'] = opts.caption;
      const cRes = await fetch(
        `https://graph.facebook.com/v18.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(containerParams).toString(),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!cRes.ok) return { ok: false, reason: `IG container HTTP ${cRes.status}`, service: 'instagram' };
      const container = (await cRes.json()) as { id?: string };
      if (!container.id) return { ok: false, reason: 'Container ID manquant', service: 'instagram' };
      /* Step 2 : publish */
      const pRes = await fetch(
        `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ access_token: token, creation_id: container.id }).toString(),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!pRes.ok) return { ok: false, reason: `IG publish HTTP ${pRes.status}`, service: 'instagram' };
      const publish = (await pRes.json()) as { id?: string };
      void auditLog.record('personal-assistant.instagram.post', {
        details: { type: opts.type, id: publish.id ?? '' },
      });
      return {
        ok: true,
        data: { igMediaId: publish.id ?? '' },
        method: 'oauth-fetch',
        service: 'instagram',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'instagram' };
    }
  }

  /* ====================================================================
   * TIKTOK
   * ==================================================================== */

  async tiktokPost(opts: {
    videoUrl: string;
    caption: string;
  }): Promise<SuccessResult | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_tiktok_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'tiktok',
        scopes: ['video.publish'],
        reason: 'TikTok Business account + app review obligatoires.',
      };
    }
    try {
      /* TikTok Content Posting API v2 — initialiser upload */
      const url = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_info: { source: 'PULL_FROM_URL', video_url: opts.videoUrl },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { ok: false, reason: `TikTok API HTTP ${res.status}`, service: 'tiktok' };
      }
      void auditLog.record('personal-assistant.tiktok.post', {
        details: { caption_len: opts.caption.length },
      });
      return { ok: true, method: 'oauth-fetch', service: 'tiktok' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'tiktok' };
    }
  }

  /* ====================================================================
   * YOUTUBE
   * ==================================================================== */

  /**
   * Upload vidéo YouTube. videoBlob ou URL acceptés.
   * Retourne { videoId } si OK.
   */
  async youtubeUpload(opts: {
    videoBlob?: Blob;
    title: string;
    description: string;
    tags?: string[];
    privacy?: 'public' | 'unlisted' | 'private';
  }): Promise<SuccessResult<{ videoId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_youtube_oauth_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'youtube',
        scopes: ['https://www.googleapis.com/auth/youtube.upload'],
        reason: 'Token YouTube OAuth manquant',
      };
    }
    if (!opts.videoBlob) {
      return { ok: false, reason: 'videoBlob requis', service: 'youtube' };
    }
    try {
      const metadata = {
        snippet: {
          title: opts.title,
          description: opts.description,
          tags: opts.tags ?? [],
        },
        status: { privacyStatus: opts.privacy ?? 'private' },
      };
      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadata),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!initRes.ok) {
        return { ok: false, reason: `YouTube init HTTP ${initRes.status}`, service: 'youtube' };
      }
      const uploadUrl = initRes.headers.get('Location') ?? '';
      if (!uploadUrl) {
        return { ok: false, reason: 'YouTube Location header manquant', service: 'youtube' };
      }
      const upRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': opts.videoBlob.type || 'video/mp4' },
        body: opts.videoBlob,
        signal: AbortSignal.timeout(120_000), /* 2 min upload */
      });
      if (!upRes.ok) return { ok: false, reason: `YouTube upload HTTP ${upRes.status}`, service: 'youtube' };
      const data = (await upRes.json()) as { id?: string };
      void auditLog.record('personal-assistant.youtube.upload', {
        details: { videoId: data.id ?? '', privacy: opts.privacy ?? 'private' },
      });
      return {
        ok: true,
        data: { videoId: data.id ?? '' },
        method: 'oauth-fetch',
        service: 'youtube',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'youtube' };
    }
  }

  /* ====================================================================
   * LINKEDIN
   * ==================================================================== */

  async linkedinPost(opts: {
    text: string;
    mediaUrl?: string;
  }): Promise<SuccessResult | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_linkedin_token');
    const personUrn = localStorage.getItem('ax_linkedin_person_urn') ?? '';
    if (!token || !personUrn) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'linkedin',
        scopes: ['w_member_social'],
        reason: 'Token LinkedIn + personUrn requis.',
      };
    }
    try {
      const body = {
        author: `urn:li:person:${personUrn}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: opts.text },
            shareMediaCategory: opts.mediaUrl ? 'ARTICLE' : 'NONE',
            ...(opts.mediaUrl && { media: [{ status: 'READY', originalUrl: opts.mediaUrl }] }),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, reason: `LinkedIn HTTP ${res.status}`, service: 'linkedin' };
      void auditLog.record('personal-assistant.linkedin.post', {
        details: { text_len: opts.text.length },
      });
      return { ok: true, method: 'oauth-fetch', service: 'linkedin' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'linkedin' };
    }
  }

  /* ====================================================================
   * TWITTER / X
   * ==================================================================== */

  async twitterPost(opts: {
    text: string;
  }): Promise<SuccessResult<{ tweetId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_twitter_oauth_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'twitter',
        scopes: ['tweet.write', 'users.read'],
        reason: 'Token X (OAuth 2.0) manquant.',
      };
    }
    try {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: opts.text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, reason: `Twitter HTTP ${res.status}`, service: 'twitter' };
      const data = (await res.json()) as { data?: { id?: string } };
      void auditLog.record('personal-assistant.twitter.post', {
        details: { tweetId: data.data?.id ?? '' },
      });
      return {
        ok: true,
        data: { tweetId: data.data?.id ?? '' },
        method: 'oauth-fetch',
        service: 'twitter',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'twitter' };
    }
  }

  /* ====================================================================
   * TELEGRAM
   * ==================================================================== */

  async telegramSendMessage(opts: {
    chatId: string;
    text: string;
  }): Promise<SuccessResult | UnavailableResult> {
    const botToken = await vault.readKey('ax_telegram_bot_token');
    if (!botToken) {
      return { ok: false, reason: 'Telegram bot token manquant (configurer dans Vault)', service: 'telegram' };
    }
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: opts.chatId, text: opts.text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, reason: `Telegram HTTP ${res.status}`, service: 'telegram' };
      void auditLog.record('personal-assistant.telegram.send', {
        details: { chatId: opts.chatId, len: opts.text.length },
      });
      return { ok: true, method: 'oauth-fetch', service: 'telegram' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'telegram' };
    }
  }

  /* ====================================================================
   * DISCORD
   * ==================================================================== */

  async discordWebhook(opts: {
    url: string;
    content: string;
  }): Promise<SuccessResult | UnavailableResult> {
    if (!opts.url || !opts.url.startsWith('https://discord.com/api/webhooks/')) {
      return { ok: false, reason: 'URL webhook Discord invalide', service: 'discord' };
    }
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: opts.content }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, reason: `Discord HTTP ${res.status}`, service: 'discord' };
      void auditLog.record('personal-assistant.discord.webhook', {
        details: { len: opts.content.length },
      });
      return { ok: true, method: 'webhook', service: 'discord' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'discord' };
    }
  }

  /* ====================================================================
   * SLACK
   * ==================================================================== */

  async slackPost(opts: {
    channel: string;
    text: string;
    webhookUrl?: string;
  }): Promise<SuccessResult | OAuthRequiredResult | UnavailableResult> {
    /* Préfère webhook si fourni (plus simple) */
    if (opts.webhookUrl) {
      try {
        const res = await fetch(opts.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: opts.text, channel: opts.channel }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, reason: `Slack HTTP ${res.status}`, service: 'slack' };
        void auditLog.record('personal-assistant.slack.webhook', {
          details: { channel: opts.channel, len: opts.text.length },
        });
        return { ok: true, method: 'webhook', service: 'slack' };
      } catch (err: unknown) {
        return { ok: false, reason: String((err as Error).message ?? err), service: 'slack' };
      }
    }
    /* Sinon Bot Token API */
    const botToken = await vault.readKey('ax_slack_bot_token');
    if (!botToken) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'slack',
        reason: 'Slack webhookUrl ou bot token manquant',
      };
    }
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: opts.channel, text: opts.text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, reason: `Slack HTTP ${res.status}`, service: 'slack' };
      void auditLog.record('personal-assistant.slack.post', {
        details: { channel: opts.channel },
      });
      return { ok: true, method: 'oauth-fetch', service: 'slack' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'slack' };
    }
  }

  /* ====================================================================
   * NOTION
   * ==================================================================== */

  async notionCreatePage(opts: {
    databaseId: string;
    title: string;
    content: string;
  }): Promise<SuccessResult<{ pageId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_notion_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'notion',
        reason: 'Notion integration token manquant.',
      };
    }
    try {
      const body = {
        parent: { database_id: opts.databaseId },
        properties: {
          Name: { title: [{ text: { content: opts.title } }] },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: opts.content } }] },
          },
        ],
      };
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, reason: `Notion HTTP ${res.status}`, service: 'notion' };
      const data = (await res.json()) as { id?: string };
      void auditLog.record('personal-assistant.notion.create_page', {
        details: { pageId: data.id ?? '' },
      });
      return {
        ok: true,
        data: { pageId: data.id ?? '' },
        method: 'oauth-fetch',
        service: 'notion',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'notion' };
    }
  }

  /* ====================================================================
   * GOOGLE PHOTOS
   * ==================================================================== */

  async googlePhotosList(albumId?: string, maxResults = 50): Promise<
    SuccessResult<Array<{ id: string; baseUrl: string; mimeType: string; mediaMetadata?: unknown }>>
    | OAuthRequiredResult
    | UnavailableResult
  > {
    const token = await vault.readKey('ax_google_photos_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'google_photos',
        scopes: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
        reason: 'Token Google Photos OAuth manquant',
      };
    }
    try {
      const url = albumId
        ? 'https://photoslibrary.googleapis.com/v1/mediaItems:search'
        : 'https://photoslibrary.googleapis.com/v1/mediaItems';
      const fetchOpts: RequestInit = {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(albumId && { 'Content-Type': 'application/json' }),
        },
        signal: AbortSignal.timeout(8000),
      };
      if (albumId) {
        fetchOpts.method = 'POST';
        fetchOpts.body = JSON.stringify({ albumId, pageSize: maxResults });
      } else {
        fetchOpts.method = 'GET';
      }
      const finalUrl = albumId ? url : `${url}?pageSize=${maxResults}`;
      const res = await fetch(finalUrl, fetchOpts);
      if (!res.ok) {
        if (res.status === 401) {
          return { ok: false, oauthRequired: true, service: 'google_photos', reason: 'Token expiré' };
        }
        return { ok: false, reason: `Google Photos HTTP ${res.status}`, service: 'google_photos' };
      }
      const data = (await res.json()) as {
        mediaItems?: Array<{ id: string; baseUrl: string; mimeType: string; mediaMetadata?: unknown }>;
      };
      void auditLog.record('personal-assistant.google_photos.list', {
        details: { count: data.mediaItems?.length ?? 0 },
      });
      return {
        ok: true,
        data: data.mediaItems ?? [],
        method: 'oauth-fetch',
        service: 'google_photos',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'google_photos' };
    }
  }

  /**
   * Crée un album Google Photos avec photos données.
   * HONNÊTETÉ : API Google Photos restrictive, ne permet d'ajouter que les photos
   * uploadées par l'app (pas les photos existantes user).
   */
  async googlePhotosOrganize(opts: {
    albumName: string;
    photoIds?: string[];
  }): Promise<SuccessResult<{ albumId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_google_photos_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'google_photos',
        scopes: ['https://www.googleapis.com/auth/photoslibrary.appendonly'],
        reason: 'Token Google Photos OAuth manquant (scope appendonly)',
      };
    }
    try {
      /* Step 1 : create album */
      const cRes = await fetch('https://photoslibrary.googleapis.com/v1/albums', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ album: { title: opts.albumName } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!cRes.ok) return { ok: false, reason: `Album create HTTP ${cRes.status}`, service: 'google_photos' };
      const album = (await cRes.json()) as { id?: string };
      const albumId = album.id ?? '';
      /* Step 2 : add photos (limité aux photos uploadées par l'app) */
      if (albumId && opts.photoIds && opts.photoIds.length > 0) {
        await fetch(`https://photoslibrary.googleapis.com/v1/albums/${albumId}:batchAddMediaItems`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mediaItemIds: opts.photoIds }),
          signal: AbortSignal.timeout(8000),
        });
      }
      void auditLog.record('personal-assistant.google_photos.organize', {
        details: { albumId, count: opts.photoIds?.length ?? 0 },
      });
      return {
        ok: true,
        data: { albumId },
        method: 'oauth-fetch',
        service: 'google_photos',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'google_photos' };
    }
  }

  /* ====================================================================
   * SPOTIFY
   * ==================================================================== */

  async spotifyPlay(opts: {
    trackId?: string;
    contextUri?: string;
    deviceId?: string;
  }): Promise<SuccessResult | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_spotify_token');
    if (!token) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'spotify',
        scopes: ['user-modify-playback-state'],
        reason: 'Token Spotify OAuth manquant + Premium requis',
      };
    }
    try {
      const url = opts.deviceId
        ? `https://api.spotify.com/v1/me/player/play?device_id=${opts.deviceId}`
        : 'https://api.spotify.com/v1/me/player/play';
      const body: Record<string, unknown> = {};
      if (opts.trackId) body['uris'] = [`spotify:track:${opts.trackId}`];
      if (opts.contextUri) body['context_uri'] = opts.contextUri;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok && res.status !== 204) {
        return { ok: false, reason: `Spotify HTTP ${res.status}`, service: 'spotify' };
      }
      void auditLog.record('personal-assistant.spotify.play', {
        details: { trackId: opts.trackId ?? '' },
      });
      return { ok: true, method: 'oauth-fetch', service: 'spotify' };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'spotify' };
    }
  }

  async spotifyCreatePlaylist(opts: {
    name: string;
    trackIds?: string[];
    isPublic?: boolean;
  }): Promise<SuccessResult<{ playlistId: string }> | OAuthRequiredResult | UnavailableResult> {
    const token = await vault.readKey('ax_spotify_token');
    const userId = localStorage.getItem('ax_spotify_user_id') ?? '';
    if (!token || !userId) {
      return {
        ok: false,
        oauthRequired: true,
        service: 'spotify',
        scopes: ['playlist-modify-private'],
        reason: 'Token Spotify + userId requis',
      };
    }
    try {
      const cRes = await fetch(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: opts.name, public: opts.isPublic ?? false }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!cRes.ok) return { ok: false, reason: `Spotify HTTP ${cRes.status}`, service: 'spotify' };
      const playlist = (await cRes.json()) as { id?: string };
      const playlistId = playlist.id ?? '';
      if (playlistId && opts.trackIds && opts.trackIds.length > 0) {
        const uris = opts.trackIds.map((id) => `spotify:track:${id}`);
        await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris }),
          signal: AbortSignal.timeout(8000),
        });
      }
      void auditLog.record('personal-assistant.spotify.create_playlist', {
        details: { playlistId, tracks: opts.trackIds?.length ?? 0 },
      });
      return {
        ok: true,
        data: { playlistId },
        method: 'oauth-fetch',
        service: 'spotify',
      };
    } catch (err: unknown) {
      return { ok: false, reason: String((err as Error).message ?? err), service: 'spotify' };
    }
  }

  /* ====================================================================
   * iCLOUD PHOTOS (NATIVE-ONLY)
   * ==================================================================== */

  /**
   * iCloud Photos n'a pas d'API publique.
   * Documente honnêtement à l'utilisateur.
   */
  icloudPhotosList(): NativeOnlyResult {
    return {
      ok: false,
      nativeOnly: true,
      service: 'icloud_photos',
      reason: "iCloud Photos n'a pas d'API publique (politique Apple).",
      alternative: "Utiliser Google Photos (synchronisable) ou app native Capacitor + PhotoKit iOS pour accès local.",
    };
  }

  /* ====================================================================
   * CAPABILITIES & HEALTH
   * ==================================================================== */

  /**
   * Retourne la matrice complète des capacités (honnêteté Kevin).
   */
  getCapabilities(): readonly IntegrationCapability[] {
    return CAPABILITIES_MATRIX;
  }

  /**
   * Filtre capacités par service.
   */
  getCapabilitiesForService(service: string): readonly IntegrationCapability[] {
    return CAPABILITIES_MATRIX.filter((c) => c.service === service);
  }

  /**
   * Vérifie l'état d'OAuth de tous les services configurés.
   * Retourne {service, valid, expiresAt?} pour chaque service.
   */
  async checkAllOAuth(): Promise<Array<{ service: string; valid: boolean; expiresAt?: number }>> {
    const services: Array<{ service: string; key: string }> = [
      { service: 'gmail', key: 'ax_gmail_oauth_token' },
      { service: 'outlook', key: 'ax_outlook_oauth_token' },
      { service: 'facebook', key: 'ax_facebook_page_token' },
      { service: 'instagram', key: 'ax_instagram_token' },
      { service: 'tiktok', key: 'ax_tiktok_token' },
      { service: 'youtube', key: 'ax_youtube_oauth_token' },
      { service: 'linkedin', key: 'ax_linkedin_token' },
      { service: 'twitter', key: 'ax_twitter_oauth_token' },
      { service: 'telegram', key: 'ax_telegram_bot_token' },
      { service: 'slack', key: 'ax_slack_bot_token' },
      { service: 'notion', key: 'ax_notion_token' },
      { service: 'google_photos', key: 'ax_google_photos_token' },
      { service: 'spotify', key: 'ax_spotify_token' },
    ];
    const results: Array<{ service: string; valid: boolean; expiresAt?: number }> = [];
    for (const s of services) {
      const token = await vault.readKey(s.key);
      const expiresAtStr = localStorage.getItem(`${s.key}_expires_at`);
      const expiresAt = expiresAtStr ? Number(expiresAtStr) : undefined;
      const valid = !!token && (!expiresAt || expiresAt > Date.now());
      results.push({
        service: s.service,
        valid,
        ...(expiresAt !== undefined && { expiresAt }),
      });
    }
    return results;
  }

  /* ====================================================================
   * HELPERS
   * ==================================================================== */

  /**
   * Nettoie un numéro téléphone : retire tous les non-digits.
   * "+33 6 12 34 56 78" → "33612345678".
   */
  private cleanPhone(phone: string): string {
    if (!phone) return '';
    return String(phone).replace(/[^\d]/g, '');
  }

  /**
   * Masque un numéro pour les logs : "+33612345678" → "+336***5678".
   */
  private maskPhone(phone: string): string {
    const cleaned = String(phone).replace(/\s/g, '');
    if (cleaned.length < 6) return '***';
    return cleaned.slice(0, 4) + '***' + cleaned.slice(-4);
  }

  /**
   * Masque un email pour les logs : "marc@example.com" → "m***@example.com".
   */
  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at < 0) return '***';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    return (local.charAt(0) || '') + '***' + domain;
  }
}

export const personalAssistant = new PersonalAssistant();
