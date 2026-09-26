import { describe, it, expect } from 'vitest';
import { detectCredential, CREDENTIAL_PATTERNS } from '../../services/vault/credential-patterns.js';

describe('credential-patterns', () => {
  it('catalogue ≥ 40 patterns', () => {
    expect(CREDENTIAL_PATTERNS.length).toBeGreaterThanOrEqual(40);
  });
  it('détecte Anthropic', () => {
    const p = detectCredential('sk-ant-api03-' + 'A'.repeat(50));
    expect(p?.name).toBe('Anthropic');
    expect(p?.storageKey).toBe('ax_anthropic_key');
    expect(p?.dashboard).toContain('console.anthropic.com');
  });
  it('détecte Stripe', () => {
    const p = detectCredential('sk_test_' + 'B'.repeat(30));
    expect(p?.name).toBe('Stripe Secret Key');
    expect(p?.category).toBe('finance');
  });
  it('détecte Telegram bot', () => {
    const p = detectCredential('12345678:AAEhBP9iq-A_yLUyuqZxnfLwL3JT8lE2JwQ');
    expect(p?.name).toBe('Telegram Bot Token');
  });
  it('CRITIQUE refuse carte bancaire (forbidden)', () => {
    const p = detectCredential('4532 1234 5678 9010');
    expect(p?.category).toBe('forbidden');
    expect(p?.storageKey).toBe('__FORBIDDEN_CB__');
  });
  it('CRITIQUE refuse seed phrase 12 mots', () => {
    const seed = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const p = detectCredential(seed);
    expect(p?.category).toBe('forbidden');
  });
  it('retourne null sur valeur quelconque', () => {
    expect(detectCredential('hello world')).toBeNull();
  });
});

