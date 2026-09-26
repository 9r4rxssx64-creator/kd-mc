/**
 * Tests services/pii-redaction.ts — coverage boost (67% → 90%+).
 *
 * Cible :
 * - shouldRedact : admin Kevin bypass, privacy_no_redact opt-out
 * - Tous les patterns PII (email, CB, IBAN, phone FR/Monaco, SS, passport, SIRET, VAT, API keys)
 * - redactMessageContent edge cases : null, undefined, primitives, objects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { redactPII, redactMessageContent } from '../../services/vault/pii-redaction.js';

describe('pii-redaction coverage boost', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldRedact() bypass logic', () => {
    it('admin Kevin connecté → BYPASS redaction (texte brut)', () => {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin' }));
      const r = redactPII('Mon email: kevin@desarzens.com');
      expect(r.redacted).toContain('kevin@desarzens.com');
      expect(r.foundCount).toBe(0);
    });

    it('user non-admin connecté → redaction active', () => {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'laurence' }));
      const r = redactPII('Mon email: laurence@example.com');
      expect(r.redacted).toContain('[EMAIL_REDACTED]');
    });

    it('apex_v13_privacy_no_redact=1 → bypass', () => {
      localStorage.setItem('apex_v13_privacy_no_redact', '1');
      const r = redactPII('Mon email: opt-out@example.com');
      expect(r.redacted).toContain('opt-out@example.com');
      expect(r.foundCount).toBe(0);
    });

    it('apex_v13_user JSON corrompu → catch silencieux + redaction normale', () => {
      localStorage.setItem('apex_v13_user', 'not-valid-json{');
      const r = redactPII('email: bad@test.com');
      expect(r.redacted).toContain('[EMAIL_REDACTED]');
    });

    it('aucun user connecté → redaction normale', () => {
      const r = redactPII('email: x@y.fr');
      expect(r.redacted).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('Tous les patterns PII', () => {
    it('téléphone Monaco (377)', () => {
      const r = redactPII('Mon tel Monaco +377 99 12 34 56');
      expect(r.redacted).toContain('[TEL_REDACTED]');
    });

    it('téléphone FR avec +33', () => {
      const r = redactPII('Numéro: +33612345678');
      expect(r.redacted).toContain('[TEL_REDACTED]');
    });

    it('téléphone FR avec espaces', () => {
      const r = redactPII('Tel: 06 12 34 56 78');
      expect(r.redacted).toContain('[TEL_REDACTED]');
    });

    it('Sécurité Sociale FR (1 99 12 95 ... avec mois 12 dept 95)', () => {
      /* Format SS strict : sex(1|2) année(2) mois(01-12,2A,2B) dept(01-95...,9X) commune(3) ordre(3) clé(2) */
      const r = redactPII('SS: 1 99 12 95 999 999 99');
      expect(r.redacted).toContain('[SS_REDACTED]');
    });

    it('passport FR format strict (2 chiffres + 2 lettres + 5 chiffres)', () => {
      const r = redactPII('Mon passeport 12AB34567');
      expect(r.redacted).toContain('[PASSPORT_REDACTED]');
    });

    it('SIRET avec préfixe SIRET:', () => {
      const r = redactPII('SIRET: 12345678901234');
      expect(r.redacted).toContain('[SIRET_REDACTED]');
    });

    it('TVA EU', () => {
      const r = redactPII('TVA FR12345678901');
      expect(r.redacted).toContain('[VAT_REDACTED]');
    });

    it('clé OpenAI sk-', () => {
      const r = redactPII(`secret: sk-${'A'.repeat(48)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('clé Google AIza...', () => {
      const r = redactPII(`google: AIza${'A'.repeat(33)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('GitHub PAT ghp_', () => {
      const r = redactPII(`token: ghp_${'A'.repeat(36)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('GitHub fine-grained github_pat_', () => {
      const r = redactPII(`token: github_pat_${'A'.repeat(85)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('Stripe SK live', () => {
      const r = redactPII(`stripe: sk_live_${'A'.repeat(30)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('Stripe SK test', () => {
      const r = redactPII(`stripe: sk_test_${'A'.repeat(30)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('Groq gsk_', () => {
      const r = redactPII(`groq: gsk_${'A'.repeat(45)}`);
      expect(r.redacted).toContain('[KEY_REDACTED]');
    });

    it('Multiple PII en un texte', () => {
      const r = redactPII('Email a@b.com, tel 0612345678, IBAN FR7630006000011234567890189');
      expect(r.foundCount).toBeGreaterThanOrEqual(3);
      expect(r.redacted).toContain('[EMAIL_REDACTED]');
      expect(r.redacted).toContain('[TEL_REDACTED]');
      expect(r.redacted).toContain('[IBAN_REDACTED]');
    });
  });

  describe('redactMessageContent edge cases', () => {
    it('content string redacte', () => {
      const r = redactMessageContent('email a@b.com');
      expect(typeof r).toBe('string');
      expect(r).toContain('[EMAIL_REDACTED]');
    });

    it('content array de blocks Anthropic', () => {
      const r = redactMessageContent([
        { type: 'text', text: 'tel 0612345678' },
        { type: 'image', source: { data: 'base64' } },
        { type: 'text', text: 'normal text' },
      ]) as Array<{ type: string; text?: string }>;
      expect(r[0]?.text).toContain('[TEL_REDACTED]');
      expect(r[2]?.text).toBe('normal text');
    });

    it('content array avec block sans text', () => {
      const r = redactMessageContent([
        { type: 'image' },
        { type: 'tool_use', id: 'a', name: 'b' },
      ]) as Array<{ type: string }>;
      expect(r[0]?.type).toBe('image');
      expect(r[1]?.type).toBe('tool_use');
    });

    it('content null retourné tel quel', () => {
      expect(redactMessageContent(null)).toBeNull();
    });

    it('content undefined retourné tel quel', () => {
      expect(redactMessageContent(undefined)).toBeUndefined();
    });

    it('content number retourné tel quel', () => {
      expect(redactMessageContent(42)).toBe(42);
    });

    it('content boolean retourné tel quel', () => {
      expect(redactMessageContent(true)).toBe(true);
    });

    it('content object plain retourné tel quel (pas array)', () => {
      const obj = { foo: 'bar' };
      expect(redactMessageContent(obj)).toBe(obj);
    });

    it('content array vide retourné []', () => {
      const r = redactMessageContent([]);
      expect(Array.isArray(r)).toBe(true);
      expect((r as unknown[]).length).toBe(0);
    });

    it('block avec text non-string laissé intact', () => {
      const blocks = [{ type: 'text', text: 123 as unknown as string }];
      const r = redactMessageContent(blocks) as Array<{ type: string; text?: unknown }>;
      expect(r[0]?.text).toBe(123);
    });
  });

  describe('foundCount précision', () => {
    it('foundCount = 0 si aucun PII', () => {
      const r = redactPII('Bonjour le monde !');
      expect(r.foundCount).toBe(0);
    });

    it('foundCount cumule par pattern matched', () => {
      const r = redactPII('Multi: a@b.com, x@y.fr, z@w.org');
      expect(r.foundCount).toBeGreaterThanOrEqual(3);
    });

    it('texte vide → foundCount=0', () => {
      const r = redactPII('');
      expect(r.foundCount).toBe(0);
      expect(r.redacted).toBe('');
    });
  });
});
