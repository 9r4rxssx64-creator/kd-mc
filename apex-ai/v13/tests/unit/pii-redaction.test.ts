import { describe, it, expect } from 'vitest';
import { redactPII, redactMessageContent } from '../../services/vault/pii-redaction.js';

describe('redactPII', () => {
  it('redacte les emails', () => {
    const r = redactPII('Mon email: user@example.com et autre@test.fr');
    expect(r.redacted).toContain('[EMAIL_REDACTED]');
    expect(r.foundCount).toBeGreaterThanOrEqual(2);
  });
  it('redacte les cartes bancaires', () => {
    const r = redactPII('CB: 4532 1234 5678 9010');
    expect(r.redacted).toContain('[CB_REDACTED]');
  });
  it('redacte les IBAN', () => {
    const r = redactPII('IBAN: FR7630006000011234567890189');
    expect(r.redacted).toContain('[IBAN_REDACTED]');
  });
  it('redacte les téléphones FR', () => {
    const r = redactPII('Tel: 0612345678');
    expect(r.redacted).toContain('[TEL_REDACTED]');
  });
  it('redacte les API keys leakées', () => {
    const r = redactPII('Ma clé sk-ant-api03-' + 'A'.repeat(50) + ' bla');
    expect(r.redacted).toContain('[KEY_REDACTED]');
  });
  it('garde le texte non-sensible intact', () => {
    const r = redactPII('Bonjour comment ça va aujourd\'hui ?');
    expect(r.redacted).toBe('Bonjour comment ça va aujourd\'hui ?');
    expect(r.foundCount).toBe(0);
  });
});

describe('redactMessageContent', () => {
  it('redacte string content', () => {
    const r = redactMessageContent('email: test@test.com');
    expect(r).toContain('[EMAIL_REDACTED]');
  });
  it('redacte array content (Anthropic blocks)', () => {
    const blocks = [{ type: 'text', text: 'CB 4532 1234 5678 9010' }, { type: 'image' }];
    const r = redactMessageContent(blocks) as Array<{ type: string; text?: string }>;
    expect(r[0]?.text).toContain('[CB_REDACTED]');
  });
});