describe('credential-patterns extended (Kevin 2026-05-04 banking/crypto/social)', () => {
  it('catalogue enrichi ≥ 60 patterns après extension', () => {
    expect(CREDENTIAL_PATTERNS.length).toBeGreaterThanOrEqual(60);
  });

  describe('Banking patterns', () => {
    it('détecte Société Générale Client ID', () => {
      const p = detectCredential('SG123456789012');
      expect(p?.name).toBe('Société Générale Client ID');
      expect(p?.category).toBe('finance');
      expect(p?.storageKey).toBe('ax_socgen_client_id');
    });
    it('détecte BNP Paribas ID', () => {
      const p = detectCredential('bnp_12345678');
      expect(p?.name).toBe('BNP Paribas ID');
      expect(p?.category).toBe('finance');
    });
    it('détecte Crédit Agricole ID', () => {
      const p = detectCredential('ca_abcdef1234567890');
      expect(p?.name).toBe('Crédit Agricole ID');
    });
    it('détecte Crédit Mutuel ID', () => {
      const p = detectCredential('cm_abcdef1234567890');
      expect(p?.name).toBe('Crédit Mutuel ID');
    });
    it('détecte BPCE/Caisse Épargne ID', () => {
      const p = detectCredential('bpce_abcdef12345678');
      expect(p?.name).toBe('BPCE/Caisse Épargne ID');
    });
    it('détecte La Banque Postale ID', () => {
      const p = detectCredential('lbp_12345678');
      expect(p?.name).toBe('La Banque Postale ID');
    });
    it('détecte ING France ID', () => {
      const p = detectCredential('ing_abcdef1234567890');
      expect(p?.name).toBe('ING France ID');
    });
    it('détecte Boursorama Client', () => {
      const p = detectCredential('bourso_abcdef1234567890');
      expect(p?.name).toBe('Boursorama Client');
    });
    it('détecte Fortuneo Client', () => {
      const p = detectCredential('fortuneo_abcdef12345678');
      expect(p?.name).toBe('Fortuneo Client');
    });
    it('détecte N26 User ID', () => {
      const p = detectCredential('n26_abcdef-1234567890-xyz');
      expect(p?.name).toBe('N26 User ID');
    });
    it('détecte Revolut Tag avec @', () => {
      const p = detectCredential('@revolut_kevinkdmc');
      expect(p?.name).toBe('Revolut Tag');
    });
    it('détecte Wise Profile', () => {
      const p = detectCredential('wise_12345678');
      expect(p?.name).toBe('Wise (TransferWise) Profile');
    });
    it('détecte Lydia Tag', () => {
      const p = detectCredential('@lydia_kevin.kdmc');
      expect(p?.name).toBe('Lydia Tag');
    });
    it('détecte PayPal Email Tag', () => {
      const p = detectCredential('paypal:kevin@kdmc.com');
      expect(p?.name).toBe('PayPal Email Tag');
      expect(p?.storageKey).toBe('ax_paypal_email');
    });
  });

  describe('Crypto exchanges', () => {
    it('détecte Coinbase API Key', () => {
      const p = detectCredential('coinbase_' + 'A'.repeat(40));
      expect(p?.name).toBe('Coinbase API Key');
      expect(p?.category).toBe('finance');
    });
    it('détecte Binance API Key', () => {
      const p = detectCredential('binance_' + 'B'.repeat(50));
      expect(p?.name).toBe('Binance API Key');
    });
    it('détecte Crypto.com API Key', () => {
      const p = detectCredential('crypto_' + 'C'.repeat(40));
      expect(p?.name).toBe('Crypto.com API Key');
    });
    it('détecte Kraken API Key', () => {
      const p = detectCredential('kraken_' + 'X'.repeat(50));
      expect(p?.name).toBe('Kraken API Key');
    });
  });

  describe('Réseaux sociaux', () => {
    it('détecte Facebook OAuth', () => {
      const p = detectCredential('EAA' + 'A'.repeat(60));
      expect(p?.name).toBe('Facebook OAuth Token');
      expect(p?.category).toBe('comms');
    });
    it('détecte Instagram Token', () => {
      const p = detectCredential('IGQVJ' + 'A'.repeat(60));
      expect(p?.name).toBe('Instagram Access Token');
    });
    it('détecte TikTok Creator Token', () => {
      const p = detectCredential('tiktok_abcdef.123-456_xyz_789');
      expect(p?.name).toBe('TikTok Creator Token');
    });
    it('détecte Twitter/X Bearer', () => {
      const p = detectCredential('AAAAAAAAAAAAAAAAAA' + 'X'.repeat(60));
      expect(p?.name).toBe('Twitter/X Bearer Token');
    });
    it('détecte LinkedIn Access Token', () => {
      const p = detectCredential('AQ' + 'A'.repeat(150));
      expect(p?.name).toBe('LinkedIn Access Token');
    });
  });

  describe('Productivité / Identité', () => {
    it('détecte Google Account Email', () => {
      const p = detectCredential('kevin@gmail.com');
      expect(p?.name).toBe('Google Account Email');
      expect(p?.category).toBe('identity');
    });
    it('détecte Microsoft 365 Email', () => {
      const p = detectCredential('kevin@outlook.com');
      expect(p?.name).toBe('Microsoft 365 Email');
    });
    it('détecte Apple ID Email', () => {
      const p = detectCredential('kevin@icloud.com');
      expect(p?.name).toBe('Apple ID Email');
    });
  });

  describe('E-commerce / Délivrables', () => {
    it('détecte Stripe Connect Account', () => {
      const p = detectCredential('acct_' + '1'.repeat(20));
      expect(p?.name).toBe('Stripe Connect Account');
    });
    it('détecte PayPal Business Email', () => {
      const p = detectCredential('paypal_biz:contact@kdmc.com');
      expect(p?.name).toBe('PayPal Business Email');
    });
    it('détecte Shopify Admin Token', () => {
      const p = detectCredential('shpat_' + 'a'.repeat(32));
      expect(p?.name).toBe('Shopify Admin Token');
    });
    it('détecte Shopify Storefront Token', () => {
      const p = detectCredential('shpss_' + 'b'.repeat(32));
      expect(p?.name).toBe('Shopify Storefront Token');
    });
  });

  describe('Forbidden étendus', () => {
    it('refuse mot de passe bancaire plain', () => {
      const p = detectCredential('bank_password:supersecret');
      expect(p?.category).toBe('forbidden');
      expect(p?.storageKey).toBe('__FORBIDDEN_BANK_PASS__');
    });
    it('refuse mdp_banque plain', () => {
      const p = detectCredential('mdp_banque:secret123');
      expect(p?.category).toBe('forbidden');
    });
    it('v13.3.98 refuse SSH private key', () => {
      const p = detectCredential('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXkt');
      expect(p?.category).toBe('forbidden');
      expect(p?.storageKey).toBe('__FORBIDDEN_SSH_KEY__');
    });
  });
});

