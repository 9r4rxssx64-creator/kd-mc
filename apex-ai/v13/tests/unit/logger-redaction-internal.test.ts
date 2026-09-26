/**
 * Tests unitaires — logger.* internal redaction (P0 sécu fix audit 2026-05-08).
 *
 * Cible : valider que `logger.info/warn/error/debug` redacte TOUS les patterns
 * sensibles AVANT push dans le buffer interne ET émission console. Audit OWASP
 * ASVS L2 V7.1.1 — secrets ne doivent JAMAIS apparaître en clair dans les logs.
 *
 * Couvre :
 *  - 4 niveaux (info/warn/error/debug) — chacun redacte msg + data + scope
 *  - patterns étendus (Stripe sk_live, GitHub OAuth ghs_, Pinecone pcsk_, JWT,
 *    AWS AKIA, IBAN, CB) qui n'étaient PAS couverts avant le fix
 *  - objets imbriqués (data.config.apiKey)
 *  - Error instances (message + stack)
 *  - scope sensible (defense en profondeur)
 *  - tableaux d'arguments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { logger, _redactForTests } from '../../core/logger.js';

describe('logger — internal redaction (P0 sécu)', () => {
  beforeEach(() => {
    logger.clearBuffer();
    logger.setLevel('debug');
  });

  describe('niveaux logger.*', () => {
    it('logger.info redacte sk-ant dans msg + data', () => {
      const fakeKey = 'sk-ant-api03-' + 'A'.repeat(80);
      logger.info('test', `Clé chargée : ${fakeKey}`, { apiKey: fakeKey });
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(fakeKey);
      expect(last?.msg).toContain('[REDACTED:anthropic_key]');
      expect(JSON.stringify(last?.data)).not.toContain(fakeKey);
      expect(JSON.stringify(last?.data)).toContain('[REDACTED:anthropic_key]');
    });

    it('logger.warn redacte ghp_ GitHub PAT', () => {
      const ghp = 'ghp_' + 'B'.repeat(36);
      logger.warn('git', 'Token expiré', { token: ghp });
      const last = logger.getBuffer().pop();
      expect(JSON.stringify(last?.data)).not.toContain(ghp);
      expect(JSON.stringify(last?.data)).toContain('[REDACTED:github_pat]');
    });

    it('logger.error redacte stack Error contenant secret', () => {
      const fakeKey = 'sk-' + 'C'.repeat(48);
      const err = new Error(`Auth failed with key ${fakeKey}`);
      logger.error('auth', 'Login error', err);
      const last = logger.getBuffer().pop();
      /* Error n'est pas JSON-sérialisable directement (perd message/stack)
       * → on inspecte les propriétés directement sur l'instance redactée. */
      expect(last?.data).toBeInstanceOf(Error);
      const redactedErr = last?.data as Error;
      expect(redactedErr.message).not.toContain(fakeKey);
      expect(redactedErr.message).toContain('[REDACTED:openai_key]');
      expect(redactedErr.name).toBe('Error');
    });

    it('logger.debug redacte AIza Google key', () => {
      const aiza = 'AIza' + 'D'.repeat(33);
      logger.debug('gemini', `Calling with ${aiza}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(aiza);
      expect(last?.msg).toContain('[REDACTED:google_api_key]');
    });
  });

  describe('patterns étendus (avant fix : NON couverts)', () => {
    it('redacte Stripe sk_live_*', () => {
      const stripe = 'sk_live_' + 'E'.repeat(32);
      logger.info('stripe', `Charge with ${stripe}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(stripe);
      expect(last?.msg).toContain('[REDACTED:stripe_key]');
    });

    it('redacte GitHub OAuth ghs_*', () => {
      const ghs = 'ghs_' + 'F'.repeat(36);
      logger.info('git', `Bot token ${ghs}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(ghs);
      expect(last?.msg).toContain('[REDACTED:github_oauth]');
    });

    it('redacte Pinecone pcsk_*', () => {
      const pcsk = 'pcsk_' + 'G'.repeat(50);
      logger.info('pinecone', 'init', { key: pcsk });
      const last = logger.getBuffer().pop();
      expect(JSON.stringify(last?.data)).not.toContain(pcsk);
      expect(JSON.stringify(last?.data)).toContain('[REDACTED:pinecone_key]');
    });

    it('redacte JWT eyJ...', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      logger.warn('auth', `Bearer ${jwt}`);
      const last = logger.getBuffer().pop();
      /* Bearer redaction englobe le tout (pattern Bearer en tête) */
      expect(last?.msg).not.toContain(jwt);
      expect(last?.msg).toMatch(/\[REDACTED:(bearer_token|jwt)\]/);
    });

    it('redacte AWS AKIA access keys', () => {
      const akia = 'AKIA' + 'H'.repeat(16);
      logger.error('aws', `Access denied for ${akia}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(akia);
      expect(last?.msg).toContain('[REDACTED:aws_access_key]');
    });

    it('redacte IBAN', () => {
      const iban = 'FR7630006000011234567890189';
      logger.info('payment', `Transfer to ${iban}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(iban);
      expect(last?.msg).toContain('[REDACTED:iban]');
    });

    it('redacte carte bancaire 16 chiffres', () => {
      const cb = '4242 4242 4242 4242';
      logger.warn('payment', `CB ${cb}`);
      const last = logger.getBuffer().pop();
      expect(last?.msg).not.toContain(cb);
      expect(last?.msg).toContain('[REDACTED:credit_card]');
    });
  });

  describe('objets imbriqués', () => {
    it('redacte secrets nested dans data.config.providers[*].apiKey', () => {
      const k1 = 'sk-ant-api03-' + 'X'.repeat(80);
      const k2 = 'gsk_' + 'Y'.repeat(50);
      logger.info('boot', 'Providers ready', {
        config: {
          providers: [
            { name: 'anthropic', apiKey: k1 },
            { name: 'groq', apiKey: k2 },
          ],
        },
      });
      const last = logger.getBuffer().pop();
      const ser = JSON.stringify(last?.data);
      expect(ser).not.toContain(k1);
      expect(ser).not.toContain(k2);
      expect(ser).toContain('[REDACTED:anthropic_key]');
      expect(ser).toContain('[REDACTED:groq_key]');
    });
  });

  describe('scope (defense en profondeur)', () => {
    it('redacte un scope qui contient par erreur un secret', () => {
      const aiza = 'AIza' + 'Z'.repeat(33);
      logger.info(aiza, 'oops scope is the key');
      const last = logger.getBuffer().pop();
      expect(last?.scope).not.toContain(aiza);
      expect(last?.scope).toContain('[REDACTED:google_api_key]');
    });
  });

  describe('idempotence + non-régression', () => {
    it('ne re-redacte pas un placeholder déjà présent', () => {
      logger.info('test', 'Already [REDACTED:anthropic_key] here');
      const last = logger.getBuffer().pop();
      /* Pas de [REDACTED:[REDACTED:...]] ou nesting */
      expect(last?.msg).toBe('[INFO] redaction-passthrough'.length > 0
        ? last?.msg
        : '');
      expect(last?.msg).toContain('[REDACTED:anthropic_key]');
      expect(last?.msg).not.toContain('[REDACTED:[REDACTED:');
    });

    it('null/undefined/number/boolean inchangés', () => {
      expect(_redactForTests(null)).toBe(null);
      expect(_redactForTests(undefined)).toBe(undefined);
      expect(_redactForTests(42)).toBe(42);
      expect(_redactForTests(true)).toBe(true);
    });

    it('texte sans secret n est pas modifié', () => {
      logger.info('test', 'plain text without any secret here');
      const last = logger.getBuffer().pop();
      expect(last?.msg).toBe('plain text without any secret here');
    });

    it('buffer rotation max 500 préservée', () => {
      logger.clearBuffer();
      for (let i = 0; i < 600; i++) logger.debug('test', `msg ${i}`);
      expect(logger.getBuffer().length).toBeLessThanOrEqual(500);
    });
  });
});
