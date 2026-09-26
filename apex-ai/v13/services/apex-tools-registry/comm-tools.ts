/**
 * APEX v13 — Tools registry: comm category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const COMM_TOOLS: readonly ApexTool[] = [
  {
    name: 'create_calendar_event',
    description: 'Crée un événement calendrier (iCal export ou Google Calendar API si configuré).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601' },
        end: { type: 'string', description: 'ISO 8601' },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'start'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'send_email',
    description: 'Envoie un email via Brevo/Resend/EmailJS configuré. Limité à 10/jour pour family/client.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
    minTier: 'family',
    impactLevel: 'C',
  },
  {
    name: 'send_telegram',
    description: 'Envoie un message Telegram via bot @Kdmc_kevind_2026_bot.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['chat_id', 'text'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'email_validate',
    description: 'Valide format email (regex RFC simplifiée + check domaine).',
    inputSchema: {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'phone_validate',
    description: 'Valide numéro téléphone format E.164 / FR / Monaco. Retourne {valid, country, normalized}.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        country: { type: 'string', description: 'Code ISO 2 (FR, MC, IT...)' },
      },
      required: ['phone'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'whatsapp_link',
    description: 'Génère lien wa.me/ pour ouvrir WhatsApp avec numéro + message pré-rempli.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'E.164 sans + (ex: 33612345678)' },
        text: { type: 'string', description: 'Message pré-rempli optionnel' },
      },
      required: ['phone'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'whatsapp_send_message',
    description: 'Envoie message WhatsApp via deeplink wa.me (ouvre app native iPhone/Android, user clique envoyer). Phone E.164 ou avec espaces. Retourne url + visual pour modal Apex.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Numéro téléphone (E.164 +33... ou avec espaces)' },
        message: { type: 'string', description: 'Message pré-rempli' },
        contact_name: { type: 'string', description: 'Nom contact pour résolution carnet (alternative à phone)' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'whatsapp_call',
    description: 'Appel WhatsApp : ouvre wa.me avec contact, user clique icône appel. Direct call sans clic impossible côté web (limite plateforme). Visual modal Apex avec bouton.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        contact_name: { type: 'string', description: 'Nom contact pour résolution carnet (ex: "Yannou")' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'B',
  },
  {
    name: 'whatsapp_video_call',
    description: 'Appel vidéo WhatsApp : ouvre app pour video call (user clique icône caméra).',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        contact_name: { type: 'string' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'B',
  },
  {
    name: 'gmail_compose',
    description: 'Compose email Gmail via deeplink Gmail web.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'gmail_list_unread',
    description: 'Liste emails non lus Gmail (nécessite OAuth token configuré dans Vault). Retourne {oauthRequired:true} sinon.',
    inputSchema: {
      type: 'object',
      properties: {
        max: { type: 'number', description: 'Nombre max résultats (default 20)' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'gmail_archive',
    description: 'Archive un email Gmail (retire INBOX) ou applique un label custom. Nécessite OAuth.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string' },
        label: { type: 'string', description: 'Label à ajouter (default: archive)' },
      },
      required: ['email_id'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'outlook_compose',
    description: 'Compose email Outlook via deeplink Outlook web.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'outlook_list_unread',
    description: 'Liste emails non lus Outlook (Microsoft Graph API, nécessite OAuth).',
    inputSchema: {
      type: 'object',
      properties: { max: { type: 'number' } },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'facebook_post',
    description: 'Publie post sur page Facebook Business (token + pageId + Meta App Review obligatoires).',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        media_url: { type: 'string', description: 'URL image/vidéo' },
        page_id: { type: 'string' },
      },
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'instagram_post',
    description: 'Publie sur Instagram (Business account + Meta App Review). Type: image, video, ou reel.',
    inputSchema: {
      type: 'object',
      properties: {
        media_url: { type: 'string' },
        caption: { type: 'string' },
        type: { type: 'string', enum: ['image', 'video', 'reel'] },
      },
      required: ['media_url', 'type'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'tiktok_post',
    description: 'Publie vidéo sur TikTok (Business account + app review obligatoires).',
    inputSchema: {
      type: 'object',
      properties: {
        video_url: { type: 'string' },
        caption: { type: 'string' },
      },
      required: ['video_url', 'caption'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'youtube_upload',
    description: 'Upload vidéo YouTube (OAuth + quota daily 6 uploads gratuits).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', description: 'Tags string[]' },
        privacy: { type: 'string', enum: ['public', 'unlisted', 'private'] },
      },
      required: ['title', 'description'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'linkedin_post',
    description: 'Publie post LinkedIn (OAuth requis + personUrn).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        media_url: { type: 'string' },
      },
      required: ['text'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'twitter_post',
    description: 'Publie tweet sur X (Twitter) — API v2 OAuth, plan Basic 100€/mois pour write.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Max 280 caractères' },
      },
      required: ['text'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'telegram_send',
    description: 'Envoie message Telegram via Bot Token (gratuit @BotFather).',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['chat_id', 'text'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'discord_webhook',
    description: 'Envoie message Discord via webhook URL (créé dans channel settings).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['url', 'content'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'slack_post',
    description: 'Envoie message Slack via webhook URL ou Bot Token OAuth.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID ou #name' },
        text: { type: 'string' },
        webhook_url: { type: 'string', description: 'Webhook optionnel (sinon Bot Token Vault)' },
      },
      required: ['channel', 'text'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'notion_create_page',
    description: 'Crée page Notion dans une database (integration token + page partagée requis).',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['database_id', 'title', 'content'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'google_photos_list',
    description: 'Liste photos Google Photos (OAuth requis). albumId optionnel pour filtrer.',
    inputSchema: {
      type: 'object',
      properties: {
        album_id: { type: 'string' },
        max: { type: 'number', description: 'Default 50' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'google_photos_organize',
    description: 'Crée album Google Photos (OAuth scope appendonly). HONNÊTETÉ : limite API ne permet d\'ajouter que photos uploadées via app.',
    inputSchema: {
      type: 'object',
      properties: {
        album_name: { type: 'string' },
        photo_ids: { type: 'array', description: 'IDs photos optionnels' },
      },
      required: ['album_name'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'spotify_play',
    description: 'Lance lecture Spotify (Premium requis + OAuth user-modify-playback-state).',
    inputSchema: {
      type: 'object',
      properties: {
        track_id: { type: 'string' },
        context_uri: { type: 'string', description: 'URI playlist/album' },
        device_id: { type: 'string' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'spotify_create_playlist',
    description: 'Crée playlist Spotify et y ajoute tracks (OAuth playlist-modify).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        track_ids: { type: 'array', description: 'IDs tracks Spotify' },
        is_public: { type: 'string', description: '"true" si public (default privé)' },
      },
      required: ['name'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'icloud_photos_list',
    description: 'Liste photos iCloud — HONNÊTETÉ : pas d\'API publique Apple. Retourne native-only avec alternative Capacitor + PhotoKit.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'integrations_capabilities',
    description: 'Retourne matrice complète des capacités d\'intégration (status web/native/oauth-required par service + feature). HONNÊTETÉ Kevin.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Filtre par service (whatsapp, gmail, etc.). Vide = tout.' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'integrations_oauth_health',
    description: 'Vérifie état OAuth de tous les services (token présent + non expiré).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'contact_add',
    description: 'Ajoute un contact (nom, phone, email, whatsapp, aliases). Aliases pour fuzzy lookup ("Yannou" → Yann Roux).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        whatsapp: { type: 'string' },
        aliases: { type: 'array', description: 'Surnoms / variantes' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'contact_search',
    description: 'Recherche fuzzy un contact par nom/alias. Retourne array trié par similarité.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nom à chercher (fuzzy : "Yannou" → "Yann Roux")' },
        max: { type: 'number', description: 'Max résultats (default 10)' },
      },
      required: ['query'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'contact_list',
    description: 'Liste tous les contacts.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'contact_remove',
    description: 'Supprime contact par ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
];
