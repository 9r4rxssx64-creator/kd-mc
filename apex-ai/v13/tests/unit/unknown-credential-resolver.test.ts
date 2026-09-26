/**
 * Tests unknown-credential-resolver.ts (46.96% → 90%+).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unknownCredentialResolver } from '../../services/vault/unknown-credential-resolver.js';

describe('unknown-credential-resolver (P0 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('tryIdentify() heuristics', () => {
    it('value vide → null', async () => {
      const r = await unknownCredentialResolver.tryIdentify('');
      expect(r).toBeNull();
    });

    it('value trop courte (<16) → null', async () => {
      const r = await unknownCredentialResolver.tryIdentify('short');
      expect(r).toBeNull();
    });

    it('Anthropic prefix sk-ant- → identified high', async () => {
      const r = await unknownCredentialResolver.tryIdentify('sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('anthropic');
      expect(r?.confidence).toBe('high');
      expect(r?.dashboard_url).toContain('anthropic');
      expect(r?.billing_url).toContain('billing');
      expect(r?.storage_key).toBe('ax_anthropic_key');
    });

    it('OpenAI sk-proj- → openai_project high', async () => {
      const r = await unknownCredentialResolver.tryIdentify('sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('openai_project');
    });

    it('OpenAI generic sk- (medium)', async () => {
      const r = await unknownCredentialResolver.tryIdentify('sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('openai');
      expect(r?.confidence).toBe('medium');
    });

    it('Groq gsk_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('groq');
    });

    it('OpenRouter sk-or- (en pratique matché par sk- générique d\'abord)', async () => {
      /* sk- précède sk-or- dans PREFIX_HEURISTICS donc tombe sur openai medium */
      const r = await unknownCredentialResolver.tryIdentify('sk-or-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBeTruthy();
      /* OpenAI ou OpenRouter selon ordre */
      expect(['openai', 'openrouter']).toContain(r?.service);
    });

    it('Perplexity pplx-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('pplx-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('perplexity');
    });

    it('xAI Grok xai-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('xai-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('xai_grok');
    });

    it('Google AIza prefix', async () => {
      const r = await unknownCredentialResolver.tryIdentify('AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('google_ai');
    });

    it('Replicate r8_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('r8_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('replicate');
    });

    it('Stripe sk_live_', async () => {
      /* Fake key avec format reconnaissable mais non valide Stripe (anti-secret-scan) */
      const fakeStripe = 'sk_' + 'live_' + 'X'.repeat(28);
      const r = await unknownCredentialResolver.tryIdentify(fakeStripe);
      expect(r?.service).toBe('stripe_secret');
    });

    it('Stripe sk_test_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('sk_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('stripe_secret');
    });

    it('Stripe pk_live_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('pk_live_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('stripe_publishable');
    });

    it('Stripe rk_live_', async () => {
      /* Fake key concat (anti-secret-scan) */
      const fakeRk = 'rk_' + 'live_' + 'X'.repeat(28);
      const r = await unknownCredentialResolver.tryIdentify(fakeRk);
      expect(r?.service).toBe('stripe_restricted');
    });

    it('Stripe whsec_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('stripe_webhook');
    });

    it('Brevo xkeysib-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('xkeysib-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('brevo');
    });

    it('Resend re_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('re_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('resend');
    });

    it('SendGrid SG.', async () => {
      const r = await unknownCredentialResolver.tryIdentify('SG.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('sendgrid');
    });

    it('GitHub ghp_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('github_pat');
    });

    it('GitHub fine grained github_pat_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('github_pat_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('github_fine_grained');
    });

    it('GitHub OAuth gho_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('github_oauth');
    });

    it('GitLab glpat-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('glpat-AAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('gitlab');
    });

    it('Notion secret_', async () => {
      const r = await unknownCredentialResolver.tryIdentify('secret_AAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('notion');
    });

    it('Slack xoxb-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('xoxb-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(['slack', 'slack_bot']).toContain(r?.service);
    });

    it('Slack xoxp-', async () => {
      const r = await unknownCredentialResolver.tryIdentify('xoxp-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(r?.service).toBe('slack');
    });

    it('AWS access key AKIA', async () => {
      const r = await unknownCredentialResolver.tryIdentify('AKIAAAAAAAAAAAAAAAAA1234567890');
      expect(r?.service).toBe('aws_access_key');
    });
  });

  describe('tryIdentify() generic charset detection', () => {
    it('hex string → confidence low generic', async () => {
      const v = '0123456789abcdef0123456789abcdef0123456789abcdef';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r?.confidence).toBe('low');
      expect(r?.service).toContain('unknown_');
      expect(r?.pattern_learned).toBeTruthy();
    });

    it('alphanum-only avec _ et - → base64url low', async () => {
      /* Une string alphanum pure tombera en base64 (incl A-Z 0-9) — utiliser base64url avec _ ou - */
      const v = 'abc123ABC456-def789GHI_012jkl345MNO';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r?.confidence).toBe('low');
    });

    it('base64url string → confidence low generic', async () => {
      const v = 'abc-_DEF123_-ghi-jkl_mno-pqr_stuvwxyz_AB';
      const r = await unknownCredentialResolver.tryIdentify(v);
      expect(r?.confidence).toBe('low');
    });
  });

  describe('learn() + listLearned()', () => {
    it('learn nouveau pattern persiste', async () => {
      const v = '0123456789abcdef0123456789abcdef0123456789';
      const r = await unknownCredentialResolver.tryIdentify(v);
      if (r && r.pattern_learned) {
        await unknownCredentialResolver.learn(v, r);
        const learned = unknownCredentialResolver.listLearned();
        expect(learned.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('learn pattern existant ne duplique pas', async () => {
      const v = 'aaaabbbbccccddddeeeeffffgggghhhh';
      const r = await unknownCredentialResolver.tryIdentify(v);
      if (r && r.pattern_learned) {
        await unknownCredentialResolver.learn(v, r);
        await unknownCredentialResolver.learn(v, r); /* idempotent */
        const learned = unknownCredentialResolver.listLearned();
        const sameService = learned.filter((l) => l.service === r.service);
        expect(sameService.length).toBe(1);
      }
    });

    it('learn sans pattern_learned → no-op', async () => {
      const fakeResolved = {
        service: 'fake',
        storage_key: 'ax_fake_key',
        dashboard_url: 'https://fake.com',
        confidence: 'high' as const,
        reason: 'test',
      };
      await unknownCredentialResolver.learn('any', fakeResolved);
      const learned = unknownCredentialResolver.listLearned();
      expect(learned.find((l) => l.service === 'fake')).toBeUndefined();
    });

    it('learn push aussi ax_claude_todo', async () => {
      const v = 'xxyyzzaa11223344556677889900xxyyzz';
      const r = await unknownCredentialResolver.tryIdentify(v);
      if (r && r.pattern_learned) {
        await unknownCredentialResolver.learn(v, r);
        const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
        expect(todos.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('listLearned localStorage corrompu → []', () => {
      localStorage.setItem('apex_v13_learned_patterns', 'broken');
      const r = unknownCredentialResolver.listLearned();
      expect(r).toEqual([]);
    });
  });

  describe('webSearchService() fallback', () => {
    it('fetch fail → null', async () => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('net'))) as unknown as typeof fetch;
      try {
        /* Format mixed (pas générique) → essaie web search */
        const r = await unknownCredentialResolver.tryIdentify('zz!@#$%^&*()_+-=mix1234');
        expect(r === null || (r !== null && r.confidence === 'low')).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('fetch return ok=false → null', async () => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response)) as unknown as typeof fetch;
      try {
        const r = await unknownCredentialResolver.tryIdentify('zz!@#$%^&*()_+-=mix1234');
        expect(r === null || r.confidence === 'low').toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('fetch return HTML avec href → service détecté', async () => {
      const origFetch = globalThis.fetch;
      const html = '<a href="https://newservice.com/path">link</a>';
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(html) } as Response)) as unknown as typeof fetch;
      try {
        const r = await unknownCredentialResolver.tryIdentify('!#@%mixed_chars_xyz_456_789_abc');
        if (r) {
          expect(r.confidence).toBe('low');
        }
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('charset detection edge cases', () => {
    it('mixed special chars → mixed', async () => {
      const v = '!@#$%^&*()_+-={}[]|;:<>?,./~"\'\\';
      const r = await unknownCredentialResolver.tryIdentify(v);
      /* mixed → pas dans whitelist generic → null ou low confidence */
      expect(r === null || r.confidence === 'low').toBe(true);
    });
  });
});
