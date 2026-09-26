/**
 * Tests services/oauth-providers-registry.ts — 13 OAuth providers status check.
 *
 * Couvre :
 * - getProviders() : retourne les 13 providers prédéfinis
 * - getProvider(id) : récup par id, undefined si inconnu
 * - getProviderStatus(id) : status configured / has_token / has_refresh
 * - getStatus() : summary avec by_category counts
 * - buildAuthorizeUrl() : génération URL avec state, redirect_uri, scope
 * - Telegram special case : bot_token only
 * - Pas de provider sans authorize_url (Telegram)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { oauthProvidersRegistry } from '../../services/integrations/oauth-providers-registry.js';
import { vault } from '../../services/vault/vault.js';

describe('oauth-providers-registry (13 providers)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProviders()', () => {
    it('retourne exactement 13 providers', () => {
      const providers = oauthProvidersRegistry.getProviders();
      expect(providers.length).toBe(13);
    });

    it('chaque provider a un id, name, category, icon', () => {
      const providers = oauthProvidersRegistry.getProviders();
      for (const p of providers) {
        expect(typeof p.id).toBe('string');
        expect(p.id.length).toBeGreaterThan(0);
        expect(typeof p.name).toBe('string');
        expect(typeof p.category).toBe('string');
        expect(typeof p.icon).toBe('string');
        expect(typeof p.description).toBe('string');
        expect(typeof p.console_url).toBe('string');
        expect(typeof p.docs_url).toBe('string');
        expect(Array.isArray(p.scopes)).toBe(true);
        expect(Array.isArray(p.required_keys)).toBe(true);
      }
    });

    it('tous les ids sont uniques', () => {
      const providers = oauthProvidersRegistry.getProviders();
      const ids = providers.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(providers.length);
    });

    it('contient les 13 providers attendus', () => {
      const ids = oauthProvidersRegistry.getProviders().map((p) => p.id);
      const expected = [
        'gmail', 'outlook', 'youtube', 'instagram', 'facebook',
        'tiktok', 'linkedin', 'twitter', 'telegram', 'slack',
        'notion', 'google_photos', 'spotify',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('catégories valides (email, social, video, productivity, music, photos, messaging)', () => {
      const validCategories = ['email', 'social', 'video', 'productivity', 'music', 'photos', 'messaging'];
      for (const p of oauthProvidersRegistry.getProviders()) {
        expect(validCategories).toContain(p.category);
      }
    });

    it('console_url et docs_url sont des URLs valides (https)', () => {
      for (const p of oauthProvidersRegistry.getProviders()) {
        expect(p.console_url).toMatch(/^https:\/\//);
        expect(p.docs_url).toMatch(/^https:\/\//);
      }
    });
  });

  describe('getProvider(id)', () => {
    it('retourne provider connu', () => {
      const p = oauthProvidersRegistry.getProvider('gmail');
      expect(p).toBeDefined();
      expect(p?.name).toBe('Gmail');
      expect(p?.category).toBe('email');
    });

    it('retourne provider Telegram spécial', () => {
      const p = oauthProvidersRegistry.getProvider('telegram');
      expect(p).toBeDefined();
      expect(p?.required_keys).toContain('bot_token');
      expect(p?.oauth_authorize_url).toBe('');
    });

    it('retourne undefined si id inconnu', () => {
      const p = oauthProvidersRegistry.getProvider('inexistant');
      expect(p).toBeUndefined();
    });

    it('retourne undefined sur id vide', () => {
      const p = oauthProvidersRegistry.getProvider('');
      expect(p).toBeUndefined();
    });
  });

  describe('getProviderStatus(id)', () => {
    it('retourne null si provider inconnu', async () => {
      const s = await oauthProvidersRegistry.getProviderStatus('inexistant');
      expect(s).toBeNull();
    });

    it('configured=false si vault retourne tout vide', async () => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('');
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s).toBeDefined();
      expect(s?.configured).toBe(false);
      expect(s?.has_token).toBe(false);
      expect(s?.has_client_id).toBe(false);
    });

    it('has_token=true si token présent (>10 chars)', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_oauth_gmail_token') return 'token-very-long-1234567890';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s?.has_token).toBe(true);
      expect(s?.configured).toBe(true);
    });

    it('configured via client_id+client_secret combo', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_oauth_gmail_client_id') return 'client-id-long-string';
        if (k === 'ax_oauth_gmail_client_secret') return 'client-secret-string';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s?.has_client_id).toBe(true);
      expect(s?.has_client_secret).toBe(true);
      expect(s?.configured).toBe(true);
    });

    it('configured=false si seulement client_id sans secret', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_oauth_gmail_client_id') return 'client-id-long-string';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s?.has_client_id).toBe(true);
      expect(s?.configured).toBe(false);
    });

    it('Telegram special : bot_token seul détermine configured', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_telegram_bot_token') return 'bot-token-very-long-string';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('telegram');
      expect(s?.has_token).toBe(true);
      expect(s?.configured).toBe(true);
    });

    it('Telegram bot_token court → configured=false', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_telegram_bot_token') return 'short';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('telegram');
      expect(s?.has_token).toBe(false);
      expect(s?.configured).toBe(false);
    });

    it('has_refresh détecté si refresh token présent', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_oauth_gmail_refresh') return 'refresh-token-long-string';
        return '';
      });
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s?.has_refresh).toBe(true);
    });

    it('vault.readKey throw → status default false (catch silencieux)', async () => {
      vi.spyOn(vault, 'readKey').mockRejectedValue(new Error('vault locked'));
      const s = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(s).toBeDefined();
      expect(s?.configured).toBe(false);
    });
  });

  describe('getStatus()', () => {
    beforeEach(() => {
      vi.spyOn(vault, 'readKey').mockResolvedValue('');
    });

    it('retourne summary avec total=13', async () => {
      const summary = await oauthProvidersRegistry.getStatus();
      expect(summary.total).toBe(13);
    });

    it('configured=0 quand aucune clé', async () => {
      const summary = await oauthProvidersRegistry.getStatus();
      expect(summary.configured).toBe(0);
    });

    it('by_category contient toutes les catégories utilisées', async () => {
      const summary = await oauthProvidersRegistry.getStatus();
      expect(summary.by_category).toBeDefined();
      const cats = Object.keys(summary.by_category);
      expect(cats.length).toBeGreaterThan(0);
      /* total des cats = nombre total */
      const sumByCategory = Object.values(summary.by_category).reduce(
        (acc, v) => acc + v.total,
        0,
      );
      expect(sumByCategory).toBe(13);
    });

    it('providers array contient 13 enrichis avec status', async () => {
      const summary = await oauthProvidersRegistry.getStatus();
      expect(summary.providers.length).toBe(13);
      for (const p of summary.providers) {
        expect(typeof p.id).toBe('string');
        expect(typeof p.configured).toBe('boolean');
        expect(typeof p.has_token).toBe('boolean');
      }
    });

    it('configured count exact si certains providers ont des tokens', async () => {
      vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        if (k === 'ax_oauth_gmail_token') return 'token-very-long-1234';
        if (k === 'ax_telegram_bot_token') return 'bot-token-very-long';
        return '';
      });
      const summary = await oauthProvidersRegistry.getStatus();
      expect(summary.configured).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildAuthorizeUrl()', () => {
    it('retourne null si provider inconnu', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('inexistant', 'http://x.com', 'state-1');
      expect(url).toBeNull();
    });

    it('retourne null pour Telegram (oauth_authorize_url vide)', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('telegram', 'http://x.com', 'state-1');
      expect(url).toBeNull();
    });

    it('génère URL avec query params pour Gmail', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('gmail', 'http://localhost/callback', 'state-abc');
      expect(url).toBeTruthy();
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=state-abc');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=');
    });

    it('encode redirect_uri proprement', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl(
        'gmail',
        'http://localhost:3000/callback?x=1',
        'state-1',
      );
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
    });

    it('génère URL Slack avec scopes joints', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('slack', 'http://x.com', 's1');
      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('scope=');
    });

    it('génère URL pour tous les providers avec authorize_url', () => {
      const providers = oauthProvidersRegistry.getProviders();
      for (const p of providers) {
        if (p.oauth_authorize_url) {
          const url = oauthProvidersRegistry.buildAuthorizeUrl(p.id, 'http://x.com', 'st');
          expect(url).toBeTruthy();
          expect(url).toContain('redirect_uri=');
          expect(url).toContain('state=st');
        }
      }
    });

    it('Notion sans scopes → URL ne contient pas scope param', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('notion', 'http://x.com', 's1');
      expect(url).toBeTruthy();
      /* Notion: scopes vides → param scope= n'est pas ajouté */
      expect(url).not.toContain('&scope=');
    });

    it('génère URL TikTok avec scope basic', () => {
      const url = oauthProvidersRegistry.buildAuthorizeUrl('tiktok', 'http://x.com', 's1');
      expect(url).toContain('https://www.tiktok.com/v2/auth/authorize');
      expect(url).toContain('scope=');
    });
  });

  describe('Validation structure complète', () => {
    it('Outlook : seul required_keys=[client_id]', () => {
      const p = oauthProvidersRegistry.getProvider('outlook');
      expect(p?.required_keys).toEqual(['client_id']);
    });

    it('Spotify : scopes incluent playback', () => {
      const p = oauthProvidersRegistry.getProvider('spotify');
      expect(p?.scopes.some((s) => s.includes('playback'))).toBe(true);
    });

    it('Gmail : scopes Google specific', () => {
      const p = oauthProvidersRegistry.getProvider('gmail');
      expect(p?.scopes.some((s) => s.includes('googleapis.com'))).toBe(true);
    });
  });

  describe('computeStatus — catch (campagne 100%)', () => {
    it('vault.readKey throw synchrone → catch → status par défaut (pas de throw)', async () => {
      /* throw SYNCHRONE → le `.catch(()=>'')` chaîné n'est jamais atteint → outer catch (322) */
      vi.spyOn(vault, 'readKey').mockImplementation(() => { throw new Error('vault down'); });
      const status = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(status).not.toBeNull();
      expect(status?.configured).toBe(false);
    });

    it('vault.readKey throw non-Error (string) → catch log String(err)', async () => {
      // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
      vi.spyOn(vault, 'readKey').mockImplementation(() => { throw 'vault-str'; });
      const status = await oauthProvidersRegistry.getProviderStatus('gmail');
      expect(status?.configured).toBe(false);
    });
  });
});
