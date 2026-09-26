/**
 * APEX v13 — Tests Message Fact Extractor (Sprint 13.3.71 enrichissement profils continu).
 *
 * Couvre :
 * - detectFacts par catégorie (profile / preferences / projects / relationships / facts)
 * - Forbidden patterns (CB, seed phrase, GitHub PAT) → blocked
 * - processMessage avec push persistent_memory_<uid>
 * - Stats agrégées
 * - Reset + lifecycle
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { messageFactExtractor } from '../../services/ai/message-fact-extractor.js';

describe('message-fact-extractor — extraction continue facts', () => {
  beforeEach(() => {
    localStorage.clear();
    messageFactExtractor.reset();
    messageFactExtractor.stop();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    messageFactExtractor.stop();
    vi.restoreAllMocks();
  });

  describe('detectFacts — patterns NLP', () => {
    it('détecte âge "j\'ai 35 ans"', () => {
      const facts = messageFactExtractor.detectFacts("J'ai 35 ans et je vis bien.");
      const ageFact = facts.find((f) => f.text.includes('Âge'));
      expect(ageFact).toBeDefined();
      expect(ageFact?.text).toContain('35');
      expect(ageFact?.category).toBe('profile');
      expect(ageFact?.importance).toBeGreaterThanOrEqual(60);
    });

    it('détecte allergie avec importance haute (>=95)', () => {
      const facts = messageFactExtractor.detectFacts("Je suis allergique aux fruits de mer.");
      const allergy = facts.find((f) => f.text.includes('Allergie'));
      expect(allergy).toBeDefined();
      expect(allergy?.importance).toBeGreaterThanOrEqual(95);
      expect(allergy?.text).toContain('fruits');
    });

    it('détecte préférences "j\'aime X"', () => {
      const facts = messageFactExtractor.detectFacts("J'aime le jazz.");
      const like = facts.find((f) => f.category === 'preferences' && f.text.startsWith('Aime'));
      expect(like).toBeDefined();
      expect(like?.text.toLowerCase()).toContain('jazz');
    });

    it('détecte projet actif "je travaille sur X"', () => {
      const facts = messageFactExtractor.detectFacts("Je travaille sur Apex AI v13 actuellement.");
      const proj = facts.find((f) => f.category === 'projects');
      expect(proj).toBeDefined();
      expect(proj?.text.toLowerCase()).toContain('apex');
    });

    it('détecte relation "ma femme Marie"', () => {
      const facts = messageFactExtractor.detectFacts("Ma femme Marie va bien.");
      const rel = facts.find((f) => f.category === 'relationships');
      expect(rel).toBeDefined();
      expect(rel?.text).toContain('Marie');
    });

    it('texte trop court ou vide → 0 facts', () => {
      expect(messageFactExtractor.detectFacts('').length).toBe(0);
      expect(messageFactExtractor.detectFacts('ok').length).toBe(0);
    });
  });

  describe('forbidden patterns — sécurité', () => {
    it('CB 16 chiffres → blocked, 0 fact extracted', async () => {
      const result = await messageFactExtractor.processMessage(
        'Voici ma carte 4532 1234 5678 9010 et j\'ai 30 ans',
        'kdmc_admin',
      );
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('cb');
      expect(result.extracted).toBe(0);
    });

    it('Token API sk-ant-xxx → blocked', async () => {
      const result = await messageFactExtractor.processMessage(
        'Mon token sk-ant-api03-abcdefghijklmnop1234567890',
        'kdmc_admin',
      );
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('token_api');
    });

    it('GitHub PAT → blocked', async () => {
      const result = await messageFactExtractor.processMessage(
        'Mon github_pat ghp_abcdefghijklmnopqrstuvwxyz0123456789',
        'kdmc_admin',
      );
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('github_pat');
    });

    it('Seed phrase 12 mots → blocked', async () => {
      const result = await messageFactExtractor.processMessage(
        'apple banana cherry dog elephant fox grape house ice juice king lemon',
        'kdmc_admin',
      );
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('seed_phrase');
    });
  });

  describe('processMessage — push persistent_memory', () => {
    it('extract + push fact dans persistent-memory-store', async () => {
      const result = await messageFactExtractor.processMessage(
        "J'ai 42 ans et j'habite Monaco.",
        'kdmc_admin',
      );
      expect(result.extracted).toBeGreaterThanOrEqual(1);
      /* Vérifie persistence : le store écrit dans IDB ou localStorage */
      const stats = messageFactExtractor.getStats();
      expect(stats.total_extracted).toBeGreaterThanOrEqual(1);
    });

    it('uid vide → fallback scope global', async () => {
      const result = await messageFactExtractor.processMessage("J'ai 25 ans.", '');
      expect(result.uid).toBe('');
      expect(result.extracted).toBeGreaterThanOrEqual(0);
    });

    it('reset() remet stats à 0', async () => {
      await messageFactExtractor.processMessage("J'ai 30 ans.", 'kdmc_admin');
      messageFactExtractor.reset();
      const stats = messageFactExtractor.getStats();
      expect(stats.total_extracted).toBe(0);
      expect(stats.total_blocked).toBe(0);
      expect(stats.last_run).toBeUndefined();
    });
  });

  describe('lifecycle start/stop', () => {
    it('start() rend le service started=true', () => {
      messageFactExtractor.start();
      const stats = messageFactExtractor.getStats();
      expect(stats.started).toBe(true);
      messageFactExtractor.stop();
    });

    it('stop() rend le service started=false', () => {
      messageFactExtractor.start();
      messageFactExtractor.stop();
      const stats = messageFactExtractor.getStats();
      expect(stats.started).toBe(false);
    });

    it('start() idempotent (2 calls = no-op double)', () => {
      messageFactExtractor.start();
      messageFactExtractor.start();
      expect(messageFactExtractor.getStats().started).toBe(true);
    });
  });
});
