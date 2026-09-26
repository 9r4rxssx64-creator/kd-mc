/**
 * APEX v13 — OAuth Providers Registry (13 services).
 *
 * Pourquoi (Kevin v13.3.16 rapport "0/13 OAuth services") :
 * - Liste 13 OAuth providers (Gmail, Outlook, YouTube, Instagram, Facebook, TikTok,
 *   LinkedIn, Twitter/X, Telegram, Slack, Notion, Google Photos, Spotify).
 * - Status check : clé/token présent vs manquant via vault.readKey().
 * - Liens directs vers consoles dev de chaque provider.
 * - Affiché dans `?view=credentials` pour configuration 1-clic.
 *
 * Stockage des credentials :
 *   ax_oauth_<provider>_token        - Access token
 *   ax_oauth_<provider>_refresh      - Refresh token (long-lived)
 *   ax_oauth_<provider>_client_id    - OAuth client ID
 *   ax_oauth_<provider>_client_secret - OAuth client secret (chiffré)
 *
 * API :
 * - getProviders() : liste statique des 13 providers
 * - getStatus() : Promise<{ provider_id, configured, has_token, has_refresh, scopes? }[]>
 * - getProvider(id) : provider details + status
 *
 * Volontairement ne PAS implémenter le flow OAuth complet (PKCE) ici — ce stub permet
 * juste l'affichage UI + le check de credential. Le flow concret est déclenché par le
 * feature `?view=credentials` quand Kevin clique "Connecter X".
 */

import { logger } from '../../core/logger.js';

/* ========================================================================== */

export interface OAuthProvider {
  id: string;
  name: string;
  category: 'email' | 'social' | 'video' | 'productivity' | 'music' | 'photos' | 'messaging';
  icon: string;
  description: string;
  console_url: string;          /* Lien dev console pour créer app OAuth */
  oauth_authorize_url: string;  /* Endpoint authorize (vide si custom flow) */
  oauth_token_url: string;      /* Endpoint token exchange */
  scopes: string[];             /* Scopes recommandés */
  required_keys: string[];      /* Clés à fournir minimum (client_id, etc) */
  docs_url: string;
}

export interface OAuthProviderStatus {
  provider_id: string;
  configured: boolean;
  has_token: boolean;
  has_refresh: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
}

export interface OAuthRegistrySummary {
  total: number;
  configured: number;
  by_category: Record<string, { total: number; configured: number }>;
  providers: (OAuthProvider & OAuthProviderStatus)[];
}

/* ========================================================================== */

const PROVIDERS: readonly OAuthProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'email',
    icon: '📧',
    description: 'Lire/envoyer emails Gmail',
    console_url: 'https://console.cloud.google.com/apis/credentials',
    oauth_authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    oauth_token_url: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.google.com/gmail/api/quickstart/js',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    category: 'email',
    icon: '📨',
    description: 'Lire/envoyer emails Outlook (Microsoft Graph)',
    console_url: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    oauth_authorize_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    oauth_token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Mail.ReadWrite', 'Mail.Send', 'offline_access'],
    required_keys: ['client_id'],
    docs_url: 'https://learn.microsoft.com/graph/auth-v2-user',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'video',
    icon: '▶️',
    description: 'Upload vidéos YouTube + manage chaîne',
    console_url: 'https://console.cloud.google.com/apis/credentials',
    oauth_authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    oauth_token_url: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.google.com/youtube/v3/quickstart/js',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: '📷',
    description: 'Publier sur Instagram (via Facebook Graph)',
    console_url: 'https://developers.facebook.com/apps/',
    oauth_authorize_url: 'https://api.instagram.com/oauth/authorize',
    oauth_token_url: 'https://api.instagram.com/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    icon: '👥',
    description: 'Publier pages Facebook + analytics',
    console_url: 'https://developers.facebook.com/apps/',
    oauth_authorize_url: 'https://www.facebook.com/v18.0/dialog/oauth',
    oauth_token_url: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.facebook.com/docs/facebook-login/',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'video',
    icon: '🎵',
    description: 'Upload vidéos TikTok (Open API)',
    console_url: 'https://developers.tiktok.com/',
    oauth_authorize_url: 'https://www.tiktok.com/v2/auth/authorize',
    oauth_token_url: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.upload'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.tiktok.com/doc/login-kit-web',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    icon: '💼',
    description: 'Publier posts LinkedIn + profil',
    console_url: 'https://www.linkedin.com/developers/apps',
    oauth_authorize_url: 'https://www.linkedin.com/oauth/v2/authorization',
    oauth_token_url: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['w_member_social', 'r_liteprofile'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://learn.microsoft.com/linkedin/shared/authentication/authentication',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    category: 'social',
    icon: '🐦',
    description: 'Publier tweets + DMs',
    console_url: 'https://developer.x.com/en/portal/projects-and-apps',
    oauth_authorize_url: 'https://twitter.com/i/oauth2/authorize',
    oauth_token_url: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    icon: '✈️',
    description: 'Bot Telegram (via @BotFather)',
    console_url: 'https://core.telegram.org/bots#botfather',
    oauth_authorize_url: '', /* Bot token, pas OAuth standard */
    oauth_token_url: '',
    scopes: [],
    required_keys: ['bot_token'],
    docs_url: 'https://core.telegram.org/bots/api',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'messaging',
    icon: '💬',
    description: 'Notifications + bot Slack',
    console_url: 'https://api.slack.com/apps',
    oauth_authorize_url: 'https://slack.com/oauth/v2/authorize',
    oauth_token_url: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read', 'incoming-webhook'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://api.slack.com/authentication/oauth-v2',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'productivity',
    icon: '📝',
    description: 'Lire/écrire Notion databases',
    console_url: 'https://www.notion.so/my-integrations',
    oauth_authorize_url: 'https://api.notion.com/v1/oauth/authorize',
    oauth_token_url: 'https://api.notion.com/v1/oauth/token',
    scopes: [], /* Notion: scopes via integration capabilities */
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.notion.com/docs/authorization',
  },
  {
    id: 'google_photos',
    name: 'Google Photos',
    category: 'photos',
    icon: '🖼️',
    description: 'Upload/recherche photos Google Photos',
    console_url: 'https://console.cloud.google.com/apis/credentials',
    oauth_authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    oauth_token_url: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/photoslibrary'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developers.google.com/photos/library/guides/get-started',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    icon: '🎧',
    description: 'Playlists + lecture Spotify',
    console_url: 'https://developer.spotify.com/dashboard',
    oauth_authorize_url: 'https://accounts.spotify.com/authorize',
    oauth_token_url: 'https://accounts.spotify.com/api/token',
    scopes: ['user-read-playback-state', 'user-modify-playback-state', 'playlist-modify-private'],
    required_keys: ['client_id', 'client_secret'],
    docs_url: 'https://developer.spotify.com/documentation/web-api',
  },
] as const;