describe('v13.3.98 P0.1 — FIX faux positif YouTube vs Google AI (Kevin 2026-05-09)', () => {
  it('AIzaSy + 31 chars (clé Gemini standard) → Google AI Gemini (PAS YouTube par défaut)', () => {
    /* v13.4.6 fix Kevin "il confond Gemini" — renommé Google AI → Google AI Gemini
     * + storageKey ax_google_key → ax_gemini_key cohérent. */
    const key = 'AIzaSy' + 'A'.repeat(31); /* 37 chars total */
    const p = detectCredential(key);
    expect(p?.name).toBe('Google AI Gemini');
    expect(p?.storageKey).toBe('ax_gemini_key');
  });
  it('youtube:AIza... (préfixe explicite) → YouTube', () => {
    const key = 'youtube:AIza' + 'A'.repeat(33);
    const p = detectCredential(key);
    expect(p?.name).toContain('YouTube');
    expect(p?.storageKey).toBe('ax_youtube_key');
  });
});

describe('v13.3.98 P0.2 — Patterns URLs/Connection strings/Webhooks', () => {
  it('détecte PostgreSQL connection', () => {
    const p = detectCredential('postgres://user:pass@db.host.com:5432/mydb');
    expect(p?.name).toBe('PostgreSQL Connection');
    expect(p?.storageKey).toBe('ax_postgres_url');
  });
  it('détecte PostgreSQL avec postgresql://', () => {
    const p = detectCredential('postgresql://u:p@host/db?sslmode=require');
    expect(p?.name).toBe('PostgreSQL Connection');
  });
  it('détecte MySQL connection', () => {
    const p = detectCredential('mysql://root:secret@127.0.0.1:3306/app_db');
    expect(p?.name).toBe('MySQL Connection');
    expect(p?.storageKey).toBe('ax_mysql_url');
  });
  it('détecte MongoDB connection (avec srv)', () => {
    const p = detectCredential('mongodb+srv://u:p@cluster.mongodb.net/mydb?retryWrites=true');
    expect(p?.name).toBe('MongoDB Connection');
    expect(p?.storageKey).toBe('ax_mongodb_url');
  });
  it('détecte Redis connection (rediss://)', () => {
    const p = detectCredential('rediss://default:xyz@redis.example.com:6379/0');
    expect(p?.name).toBe('Redis Connection');
    expect(p?.storageKey).toBe('ax_redis_url');
  });
  it('détecte Slack Webhook', () => {
    const p = detectCredential('https://hooks.slack.com/services/T01ABCDEF/B01ABCDEF/abcdefghij1234567890');
    expect(p?.name).toBe('Slack Webhook URL');
    expect(p?.storageKey).toBe('ax_slack_webhook_url');
  });
  it('détecte Railway service URL', () => {
    const p = detectCredential('https://my-app.up.railway.app');
    expect(p?.name).toBe('Railway Service URL');
    expect(p?.storageKey).toBe('ax_railway_url');
  });
  it('détecte Cloudflare Worker URL', () => {
    const p = detectCredential('https://my-worker.kevin.workers.dev');
    expect(p?.name).toBe('Cloudflare Worker URL');
    expect(p?.storageKey).toBe('ax_cloudflare_worker_url');
  });
  it('détecte Google OAuth refresh token', () => {
    const p = detectCredential('1//0gAAAA' + 'a'.repeat(60));
    expect(p?.name).toBe('Google OAuth Refresh Token');
  });
  it('détecte JWT générique', () => {
    const p = detectCredential('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk');
    expect(p?.name).toBe('JWT Token (générique)');
  });
});