/* ========================================================================== */

class OAuthProvidersRegistry {
  /**
   * Liste tous les providers (statique).
   */
  getProviders(): readonly OAuthProvider[] {
    return PROVIDERS;
  }

  /**
   * Récupère un provider par id.
   */
  getProvider(id: string): OAuthProvider | undefined {
    return PROVIDERS.find((p) => p.id === id);
  }

  /**
   * Status d'un provider (configured / has_token / etc).
   */
  async getProviderStatus(id: string): Promise<OAuthProviderStatus | null> {
    const p = this.getProvider(id);
    if (!p) return null;
    return this.computeStatus(p);
  }

  /**
   * Status global (utilisé par UI ?view=credentials et sentinelle).
   */
  async getStatus(): Promise<OAuthRegistrySummary> {
    const providersWithStatus: (OAuthProvider & OAuthProviderStatus)[] = [];
    let configured = 0;
    const byCategory: Record<string, { total: number; configured: number }> = {};

    for (const p of PROVIDERS) {
      const s = await this.computeStatus(p);
      const merged = { ...p, ...s };
      providersWithStatus.push(merged);
      if (s.configured) configured++;
      const cat = p.category;
      if (!byCategory[cat]) byCategory[cat] = { total: 0, configured: 0 };
      byCategory[cat].total++;
      if (s.configured) byCategory[cat].configured++;
    }

    return {
      total: PROVIDERS.length,
      configured,
      by_category: byCategory,
      providers: providersWithStatus,
    };
  }

  private async computeStatus(p: OAuthProvider): Promise<OAuthProviderStatus> {
    const status: OAuthProviderStatus = {
      provider_id: p.id,
      configured: false,
      has_token: false,
      has_refresh: false,
      has_client_id: false,
      has_client_secret: false,
    };
    try {
      const { vault } = await import('../vault/vault.js');
      const tokenKey = `ax_oauth_${p.id}_token`;
      const refreshKey = `ax_oauth_${p.id}_refresh`;
      const clientIdKey = `ax_oauth_${p.id}_client_id`;
      const clientSecretKey = `ax_oauth_${p.id}_client_secret`;
      /* Special-case Telegram (bot_token only) */
      if (p.id === 'telegram') {
        const bot = await vault.readKey('ax_telegram_bot_token').catch(() => '');
        status.has_token = bot.length > 10;
        status.configured = status.has_token;
        return status;
      }
      const [tok, refresh, cid, csec] = await Promise.all([
        vault.readKey(tokenKey).catch(() => ''),
        vault.readKey(refreshKey).catch(() => ''),
        vault.readKey(clientIdKey).catch(() => ''),
        vault.readKey(clientSecretKey).catch(() => ''),
      ]);
      status.has_token = tok.length > 10;
      status.has_refresh = refresh.length > 10;
      status.has_client_id = cid.length > 5;
      status.has_client_secret = csec.length > 5;
      /* Configured = au minimum client_id présent OU token actif */
      status.configured = status.has_token || (status.has_client_id && status.has_client_secret);
    } catch (err: unknown) {
      logger.warn('oauth-providers-registry', `computeStatus ${p.id} failed`, {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return status;
  }

  /**
   * URL d'authorize OAuth construite (utilisée par flow PKCE futur).
   */
  buildAuthorizeUrl(providerId: string, redirectUri: string, state: string): string | null {
    const p = this.getProvider(providerId);
    if (!p || !p.oauth_authorize_url) return null;
    const url = new URL(p.oauth_authorize_url);
    /* Ne stocke pas client_id ici — c'est au feature credentials de récupérer via vault */
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    if (p.scopes.length > 0) url.searchParams.set('scope', p.scopes.join(' '));
    return url.toString();
  }
}

/* ========================================================================== */

export const oauthProvidersRegistry = new OAuthProvidersRegistry();
